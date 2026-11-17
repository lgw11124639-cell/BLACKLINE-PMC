const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  M = require("../overwatch/missions"),
  S = require("../overwatch/command-staff");
function make(n = 4) {
  const s = C.createCampaign({ id: "ACADEMY" });
  S.upgrade(s);
  for (let i = 0; i < n; i++)
    P.hire(
      s,
      s.market.candidates.find(
        (c) => c.specialty === (i % 2 ? "sniper" : "observer"),
      ).id,
      30,
    );
  if (n >= 2) P.assign(s, "ALPHA", s.members[0].id, s.members[1].id);
  for (const duty of ["instructor", "controller"]) {
    const staff = S.hire(
      s,
      s.commandStaff.market.find((c) => c.duty === duty).id,
    );
    S.assign(s, duty, staff.id);
  }
  return s;
}
test("instructor creates a paid two-to-four member training cohort without disbanding an existing pair and blocks formation changes while busy", () => {
  const s = make(),
    formation = C.clone(s.squads);
  assert.equal(S.manageTraining(s), true);
  const a = s.activities.find((a) => a.status === "running");
  assert.equal(a.memberIds.length, 4);
  assert.equal(a.cost, 200000);
  assert.equal(a.instructorId, s.commandStaff.instructorId);
  assert.deepEqual(s.squads, formation);
  assert.throws(() => P.assign(s, "ALPHA", s.members[0].id, s.members[1].id));
  assert.throws(() => P.clearSquad(s, "ALPHA"));
  C.validate(s);
  const copy = C.clone(s),
    course = a.course,
    before = s.members[0].skills[course];
  S.manageTraining(copy, 14400);
  assert.ok(copy.members[0].skills[course] > before);
  assert.equal(copy.activities[0].status, "completed");
  C.validate(copy);
});
test("one available trainee waits for another; a group over four or a forged instructor is rejected", () => {
  const s = make(1);
  S.manageTraining(s);
  assert.equal(s.activities.length, 0);
  assert.match(s.commandStaff.trainingPlan.status, /2명/);
  const x = make(6);
  assert.throws(() =>
    P.start(x, {
      kind: "training",
      memberIds: x.members.slice(0, 5).map((m) => m.id),
      course: "shooting",
      hours: 4,
      instructorId: x.commandStaff.instructorId,
    }),
  );
  assert.throws(() =>
    P.start(x, {
      kind: "training",
      memberIds: x.members.slice(0, 2).map((m) => m.id),
      course: "shooting",
      hours: 4,
      instructorId: "forged",
    }),
  );
});
test("the instructor prioritizes actual fatigue recovery, respects daily training budget, and can pause management", () => {
  const s = make();
  s.members[0].fatigue = 55;
  S.manageTraining(s);
  const rest = s.activities[0];
  assert.equal(rest.kind, "rest");
  S.manageTraining(s, 21600);
  assert.ok(s.members[0].fatigue < 55);
  for (let i = 0; i < 12; i++) S.manageTraining(s, 14400);
  const spending = {};
  for (const a of s.activities.filter((a) => a.instructorId)) {
    const day = Math.floor(a.startedAt / 86400);
    spending[day] = (spending[day] || 0) + a.cost;
  }
  assert.ok(Object.values(spending).every((n) => n <= 500000));
  s.commandStaff.autoTraining = false;
  const before = JSON.stringify(s);
  assert.equal(S.manageTraining(s, 60), false);
  assert.equal(JSON.stringify(s), before);
  C.validate(s);
});
test("accepting an operation interrupts only instructor-managed activities and preserves the selected formation for real deployment", () => {
  const s = make();
  S.manageTraining(s);
  const c = s.contracts.find((c) => c.key === "aid-cover");
  M.accept(s, c.id);
  assert.ok(s.activities.every((a) => a.status !== "running"));
  assert.equal(S.manageTraining(s, 60), false);
  assert.equal(M.ready(s, c), null);
  M.launch(s, c.id);
  assert.equal(s.commandExercise.world.units.length, 2);
  C.validate(s);
});
test("twenty field members are supported independently of staff and deployment remains six", () => {
  const s = make(6);
  P.finance(s, 200000000, "test-capital");
  while (s.members.length < P.MAX_MEMBERS) {
    if (!s.market.candidates.length) {
      P.elapse(s, 12 * P.HOUR);
      P.refreshMarket(s);
    }
    P.hire(s, s.market.candidates[0].id, 30);
  }
  assert.equal(s.members.length, 20);
  assert.throws(() => P.hire(s, "over-capacity", 30));
  P.assign(s, "BRAVO", s.members[2].id, s.members[3].id);
  P.assign(s, "CHARLIE", s.members[4].id, s.members[5].id);
  B.begin(s, { seed: 7 });
  assert.equal(s.commandExercise.world.units.length, 6);
  C.validate(s);
});
test("a direct AXMC chest hit is lethal while grazes and extremity impacts remain distinct", () => {
  const s = make(2);
  B.begin(s, { seed: 7 });
  const e = s.commandExercise,
    units = e.world.actors.filter((a) => a.side === "red");
  B.ballisticImpact(s, e, units[0], {
    eventId: "precision-vital",
    model: "AXMC",
    part: "chest",
    height: 1.2,
    lateral: 0.05,
    distance: 900,
  });
  assert.equal(units[0].health.alive, false);
  B.ballisticImpact(s, e, units[1], {
    eventId: "precision-graze",
    model: "AXMC",
    part: "chest",
    height: 1.2,
    lateral: 0.32,
    distance: 900,
  });
  assert.equal(units[1].health.alive, true);
  B.ballisticImpact(s, e, units[2], {
    eventId: "precision-limb",
    model: "AXMC",
    part: "leftLeg",
    height: 0.4,
    lateral: 0.1,
    distance: 500,
  });
  assert.equal(units[2].health.alive, true);
  C.validate(s);
});
test("actual incoming fire causes a mobile sniper pair to leave the exposed position with real alternate paths", () => {
  const s = make(2),
    c = s.contracts.find((c) => c.key === "aid-cover");
  M.accept(s, c.id);
  M.launch(s, c.id);
  const e = s.commandExercise;
  for (let i = 0; i < 150; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
  }
  const u = e.world.units[1],
    enemy = e.world.actors.find((a) => a.side === "red");
  Object.assign(u, { x: 200, y: 775, path: [], goal: null });
  Object.assign(e.world.units[0], { x: 205, y: 775, path: [], goal: null });
  delete u.roofId;
  delete e.world.units[0].roofId;
  u.lastThreatAt = e.time;
  e.world.units[0].lastThreatAt = e.time;
  const from = { x: 350, y: 775 };
  e.battle.shots.push({
    id: "incoming-displacement",
    time: e.time,
    actorId: enemy.id,
    targetId: u.id,
    from,
    to: { x: 201, y: 775 },
    side: "red",
    model: "AKM",
    hit: false,
    part: null,
  });
  B.tick(s, e);
  assert.ok(e.events.some((ev) => ev.type === "sniper-position-abandoned"));
  assert.ok(e.squads[0].displacement);
  assert.ok(e.world.units.some((unit) => unit.path.length > 0));
  assert.ok(e.squads[0].avoidPositions.length);
});

