const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle");
function scenario(distance, optics = true, soloObserver = false) {
  const s = C.createCampaign({ id: "VISION" }),
    o = P.hire(
      s,
      s.market.candidates.find((c) => c.specialty === "observer").id,
      30,
    ),
    n = P.hire(
      s,
      s.market.candidates.find((c) => c.specialty === "sniper").id,
      30,
    );
  P.assign(s, "ALPHA", o.id, n.id);
  B.begin(s, { seed: 7 });
  const e = s.commandExercise,
    u = e.world.units[0],
    t = e.world.actors[0];
  Object.assign(u, { x: 100, y: 700, path: [], goal: null });
  Object.assign(e.world.units[1], { x: 80, y: 680, path: [], goal: null });
  Object.assign(t, {
    x: 100 + distance,
    y: 700,
    heading: 0,
    route: [{ x: 100 + distance, y: 700 }],
    waypoint: 0,
    speed: 0,
  });
  e.world.actors = [t];
  if (soloObserver) e.world.units[1].home = true;
  if (optics) D.issue(s, "ALPHA", "observe", { x: 1190, y: 700 });
  else D.issue(s, "ALPHA", "hold");
  for (let i = 0; i < 45; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
    C.validate(s);
  }
  return { s, e, u, t };
}
test("an observer identifies a target beyond rifle range but cannot fire at it", () => {
  const { s, e, u, t } = scenario(500);
  assert.ok(
    u.visionRange > u.weapon.range ||
      u.visionRange > B.WEAPONS[u.weapon.model].range,
  );
  assert.ok(
    D.frame(s).contacts.some(
      (c) => c.id === t.id && c.classification === "armed-person",
    ),
  );
  const before = u.weapon.loaded;
  u.weapon.targetId = t.id;
  u.weapon.aimSince = 0;
  B.fire(s, e, u, { id: t.id, x: t.x, y: t.y, condition: "standing" });
  assert.equal(u.weapon.loaded, before);
  assert.ok(u.visionRange > B.WEAPONS[u.weapon.model].range);
});
test("a detected distant person does not become an identified armed target outside identification range", () => {
  const { s, u, t } = scenario(900, true, true);
  const c = D.frame(s).contacts.find((c) => c.id === t.id);
  assert.ok(c);
  assert.equal(c.classification, "unknown");
  assert.ok(c.confidence < 0.8);
  assert.ok(u.visionRange > 900);
  assert.ok(u.identificationRange < 900);
});
test("weapon range never reveals someone outside unassisted sight", () => {
  const { s, e, u, t } = scenario(400, false);
  assert.equal(D.frame(s).contacts.length, 0);
  assert.ok(B.WEAPONS[u.weapon.model].range > 400);
  assert.ok(u.visionRange < 400);
  assert.equal(e.battle.totalShots, 0);
});

test("a visibly killed target is confirmed once instead of repeating active coordinate reports", () => {
  const { s, e, t } = scenario(500);
  B.injure(s, e, t, { eventId: "confirmed-impact", part: "head", severity: 3 });
  assert.equal(t.health.alive, false);
  const start = e.radio.length;
  for (let i = 0; i < 90; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
    C.validate(s);
  }
  const reports = e.radio
    .slice(start)
    .filter((r) => r.payload?.contact?.id === t.id);
  assert.equal(reports.length, 1);
  assert.match(reports[0].body, /사살 확인/);
  assert.doesNotMatch(reports[0].body, /좌표|무장 인원 관측/);
  assert.equal(reports[0].payload.contact.medicalCondition, "dead");
  assert.equal(
    D.frame(s).contacts.find((c) => c.id === t.id).medicalCondition,
    "dead",
  );
  // Existing saves have no terminal-report marker; the next actual sighting repairs it.
  delete e.squads[0].contacts.find((c) => c.id === t.id).reportedCondition;
  const restoreStart = e.radio.length;
  for (let i = 0; i < 60; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
  }
  assert.equal(
    e.radio.slice(restoreStart).filter((r) => r.payload?.contact?.id === t.id)
      .length,
    1,
  );
});

test("an unidentifiable distant body cannot produce a confirmed kill report", () => {
  const { s, e, t } = scenario(900, true, true);
  B.injure(s, e, t, { eventId: "distant-impact", part: "head", severity: 3 });
  const start = e.radio.length;
  for (let i = 0; i < 60; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
    C.validate(s);
  }
  const reports = e.radio
    .slice(start)
    .filter((r) => r.payload?.contact?.id === t.id);
  assert.equal(reports.length, 1);
  assert.match(reports[0].body, /사망 여부 미확인/);
  assert.doesNotMatch(reports[0].body, /사살 확인/);
  assert.equal(reports[0].payload.contact.medicalCondition, "down");
});

