const test = require("node:test"),
  assert = require("node:assert/strict");
const C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  M = require("../overwatch/missions"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  G = require("../overwatch/geometry"),
  Staff = require("../overwatch/command-staff"),
  Storage = require("../overwatch/storage");
function make(key = "high-value-target") {
  const s = C.createCampaign({ id: "SECURITY-" + key });
  Staff.upgrade(s);
  const c = s.contracts.find((c) => c.key === key);
  for (let i = 0; i < c.min / 2; i++) {
    const h = (r) =>
      P.hire(s, s.market.candidates.find((x) => x.specialty === r).id, 30);
    P.assign(s, C.CALLSIGNS[i], h("observer").id, h("sniper").id);
  }
  const staff = Staff.hire(
    s,
    s.commandStaff.market.find((c) => c.duty === "controller").id,
  );
  Staff.assign(s, "controller", staff.id);
  M.accept(s, c.id);
  M.launch(s, c.id);
  return { s, e: s.commandExercise, c };
}
function step(s, n = 1) {
  for (let i = 0; i < n && s.commandExercise.status === "running"; i++) {
    for (const a of s.commandExercise.world.actors.filter(
      (a) => a.side === "red",
    ))
      a.weapon.nextFireAt = s.commandExercise.time + 20;
    B.setPaused(s, false);
    D.step(s, 1);
  }
}
for (const t of M.TEMPLATES)
  test(
    t.key +
      " includes four real external security infantry without consuming field roster slots",
    () => {
      const { s, e, c } = make(t.key);
      const guards = e.world.actors.filter((a) => a.taskDuty === "security");
      assert.equal(c.agencyInfantry, 4);
      assert.equal(guards.length, 4);
      assert.ok(
        guards.every(
          (a) =>
            a.side === "ally" &&
            a.role === "infantry" &&
            a.armed &&
            a.weapon.model === "HK416" &&
            a.health.alive,
        ),
      );
      assert.equal(s.members.length, c.min);
      assert.equal(e.world.units.length, c.min);
      assert.equal(
        e.mission.forcePackage.agency,
        e.world.actors.filter((a) => a.side === "ally" && a.armed).length,
      );
      C.validate(s);
    },
  );
test("version-two live target operation receives missing security at insertion once, preserving clock, loadouts and all existing casualties", () => {
  const { s, e } = make();
  s.operations.contentVersion = 2;
  delete e.mission.securityControl;
  e.world.actors = e.world.actors.filter((a) => a.taskDuty !== "security");
  const before = {
    clock: C.clone(s.clock),
    funds: s.headquarters.funds,
    units: C.clone(e.world.units),
    targets: C.clone(e.mission.targetProgress),
  };
  assert.equal(M.upgrade(s), true);
  assert.equal(M.upgrade(s), false);
  let guards = e.world.actors.filter((a) => a.taskDuty === "security");
  assert.equal(guards.length, 4);
  assert.deepEqual(s.clock, before.clock);
  assert.equal(s.headquarters.funds, before.funds);
  assert.deepEqual(e.world.units, before.units);
  assert.deepEqual(e.mission.targetProgress, before.targets);
  assert.ok(
    guards.every((a) => G.distance(a, e.mission.contract.insertion) < 20),
  );
  guards[0].health.alive = false;
  guards[0].health.conscious = false;
  guards[0].health.bloodMl = 0;
  delete e.mission.securityControl;
  step(s, 1);
  guards = e.world.actors.filter((a) => a.taskDuty === "security");
  assert.equal(guards.length, 4);
  assert.equal(guards[0].health.alive, false);
  C.validate(s);
});
test("security infantry start their own ground search without waiting for stationary sniper positions and survive save/restore", () => {
  const { s, e } = make();
  let staged = null;
  for (let i = 0; i < 3000 && !e.mission.securityControl.authorized; i++) {
    step(s);
    const guards = e.world.actors.filter((a) => a.taskDuty === "security");
    if (
      e.mission.fieldStartedAt != null &&
      !e.mission.securityControl.authorized
    ) {
      if (!staged) staged = guards.map((a) => ({ x: a.x, y: a.y }));
      assert.ok(guards.every((a, i) => G.distance(a, staged[i]) < 1));
    }
  }
  const g = e.mission.securityControl;
  assert.ok(staged);
  assert.ok(g.authorized);
  assert.equal(g.readyTeams.length,0);
  assert.ok(e.mission.groundSearch);
  const guards = e.world.actors.filter((a) => a.taskDuty === "security"),
    before = guards.map((a) => ({ x: a.x, y: a.y }));
  step(s, 12);
  assert.ok(guards.some((a, i) => G.distance(a, before[i]) > 0));
  assert.ok(Object.keys(g.goals).length === 4);
  assert.ok(guards.every((a) => !a.roofId));
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
  assert.deepEqual(restored.commandExercise.mission.securityControl, g);
  assert.equal(
    restored.commandExercise.world.actors.filter(
      (a) => a.taskDuty === "security",
    ).length,
    4,
  );
  C.validate(restored);
});
test("covert security holds fire against an unengaged visible guard and returns real fire after an actual hostile shot", () => {
  const { s, e } = make();
  step(s, 150);
  const u = e.world.actors.find((a) => a.taskDuty === "security"),
    enemy = e.world.actors.find(
      (a) => a.side === "red" && a.id === "opposition-2",
    );
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  Object.assign(u, {
    x: 200,
    y: 775,
    waitingForDeployment: false,
    path: [],
    heading: 0,
    health: B.health(),
    lastThreatAt: -100,
  });
  Object.assign(enemy, {
    x: 240,
    y: 775,
    health: B.health(),
    heading: Math.PI,
    skill: 0,
    combatActive: false,
    lastShotAt: -100,
  });
  enemy.weapon = B.weapon("AKM");
  e.mission.phase = "field";
  e.mission.securityControl.authorized = false;
  const advance = () => {
    e.time++;
    P.elapse(s, 1);
  };
  for (let i = 0; i < 10; i++) {
    advance();
    M.actorTaskTick(s, e, u);
  }
  assert.equal(u.weapon.spent, 0);
  const buddy = e.world.actors.find(
    (a) => a.taskDuty === "security" && a.id !== u.id,
  );
  Object.assign(buddy, {
    x: 203,
    y: 780,
    waitingForDeployment: false,
    health: B.health(),
  });
  let shot = null;
  for (let i = 0; i < 30 && !shot; i++) {
    advance();
    shot = B.fire(s, e, enemy, {
      id: buddy.id,
      x: buddy.x,
      y: buddy.y,
      lastSeen: e.time,
    });
  }
  assert.ok(shot);
  enemy.weapon.nextFireAt = e.time + 20;
  for (let i = 0; i < 25 && u.weapon.spent === 0; i++) {
    advance();
    M.actorTaskTick(s, e, u);
  }
  assert.ok(
    u.weapon.spent > 0,
    JSON.stringify({ health: u.health, state: u.state }),
  );
  assert.ok(e.battle.shots.some((x) => x.actorId === u.id));
  C.validate(s);
});
