const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  M = require("../overwatch/missions"),
  G = require("../overwatch/geometry");
function make() {
  const s = C.createCampaign({ id: "STALLED-PHONE" });
  let a = P.hire(
      s,
      s.market.candidates.find((c) => c.specialty === "observer").id,
      30,
    ),
    n = P.hire(
      s,
      s.market.candidates.find((c) => c.specialty === "sniper").id,
      30,
    );
  P.assign(s, "ALPHA", a.id, n.id);
  M.accept(s, s.contracts[0].id);
  M.launch(s, s.contracts[0].id);
  s.commandExercise.battle.continuous = true;
  B.setPaused(s, false);
  return s;
}
function run(s, n) {
  for (let i = 0; i < n && s.commandExercise.status === "running"; i++) {
    assert.equal(s.commandExercise.paused, false);
    D.step(s, 1);
    C.validate(s);
  }
}
test("urgent injury reports and complete radio shadow do not pause continuous operations", () => {
  const s = make(),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  run(s, 80);
  B.injure(s, e, e.world.units[1], {
    eventId: "continuous-injury",
    part: "leftArm",
    severity: 1,
  });
  run(s, 20);
  assert.equal(e.paused, false);
  for (const [i, u] of e.world.units.entries())
    Object.assign(u, { x: 540 + i * 12, y: 550, path: [], goal: null });
  run(s, 100);
  assert.equal(e.paused, false);
  assert.equal(e.time, 200);
});
test("a contract without a medical aircraft retrieves immobilized casualties through its existing transport crew", () => {
  const s = make(),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  run(s, 80);
  for (const [i, u] of e.world.units.entries())
    Object.assign(u, { x: 480 + i * 12, y: 550, path: [], goal: null });
  run(s, 10);
  for (const [i, u] of e.world.units.entries()) {
    Object.assign(u, { x: 540 + i * 12, y: 550, path: [], goal: null });
    u.health.kit = 0;
  }
  B.injure(s, e, e.world.units[0], {
    eventId: "crew-casualty-a",
    part: "leftLeg",
    severity: 2,
  });
  B.injure(s, e, e.world.units[1], {
    eventId: "crew-casualty-b",
    part: "abdomen",
    severity: 3,
  });
  run(s, 60);
  assert.ok(
    Object.values(e.knowledge.friends).some((f) => e.time - f.observedAt > 45),
  );
  assert.equal(e.mission.contract.support.medical, 0);
  M.requestReturn(s, { abort: true });
  assert.ok(G.distance(e.mission.extractionPoint, { x: 480, y: 550 }) < 20);
  run(s, 1000);
  assert.equal(e.status, "ended");
  assert.ok(
    e.mission.log.some((ev) => ev.type === "transport-recovery-started"),
  );
  assert.equal(e.mission.transports.length, 1);
  assert.equal(e.mission.supports.medical, 0);
  assert.equal(e.mission.home.length, 2);
  assert.equal(
    s.operations.reports[0].refund + s.operations.reports[0].consumed,
    s.operations.reports[0].escrow,
  );
});
