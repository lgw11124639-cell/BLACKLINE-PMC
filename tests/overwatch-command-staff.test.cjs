const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  M = require("../overwatch/missions"),
  Staff = require("../overwatch/command-staff"),
  Storage = require("../overwatch/storage");
function setup() {
  const s = C.createCampaign({ id: "STAFF" }),
    hire = (role) =>
      P.hire(s, s.market.candidates.find((c) => c.specialty === role).id, 30),
    o = hire("observer"),
    n = hire("sniper"),
    controller = hire("observer"),
    instructor = hire("sniper");
  P.assign(s, "ALPHA", o.id, n.id);
  Staff.initialize(s);
  Staff.assign(s, "controller", controller.id);
  Staff.assign(s, "instructor", instructor.id);
  return { s, o, n, controller, instructor };
}
function advance(s, seconds) {
  for (let i = 0; i < seconds && s.commandExercise.status === "running"; i++) {
    for (const a of s.commandExercise.world.actors)
      a.weapon.nextFireAt = s.commandExercise.time + 20;
    B.setPaused(s, false);
    D.step(s, 1);
    C.validate(s);
  }
}
function launch() {
  const x = setup(),
    { s } = x;
  M.accept(s, s.contracts[0].id);
  M.launch(s, s.contracts[0].id);
  for (const a of s.commandExercise.world.actors) a.weapon.nextFireAt = 20;
  return { ...x, e: s.commandExercise };
}
test("HQ duties reserve actual members and reject duplicate field or training assignments", () => {
  const { s, controller, instructor, n } = setup();
  assert.throws(() => P.assign(s, "ALPHA", controller.id, n.id), /본부/);
  assert.throws(() => Staff.assign(s, "instructor", controller.id), /직책/);
  assert.throws(
    () =>
      P.start(s, {
        kind: "training",
        memberIds: [instructor.id],
        course: "shooting",
        hours: 4,
      }),
    /본부/,
  );
  P.release(s, controller.id);
  assert.equal(s.commandStaff.controllerId, null);
  assert.match(Staff.ready(s), /작전통제관/);
  C.validate(s);
});
test("the instructor issues real team orders and receives observer reports without player unit orders", () => {
  const { s, instructor } = setup();
  B.begin(s, { seed: 7 });
  advance(s, 35);
  const e = s.commandExercise;
  assert.equal(e.control.staffId, instructor.id);
  assert.ok(e.commands.some((c) => c.kind === "recon"));
  assert.ok(
    e.radio.some(
      (r) =>
        r.route === "down" &&
        r.from.id === instructor.id &&
        r.from.role === "훈련 교관",
    ),
  );
  assert.ok(e.radio.some((r) => r.route === "up" && r.to.id === instructor.id));
  assert.ok(
    e.world.units.some((u) => u.path.length || u.state === "observing"),
  );
  C.validate(s);
});
test("approving a contract delegates reconnaissance and uses at most the provided UAV count", () => {
  const { s, e, controller } = launch();
  advance(s, 260);
  assert.equal(e.control.staffId, controller.id);
  assert.ok(
    e.radio.some((r) => r.route === "down" && r.from.id === controller.id),
  );
  assert.ok(e.commands.some((c) => c.kind === "recon"));
  assert.ok(e.mission.supports.drone <= e.mission.contract.support.drone);
  assert.ok(e.mission.transports.filter((t) => t.trip === "drone").length <= 1);
  C.validate(s);
});
test("moving an unseen enemy does not change the controller plan or support allocation", () => {
  const { s, e } = launch();
  s.commandStaff.delegated = false;
  advance(s, 160);
  const other = C.clone(s);
  for (const a of other.commandExercise.world.actors) {
    a.x += 1;
    a.y += 1;
  }
  for (const x of [s, other]) {
    x.commandStaff.delegated = true;
    delete x.commandExercise.control;
    Staff.tick(x, x.commandExercise);
    C.validate(x);
  }
  assert.deepEqual(
    s.commandExercise.control.orders,
    other.commandExercise.control.orders,
  );
  assert.deepEqual(
    s.commandExercise.mission.supports,
    other.commandExercise.mission.supports,
  );
});
test("HQ can retask an existing UAV without a second sortie or resetting its endurance", () => {
  const { s, e } = launch();
  s.commandStaff.delegated = false;
  advance(s, 160);
  M.requestSupport(s, "drone", { x: 500, y: 200 });
  const t = e.mission.transports.find((x) => x.trip === "drone");
  t.until = e.time + 120;
  const until = t.until,
    used = e.mission.supports.drone;
  M.retaskDrone(s, { x: 540, y: 200 });
  assert.equal(e.mission.supports.drone, used);
  assert.equal(t.until, until);
  assert.deepEqual(t.supportTarget, { x: 540, y: 200 });
  assert.equal(
    e.mission.transports.filter((x) => x.trip === "drone").length,
    1,
  );
  C.validate(s);
});
test("delegated decisions and assigned staff round-trip through lossless storage", () => {
  const { s } = setup();
  Staff.upgrade(s);
  B.begin(s, { seed: 7 });
  advance(s, 30);
  const memory = {
      m: new Map(),
      getItem(k) {
        return this.m.get(k) ?? null;
      },
      setItem(k, v) {
        this.m.set(k, v);
      },
      removeItem(k) {
        this.m.delete(k);
      },
    },
    store = Storage.create({ storage: memory }),
    saved = store.save(s, null),
    loaded = store.load().state;
  assert.deepEqual(loaded.commandStaff, saved.commandStaff);
  assert.deepEqual(
    loaded.commandExercise.control,
    saved.commandExercise.control,
  );
  C.validate(loaded);
});

