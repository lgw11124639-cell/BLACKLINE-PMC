const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  Sprites = require("../overwatch/sprites");
function setup() {
  const s = C.createCampaign({ id: "SURVIVAL" }),
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
  return { s, e: s.commandExercise, u: s.commandExercise.world.units[0] };
}
function advance(s, n) {
  for (let i = 0; i < n; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
    C.validate(s);
  }
}
test("a high-power head graze is a survivable wound while a central penetrating strike remains fatal", () => {
  const { s, e, u } = setup();
  B.ballisticImpact(s, e, u, {
    eventId: "actual-graze",
    model: "SVD",
    part: "head",
    lateral: 0.18,
    height: 1.84,
    distance: 300,
  });
  assert.equal(u.health.alive, true);
  assert.equal(u.health.wounds[0].severity, 2);
  assert.ok(u.protection.helmet < 100);
  const v = e.world.units[1];
  B.ballisticImpact(s, e, v, {
    eventId: "central-cranial",
    model: "SVD",
    part: "head",
    lateral: 0,
    height: 1.7,
    distance: 300,
  });
  assert.equal(v.health.alive, false);
  C.validate(s);
});
test("a severe torso injury is incapacitating, has progressive blood loss and remains available for rescue", () => {
  const { s, e, u } = setup();
  e.world.actors = [];
  for (const p of e.world.units) p.health.kit = 0;
  B.ballisticImpact(s, e, u, {
    eventId: "torso-trauma",
    model: "SVD",
    part: "chest",
    lateral: 0,
    height: 1.2,
    distance: 250,
  });
  assert.equal(u.health.alive, true);
  assert.equal(u.health.conscious, false);
  advance(s, 60);
  assert.equal(u.health.alive, true);
  assert.ok(u.health.bloodMl >= 4700 && u.health.bloodMl < 5000);
  assert.equal(B.moveFactor(u), 0);
  assert.notEqual(
    Sprites.select({ ...B.snapshot(u), role: u.role }).art.src,
    Sprites.select({
      ...B.snapshot(u),
      role: u.role,
      health: { ...u.health, alive: false },
      pose: "dead",
    }).art.src,
  );
});
test("an intact chest plate absorbs a rifle strike, records damage, and a spent plate no longer grants protection", () => {
  const { s, e, u } = setup();
  e.world.actors = [];
  for (const p of e.world.units) p.health.kit = 0;
  B.ballisticImpact(s, e, u, {
    eventId: "plate-stop",
    model: "AKM",
    part: "chest",
    lateral: 0,
    height: 1.2,
    distance: 100,
  });
  assert.equal(u.health.wounds[0].type, "방호 충격상");
  assert.equal(u.protection.plate, 64);
  advance(s, 60);
  assert.equal(u.health.bloodMl, 5000);
  u.protection.plate = 0;
  B.ballisticImpact(s, e, u, {
    eventId: "plate-spent",
    model: "AKM",
    part: "chest",
    lateral: 0,
    height: 1.2,
    distance: 100,
  });
  assert.equal(u.health.wounds[1].severity, 2);
  assert.equal(u.health.wounds[1].type, "총상");
  C.validate(s);
});
test("incoming fire produces feedback without revealing an unidentified shooter position or identity", () => {
  const { e, u } = setup(),
    q = e.squads[0],
    enemy = e.world.actors[0],
    shot = {
      id: "incoming-actual",
      time: e.time,
      actorId: enemy.id,
      targetId: u.id,
      from: { x: enemy.x, y: enemy.y },
      to: { x: u.x, y: u.y },
      model: "SVD",
      hit: true,
    };
  const fx = B.shotObservation(e, q, shot);
  assert.equal(fx.kind, "incoming");
  assert.equal(fx.actorId, null);
  assert.equal(fx.model, "incoming");
  assert.deepEqual(fx.from, shot.to);
  assert.equal(fx.targetId, u.id);
  assert.equal(fx.hit, true);
  assert.deepEqual(q.contacts, []);
});
test("movement invalidates a completed aim instead of allowing a snap shot at a newly moved target", () => {
  const { s, e, u } = setup(),
    t = e.world.actors[0];
  Object.assign(u, { x: 100, y: 700, path: [], goal: null });
  Object.assign(t, { x: 200, y: 700 });
  e.time = 30;
  s.clock.elapsedSeconds = 30;
  Object.assign(u.weapon, {
    targetId: t.id,
    aimSince: 0,
    aimAnchor: { x: 180, y: 700 },
    aimOrigin: { x: 100, y: 700 },
  });
  const before = u.weapon.loaded;
  B.fire(s, e, u, { id: t.id, x: 200, y: 700, condition: "standing" });
  assert.equal(u.weapon.loaded, before);
  assert.equal(u.weapon.aimSince, 30);
  assert.deepEqual(u.weapon.aimAnchor, { x: 200, y: 700 });
  C.validate(s);
});
test("actual suppression reduces shot precision for the same skill, range and random seed", () => {
  function shot(suppressed) {
    const { s, e, u } = setup(),
      t = e.world.actors[0];
    Object.assign(u, {
      x: 100,
      y: 700,
      path: [],
      goal: null,
      lastThreatAt: suppressed ? 29 : -100,
    });
    Object.assign(t, { x: 200, y: 700, stance: "standing", prone: false });
    e.time = 30;
    s.clock.elapsedSeconds = 30;
    e.battle.weather.wind = 0;
    Object.assign(u.weapon, {
      targetId: t.id,
      aimSince: 0,
      aimAnchor: { x: 200, y: 700 },
      aimOrigin: { x: 100, y: 700 },
    });
    const fired = B.fire(s, e, u, {
      id: t.id,
      x: 200,
      y: 700,
      condition: "standing",
    });
    assert.ok(fired);
    return Math.abs(fired.to.x - 200);
  }
  assert.ok(shot(true) > shot(false));
});
