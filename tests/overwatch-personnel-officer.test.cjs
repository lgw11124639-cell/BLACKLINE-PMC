const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  Staff = require("../overwatch/command-staff"),
  RT = require("../overwatch/realtime");
function make() {
  const s = C.createCampaign({ id: "HR-AUTO" });
  Staff.upgrade(s);
  for (let i = 0; i < 6; i++)
    P.hire(
      s,
      s.market.candidates.find(
        (m) => m.specialty === (i % 2 ? "sniper" : "observer"),
      ).id,
      30,
    );
  const hr = Staff.hire(
    s,
    s.commandStaff.market.find((m) => m.duty === "personnel").id,
  );
  Staff.assign(s, "personnel", hr.id);
  return s;
}
test("personnel officer forms healthy pairs and preserves existing sniper personnel and preserves them on later passes", () => {
  const s = make(),
    count = s.members.length;
  assert.ok(Staff.managePersonnel(s));
  assert.equal(s.squads.length, 3);
  const before = C.clone(s.squads);
  assert.equal(Staff.managePersonnel(s), false);
  assert.deepEqual(s.squads, before);
  assert.equal(s.members.length, count);
  assert.equal(s.commandStaff.members.length, 1);
  C.validate(s);
});
test("actual injured queue receives paid treatment automatically while resting personnel are not assigned", () => {
  const s = make(),
    m = s.members[0];
  P.casualty(s, {
    id: "injury-hr",
    missionId: "M-HR",
    memberId: m.id,
    kind: "injury",
    part: "leftLeg",
    severity: 2,
    injuryType: "총상",
  });
  const plan = P.treatmentPlan(m),
    cash = s.headquarters.funds;
  P.start(s, { kind: "rest", memberIds: [s.members[2].id], hours: 6 });
  const cashAfterTraining = s.headquarters.funds;
  Staff.managePersonnel(s);
  assert.equal(
    s.headquarters.funds,
    cashAfterTraining -
      plan.cost -
      s.infantry.members.reduce((n, m) => n + m.dailySalary * 30, 0),
  );
  assert.ok(
    s.activities.some(
      (a) =>
        a.kind === "treatment" &&
        a.memberIds.includes(m.id) &&
        a.status === "running",
    ),
  );
  assert.ok(
    !s.squads.some((q) => [q.observerId, q.sniperId].includes(s.members[2].id)),
  );
  Staff.manageHeadquarters(s, plan.seconds);
  assert.ok(m.injuries.every((w) => w.healed));
  C.validate(s);
});
test("personnel automation can be disabled and does not change a deployed roster", () => {
  const s = make();
  s.commandStaff.autoPersonnel = false;
  assert.equal(Staff.managePersonnel(s), false);
  assert.equal(s.squads.length, 0);
  s.commandStaff.autoPersonnel = true;
  s.activeMission = { memberIds: [s.members[0].id] };
  assert.equal(Staff.managePersonnel(s), false);
  assert.equal(s.squads.length, 0);
});
test("frame work budget defers whole fixed steps without losing them or pausing the simulation", () => {
  let time = 0,
    ticks = 0,
    saves = 0;
  const r = RT.create({
    baseRate: 4,
    maxWorkMs: 12,
    now: () => time,
    tick: () => {
      ticks++;
      time += 13;
    },
    checkpoint: () => saves++,
  });
  r.start(4);
  time = 250;
  assert.equal(r.pump(), 1);
  assert.equal(r.isRunning(), true);
  r.pump();
  r.pump();
  r.pump();
  assert.equal(ticks, 4);
  r.flush();
  assert.equal(saves, 1);
});

const I = require("../overwatch/infantry");
test("personnel officer buys separate infantry and sniper pairs within the operating reserve exactly once", () => {
  const s = C.createCampaign({ id: "HR-RECRUIT" });
  Staff.upgrade(s);
  const hr = Staff.hire(
    s,
    s.commandStaff.market.find((m) => m.duty === "personnel").id,
  );
  Staff.assign(s, "personnel", hr.id);
  const cash = s.headquarters.funds,
    reserve = Math.max(5000000, Math.ceil(cash * 0.25));
  Staff.managePersonnel(s);
  assert.equal(s.infantry.members.length, 12);
  assert.equal(s.members.length, 6);
  assert.equal(s.squads.length, 3);
  assert.ok(s.headquarters.funds >= reserve);
  const after = s.headquarters.funds;
  Staff.managePersonnel(s);
  assert.equal(s.headquarters.funds, after);
  assert.equal(s.infantry.members.length, 12);
  C.validate(s);
});
test("recruitment protects outstanding expenses and never buys replacements for busy infantry", () => {
  const s = make();
  P.finance(s, 9000000 - s.headquarters.funds, "test-funds");
  s.operations.payable = 5000000;
  Staff.managePersonnel(s);
  assert.equal(s.infantry.members.length, 0);
  assert.equal(s.headquarters.funds, 9000000);
  s.operations.payable = 0;
  P.finance(s, 80000000 - s.headquarters.funds, "test-funds");
  Staff.managePersonnel(s);
  I.train(s);
  const before = s.headquarters.funds;
  Staff.managePersonnel(s);
  assert.equal(s.headquarters.funds, before);
  assert.equal(s.infantry.members.length, 12);
  assert.ok(
    s.infantry.members.every((m) => ["training", "standby"].includes(m.status)),
  );
  C.validate(s);
});

test("twenty infantry remain separate and three four-person squads can deploy selectively", () => {
  const s = C.createCampaign({ id: "HR-THREE-SQUADS" });
  Staff.upgrade(s);
  P.finance(s, 200000000 - s.headquarters.funds, "test-funds");
  const hr = Staff.hire(
    s,
    s.commandStaff.market.find((m) => m.duty === "personnel").id,
  );
  Staff.assign(s, "personnel", hr.id);
  Staff.managePersonnel(s);
  assert.deepEqual(
    I.squads(s).map((q) => q.callsign),
    ["ALPHA", "BRAVO", "CHARLIE"],
  );
  for (let i = 0; i < 8; i++) I.hire(s, s.infantry.market[i % 4].id);
  assert.equal(s.infantry.members.length, 20);
  assert.throws(() => I.hire(s, s.infantry.market[0].id), /20/);
  s.infantry.disabledSquads = ["CHARLIE"];
  const M = require("../overwatch/missions"),
    c = s.contracts.find((c) => c.key === "high-value-target");
  const chief = Staff.hire(
    s,
    s.commandStaff.market.find((m) => m.duty === "controller").id,
  );
  Staff.assign(s, "controller", chief.id);
  M.accept(s, c.id);
  M.launch(s, c.id);
  const units = I.units(s.commandExercise);
  assert.equal(units.length, 8);
  assert.equal(units.filter((u) => u.callsign === "본부 보병 ALPHA").length, 4);
  assert.equal(units.filter((u) => u.callsign === "본부 보병 BRAVO").length, 4);
  assert.equal(
    s.infantry.members.filter((m) => m.status === "deployed").length,
    8,
  );
  C.validate(s);
});