test("a direct HQ UAV request is not duplicated by the automatic support controller", () => {
  const { s, e } = launch();
  s.commandStaff.delegated = false;
  advance(s, 160);
  M.requestSupport(s, "drone", { x: 500, y: 200 });
  s.commandStaff.delegated = true;
  for (let i = 0; i < 3; i++) {
    if (e.control) e.control.lastAssess = -100;
    if (e.control) e.control.lastSupport = -100;
    Staff.tick(s, e);
  }
  assert.equal(e.mission.supports.drone, 1);
  assert.equal(
    e.mission.transports.filter((t) => t.trip === "drone").length,
    1,
  );
  C.validate(s);
});
test("taking command back restores HQ report routing without erasing the instructor order history", () => {
  const { s } = setup();
  B.begin(s, { seed: 7 });
  advance(s, 25);
  const e = s.commandExercise;
  assert.ok(e.commandAuthority);
  const old = e.radio.filter((r) => r.route === "down").map((r) => r.from.id);
  Staff.delegate(s, false);
  D.issue(s, "ALPHA", "report");
  advance(s, 15);
  assert.equal(e.commandAuthority, null);
  assert.ok(
    e.radio.some(
      (r) => r.route === "up" && r.createdAt > 25 && r.to.id === "HQ",
    ),
  );
  assert.deepEqual(
    e.radio
      .filter((r) => r.route === "down")
      .slice(0, old.length)
      .map((r) => r.from.id),
    old,
  );
  C.validate(s);
});

test("loss of all field reports triggers an actual recovery order without fabricating death confirmation", () => {
  const { s, e } = launch();
  s.commandStaff.autoSupport = false;
  advance(s, 160);
  for (const u of e.world.units)
    B.injure(s, e, u, {
      eventId: "silent-loss-" + u.id,
      part: "head",
      severity: 3,
    });
  advance(s, 160);
  assert.equal(e.mission.returnRequested, true);
  assert.equal(e.mission.abortRequested, true);
  assert.ok(e.events.some((ev) => ev.type === "controller-extraction"));
  C.validate(s);
});

