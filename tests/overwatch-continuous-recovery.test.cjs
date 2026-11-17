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

test("partially boarded vehicle preserves its crew and searches reported casualties behind a building instead of restarting notices", () => {
  const s = C.createCampaign({ id: "PARTIAL-BLOCKED-RECOVERY" }),
    h = (r) =>
      P.hire(s, s.market.candidates.find((c) => c.specialty === r).id, 30);
  for (const call of ["ALPHA", "BRAVO"])
    P.assign(s, call, h("observer").id, h("sniper").id);
  const contract = s.contracts.find((c) => c.key === "high-value-target");
  M.accept(s, contract.id);
  M.launch(s, contract.id);
  const e = s.commandExercise,
    m = e.mission,
    t = m.transports[0];
  e.battle.continuous = true;
  B.setPaused(s, false);
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  run(s, 100);
  const building = G.MAP.buildings.find(
      (b) => b[0] > 20 && b[2] < 1180 && b[1] > 20 && b[3] < 780,
    ),
    left = G.project({
      x: building[0] - 5,
      y: (building[1] + building[3]) / 2,
    }),
    right = G.project({
      x: building[2] + 5,
      y: (building[1] + building[3]) / 2,
    });
  assert.equal(G.clear(left, right), false);
  Object.assign(t, {
    x: left.x,
    y: left.y,
    state: "loading",
    trip: "extraction",
    path: [],
    target: left,
    arrival: "pickup-landed",
    loadingSince: e.time - 20,
    manifest: e.world.units.slice(0, 2).map((u) => u.id),
    crew: null,
  });
  m.returnRequested = true;
  m.abortRequested = true;
  m.recoveryVersion = 2;
  m.phase = "extracting";
  m.extractionPoint = left;
  for (const [i, u] of e.world.units.entries()) {
    Object.assign(u, {
      x: i < 2 ? left.x : right.x,
      y: (i < 2 ? left.y : right.y) + (i % 2) * 4,
      path: [],
      goal: null,
      roofId: null,
      roofTransit: null,
      waitingForDeployment: false,
      boardedBy: i < 2 ? t.id : null,
    });
    if (i >= 2) {
      B.injure(s, e, u, {
        eventId: "hidden-casualty-" + i,
        part: "leftLeg",
        severity: 2,
      });
      for (const w of u.health.wounds) w.treated = true;
      u.health.conscious = false;
      u.health.kit = 0;
    }
    e.knowledge.friends[u.id] = {
      ...e.knowledge.friends[u.id],
      ...B.snapshot(u, e.time),
      observedAt: e.time,
      receivedAt: e.time,
    };
  }
  for (const q of e.squads) {
    const ev = D.internals.event(e, "received-casualty-status"),
      friends = D.internals.friendSnapshots(e, q),
      r = D.internals.radio(
        s,
        e,
        q,
        "up",
        q.leaderId,
        "HQ",
        "medical",
        "마지막 위치·부상 보고",
        ev,
        { friends },
      );
    Object.assign(r, {
      status: "delivered",
      sentAt: e.time,
      deliveredAt: e.time,
      hqVisibleAt: e.time,
    });
    for (const f of friends)
      e.knowledge.friends[f.id] = { ...f, receivedAt: e.time };
  }
  run(s, 20);
  const first = t.crew;
  assert.ok(first);
  assert.ok(first.searchPoints?.some((p) => G.distance(p, right) < 10));
  const restored = C.clone(s);
  run(restored, 2000);
  const done = restored.commandExercise;
  assert.equal(
    done.status,
    "ended",
    JSON.stringify({ time: done.time, transport: done.mission.transports[0] }),
  );
  assert.equal(done.mission.home.length, 4);
  assert.equal(
    done.mission.log.filter((ev) => ev.type === "transport-recovery-started")
      .length,
    1,
  );
  assert.ok(done.mission.log.some((ev) => ev.type === "medical-boarded"));
  C.validate(restored);
});
