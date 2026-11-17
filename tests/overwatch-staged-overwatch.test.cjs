const test = require("node:test"),
  assert = require("node:assert/strict");
const C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  M = require("../overwatch/missions"),
  G = require("../overwatch/geometry"),
  Staff = require("../overwatch/command-staff");
function launch(pairs = 3) {
  const s = C.createCampaign({ id: "STAGED" }),
    hire = (r) =>
      P.hire(s, s.market.candidates.find((c) => c.specialty === r).id, 30);
  for (let i = 0; i < pairs; i++)
    P.assign(s, C.CALLSIGNS[i], hire("observer").id, hire("sniper").id);
  Staff.upgrade(s);
  const chief = Staff.hire(
    s,
    s.commandStaff.market.find((c) => c.duty === "controller").id,
  );
  Staff.assign(s, "controller", chief.id);
  const c = s.contracts.find((c) => c.key === "rescue-cover");
  M.accept(s, c.id);
  M.launch(s, c.id);
  return { s, e: s.commandExercise };
}
function training() {
  const s = C.createCampaign({ id: "METRES" }),
    hire = (r) =>
      P.hire(s, s.market.candidates.find((c) => c.specialty === r).id, 30);
  P.assign(s, "ALPHA", hire("observer").id, hire("sniper").id);
  B.begin(s, { seed: 7 });
  return { s, e: s.commandExercise };
}
test("new city operations use a kilometre district while original saved/training coordinates stay intact", () => {
  const { s, e } = launch();
  assert.equal(G.MAP.width, 1200);
  assert.equal(G.MAP.height, 800);
  assert.equal(G.maps["urban-port"].width, 240);
  assert.equal(e.mapId, "urban-port-operation");
  assert.equal(G.distance({ x: 100, y: 700 }, { x: 600, y: 700 }), 500);
  assert.ok(B.WEAPONS.HK416.range < 500);
  assert.ok(B.WEAPONS.AXMC.range > 1000);
  const copy = C.clone(s);
  C.validate(copy);
  assert.deepEqual(
    copy.commandExercise.mission.agencyControl,
    e.mission.agencyControl,
  );
});
test("real six-member insertion assigns separate sniper sectors while infantry search independently and initial deployment remains survivable", () => {
  const { s, e } = launch();
  for (let i = 0; i < 300; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
    if (i % 25 === 0) C.validate(s);
  }
  assert.equal(e.world.units.length, 6);
  assert.equal(new Set(e.squads.map((q) => q.assignment.kind)).size, 3);
  assert.deepEqual(
    e.squads.map((q) => q.assignment.kind),
    ["counter-sniper", "corridor-cover", "flank-security"],
  );
  assert.equal(e.mission.agencyControl.everAuthorized, true);
  assert.equal(e.mission.taskLinked, false);
  const agency = e.world.actors.filter((a) => a.side === "ally" && a.armed);
  assert.ok(agency.length >= 4);
  assert.ok(agency.every((a) => a.weapon.spent === 0));
  assert.ok(
    e.world.units.every((u) => u.health.alive && u.health.wounds.length === 0),
  );
  assert.ok(
    e.world.units.some((u) => G.distance(u, e.mission.contract.insertion) > 25),
  );
  assert.ok(
    ["ALPHA", "BRAVO", "CHARLIE"].every((call) =>
      e.commands.some((c) => c.callsign === call),
    ),
  );
  const bands = Object.values(e.control.watchSectors).sort(
    (a, b) => a.x1 - b.x1,
  );
  assert.equal(bands.length, 3);
  assert.ok(bands[0].x2 <= bands[1].x1 && bands[1].x2 <= bands[2].x1);
  assert.equal(
    e.events.find(
      (ev) => ev.type === "bound-overwatch-swapped" && ev.callsign === "ALPHA",
    ).coveringId,
    e.squads[0].sniperId,
  );
});
test("pre-aiming tracks a visible target without spending ammunition or producing a shot", () => {
  const { s, e } = training(),
    u = e.world.units[1],
    t = e.world.actors[0];
  Object.assign(u, { x: 100, y: 700, path: [], stance: "prone", prone: true });
  Object.assign(t, { x: 200, y: 700 });
  e.world.units[0].home = true;
  e.time = 20;
  s.clock.elapsedSeconds = 20;
  const before = {
    loaded: u.weapon.loaded,
    spent: u.weapon.spent,
    shots: e.battle.totalShots,
  };
  const k = { id: t.id, x: t.x, y: t.y, condition: "standing" };
  for (let i = 0; i < 12; i++) {
    e.time++;
    s.clock.elapsedSeconds++;
    B.fire(s, e, u, k, { holdFire: true, keepStance: true });
  }
  assert.equal(u.weapon.targetId, t.id);
  assert.deepEqual(
    {
      loaded: u.weapon.loaded,
      spent: u.weapon.spent,
      shots: e.battle.totalShots,
    },
    before,
  );
  assert.equal(u.stance, "prone");
  assert.equal(u.fireBlockReason, "holding-fire");
});
test("enemy scope long range is restricted to its viewing direction, not the whole peripheral cone", () => {
  function acquired(angle) {
    const { e } = training(),
      u = e.world.units[1],
      t = e.world.actors[0];
    e.world.units[0].home = true;
    Object.assign(u, {
      x: 100,
      y: 700,
      stance: "standing",
      prone: false,
      state: "holding",
      path: [],
    });
    Object.assign(t, {
      x: 500,
      y: 700,
      heading: Math.PI - angle,
      weapon: B.weapon("SVD"),
      memory: [],
    });
    for (let i = 0; i < 180; i++) {
      e.time++;
      if (B.scanEnemy(e, t)?.id === u.id) return true;
    }
    return false;
  }
  assert.equal(acquired(0), true);
  assert.equal(acquired(0.7), false);
});
test("ground-level teammates do not obstruct a rooftop path and descent retains its stair waypoint", () => {
  const { s, e } = training();
  G.activate("urban-port-operation");
  e.mapId = G.MAP.id;
  const roof = G.roofs()[3],
    u = e.world.units[1],
    other = e.world.units[0];
  Object.assign(u, { ...roof.point, x: roof.point.x - 4, state: "moving" });
  Object.assign(other, { x: u.x + 1, y: u.y, roofId: null });
  u.path = [{ ...roof.point }];
  u.goal = { ...roof.point };
  D.internals.moveUnit(e, u, 2);
  assert.ok(u.x > roof.point.x - 4);
  other.home = true;
  u.path = G.path(u, G.MAP.base);
  assert.ok(u.path.some((p) => p.roofTransition === "down"));
  for (let i = 0; i < 1800 && u.path.length; i++) {
    e.time++;
    D.internals.moveUnit(e, u, 1);
  }
  assert.equal(u.roofId, undefined);
  assert.ok(G.distance(u, G.MAP.base) < 1);
});
test("agency infantry actually replace an incapacitated rescue leader; a lost agency force reports losses without forcing HQ withdrawal", () => {
  const { s, e } = launch(2);
  for (let i = 0; i < 150; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
  }
  const old = e.world.actors.find((a) => a.id === "agency-rescuer");
  B.injure(s, e, old, { eventId: "leader-impact", part: "head", severity: 3 });
  B.setPaused(s, false);
  D.step(s, 1);
  assert.notEqual(e.mission.taskLeaderId, old.id);
  assert.ok(
    e.events.some(
      (ev) => ev.type === "agency-leader-replaced" && ev.previousId === old.id,
    ),
  );
  const successor = e.world.actors.find((a) => a.id === e.mission.taskLeaderId);
  assert.equal(successor.taskDuty, "leader");
  for (const a of e.world.actors.filter(
    (a) => a.side === "ally" && a.armed && a.health.alive,
  ))
    B.injure(s, e, a, {
      eventId: "force-impact-" + a.id,
      part: "head",
      severity: 3,
    });
  B.setPaused(s, false);
  D.step(s, 1);
  assert.ok(!e.mission.objectiveFailed);
  assert.ok(!e.mission.returnRequested);
  assert.ok(e.events.some((ev) => ev.type === "agency-team-incapacitated"));
  C.validate(s);
});

