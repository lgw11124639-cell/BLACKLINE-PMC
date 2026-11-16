const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  M = require("../overwatch/missions"),
  S = require("../overwatch/command-staff"),
  G = require("../overwatch/geometry");
function make() {
  const s = C.createCampaign({ id: "PAIR-RESCUE" });
  S.upgrade(s);
  const h = (r) =>
    P.hire(s, s.market.candidates.find((c) => c.specialty === r).id, 30);
  for (const call of C.CALLSIGNS)
    P.assign(s, call, h("observer").id, h("sniper").id);
  const officer = S.hire(
    s,
    s.commandStaff.market.find((m) => m.duty === "controller").id,
  );
  S.assign(s, "controller", officer.id);
  const c = s.contracts.find((c) => c.key === "rescue-cover");
  M.accept(s, c.id);
  M.launch(s, c.id);
  const e = s.commandExercise;
  for (let i = 0; i < 160; i++) {
    for (const a of e.world.actors.filter((a) => a.side === "red"))
      a.health.conscious = false;
    B.setPaused(s, false);
    D.step(s, 1);
  }
  for (const [i, u] of e.world.units.entries()) {
    Object.assign(u, {
      x: 200 + Math.floor(i / 2) * 140 + (i % 2) * 4,
      y: 775,
      roofId: null,
      roofTransit: null,
      path: [],
      overwatchPath: [],
      goal: null,
    });
    u.health.kit = 0;
  }
  for (const [i, a] of e.world.actors
    .filter((a) => a.taskDuty === "security")
    .entries())
    Object.assign(a, {
      x: 475 + i * 3,
      y: 775,
      path: [],
      roofId: null,
      waitingForDeployment: false,
    });
  for (const q of e.squads) {
    q.bound = null;
    q.commandId = null;
    q.displacement = null;
  }
  for (const c of e.commands)
    if (["queued", "received", "thinking", "executing"].includes(c.status))
      c.status = "cancelled";
  return { s, e };
}
test("delivered own-pair casualty reports redirect another healthy pair and external infantry perform real local treatment", () => {
  const { s, e } = make(),
    patient = e.world.units[5];
  B.injure(s, e, patient, {
    eventId: "mutual-hit",
    part: "leftArm",
    severity: 2,
  });
  const q = e.squads[2],
    event = D.internals.event(e, "casualty-test", { actorId: patient.id });
  D.internals.report(
    s,
    e,
    q,
    "injury",
    "CHARLIE 부상, 엄호·처치 요청.",
    event,
    { friends: D.internals.friendSnapshots(e, q) },
  );
  assert.ok(!e.events.some((ev) => ev.type === "controller-friendly-cover"));
  for (let i = 0; i < 150; i++) {
    for (const a of e.world.actors.filter((a) => a.side === "red"))
      a.health.conscious = false;
    B.setPaused(s, false);
    D.step(s, 1);
    if (i % 20 === 0) C.validate(s);
    if (patient.health.wounds.every((w) => w.treated)) break;
  }
  assert.ok(e.events.some((ev) => ev.type === "controller-friendly-cover"));
  const cover = e.commands.find((c) => c.protectPosition);
  assert.ok(cover);
  assert.notEqual(cover.callsign, "CHARLIE");
  assert.equal(cover.supportContact, undefined);
  assert.ok(
    e.mission.log.some(
      (ev) =>
        ev.type === "agency-friendly-aid-started" && ev.targetId === patient.id,
    ),
  );
  assert.ok(patient.health.wounds.every((w) => w.treated));
  assert.ok(
    e.world.actors.some((a) => a.taskDuty === "security" && a.health.kit === 0),
  );
  C.validate(s);
});
test("minor injuries permit emergency movement but major wounds and critical blood loss remain immobilizing", () => {
  const { s, e } = make(),
    u = e.world.units[1];
  B.injure(s, e, u, { eventId: "graze", part: "leftArm", severity: 1 });
  assert.ok(B.moveFactor(u) > 0);
  u.health.bloodMl = 3200;
  assert.equal(B.moveFactor(u), 0);
  u.health.bloodMl = 5000;
  B.injure(s, e, u, { eventId: "major", part: "leftLeg", severity: 3 });
  assert.equal(B.moveFactor(u), 0);
});
