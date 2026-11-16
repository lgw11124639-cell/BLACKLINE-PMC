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
test("personnel officer forms healthy pairs without recruiting and preserves them on later passes", () => {
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
  assert.equal(s.headquarters.funds, cashAfterTraining - plan.cost);
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
