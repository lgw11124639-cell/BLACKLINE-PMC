const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  M = require("../overwatch/missions"),
  B = require("../overwatch/battle"),
  D = require("../overwatch/command"),
  G = require("../overwatch/geometry"),
  Staff = require("../overwatch/command-staff"),
  Storage = require("../overwatch/storage");
function make(key = "high-value-target", pairs = 1) {
  const s = C.createCampaign({ id: "TARGET-" + key });
  for (let i = 0; i < pairs; i++) {
    const hire = (r) =>
      P.hire(s, s.market.candidates.find((x) => x.specialty === r).id, 30);
    P.assign(s, C.CALLSIGNS[i], hire("observer").id, hire("sniper").id);
  }
  Staff.upgrade(s);
  const staff = Staff.hire(
    s,
    s.commandStaff.market.find((x) => x.duty === "controller").id,
  );
  Staff.assign(s, "controller", staff.id);
  const c = s.contracts.find((c) => c.key === key);
  M.accept(s, c.id);
  M.launch(s, c.id);
  return { s, e: s.commandExercise, c };
}
function step(s, n) {
  for (let i = 0; i < n && s.commandExercise.status === "running"; i++) {
    for (const a of s.commandExercise.world.actors.filter(
      (a) => a.side === "red",
    ))
      a.weapon.nextFireAt = s.commandExercise.time + 20;
    B.setPaused(s, false);
    D.step(s, 1);
  }
}
test("three new urban maps have distinct navigation geometry, vector art, roofs and valid wide operation paths", () => {
  const fingerprints = new Set();
  for (const id of ["urban-embassy", "urban-rail", "urban-research"]) {
    G.activate(id + "-operation");
    assert.equal(G.MAP.width, 1200);
    assert.ok(fs.statSync(G.MAP.image).size > 1000);
    fingerprints.add(JSON.stringify(G.MAP.buildings));
    assert.ok(G.roofs().length >= 10);
    assert.ok(G.path(G.MAP.base, G.project({ x: 1100, y: 775 })).length);
  }
  assert.equal(fingerprints.size, 3);
});
test("content upgrade adds only new offers and preserves accepted contract, money, members and active physical state", () => {
  const { s, e } = make("aid-cover");
  s.contracts = s.contracts.filter(
    (c) =>
      !["high-value-target", "counter-sniper", "courier-intercept"].includes(
        c.key,
      ),
  );
  delete s.operations.contentVersion;
  const before = JSON.stringify({
    e,
    m: s.members,
    f: s.headquarters.funds,
    clock: s.clock,
  });
  assert.equal(M.upgrade(s), true);
  assert.equal(M.upgrade(s), false);
  assert.equal(
    s.contracts.filter((c) => ["eliminate", "interdict"].includes(c.task))
      .length,
    3,
  );
  assert.equal(
    JSON.stringify({
      e: s.commandExercise,
      m: s.members,
      f: s.headquarters.funds,
      clock: s.clock,
    }),
    before,
  );
  C.validate(s);
});
test("ordinary enemy death and an unobserved designated death cannot satisfy a target contract", () => {
  const { s, e } = make();
  const guard = e.world.actors.find(
    (a) => a.side === "red" && !e.mission.targetIds.includes(a.id),
  );
  B.ballisticImpact(s, e, guard, {
    eventId: "guard-hit",
    model: "AXMC",
    part: "head",
    height: 1.7,
    lateral: 0,
    distance: 300,
  });
  M.tick(s, e);
  assert.equal(e.mission.objective, false);
  const target = e.world.actors.find((a) => e.mission.targetIds.includes(a.id));
  B.ballisticImpact(s, e, target, {
    eventId: "unseen-target-hit",
    model: "AXMC",
    part: "head",
    height: 1.7,
    lateral: 0,
    distance: 300,
  });
  M.tick(s, e);
  assert.equal(e.mission.objective, false);
  assert.equal(
    D.frame(s).contacts.some((c) => c.objectiveCode),
    false,
  );
  C.validate(s);
});
test("new target assignments and route/identity state survive storage round trip", () => {
  const { s, e } = make("courier-intercept");
  const mem = new Map(),
    st = Storage.create({
      storage: {
        getItem: (k) => mem.get(k) || null,
        setItem: (k, v) => mem.set(k, v),
        removeItem: (k) => mem.delete(k),
      },
    });
  st.save(s, null);
  const restored = st.load().state;
  assert.deepEqual(
    restored.commandExercise.mission.targetProgress,
    e.mission.targetProgress,
  );
  assert.deepEqual(
    restored.commandExercise.world.actors
      .filter((a) => a.missionTargetCode)
      .map((a) => [a.id, a.escapeAfter, a.deployment]),
    e.world.actors
      .filter((a) => a.missionTargetCode)
      .map((a) => [a.id, a.escapeAfter, a.deployment]),
  );
  C.validate(restored);
});
for (const key of ["high-value-target", "counter-sniper", "courier-intercept"])
  test(
    "delegated " +
      key +
      " identifies actual targets, executes physical fire and returns for settlement",
    () => {
      const { s, e } = make(key, 2);
      for (let i = 0; i < 6500 && e.status === "running"; i++) {
        step(s, 1);
        if (i % 100 === 0) C.validate(s);
      }
      fs.writeFileSync("/tmp/target-" + key + ".json", JSON.stringify(e));
      assert.equal(e.status, "ended");
      assert.equal(
        e.mission.objective,
        true,
        JSON.stringify({
          key,
          time: e.time,
          progress: e.mission.targetProgress,
          control: e.control,
        }),
      );
      assert.ok(e.events.some((ev) => ev.type === "mission-target-identified"));
      assert.ok(
        e.mission.targetProgress.confirmed.length ===
          e.mission.targetIds.length,
      );
      assert.ok(e.mission.home.length === 4);
      assert.equal(s.operations.reports.length, 1);
      assert.equal(s.operations.reports[0].success, true);
      assert.ok(
        s.operations.reports[0].events.some((ev) => ev.type === "shot-fired"),
      );
      C.validate(s);
    },
  );
