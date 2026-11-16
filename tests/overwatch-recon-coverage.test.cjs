const test = require("node:test"),
  assert = require("node:assert/strict");
const C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  M = require("../overwatch/missions"),
  G = require("../overwatch/geometry");
function make() {
  const s = C.createCampaign({ id: "RECON-COVERAGE" });
  const h = (r) =>
    P.hire(s, s.market.candidates.find((c) => c.specialty === r).id, 30);
  P.assign(s, "ALPHA", h("observer").id, h("sniper").id);
  const c = s.contracts.find((c) => c.key === "ridge-watch");
  M.accept(s, c.id);
  M.launch(s, c.id);
  const e = s.commandExercise,
    m = e.mission;
  m.fieldStartedAt = 0;
  m.phase = "field";
  for (const a of e.world.actors.filter((a) => a.side === "ally"))
    a.waitingForDeployment = a.id !== "agency-infantry-0";
  return { s, e, m };
}
function tick(x) {
  x.e.time++;
  x.s.clock.elapsedSeconds = x.e.startedAt + x.e.time;
  M.tick(x.s, x.e);
}
test("identifying even every enemy does not complete reconnaissance or replace physical area inspection", () => {
  const x = make();
  for (const q of x.e.squads)
    q.contacts = x.e.world.actors
      .filter((a) => a.side === "red")
      .map((a) => ({
        id: a.id,
        x: a.x,
        y: a.y,
        classification: "armed-person",
        confidence: 1,
        lastSeen: x.e.time,
      }));
  tick(x);
  assert.equal(x.m.objective, false);
  assert.equal(x.m.reconPlan.areas.length, 6);
  assert.equal(
    x.m.reconPlan.areas.filter((a) => a.checkedAt != null).length,
    0,
  );
});
test("recon requires sequential actual patrol presence and inspection time through the exit route", () => {
  const x = make();
  tick(x);
  const g = x.m.securityControl;
  g.everAuthorized = true;
  const guard = x.e.world.actors.find((a) => a.id === "agency-infantry-0");
  for (const area of x.m.reconPlan.areas) {
    Object.assign(guard, area.point);
    guard.roofId = null;
    guard.lastThreatAt = -100;
    g.authorized = true;
    g.lastAssessment = x.e.time;
    for (let i = 0; i < 19; i++) tick(x);
    assert.equal(area.checkedAt, null);
    tick(x);
    assert.notEqual(area.checkedAt, null);
    if (area.id < 5) assert.equal(x.m.objective, false);
  }
  assert.equal(x.m.objective, true);
  assert.equal(x.m.knowledge.reconProgress, undefined);
  const report = x.e.radio.findLast((r) => r.payload?.reconProgress);
  M.applyPayload(x.e, report);
  assert.equal(x.m.knowledge.reconProgress.checked, 6);
  assert.equal(
    x.m.log.filter((e) => e.type === "recon-area-checked").length,
    6,
  );
  C.validate(x.s);
});
test("absent, wounded or currently threatened patrol cannot accumulate inspection time; progress survives save data", () => {
  const x = make();
  tick(x);
  x.m.securityControl.everAuthorized = true;
  x.m.securityControl.authorized = true;
  const a = x.e.world.actors.find((a) => a.id === "agency-infantry-0"),
    area = x.m.reconPlan.areas[0];
  Object.assign(a, area.point);
  a.health.conscious = false;
  for (let i = 0; i < 25; i++) tick(x);
  assert.equal(area.dwell, 0);
  a.health.conscious = true;
  for (let i = 0; i < 10; i++) {
    a.lastThreatAt = x.e.time;
    tick(x);
  }
  assert.equal(area.dwell, 0);
  a.lastThreatAt = -100;
  for (let i = 0; i < 7; i++) tick(x);
  assert.equal(area.dwell, 7);
  const restored = C.clone(x.s);
  C.validate(restored);
  assert.deepEqual(restored.commandExercise.mission.reconPlan, x.m.reconPlan);
});
