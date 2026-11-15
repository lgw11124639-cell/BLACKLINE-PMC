const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  G = require("../overwatch/geometry"),
  S = require("../overwatch/storage"),
  RT = require("../overwatch/realtime");
function make(pairs = 1) {
  const s = C.createCampaign({ id: "FIELD", at: "2026-11-15T00:00:00.000Z" });
  for (let i = 0; i < pairs; i++) {
    const a = P.hire(
        s,
        s.market.candidates.find((c) => c.specialty === "observer").id,
        30,
      ),
      b = P.hire(
        s,
        s.market.candidates.find((c) => c.specialty === "sniper").id,
        30,
      );
    P.assign(s, C.CALLSIGNS[i], a.id, b.id);
  }
  B.begin(s, { seed: 7 });
  return s;
}
function advance(s, seconds) {
  while (seconds > 0 && s.commandExercise.status === "running") {
    if (s.commandExercise.paused) B.setPaused(s, false);
    const used = D.step(s, Math.min(seconds, 120));
    seconds -= used;
    if (!used) break;
  }
  C.validate(s);
}
function total(w) {
  return w.loaded + w.magazines.reduce((a, b) => a + b, 0) + w.spent;
}
class Memory {
  constructor() {
    this.m = new Map();
    this.fail = null;
  }
  getItem(k) {
    return this.m.get(k) ?? null;
  }
  setItem(k, v) {
    if (k === this.fail) {
      this.fail = null;
      throw Error("quota");
    }
    this.m.set(k, v);
  }
  removeItem(k) {
    this.m.delete(k);
  }
}
test("schema 3 field upgrade keeps funds, squad, archive and byte-exact pre-upgrade save", () => {
  const old = C.createCampaign({ id: "OLD", schemaVersion: 3 }),
    mem = new Memory(),
    store = S.create({ storage: mem });
  store.save(old, null);
  const raw = store.raw(S.KEYS.primary),
    up = store.migrate();
  assert.equal(up.schemaVersion, 4);
  assert.equal(up.headquarters.funds, old.headquarters.funds);
  assert.deepEqual(up.commandArchive, old.commandArchive);
  assert.equal(JSON.parse(store.raw(S.KEYS.beforeFieldMigration)).primary, raw);
  assert.equal(
    up.headquarters.ledger.filter((e) => e.kind === "startup-grant").length,
    1,
  );
});
test("simulation deploys exactly the selected six entities, starts paused, and cannot start another exercise", () => {
  const s = make(3);
  assert.equal(s.commandExercise.world.units.length, 6);
  assert.equal(s.commandExercise.paused, true);
  assert.equal(s.clock.paused, true);
  assert.throws(() => B.begin(s));
  assert.equal(D.frame(s).contacts.length, 0);
  C.validate(s);
});
test("no observed contact means no fabricated engagement, ammunition loss, injury or medical request", () => {
  const s = make();
  D.issue(s, "ALPHA", "roe", null, "authorized");
  advance(s, 120);
  assert.equal(s.commandExercise.battle.totalShots, 0);
  assert.ok(
    s.commandExercise.world.units.every(
      (u) => u.weapon.spent === 0 && u.health.wounds.length === 0,
    ),
  );
  assert.ok(!D.frame(s).radio.some((r) => r.kind === "medical"));
});
test("ROE and report requests do not cancel an executing movement instruction", () => {
  const s = make(),
    move = D.issue(s, "ALPHA", "move", { x: 220, y: 200 });
  advance(s, 40);
  D.issue(s, "ALPHA", "roe", null, "authorized");
  D.issue(s, "ALPHA", "report");
  advance(s, 40);
  assert.equal(move.status, "executing");
  assert.equal(
    D.frame(s).commands.find((c) => c.id === move.id).status,
    "acknowledged",
  );
  assert.equal(s.commandExercise.squads[0].roe, "authorized");
});
test("actual observed armed contact halts unsafe approach and produces a causal observer report", () => {
  const s = make();
  const c = D.issue(s, "ALPHA", "move", { x: 710, y: 140 });
  D.issue(s, "ALPHA", "roe", null, "authorized");
  advance(s, 650);
  assert.ok(s.commandExercise.events.some((e) => e.type === "contact-halt"));
  assert.equal(c.status, "failed");
  assert.ok(
    D.frame(s).contacts.some((c) => c.classification === "armed-person"),
  );
});
test("actual shots debit real magazine rounds and every weapon conserves initial ammunition across reloads", () => {
  const s = make();
  D.issue(s, "ALPHA", "move", { x: 220, y: 200 });
  D.issue(s, "ALPHA", "roe", null, "authorized");
  advance(s, 650);
  assert.ok(s.commandExercise.battle.totalShots > 0);
  for (const u of [
    ...s.commandExercise.world.units,
    ...s.commandExercise.world.actors,
  ])
    for (const w of [u.weapon, u.sidearm]) assert.equal(total(w), w.initial);
  assert.equal(
    s.commandExercise.battle.totalShots,
    [
      ...s.commandExercise.world.units,
      ...s.commandExercise.world.actors,
    ].reduce((n, u) => n + u.weapon.spent + u.sidearm.spent, 0),
  );
});
test("empty magazine starts a timed reload and consumes no ammunition until the next actual shot", () => {
  const s = make(),
    e = s.commandExercise,
    u = e.world.units[1],
    t = e.world.actors[0];
  u.x = 300;
  u.y = 140;
  t.x = 350;
  t.y = 140;
  u.weapon.spent = u.weapon.loaded;
  u.weapon.loaded = 0;
  e.battle.totalShots = u.weapon.spent;
  B.fire(s, e, u, { id: t.id, x: t.x, y: t.y, condition: "standing" });
  assert.equal(u.weapon.reloadUntil, B.WEAPONS[u.weapon.model].reload);
  const before = u.weapon.magazines.length;
  advance(s, 7);
  assert.equal(u.weapon.loaded, 10);
  assert.equal(u.weapon.magazines.length, before - 1);
  assert.equal(total(u.weapon), u.weapon.initial);
});
test("sniper rifle impact produces anatomical disabling trauma rather than an abstract HP pool", () => {
  const s = make(),
    e = s.commandExercise,
    u = e.world.units[1],
    t = e.world.actors[0];
  u.x = 300;
  u.y = 140;
  t.x = 330;
  t.y = 140;
  u.weapon.targetId = t.id;
  u.weapon.aimSince = 0;
  e.time = 20;
  s.clock.elapsedSeconds = 20;
  u.skill = 95;
  const shot = B.fire(s, e, u, {
    id: t.id,
    x: t.x,
    y: t.y,
    condition: "standing",
  });
  assert.ok(shot && shot.hit);
  assert.equal(t.health.wounds.length, 1);
  assert.equal(t.health.conscious, false);
  assert.equal(t.hp, undefined);
  assert.equal(t.health.wounds[0].sourceEventId, shot.id);
  C.validate(s);
});
test("unseen targets cannot supply HQ positions, health or shot animations to either renderer", () => {
  const s = make(),
    a = D.frame(s),
    other = C.clone(s);
  other.commandExercise.world.actors[0].x = 1100;
  other.commandExercise.world.actors[0].health.bloodMl = 2000;
  assert.deepEqual(D.frame(other), a);
  advance(s, 12);
  const e = s.commandExercise;
  assert.equal(D.frame(s).contacts.length, 0);
  assert.equal(D.frame(s).battle.effects.length, 0);
  assert.equal(D.frame(s).friends.length, 2);
});
test("telemetry has actual delay and freezes in signal shadow instead of moving HQ markers from truth", () => {
  const s = make();
  advance(s, 8);
  const before = D.frame(s).friends.map((u) => [u.id, u.x, u.y]);
  for (const [i, u] of s.commandExercise.world.units.entries()) {
    u.x = 550 + i * 18;
    u.y = 550;
  }
  advance(s, 30);
  assert.deepEqual(
    D.frame(s).friends.map((u) => [u.id, u.x, u.y]),
    before,
  );
  assert.ok(D.frame(s).friends.every((u) => u.age >= 30));
});
test("untreated injury prevents walking, spends a real first-aid item, and leaves a persistent wound after care", () => {
  const s = make(),
    e = s.commandExercise,
    u = e.world.units[0],
    p = { x: u.x, y: u.y };
  B.injure(s, e, u, {
    eventId: "test-arm-impact",
    part: "leftArm",
    severity: 2,
  });
  u.goal = { x: 150, y: 600 };
  u.path = G.path(u, u.goal);
  advance(s, 10);
  assert.deepEqual({ x: u.x, y: u.y }, p);
  assert.equal(u.health.kit, 0);
  assert.ok(u.health.aid);
  assert.equal(u.health.wounds[0].treated, false);
  advance(s, 40);
  assert.equal(u.health.wounds[0].treated, true);
  assert.equal(u.health.wounds.length, 1);
  assert.ok(u.health.bloodMl < 5000);
  assert.equal(u.health.aid, null);
  assert.ok(e.events.some((e) => e.type === "aid-completed"));
});
test("nearby teammate treats an unconscious casualty and physically carries them to the rally point", () => {
  const s = make(),
    e = s.commandExercise,
    a = e.world.units[0],
    b = e.world.units[1];
  a.x = 105;
  a.y = 650;
  b.x = 115;
  b.y = 650;
  B.injure(s, e, a, {
    eventId: "test-chest-impact",
    part: "chest",
    severity: 3,
  });
  advance(s, 65);
  assert.ok(a.health.wounds[0].treated);
  assert.ok(a.extracted || b.carrying === a.id);
  advance(s, 150);
  assert.equal(a.extracted, true);
  assert.ok(G.distance(a, G.MAP.base) < 40);
  assert.equal(a.health.wounds.length, 1);
});
test("fatal head injury is not repaired by the aid loop and the observer role passes to the sniper", () => {
  const s = make(),
    e = s.commandExercise,
    u = e.world.units[0];
  B.injure(s, e, u, { eventId: "test-head-impact", part: "head", severity: 3 });
  advance(s, 15);
  assert.equal(u.health.alive, false);
  assert.equal(e.squads[0].leaderId, e.world.units[1].id);
  assert.equal(u.health.wounds[0].treated, false);
  assert.ok(!u.path.length);
});
test("training wounds/deaths, shots and completion do not fabricate permanent campaign losses, payments or supplies", () => {
  const s = make(),
    before = C.clone(s.members),
    money = s.headquarters.funds;
  B.injure(s, s.commandExercise, s.commandExercise.world.units[0], {
    eventId: "test-head",
    part: "head",
    severity: 3,
  });
  advance(s, 10);
  D.end(s, "control");
  assert.deepEqual(s.members, before);
  assert.equal(s.headquarters.funds, money);
  assert.equal(s.commandExercise.battle.result.returned, false);
  assert.ok(s.records.at(-1).message.includes("실제 복귀 미완료"));
  C.validate(s);
});
test("goal and return are separate; only actual surviving entities at the rally point complete withdrawal", () => {
  const s = make(),
    e = s.commandExercise;
  advance(s, 5);
  B.withdraw(s);
  advance(s, 60);
  assert.equal(e.status, "ended");
  assert.equal(e.battle.result.returned, true);
  assert.equal(e.battle.result.objective, false);
  assert.ok(e.battle.result.roster.every((u) => u.extracted));
});
test("all killed entities cannot satisfy a vacuous successful withdrawal", () => {
  const s = make(),
    e = s.commandExercise;
  for (const u of e.world.units)
    B.injure(s, e, u, { eventId: "fatal-" + u.id, part: "head", severity: 3 });
  e.battle.objective.returnRequested = true;
  advance(s, 10);
  assert.notEqual(e.battle.phase, "returned");
  assert.equal(e.status, "running");
});
test("saved RNG, aiming, weapons, wounds, radio and telemetry resume identically through combat", () => {
  const a = make();
  D.issue(a, "ALPHA", "move", { x: 220, y: 200 });
  D.issue(a, "ALPHA", "roe", null, "authorized");
  advance(a, 400);
  const b = C.clone(a);
  advance(a, 350);
  advance(b, 350);
  assert.deepEqual(b, a);
});
test("speed changes do not change deterministic simulation results for the same number of ticks", () => {
  const a = make(),
    b = C.clone(a);
  B.speed(b, 4);
  advance(a, 80);
  advance(b, 80);
  a.clock.speed = 4;
  a.commandExercise.battle.speed = 4;
  assert.deepEqual(a, b);
});
test("fixed-step clock honors 1/2/4 speed while discarding hidden/offline gaps and stops on emergencies", () => {
  let now = 0,
    ticks = 0,
    saves = 0;
  const rt = RT.create({
    tick: () => {
      ticks++;
      return true;
    },
    checkpoint: () => saves++,
    now: () => now,
  });
  rt.start(1);
  for (let i = 0; i < 20; i++) {
    now += 100;
    rt.pump();
  }
  assert.equal(ticks, 2);
  rt.setSpeed(4);
  for (let i = 0; i < 20; i++) {
    now += 100;
    rt.pump();
  }
  assert.equal(ticks, 10);
  now += 600000;
  rt.pump(false);
  assert.equal(ticks, 10);
  rt.stop();
  now += 600000;
  rt.pump();
  assert.equal(ticks, 10);
  assert.ok(saves >= 2);
  let stopped = 0;
  const emergency = RT.create({
    tick: () => {
      stopped++;
      return false;
    },
    checkpoint: () => {},
    now: () => now,
  });
  emergency.start(4);
  now += 250;
  emergency.pump();
  assert.equal(stopped, 1);
  assert.equal(emergency.isRunning(), false);
});
test("checkpoint exceptions stop the clock and invoke recovery without silently advancing further", () => {
  let now = 0,
    ticks = 0,
    errors = 0;
  const rt = RT.create({
    tick: () => {
      ticks++;
      return true;
    },
    checkpoint: () => {
      throw Error("quota");
    },
    onError: () => errors++,
    now: () => now,
  });
  rt.start(4);
  for (let i = 0; i < 30; i++) {
    now += 250;
    rt.pump();
  }
  assert.equal(errors, 1);
  assert.equal(ticks, 5);
  assert.equal(rt.isRunning(), false);
});
test("malformed physiology, ammo, results and telemetry are rejected before renderer or AI use", () => {
  const source = make();
  advance(source, 10);
  for (const mutation of [
    (s) => s.commandExercise.world.units[0].weapon.loaded++,
    (s) => (s.commandExercise.world.units[0].health.wounds = "bad"),
    (s) =>
      (s.commandExercise.battle.delivered[0].friends[0].health.bloodMl = -1),
    (s) => (s.commandExercise.battle.totalShots = 100),
    (s) => (s.commandExercise.battle.weather.visibility = 99),
    (s) =>
      (s.commandExercise.battle.knowledge.effects = [
        {
          eventId: "bad",
          time: 0,
          receivedAt: 1,
          from: { x: NaN, y: 20 },
          to: { x: 20, y: 20 },
        },
      ]),
  ]) {
    const s = C.clone(source);
    mutation(s);
    assert.throws(() => C.validate(s));
  }
});
test("a failed checkpoint restores primary and backup including last saved combat state", () => {
  const mem = new Memory(),
    store = S.create({ storage: mem }),
    original = store.save(make(), null),
    next = C.clone(original);
  advance(next, 10);
  const before = store.raw(S.KEYS.primary);
  mem.fail = S.KEYS.backup;
  assert.throws(() => store.save(next, original.revision));
  assert.equal(store.raw(S.KEYS.primary), before);
  assert.deepEqual(store.load().state, original);
});