test("agency infantry under real incoming fire select cover and physically move rather than keep their escort route", () => {
  const { s, e } = make("aid-cover");
  step(s, 150);
  G.activate(e.mapId);
  const u = e.world.actors.find((a) => a.id === "agency-infantry-0"),
    b = G.MAP.buildings.at(-2);
  Object.assign(u, {
    x: b[0] - 5,
    y: b[3] + 4,
    path: [],
    waitingForDeployment: false,
    lastThreatAt: e.time,
  });
  u.health = B.health();
  e.mission.phase = "field";
  const start = { x: u.x, y: u.y };
  e.battle.shots.push({
    id: "agency-cover-shot",
    time: e.time,
    actorId: "opposition-0",
    targetId: u.id,
    from: { x: u.x + 60, y: u.y },
    to: { x: u.x, y: u.y },
    side: "red",
    model: "AKM",
    hit: false,
    part: null,
  });
  M.actorTaskTick(s, e, u);
  assert.ok(e.events.some((ev) => ev.type === "agency-cover-selected"));
  assert.equal(u.state, "cover-move");
  assert.ok(G.distance(start, u) > 0);
  assert.ok(u.path.length);
  C.validate(s);
});
test("unselected HQ treatment/rest no longer blocks sortie and continues alongside actual mission time", () => {
  const s = C.createCampaign({ id: "HQ-CONCURRENT" });
  Staff.upgrade(s);
  for (let i = 0; i < 4; i++)
    P.hire(
      s,
      s.market.candidates.find(
        (x) => x.specialty === (i % 2 ? "sniper" : "observer"),
      ).id,
      30,
    );
  P.assign(s, "ALPHA", s.members[0].id, s.members[1].id);
  P.start(s, { kind: "rest", memberIds: [s.members[2].id], hours: 6 });
  const activity = s.activities.at(-1),
    c = s.contracts.find((c) => c.key === "high-value-target");
  s.commandStaff.delegated = false;
  M.accept(s, c.id);
  assert.equal(M.ready(s, c), null);
  M.launch(s, c.id);
  step(s, 60);
  assert.equal(activity.status, "running");
  assert.equal(activity.workedSeconds, 60);
  assert.equal(s.members[2].status, "resting");
  C.validate(s);
});
test("moving escort waypoints preserve the current ground route instead of repeatedly returning to the rounded grid start", () => {
  const { s, e } = make("rescue-cover", 2);
  step(s, 150);
  const u = e.world.actors.find((a) => a.id === "agency-protected");
  Object.assign(u, {
    x: 458.62,
    y: 471.38,
    path: [],
    waitingForDeployment: false,
  });
  u.health = B.health();
  const m = e.mission;
  m.phase = "field";
  m.taskLinked = true;
  const start = { x: u.x, y: u.y };
  for (let i = 0; i < 80; i++) {
    e.time++;
    P.elapse(s, 1);
    m.agencyControl.authorized = true;
    m.agencyControl.lastAssessment = e.time;
    m.agencyControl.waypoint = {
      x: 398 + (Math.floor(i / 12) % 2) * 6,
      y: 572,
    };
    M.actorTaskTick(s, e, u);
  }
  assert.ok(
    G.distance(u, start) > 30,
    JSON.stringify({ start, end: { x: u.x, y: u.y } }),
  );
  C.validate(s);
});
test("courier time window starts a real escape route, not an automatic timer failure", () => {
  const { s, e } = make("courier-intercept");
  s.commandStaff.delegated = false;
  const targets = e.world.actors.filter((a) => a.missionTargetCode);
  for (const a of targets) a.escapeAfter = e.time + 1;
  step(s, 2);
  assert.equal(e.mission.objectiveFailed, false);
  assert.ok(targets.every((a) => !a.escaped));
  for (let i = 0; i < 1800 && !e.mission.objectiveFailed; i++) step(s, 1);
  assert.equal(e.mission.objectiveFailed, true);
  const escaped = targets.find((a) => a.escaped);
  assert.ok(escaped);
  assert.ok(G.distance(escaped, e.mission.targetExit) < 8);
  C.validate(s);
});

