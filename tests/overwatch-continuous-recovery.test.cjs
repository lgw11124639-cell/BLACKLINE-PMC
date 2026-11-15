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

test("an already-stalled old save dispatches its transport even if every actual casualty is dead and HQ cannot know yet", () => {
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
    B.injure(s, e, u, {
      eventId: "old-save-death-" + i,
      part: "head",
      severity: 3,
    });
  }
  run(s, 60);
  const m = e.mission;
  m.returnRequested = true;
  m.abortRequested = true;
  m.phase = "extracting";
  delete m.recoveryVersion;
  m.extractionPoint = { x: 220, y: 550 };
  m.transports[0].state = "home";
  m.transports[0].manifest = [];
  C.validate(s);
  const restored = C.clone(s);
  run(restored, 1000);
  const done = restored.commandExercise;
  assert.equal(done.status, "ended");
  assert.equal(done.mission.home.length, 2);
  assert.equal(
    restored.archive.members.filter((m) => m.status === "deceased").length,
    2,
  );
  assert.equal(done.mission.transports.length, 1);
  assert.ok(done.mission.log.some((ev) => ev.type === "recovery-replanned"));
  assert.equal(restored.operations.reports[0].reward, 0);
});
test("an empty transport already on the way replans to the changed pickup instead of finishing at the old one", () => {
  const s = make(),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  run(s, 80);
  M.requestReturn(s);
  run(s, 31);
  const t = e.mission.transports[0],
    next = G.project({ x: 340, y: 700 });
  M.requestReturn(s, { pickup: next, abort: true });
  assert.deepEqual(t.target, next);
  assert.deepEqual(t.path.at(-1), next);
  run(s, 1000);
  assert.equal(e.status, "ended");
  assert.equal(e.mission.home.length, 2);
});
test("an empty broken route cannot be treated as actual arrival", () => {
  const s = make(),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  run(s, 80);
  const t = e.mission.transports[0];
  Object.assign(t, {
    state: "driving",
    trip: "extraction",
    target: { x: 340, y: 700 },
    arrival: "pickup-landed",
    path: [],
  });
  e.mission.recoveryVersion = 2;
  run(s, 2);
  assert.equal(t.state, "route-blocked");
  assert.equal(t.x, 100);
  assert.equal(e.mission.home.length, 0);
  assert.match(D.frame(s).mission.waitReason, /경로/);
});

test("an explicit abort ends as missing after two actual unsuccessful recovery searches and returns, without inventing confirmed deaths", () => {
  const s = make(),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  run(s, 80);
  for (const [i, u] of e.world.units.entries())
    Object.assign(u, { x: 480 + i * 12, y: 550, path: [], goal: null });
  run(s, 10);
  for (const [i, u] of e.world.units.entries()) {
    Object.assign(u, { x: 1000 + i * 12, y: 700, path: [], goal: null });
    B.injure(s, e, u, {
      eventId: "unseen-loss-" + i,
      part: "head",
      severity: 3,
    });
  }
  run(s, 60);
  M.requestReturn(s, { abort: true });
  run(s, 1800);
  assert.equal(e.status, "ended");
  assert.ok(e.mission.failedRecoveries >= 2);
  assert.ok(
    e.mission.log.filter((v) => v.type === "recovery-search-completed")
      .length >= 2,
  );
  assert.equal(e.mission.home.length, 0);
  assert.ok(s.archive.members.every((v) => v.status === "missing"));
  assert.equal(s.operations.reports[0].reward, 0);
});
