const test = require("node:test"),
  assert = require("node:assert/strict");
const C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  B = require("../overwatch/battle"),
  D = require("../overwatch/command"),
  M = require("../overwatch/missions"),
  S = require("../overwatch/command-staff"),
  G = require("../overwatch/geometry");
function make(pairs = 1, key = "high-value-target") {
  const s = C.createCampaign({ id: "COORDINATED-" + key });
  S.upgrade(s);
  const h = (r) =>
    P.hire(s, s.market.candidates.find((m) => m.specialty === r).id, 30);
  for (let i = 0; i < pairs; i++)
    P.assign(s, C.CALLSIGNS[i], h("observer").id, h("sniper").id);
  const chief = S.hire(
    s,
    s.commandStaff.market.find((m) => m.duty === "controller").id,
  );
  S.assign(s, "controller", chief.id);
  S.delegate(s, false);
  const contract = s.contracts.find((c) => c.key === key);
  M.accept(s, contract.id);
  M.launch(s, contract.id);
  const e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      B.setPaused(s, false);
      D.step(s, 1);
    }
  };
  step(pairs > 1 ? 220 : 100);
  const assess = () => {
    S.delegate(s, true);
    if (e.control) e.control.lastAssess = -100;
    S.tick(s, e);
    S.delegate(s, false);
  };
  return { s, e, step, assess };
}
function reportOwn(s, e) {
  for (const q of e.squads) {
    const ev = D.internals.event(e, "test-received-status", {
      callsign: q.callsign,
    });
    D.internals.report(s, e, q, "position", "탄약·상태 보고", ev, {
      friends: D.internals.friendSnapshots(e, q),
    });
  }
}
function agencyReports(e, pressure) {
  const units = e.world.actors.filter((a) => a.side === "ally" && a.armed);
  for (const [i, u] of units.entries()) {
    u.lastThreatAt = pressure && i < 2 ? e.time : -1000;
    const old = e.mission.knowledge.actors.find((a) => a.id === u.id);
    if (old) Object.assign(old, B.snapshot(u, e.time), { observedAt: e.time });
  }
  return units;
}
test("three target-search teams receive distinct public sectors and actually choose independent posts, rather than watching the infantry centroid", () => {
  const { s, e, step, assess } = make(3);
  assess();
  const orders = C.CALLSIGNS.map((call) =>
    e.commands.findLast((c) => c.callsign === call && c.kind === "recon"),
  );
  assert.ok(
    orders.every(Boolean),
    JSON.stringify({
      phase: e.mission.phase,
      units: e.world.units.map((u) => [
        u.id,
        u.waitingForDeployment,
        u.boardedBy,
      ]),
      commands: e.commands.map((c) => [c.callsign, c.kind, c.status]),
    }),
  );
  assert.equal(new Set(orders.map((c) => c.target.x)).size, 3);
  for (const c of orders) {
    assert.ok(c.target.x >= c.watchSector.x1 && c.target.x <= c.watchSector.x2);
    assert.equal(c.protectPosition, undefined);
  }
  step(120);
  for (const q of e.squads) {
    assert.ok(q.tactical);
    assert.equal(q.tactical.protectedPoint, null);
    assert.ok(
      q.tactical.position.x >= q.watchSector.x1 &&
        q.tactical.position.x <= q.watchSector.x2,
    );
  }
  const posts = e.squads.map((q) => q.tactical.position);
  for (let i = 0; i < posts.length; i++)
    for (let j = i + 1; j < posts.length; j++)
      assert.ok(G.distance(posts[i], posts[j]) > 28);
  C.validate(C.clone(s));
});
test("controller reacts to fresh received infantry pressure through delayed real radio, resumes after clear reports and preserves a manual HQ order", () => {
  const { s, e, step, assess } = make();
  e.mission.knowledge.actors = [];
  for (const u of e.world.actors.filter((a) => a.side === "ally" && a.armed))
    u.lastThreatAt = e.time;
  assess();
  assert.equal(
    e.radio.some((r) => r.payload?.agencyDirective),
    false,
    "unreported actual pressure cannot reach HQ",
  );
  step(5);
  agencyReports(e, true);
  assess();
  const hold = e.radio.findLast((r) => r.payload?.agencyDirective);
  assert.equal(hold.payload.agencyDirective.mode, "hold");
  assert.equal(hold.status, "queued");
  step(5);
  assert.equal(e.mission.agencyDirective.source, "controller");
  assert.equal(D.frame(s).mission.agencyDirectiveSource, "controller");
  assert.equal(e.mission.agencyDirective.mode, "hold");
  agencyReports(e, false);
  assess();
  step(21);
  agencyReports(e, false);
  assess();
  step(5);
  assert.equal(e.mission.agencyDirective.mode, "auto");
  M.commandAgency(s, "advance");
  step(5);
  agencyReports(e, true);
  assess();
  assert.equal(e.mission.agencyDirective.mode, "advance");
  assert.equal(
    e.radio.filter((r) => r.payload?.agencyDirective && r.status === "queued")
      .length,
    0,
  );
  C.validate(C.clone(s));
  const forged = C.clone(s);
  forged.commandExercise.mission.agencyDirective.source = "controller";
  assert.throws(() => C.validate(forged), /지휘|보병|저장/);
});
test("reported exhaustion of both weapons leads to extraction when supplies are unavailable, while hidden actual ammo cannot cause an order", () => {
  const { s, e, step, assess } = make();
  for (const u of e.world.units)
    for (const w of [u.weapon, u.sidearm]) {
      w.loaded = 0;
      w.magazines = [];
      w.initial = w.spent;
    }
  assess();
  assert.equal(e.control.ammoRiskSince, null);
  for (let i = 0; i < 8 && !e.mission.returnRequested; i++) {
    reportOwn(s, e);
    step(7);
    assess();
  }
  assert.equal(e.mission.returnRequested, true);
  assert.ok(e.events.some((d) => d.type === "controller-ammo-withdraw"));
  C.validate(C.clone(s));
});