test("agency escort stays at insertion until sniper positions are physically secured and reported, with a distributed forward overwatch", () => {
  const { s, e } = make("aid-cover", 2);
  let waitingPosition = null;
  for (
    let i = 0;
    i < 4000 &&
    !e.mission.agencyControl.everAuthorized &&
    e.status === "running";
    i++
  ) {
    step(s, 1);
    const protectedUnit = e.world.actors.find(
      (a) => a.id === "agency-protected",
    );
    if (
      e.mission.fieldStartedAt != null &&
      !e.mission.agencyControl.everAuthorized
    ) {
      if (!waitingPosition)
        waitingPosition = { x: protectedUnit.x, y: protectedUnit.y };
      assert.ok(G.distance(protectedUnit, waitingPosition) < 1);
    }
  }
  const g = e.mission.agencyControl;
  assert.ok(waitingPosition);
  assert.ok(g.everAuthorized);
  const approval = g.history.find((x) => x.authorized);
  assert.ok(approval);
  for (const call of g.readyTeams)
    assert.ok(
      e.commands.some(
        (c) =>
          c.callsign === call &&
          ["recon", "cover"].includes(c.kind) &&
          c.completedAt != null &&
          c.completedAt <= approval.at,
      ),
    );
  const positions = e.squads.map((q) => q.tactical.position);
  assert.ok(
    positions.some((p) => G.distance(p, e.mission.contract.insertion) > 150),
  );
  assert.ok(G.distance(positions[0], positions[1]) > 100);
  C.validate(s);
});
