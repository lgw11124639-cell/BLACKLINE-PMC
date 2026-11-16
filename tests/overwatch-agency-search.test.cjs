const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  M = require("../overwatch/missions"),
  S = require("../overwatch/command-staff"),
  G = require("../overwatch/geometry");
function make(key = "rescue-cover") {
  const s = C.createCampaign({ id: "SEARCH-" + key }),
    h = (r) =>
      P.hire(s, s.market.candidates.find((c) => c.specialty === r).id, 30);
  S.upgrade(s);
  const count = s.contracts.find((c) => c.key === key).min / 2;
  for (let i = 0; i < count; i++)
    P.assign(s, C.CALLSIGNS[i], h("observer").id, h("sniper").id);
  const staff = S.hire(
    s,
    s.commandStaff.market.find((m) => m.duty === "controller").id,
  );
  S.assign(s, "controller", staff.id);
  S.delegate(s, false);
  const c = s.contracts.find((c) => c.key === key);
  M.accept(s, c.id);
  M.launch(s, c.id);
  return s;
}
function step(s, n = 1) {
  for (let i = 0; i < n && s.commandExercise.status === "running"; i++) {
    for (const a of s.commandExercise.world.actors.filter(
      (a) => a.side === "red",
    ))
      a.weapon.nextFireAt = s.commandExercise.time + 20;
    B.setPaused(s, false);
    D.step(s, 1);
  }
}
function locate(a, p) {
  Object.assign(a, {
    ...p,
    route: [{ ...p }],
    path: [],
    goal: null,
    waypoint: 0,
    roofId: null,
  });
}
test("hidden objective positions do not affect initial ground planning; infantry move and search with no sniper orders or visibility authorizations", () => {
  const a = make(),
    b = C.clone(a),
    ea = a.commandExercise,
    eb = b.commandExercise;
  locate(
    ea.world.actors.find((a) => a.id === "agency-protected"),
    G.project({ x: 1100, y: 100 }),
  );
  locate(
    eb.world.actors.find((a) => a.id === "agency-protected"),
    G.project({ x: 500, y: 100 }),
  );
  for (const e of [ea, eb])
    for (const x of e.world.actors.filter((a) => a.side === "red"))
      x.health.conscious = false;
  step(a, 120);
  step(b, 120);
  assert.ok(ea.mission.fieldStartedAt != null);
  assert.equal(ea.commands.length, 0);
  assert.equal(eb.commands.length, 0);
  assert.ok(ea.mission.agencyControl.authorized);
  assert.ok(ea.mission.agencyControl.everAuthorized);
  assert.equal(ea.mission.groundSearch.lead, null);
  assert.equal(eb.mission.groundSearch.lead, null);
  assert.deepEqual(M.searchPoint(ea), M.searchPoint(eb));
  assert.deepEqual(
    ea.mission.agencyControl.waypoint,
    eb.mission.agencyControl.waypoint,
  );
  assert.ok(
    ea.world.actors
      .filter((a) => a.side === "ally" && a.armed)
      .some((u) => G.distance(u, ea.mission.contract.insertion) > 20),
  );
  assert.equal(ea.mission.taskLinked, false);
  C.validate(a);
  C.validate(b);
});
test("a real sniper observation is relayed by a separate delayed agency packet; infantry pursue the reported point rather than the hidden moved target", () => {
  const s = make(),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  step(s, 100);
  const h = e.world.actors.find((a) => a.id === "agency-protected"),
    point = G.project({ x: 400, y: 775 });
  locate(h, point);
  for (const [i, u] of e.world.units.entries())
    Object.assign(u, {
      x: 350 + i * 3,
      y: 775,
      path: [],
      goal: null,
      roofId: null,
      roofTransit: null,
      overwatchPath: [],
    });
  D.issue(s, "ALPHA", "observe", point);
  let packet;
  for (let i = 0; i < 100 && !packet; i++) {
    step(s);
    packet = e.radio.find(
      (r) => r.route === "agency" && r.payload?.agencyLead?.id === h.id,
    );
  }
  assert.ok(
    packet,
    "a locally identified and delivered observer report must produce a relay",
  );
  assert.equal(packet.status, "queued");
  assert.equal(e.mission.groundSearch.lead, null);
  const source = e.radio.find(
    (r) => r.id === packet.payload.agencyLead.sourceMessageId,
  );
  assert.equal(source.status, "delivered");
  assert.equal(source.payload.contact.objectiveCode, "RESCUE-PERSON");
  assert.notEqual(source.payload.contact.callsign, "보병조");
  const oldPoint = C.clone(packet.payload.agencyLead.point);
  locate(h, G.project({ x: 1100, y: 100 }));
  for (let i = 0; i < 12 && packet.status !== "delivered"; i++) {
    assert.equal(e.mission.groundSearch.lead, null);
    step(s);
  }
  assert.equal(packet.status, "delivered");
  assert.deepEqual(e.mission.groundSearch.lead.point, oldPoint);
  assert.deepEqual(M.searchPoint(e), oldPoint);
  assert.ok(G.distance(M.searchPoint(e), h) > 300);
  const leader = e.world.actors.find((a) => a.id === "agency-rescuer"),
    before = G.distance(leader, oldPoint);
  step(s, 100);
  assert.ok(G.distance(leader, oldPoint) < before - 10);
  assert.equal(e.mission.taskLinked, false);
  C.validate(s);
});
test("identified armed hostiles receive real infantry fire and damage even when movement authorization is held", () => {
  const s = make("high-value-target"),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  step(s, 100);
  const u = e.world.actors.find((a) => a.id === "agency-infantry-0"),
    enemy = e.world.actors.find((a) => a.id === "opposition-4");
  locate(u, G.project({ x: 400, y: 775 }));
  locate(enemy, G.project({ x: 450, y: 775 }));
  enemy.health.conscious = true;
  enemy.deployment = null;
  enemy.memory = [];
  u.waitingForDeployment = false;
  for (let i = 0; i < 100; i++) {
    e.mission.securityControl.authorized = false;
    e.mission.securityControl.lastAssessment = e.time;
    step(s);
    if (!enemy.health.alive) break;
  }
  assert.ok(
    e.events.some((x) => x.type === "shot-fired" && x.actorId === u.id),
  );
  assert.ok(u.weapon.spent > 0);
  assert.ok(enemy.health.wounds.length > 0 || !enemy.health.alive);
  assert.ok(
    e.mission.log.some(
      (x) => x.type === "agency-contact-observed" && x.targetId === enemy.id,
    ),
  );
  C.validate(s);
});
test("unidentified or non-visible objectives cannot create a received ground lead; forged receipt state is rejected", () => {
  const s = make(),
    e = s.commandExercise;
  step(s, 80);
  assert.equal(e.mission.groundSearch.lead, null);
  const copy = C.clone(s);
  copy.commandExercise.mission.groundSearch.lead = {
    id: "agency-protected",
    kind: "protected",
    point: { x: 500, y: 500 },
    observedAt: e.time,
    messageId: "not-delivered",
    sourceMessageId: "not-observed",
  };
  assert.throws(() => C.validate(copy), /수신되지 않은 목표/);
  C.validate(s);
});
test("infantry clear a blocked friendly firing lane before firing instead of remaining stacked", () => {
  const s = make("high-value-target"),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  step(s, 100);
  const troops = e.world.actors.filter((a) => a.side === "ally" && a.armed),
    u = troops[0],
    v = e.world.actors.find((a) => a.id === "opposition-4");
  troops.forEach((a, i) =>
    locate(
      a,
      G.project({ x: i < 2 ? 400 : 330, y: i < 2 ? 775 : 740 + i * 5 }),
    ),
  );
  locate(v, G.project({ x: 450, y: 775 }));
  v.health.conscious = true;
  v.deployment = null;
  step(s, 100);
  assert.ok(
    e.mission.log.some((ev) => ev.type === "agency-fire-lane-reposition"),
  );
  assert.ok(troops.some((a) => a.weapon.spent > 0));
  assert.ok(G.distance(troops[0], troops[1]) > 3);
  assert.ok(troops.every((a) => a.health.wounds.length === 0));
  C.validate(s);
});
test("a dead positively identified target needs actual infantry inspection before the objective completes", () => {
  const s = make("high-value-target"),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  step(s, 100);
  const target = e.world.actors.find((a) => a.missionTargetCode),
    troops = e.world.actors.filter((a) => a.side === "ally" && a.armed);
  locate(target, G.project({ x: 500, y: 775 }));
  target.health.alive = false;
  step(s, 20);
  assert.equal(e.mission.objective, false);
  assert.deepEqual(e.mission.groundSearch.securedIds, []);
  troops.forEach((a, i) => locate(a, G.project({ x: 492 - i * 2, y: 775 })));
  step(s, 100);
  assert.ok(e.mission.log.some((ev) => ev.type === "agency-lead-received"));
  assert.ok(e.mission.log.some((ev) => ev.type === "agency-target-secured"));
  assert.ok(e.mission.groundSearch.securedIds.includes(target.id));
  assert.equal(e.mission.objective, true);
  C.validate(s);
});
test("an actual UAV identifies a hidden objective and passes a rounded boundary coordinate to a reachable infantry route", () => {
  const s = make(),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  step(s, 100);
  const h = e.world.actors.find((a) => a.id === "agency-protected");
  locate(h, G.project({ x: 600, y: 240 }));
  M.requestSupport(s, "drone", { x: h.x, y: h.y });
  let received;
  for (let i = 0; i < 500 && !received; i++) {
    step(s);
    received = e.radio.find(
      (r) =>
        r.route === "agency" &&
        r.status === "delivered" &&
        r.payload?.agencyLead?.sourceObserverId?.includes("drone"),
    );
  }
  assert.ok(
    received,
    "the drone must reach station, actually identify, and deliver both radio hops",
  );
  const source = e.radio.find(
    (r) => r.id === received.payload.agencyLead.sourceMessageId,
  );
  assert.equal(source.payload.contact.callsign, "UAV");
  assert.equal(source.payload.contact.objectiveCode, "RESCUE-PERSON");
  assert.ok(!G.blocked(M.searchPoint(e)));
  assert.ok(e.mission.agencyControl.authorized);
  assert.ok(!e.mission.knowledge.actors.some((a) => a.id === h.id));
  C.validate(s);
});