test("delegated foot insertion completes its published route before the controller starts reconnaissance", () => {
  const { s } = setup(),
    contract = s.contracts.find((c) => c.key === "quiet-watch");
  M.accept(s, contract.id);
  M.launch(s, contract.id);
  const e = s.commandExercise;
  advance(s, 450);
  assert.notEqual(e.mission.fieldStartedAt, null);
  assert.ok(
    e.radio.some((r) => r.route === "down" && r.from.role === "작전통제관"),
  );
  C.validate(s);
});

test("a delegated reconnaissance move leaves one actual teammate stationary with optics while the other advances", () => {
  const { s } = setup();
  B.begin(s, { seed: 7 });
  advance(s, 35);
  const e = s.commandExercise,
    q = e.squads[0];
  assert.ok(q.bound);
  const stationary = e.world.units.filter(
    (u) => !u.path.length && u.overwatchPath?.length,
  );
  assert.equal(stationary.length, 1);
  assert.ok(stationary[0].visionRange > 1000);
  assert.ok(e.world.units.some((u) => u.path.length));
  C.validate(s);
});

test("legacy HQ appointees migrate to a separate roster without changing paid contracts or field pairings", () => {
  const { s, controller, instructor } = setup(),
    before = JSON.stringify(controller.contract),
    pair = JSON.stringify(s.squads);
  Staff.upgrade(s);
  assert.equal(s.members.length, 2);
  assert.equal(s.commandStaff.members.length, 2);
  assert.equal(Staff.staff(s, "controller").id, controller.id);
  assert.equal(JSON.stringify(Staff.staff(s, "controller").contract), before);
  assert.equal(JSON.stringify(s.squads), pair);
  Staff.upgrade(s);
  assert.equal(s.commandStaff.members.length, 2);
  B.begin(s, { seed: 7 });
  advance(s, 30);
  assert.ok(
    s.commandExercise.commands.some((c) => c.fromId === instructor.id) ||
      s.commandExercise.radio.some((r) => r.from.id === instructor.id),
  );
  C.validate(s);
});
test("separate staff contracts charge once, preserve ten field slots, and restore actual delegated authority", () => {
  const s = C.createCampaign({ id: "EXTERNAL-STAFF" });
  Staff.upgrade(s);
  P.finance(s, 50000000, "test-capital");
  for (let i = 0; i < 10; i++) P.hire(s, s.market.candidates[0].id, 30);
  const candidate = s.commandStaff.market.find((m) => m.duty === "instructor"),
    funds = s.headquarters.funds;
  const m = Staff.hire(s, candidate.id);
  assert.equal(s.members.length, 10);
  assert.equal(s.headquarters.funds, funds - candidate.dailySalary * 30);
  assert.throws(() => Staff.hire(s, candidate.id));
  Staff.assign(s, "instructor", m.id);
  const o = s.members.find((m) => m.specialty === "observer"),
    n = s.members.find((m) => m.specialty === "sniper");
  P.assign(s, "ALPHA", o.id, n.id);
  B.begin(s, { seed: 7 });
  advance(s, 30);
  assert.ok(s.commandExercise.radio.some((r) => r.from.id === m.id));
  C.validate(s);
  const restored = JSON.parse(JSON.stringify(s));
  C.validate(restored);
  assert.equal(Staff.authority(restored, restored.commandExercise).id, m.id);
});
test("market generation varies given names and refresh does not rename contracted people", () => {
  const s = C.createCampaign({ id: "NAMES" });
  assert.equal(
    new Set(s.market.candidates.map((m) => m.name.slice(1))).size,
    12,
  );
  const m = P.hire(s, s.market.candidates[0].id, 30),
    name = m.name;
  Staff.upgrade(s);
  assert.equal(m.name, name);
  assert.equal(
    new Set(s.market.candidates.map((m) => m.name)).size,
    s.market.candidates.length,
  );
  assert.equal(
    new Set(s.commandStaff.market.map((m) => m.name.slice(1))).size,
    6,
  );
  C.validate(s);
});