test("moving units face their route instead of turning toward the observation sector", () => {
  const { s, e, u } = scenario(400, false);
  Object.assign(u, { x: 600, y: 700, path: [], goal: null });
  Object.assign(e.world.units[1], { x: 590, y: 680, path: [], goal: null });
  D.issue(s, "ALPHA", "move", { x: 200, y: 700 });
  let checked = 0;
  for (let i = 0; i < 50; i++) {
    e.squads[0].sector = { x: 1190, y: 700 };
    const x = u.x,
      y = u.y;
    B.setPaused(s, false);
    D.step(s, 1);
    C.validate(s);
    if (u.path.length && Math.hypot(u.x - x, u.y - y) > 0.1) {
      const expected = Math.atan2(u.y - y, u.x - x);
      assert.ok(Math.cos(u.heading - expected) > 0.99);
      checked++;
    }
  }
  assert.ok(checked > 5);
});

test("routine status telemetry stays fresh while routine radio updates stay hidden", () => {
  const { s, e } = scenario(400, false);
  e.world.actors = [];
  for (let i = 0; i < 240; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
  }
  const raw = e.radio.filter(
    (r) => r.kind === "position" && r.hqVisibleAt !== null,
  );
  const f = D.frame(s),
    visible = f.radio.filter((r) => r.kind === "position");
  assert.ok(raw.length >= 7);
  assert.equal(visible.length, 0);
  assert.ok(f.friends.every((u) => u.age < 35));
  // Never suppress important messages while hiding redundant routine updates.
  for (const r of e.radio.filter(
    (r) => r.kind === "urgent" && r.hqVisibleAt !== null,
  ))
    assert.ok(f.radio.some((v) => v.id === r.id));
  C.validate(s);
});

test("observer autonomy quietly evades a fresh close threat during reconnaissance", () => {
  const { s, e, u } = scenario(200);
  const q = e.squads[0],
    target = q.contacts[0];
  e.commands.find((c) => c.id === q.commandId).kind = "recon";
  e.battle.observerAutonomy = true;
  const before = Math.hypot(u.x - target.x, u.y - target.y);
  assert.equal(B.observerDecision(s, e, q, u, target), false);
  assert.equal(q.fieldDecision.mode, "evade");
  assert.ok(u.path.length > 0);
  assert.ok(Math.hypot(u.goal.x - target.x, u.goal.y - target.y) > before);
  assert.equal(u.weapon.spent, 0);
  C.validate(s);
  const copy = C.clone(s);
  C.validate(copy);
  assert.deepEqual(
    copy.commandExercise.squads[0].fieldDecision,
    q.fieldDecision,
  );
});

test("observer approves cover fire independently of the old HQ hold setting but protects civilians", () => {
  const { s, e } = scenario(500);
  const q = e.squads[0],
    u = e.world.units[1],
    target = q.contacts[0];
  e.commands.find((c) => c.id === q.commandId).kind = "cover";
  q.roe = "hold";
  e.battle.observerAutonomy = true;
  u.path = [];
  assert.equal(B.observerDecision(s, e, q, u, target), true);
  q.contacts.push({
    id: "observed-civilian",
    x: target.x - 2,
    y: target.y,
    lastSeen: e.time,
    confidence: 0.95,
    classification: "unarmed-person",
  });
  assert.equal(B.observerDecision(s, e, q, u, target), false);
});

test("the sniper optical identification is not capped by the observer lower-detail long-range view", () => {
  const { s, e, t } = scenario(900);
  const c = D.frame(s).contacts.find((c) => c.id === t.id);
  assert.equal(c.classification, "armed-person");
  assert.ok(e.squads[0].contacts.find((x) => x.id === t.id).confidence >= 0.8);
  for (let i = 0; i < 20; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
  }
  assert.equal(
    D.frame(s).contacts.find((c) => c.id === t.id).classification,
    "armed-person",
  );
  C.validate(s);
});

test("steady tracked contacts update map intelligence without repeated audible coordinate reports", () => {
  const { s, e, t } = scenario(500);
  for (let i = 0; i < 120; i++) {
    t.weapon.nextFireAt = e.time + 20;
    for (const u of e.world.units) u.weapon.nextFireAt = e.time + 20;
    B.setPaused(s, false);
    D.step(s, 1);
  }
  const reports = e.radio.filter((r) => r.payload?.contact?.id === t.id);
  assert.ok(reports.some((r) => r.kind === "position"));
  assert.ok(reports.filter((r) => r.kind === "observation").length <= 3);
  assert.ok(D.frame(s).radio.every((r) => r.kind !== "position"));
  // Old versions stored ordinary tracking packets as voiced observations.
  for (const r of reports) if (r.kind === "position") r.kind = "observation";
  assert.ok(
    D.frame(s).radio.filter((r) => r.kind === "observation").length <= 3,
  );
  C.validate(s);
});