test("injured agency infantry transmit incoming-fire evidence without giving the HQ controller authority over their independent force", () => {
  const s = make(2),
    c = s.contracts.find((c) => c.key === "aid-cover");
  M.accept(s, c.id);
  M.launch(s, c.id);
  const e = s.commandExercise;
  for (const enemy of e.world.actors.filter((a) => a.side === "red"))
    enemy.health.conscious = false;
  for (let i = 0; i < 150; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
  }
  const a = e.world.actors.find((a) => a.id === "agency-guide");
  a.waitingForDeployment = false;
  a.lastThreatAt = e.time;
  B.injure(s, e, a, {
    eventId: "agency-hit-regression",
    part: "leftArm",
    severity: 1,
  });
  e.battle.shots.push({
    id: "agency-incoming",
    time: e.time,
    actorId: "opposition-0",
    targetId: a.id,
    from: { x: a.x + 80, y: a.y },
    to: { x: a.x, y: a.y },
    side: "red",
    model: "AKM",
    hit: true,
    part: "leftArm",
  });
  M.actorTaskTick(s, e, a);
  const report = e.radio.find((r) => r.payload?.supportAlert);
  assert.ok(report);
  assert.equal(report.payload.supportAlert.contact, null);
  assert.equal(e.mission.knowledge.supportAlert, undefined);
  for (let i = 0; i < 30; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
  }
  assert.ok(e.mission.knowledge.supportAlert);
  assert.ok(!e.events.some((ev) => ev.type === "controller-urgent-cover"));
  C.validate(s);
});

test("identified agency contact relayed by urgent cover retains a valid confidence record before any local sighting", () => {
  const s = make(2),
    c = s.contracts.find((c) => c.key === "aid-cover");
  M.accept(s, c.id);
  M.launch(s, c.id);
  const e = s.commandExercise;
  for (const enemy of e.world.actors.filter((a) => a.side === "red"))
    enemy.health.conscious = false;
  for (let i = 0; i < 150; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
  }
  const authority = S.authority(s, e),
    cmd = D.issue(s, "ALPHA", "cover", { x: 554, y: 580 }, null, authority);
  cmd.supportContact = {
    id: "agency-identified-target",
    x: 554,
    y: 580,
    lastSeen: e.time,
    classification: "armed-person",
    confidence: 0.9,
    condition: "standing",
    reportedAt: e.time,
  };
  for (let i = 0; i < 25; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
    C.validate(s);
  }
  const contact = e.squads[0].contacts.find(
    (c) => c.id === "agency-identified-target",
  );
  assert.ok(contact);
  assert.equal(contact.reportedConfidence, 0);
});
