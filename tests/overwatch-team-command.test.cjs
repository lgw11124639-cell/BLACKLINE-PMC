const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  S = require("../overwatch/command-staff"),
  I = require("../overwatch/infantry"),
  M = require("../overwatch/missions"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle");
function make(snipers = true, teams = 3) {
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
  const c = s.contracts.find((c) => c.key === "high-value-target");
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
