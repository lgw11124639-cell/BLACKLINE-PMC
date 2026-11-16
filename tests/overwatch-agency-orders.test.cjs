const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  B = require("../overwatch/battle"),
  D = require("../overwatch/command"),
  M = require("../overwatch/missions"),
  S = require("../overwatch/command-staff"),
  G = require("../overwatch/geometry");
function make() {
  const s = C.createCampaign({ id: "AGENCY-ORDERS" });
  S.upgrade(s);
  const h = (r) =>
    P.hire(s, s.market.candidates.find((m) => m.specialty === r).id, 30);
  P.assign(s, "ALPHA", h("observer").id, h("sniper").id);
  const officer = S.hire(
    s,
    s.commandStaff.market.find((m) => m.duty === "controller").id,
  );
  S.assign(s, "controller", officer.id);
  S.delegate(s, false);
  const c = s.contracts.find((c) => c.key === "high-value-target");
  M.accept(s, c.id);
  M.launch(s, c.id);
  const e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      B.setPaused(s, false);
      D.step(s, 1);
    }
  };
  step(100);
  return { s, e, step };
}
test("HQ infantry orders require actual receipt, then hold, advance, and withdraw through physical routes", () => {
  const { s, e, step } = make();
  M.commandAgency(s, "hold");
  const packet = e.radio.findLast((r) => r.payload?.agencyDirective);
  assert.equal(packet.status, "queued");
  assert.equal(e.mission.agencyDirective, undefined);
  step(5);
  assert.equal(packet.status, "delivered");
  assert.equal(e.mission.agencyDirective.mode, "hold");
  const u = e.world.actors.find((a) => a.id === "agency-infantry-0"),
    anchor = { ...u };
  step(50);
  assert.ok(G.distance(u, anchor) < 8);
  C.validate(s);
  M.commandAgency(s, "advance");
  step(5);
  const start = { ...u };
  step(100);
  assert.ok(G.distance(u, start) > 15);
  C.validate(s);
  const distance = G.distance(u, e.mission.extractionPoint);
  M.commandAgency(s, "withdraw");
  step(120);
  assert.ok(G.distance(u, e.mission.extractionPoint) < distance - 20);
  assert.equal(e.mission.agencyDirective.mode, "withdraw");
  C.validate(C.clone(s));
  M.commandAgency(s, "auto");
  step(5);
  assert.equal(e.mission.agencyDirective.mode, "auto");
  assert.throws(() => M.commandAgency(s, "teleport"));
  C.validate(s);
});
test("a forged manual doctrine without delivered command evidence is rejected", () => {
  const { s, e } = make();
  e.mission.agencyDirective = {
    mode: "withdraw",
    anchors: {},
    receivedAt: e.time,
    messageId: "not-received",
  };
  assert.throws(() => C.validate(s), /수신 기록/);
});
test("a lightly wounded agency soldier takes cover and still returns actual fire during sustained incoming shots", () => {
  const { s, e, step } = make(),
    u = e.world.actors.find((a) => a.id === "agency-infantry-0"),
    enemy = e.world.actors.find((a) => a.id === "opposition-4");
  for (const [i, a] of e.world.actors
    .filter((a) => a.side === "ally" && a.armed)
    .entries())
    Object.assign(a, {
      x: a.id === u.id ? 400 : 100 - i * 10,
      y: 775,
      path: [],
      goal: null,
      agencyCoverGoal: null,
    });
  Object.assign(enemy, {
    x: 450,
    y: 775,
    path: [],
    goal: null,
    deployment: null,
    route: [{ x: 450, y: 775 }],
  });
  enemy.health.conscious = true;
  B.ballisticImpact(s, e, u, {
    eventId: "minor-arm-impact",
    model: "G19",
    part: "leftArm",
    lateral: 0,
    height: 1.2,
    distance: 300,
  });
  assert.ok(u.health.wounds.every((w) => w.severity === 1));
  let incoming = 0;
  for (let i = 0; i < 70 && !u.weapon.spent; i++) {
    enemy.weapon.nextFireAt = 0;
    enemy.weapon.aimSince = 0;
    if (
      B.fire(s, e, enemy, {
        id: u.id,
        x: u.x + 6,
        y: u.y,
        lastSeen: e.time,
        condition: "standing",
      })
    )
      incoming++;
    step(1);
  }
  assert.ok(incoming > 1);
  assert.ok(
    u.weapon.spent > 0,
    JSON.stringify({
      state: u.state,
      reason: u.fireBlockReason,
      health: u.health,
      cover: u.agencyCoverGoal,
    }),
  );
  assert.ok(e.mission.log.some((ev) => ev.type === "agency-cover-selected"));
  assert.ok(u.health.alive);
  C.validate(s);
});