test("a compromised rooftop is excluded from the next real post selection, with a physical reachable route to another post", () => {
  const { s, e, step } = make();
  const roof = G.roofs()[0],
    q = e.squads[0];
  for (const [i, u] of e.world.units.entries())
    Object.assign(u, {
      x: roof.point.x + i,
      y: roof.point.y,
      roofId: roof.id,
      roofTransit: null,
      path: [],
      overwatchPath: [],
      goal: null,
    });
  q.avoidPositions = [{ ...roof.point, roofId: roof.id, at: e.time }];
  q.bound = null;
  const c = D.issue(s, q.callsign, "cover", G.project(G.MAP.sector));
  c.reposition = true;
  step(35);
  assert.ok(q.tactical, JSON.stringify(c));
  assert.notEqual(q.tactical.position.roofId, roof.id);
  assert.ok(
    G.path(e.world.units[0], q.tactical.position).length ||
      G.distance(e.world.units[0], q.tactical.position) < 2,
  );
  C.validate(C.clone(s));
});

test("controller uses an available supply trip before extraction and never dispatches another trip for the same shortage", () => {
  const { s, e, step, assess } = make(1, "counter-sniper");
  for (const u of e.world.units)
    for (const w of [u.weapon, u.sidearm]) {
      w.loaded = 0;
      w.magazines = [];
      w.initial = w.spent;
    }
  reportOwn(s, e);
  step(7);
  assess();
  assert.equal(e.mission.supports.supply, 1);
  assert.equal(e.mission.returnRequested, false);
  assert.ok(e.events.some((x) => x.type === "controller-ammo-support"));
  for (let i = 0; i < 8; i++) {
    reportOwn(s, e);
    step(7);
    assess();
  }
  assert.equal(e.mission.supports.supply, 1);
  assert.equal(e.mission.returnRequested, false);
  C.validate(C.clone(s));
});
