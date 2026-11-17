const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  S = require("../overwatch/command-staff"),
  I = require("../overwatch/infantry"),
  M = require("../overwatch/missions"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle");
function make(snipers = true, teams = 3, key = "high-value-target") {
  const s = C.createCampaign({ id: "NEW-TEAM-DOCTRINE" });
  S.upgrade(s);
  P.finance(s, 200000000 - s.headquarters.funds, "test-funds");
  const chief = S.hire(
    s,
    s.commandStaff.market.find((m) => m.duty === "controller").id,
  );
  S.assign(s, "controller", chief.id);
  I.initialize(s);
  for (let i = 0; i < teams; i++)
    for (const c of s.infantry.market) I.hire(s, c.id);
  I.formTeams(s);
  if (snipers) {
    const h = (r) =>
      P.hire(s, s.market.candidates.find((m) => m.specialty === r).id, 30);
    P.assign(s, "ALPHA", h("observer").id, h("sniper").id);
  }
  const c = s.contracts.find((c) => c.key === key);
  M.accept(s, c.id);
  M.setTeams(s, c.id, snipers ? ["ALPHA"] : []);
  return { s, c };
}
function step(s, n) {
  for (let i = 0; i < n && s.commandExercise.status === "running"; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
  }
}
test("manual infantry formation enforces four distinct roles and no duplicate or training assignments", () => {
  const { s } = make();
  assert.equal(I.squads(s).length, 3);
  const q = s.infantry.teams[0];
  assert.throws(() => I.assignTeam(s, "BRAVO", q.memberIds), /다른/);
  I.train(s);
  assert.throws(() => I.assignTeam(s, "ALPHA", q.memberIds), /훈련/);
  C.validate(s);
});
test("infantry can deploy without any sniper team and receive independent team directives", () => {
  const { s, c } = make(false);
  assert.equal(M.ready(s, c), null);
  M.launch(s, c.id);
  for (const a of s.commandExercise.world.actors.filter(
    (a) => a.side === "red",
  ))
    a.health.conscious = false;
  step(s, 180);
  const e = s.commandExercise;
  assert.equal(e.squads.length, 0);
  assert.equal(e.world.units.length, 0);
  assert.equal(I.units(e).length, 12);
  assert.ok(!e.mission.abortRequested);
  const orders = e.mission.hqInfantry.teamDirectives;
  assert.deepEqual(Object.keys(orders).sort(), ["ALPHA", "BRAVO", "CHARLIE"]);
  assert.equal(
    new Set(Object.values(orders).map((d) => d.point.x + "," + d.point.y)).size,
    3,
  );
  assert.ok(Object.values(orders).every((d) => d.source === "controller"));
  C.validate(s);
});
test("one team direct order does not overwrite another team and internal radio is hidden", () => {
  const { s, c } = make();
  M.launch(s, c.id);
  for (const a of s.commandExercise.world.actors.filter(
    (a) => a.side === "red",
  ))
    a.health.conscious = false;
  step(s, 140);
  const e = s.commandExercise,
    before = C.clone(e.mission.hqInfantry.teamDirectives.BRAVO);
  I.command(s, "hold", { x: 100, y: 775 }, "headquarters", "ALPHA");
  step(s, 6);
  assert.equal(e.mission.hqInfantry.teamDirectives.ALPHA.mode, "hold");
  assert.equal(
    e.mission.hqInfantry.teamDirectives.BRAVO.messageId,
    before.messageId,
  );
  assert.ok(D.frame(s).radio.every((r) => r.channel !== "internal"));
  C.validate(s);
});
test("both force types can be independently excluded but an empty sortie is rejected", () => {
  const { s, c } = make();
  s.infantry.deploy = false;
  assert.equal(M.ready(s, c), null);
  M.setTeams(s, c.id, []);
  assert.match(M.ready(s, c), /하나 이상/);
});
test("a primary helicopter waits for mobile teammates instead of returning after one recovered passenger", () => {
  const { s, c } = make(true, 0);
  s.infantry.deploy = false;
  c.transport = "helicopter";
  M.launch(s, c.id);
  const e = s.commandExercise,
    m = e.mission,
    t = m.transports[0],
    [aboard, pending] = e.world.units;
  for (const u of e.world.actors.filter((u) => u.side === "red"))
    u.health.conscious = false;
  Object.assign(aboard, {
    x: 100,
    y: 775,
    boardedBy: t.id,
    waitingForDeployment: false,
  });
  Object.assign(pending, {
    x: 180,
    y: 775,
    boardedBy: null,
    waitingForDeployment: false,
  });
  Object.assign(t, {
    x: 100,
    y: 775,
    state: "loading",
    manifest: [aboard.id],
    loadingSince: e.time - 20,
    crew: {
      id: t.id + "-recovery",
      name: "기관 수송 회수요원",
      x: 100,
      y: 775,
      state: "search",
      targetId: null,
      patientId: null,
      path: [],
      dueAt: null,
    },
  });
  m.returnRequested = true;
  m.phase = "extracting";
  m.extractionPoint = { x: 100, y: 775 };
  m.fieldStartedAt = 0;
  M.beforeTick(s, e);
  assert.equal(t.state, "loading");
  assert.ok(t.manifest.includes(aboard.id));
  assert.ok(!pending.boardedBy);
});
test("three spread infantry teams physically recover all twelve healthy members instead of declaring a timed partial pickup", () => {
  const { s, c } = make(false, 3);
  M.launch(s, c.id);
  const e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  for (const [i, u] of I.units(e).entries())
    Object.assign(u, {
      x: 100 + i * 50,
      y: 775,
      path: [],
      goal: null,
      waitingForDeployment: false,
    });
  e.mission.phase = "field";
  e.mission.fieldStartedAt = 0;
  e.mission.returnRequested = true;
  step(s, 3600);
  assert.equal(e.mission.hqInfantry.transport.state, "home");
  assert.ok(I.units(e).every((u) => u.home));
  assert.equal(e.mission.hqInfantry.transport.manifest.length, 12);
  assert.ok(s.infantry.members.every((m) => m.status === "standby"));
  C.validate(s);
});

test("a leader receives a team directive before individual members receive their hidden local instructions", () => {
  const { s, c } = make(false, 1);
  M.launch(s, c.id);
  const e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  I.command(s, "hold", { x: 100, y: 775 }, "headquarters", "ALPHA");
  for (let i = 0; i < 10 && !e.mission.hqInfantry.teamDirectives?.ALPHA; i++)
    step(s, 1);
  const f = e.mission.hqInfantry,
    l = I.leader(e, "ALPHA");
  assert.ok(f.teamDirectives.ALPHA);
  assert.ok(f.memberOrders[l.id]);
  const packets = e.radio.filter((r) => r.payload?.infantryMemberOrder);
  assert.equal(packets.length, 3);
  assert.ok(
    packets.every(
      (r) => r.from.id === l.id && r.internal && r.status === "queued",
    ),
  );
  step(s, 3);
  assert.equal(Object.keys(f.memberOrders).length, 4);
  assert.equal(
    new Set(Object.values(f.memberOrders).map((o) => o.task)).size,
    4,
  );
  assert.ok(
    D.frame(s).radio.every((r) => !r.body.includes("전방 수색·근접 경계")),
  );
  C.validate(s);
});
test("HQ infantry projects rooftop goals to ground access and physically descends an existing roof assignment", () => {
  const { s, c } = make(false, 1);
  M.launch(s, c.id);
  const e = s.commandExercise,
    G = require("../overwatch/geometry"),
    u = I.units(e)[0],
    roof = G.roofs()[0];
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  M.moveGround(u, roof.point, 1, e);
  assert.ok(!u.taskMoveGoal.roofId);
  assert.ok(!u.path.some((p) => p.roofTransition === "up"));
  Object.assign(u, roof.point, {
    path: [],
    goal: null,
    waitingForDeployment: false,
  });
  e.mission.phase = "field";
  e.mission.fieldStartedAt = 0;
  step(s, 180);
  assert.ok(!u.roofId);
  assert.ok(!u.path.some((p) => p.roofTransition === "up"));
  C.validate(s);
});
test("field reports reach the commander through the squad leader without exposing the member radio packet", () => {
  const { s, c } = make(false, 1);
  M.launch(s, c.id);
  const e = s.commandExercise,
    l = I.leader(e, "ALPHA"),
    u = I.units(e).find((u) => u.assignmentRole === "rifleman"),
    ev = D.internals.event(e, "local-arrival-report");
  I.report(s, e, u, "arrival", "지정 도로 도착 확인", ev, {});
  assert.equal(e.radio.at(-1).to.id, l.id);
  assert.equal(e.radio.at(-1).internal, true);
  step(s, 8);
  const shown = D.frame(s).radio.filter((r) =>
    r.body.includes("지정 도로 도착 확인"),
  );
  assert.equal(shown.length, 1);
  assert.equal(shown[0].from.id, l.id);
  assert.equal(shown[0].channel, "hq");
  I.report(
    s,
    e,
    u,
    "arrival",
    "지정 도로 도착 확인",
    D.internals.event(e, "repeat-local-arrival"),
    {},
  );
  step(s, 8);
  assert.equal(
    D.frame(s).radio.filter((r) => r.body.includes("지정 도로 도착 확인"))
      .length,
    1,
  );
  C.validate(s);
});
test("a threatened wounded squad automatically uses one smoke without exhausting every member stock at once", () => {
  const { s, c } = make(false, 1);
  M.launch(s, c.id);
  const e = s.commandExercise,
    O = require("../overwatch/ordnance");
  for (const [i, u] of I.units(e).entries())
    Object.assign(u, {
      x: 100 + i * 3,
      y: 775,
      path: [],
      waitingForDeployment: false,
    });
  const [u, v] = I.units(e);
  B.injure(s, e, u, {
    eventId: "smoke-cover-injury",
    part: "leftArm",
    severity: 1,
  });
  const attacker = e.world.actors.find((a) => a.side === "red");
  Object.assign(attacker, { x: 130, y: 775, path: [] });
  Object.assign(attacker.weapon, {
    targetId: u.id,
    aimSince: e.time - 10,
    aimAnchor: { x: u.x, y: u.y },
    aimOrigin: { x: attacker.x, y: attacker.y },
    aimAnchorAt: e.time - 1,
    nextFireAt: e.time,
  });
  assert.ok(
    B.fire(
      s,
      e,
      attacker,
      { id: u.id, x: u.x, y: u.y, lastSeen: e.time },
      { suppress: true },
    ),
  );
  u.lastThreatAt = e.time;
  v.lastThreatAt = e.time;
  assert.ok(B.underFire(e, u));
  assert.equal(O.ai(s, e, u, []), true);
  assert.equal(u.grenades.spent.smoke, 1);
  assert.equal(O.ai(s, e, v, []), false);
  assert.equal(v.grenades.spent.smoke, 0);
  assert.equal(
    O.state(e).projectiles.filter((p) => p.kind === "smoke").length,
    1,
  );
  C.validate(s);
});

test("stalled infantry-only escort replans through infantry leaders without dereferencing an absent sniper callsign", () => {
  const { s, c } = make(false, 1, "vip-cover");
  M.launch(s, c.id);
  const e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  step(s, 360);
  e.control.lastAssess = e.time - 30;
  S.tick(s, e);
  const w = e.control.progressWatch;
  assert.ok(w);
  w.lastUsefulAt = e.time - 301;
  w.bestRemaining = 0;
  w.replanAt = null;
  w.visited = (e.mission.knowledge.actors || []).map(
    (a) =>
      a.id +
      ":" +
      Math.floor(a.x / 20) +
      ":" +
      Math.floor(a.y / 20) +
      ":" +
      (a.roofId || "ground"),
  );
  e.control.lastAssess = e.time - 30;
  assert.doesNotThrow(() => S.tick(s, e));
  assert.equal(w.replanAt, e.time);
  assert.ok(
    e.events.some((ev) => ev.type === "controller-infantry-route-stalled"),
  );
  assert.equal(e.squads.length, 0);
  C.validate(s);
});

test("infantry-only rescue settlement counts the deployed force and repairs a legacy false failure once", () => {
  const { s, c } = make(false, 2, "rescue-cover");
  M.launch(s, c.id);
  const e = s.commandExercise,
    m = e.mission;
  assert.equal(e.world.units.length, 0);
  for (const u of I.units(e)) u.home = true;
  m.objective = true;
  m.protectedHome = true;
  m.finalizing = true;
  e.status = "ended";
  const r = M.settle(s, e);
  assert.equal(r.returnComplete, true);
  assert.equal(r.success, true);
  assert.equal(r.reward, c.reward);
  const cash = s.headquarters.funds;
  M.settle(s, e);
  assert.equal(s.headquarters.funds, cash);
  const payment = r.reward + r.bonus;
  P.finance(s, -payment, "test-legacy-result");
  Object.assign(r, {
    returnComplete: false,
    success: false,
    reward: 0,
    bonus: 0,
  });
  assert.equal(M.upgrade(s), true);
  assert.equal(r.success, true);
  assert.equal(r.returnComplete, true);
  assert.equal(s.headquarters.funds, cash);
  M.upgrade(s);
  assert.equal(s.headquarters.funds, cash);
});

test("a living infantry member left behind prevents success even when snipers returned", () => {
  const { s, c } = make(true, 1, "rescue-cover");
  M.launch(s, c.id);
  const e = s.commandExercise,
    m = e.mission;
  m.home = e.world.units.map((u) => u.id);
  for (const u of I.units(e)) u.home = true;
  I.units(e)[0].home = false;
  m.objective = true;
  m.finalizing = true;
  e.status = "ended";
  const r = M.settle(s, e);
  assert.equal(r.returnComplete, false);
  assert.equal(r.success, false);
  assert.equal(r.reward, 0);
  M.upgrade(s);
  assert.equal(r.success, false);
});

test("undeployed first team stays visible with its launch reason while teams two and three deploy", () => {
  const { s, c } = make(false, 3, "rescue-cover");
  s.infantry.disabledSquads = ["ALPHA"];
  const choices = I.deployment(s);
  assert.equal(choices[0].reason, "출격 선택 해제");
  assert.equal(choices[0].deployed, false);
  M.launch(s, c.id);
  const e = s.commandExercise;
  assert.equal(I.units(e).length, 8);
  assert.ok(I.units(e).every(u => u.hqTeam !== "ALPHA"));
  assert.match(I.live(s), /본부 1팀 · 미출격 · 출격 선택 해제/);
  assert.equal(e.mission.hqInfantry.teamDeployment.length, 3);
});