test("agency infantry starts actual self-aid instead of remaining immobilized forever after an untreated wound", () => {
  const { s, e } = launch(2);
  for (let i = 0; i < 150; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
  }
  const patient = e.world.actors.find((a) => a.side === "ally" && a.armed);
  B.injure(s, e, patient, {
    eventId: "agency-leg-hit",
    part: "leftLeg",
    severity: 2,
  });
  assert.ok(patient.health.wounds.some((w) => !w.treated));
  M.actorTaskTick(s, e, patient);
  assert.equal(patient.health.aid?.targetId, patient.id);
  assert.ok(
    e.events.some(
      (ev) => ev.type === "aid-started" && ev.actorId === patient.id,
    ),
  );
  C.validate(s);
});
for (const prepared of [false, true])
  test(
    "reported stalled " +
      (prepared ? "advance" : "initial preparation") +
      " replans then requests physical recovery",
    () => {
      const { s, e } = launch(2);
      for (let i = 0; i < 150; i++) {
        B.setPaused(s, false);
        D.step(s, 1);
      }
      e.mission.agencyControl.everAuthorized = prepared;
      const a = e.commandAuthority,
        c = e.control,
        frame = D.frame(s),
        anchor = e.mission.knowledge.actors.find(
          (a) => a.id === "agency-rescuer",
        );
      function assess(t) {
        e.time = t;
        s.clock.elapsedSeconds = e.startedAt + t;
        anchor.observedAt = t;
        frame.time = t;
        frame.friends.forEach((f) => {
          f.age = 0;
          f.observedAt = t;
        });
        return Staff.missionProgress(s, e, a, c, frame);
      }
      assess(200);
      assess(510);
      assert.ok(e.events.some((ev) => ev.type === "controller-route-stalled"));
      assert.equal(e.mission.returnRequested, false);
      assess(810);
      assert.equal(e.mission.returnRequested, true);
      assert.equal(e.mission.abortRequested, true);
      assert.equal(e.mission.objective, false);
      assert.equal(e.status, "running");
      assert.equal(s.operations.reports.length, 0);
      assert.ok(e.events.some((ev) => ev.type === "controller-progress-abort"));
      assert.ok(e.commands.some((command) => command.kind === "withdraw"));
    },
  );