test("blocked/corrupt saves have an empty view projection so recovery controls can still mount", () => {
  assert.equal(D.frame(null), null);
  assert.equal(D.frame(undefined), null);
});

test("unobserved incapacitated opposition cannot fabricate an observer objective-complete report", () => {
  const s = make(),
    e = s.commandExercise;
  e.battle.scenario = "interdiction";
  for (const u of e.world.actors.filter((u) => u.side === "red")) {
    u.health.alive = false;
    u.health.conscious = false;
  }
  advance(s, 20);
  assert.equal(e.battle.objective.done, false);
  assert.equal(D.frame(s).battle.objective, false);
  assert.equal(e.radio.filter((r) => r.kind === "objective").length, 0);
});

test("a depleted primary switches to a real loaded sidearm only within its close-range envelope", () => {
  const s = make(),
    e = s.commandExercise,
    u = e.world.units[0],
    target = e.world.actors[0];
  u.weapon.spent = u.weapon.initial;
  u.weapon.loaded = 0;
  u.weapon.magazines = [];
  e.battle.totalShots = u.weapon.spent;
  target.x = u.x + 40;
  target.y = u.y;
  B.fire(s, e, u, {
    id: target.id,
    x: target.x,
    y: target.y,
    condition: "standing",
  });
  assert.equal(u.weapon.model, "G19");
  assert.equal(u.sidearm.model, "HK416");
  assert.ok(e.events.some((a) => a.type === "weapon-switched"));
  assert.equal(total(u.weapon), u.weapon.initial);
  assert.equal(total(u.sidearm), u.sidearm.initial);
  C.validate(s);
});
