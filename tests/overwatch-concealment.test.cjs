const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle");
function make({ prone = true, moving = false, distance = 100 } = {}) {
  const s = C.createCampaign({ id: "HIDE" }),
    hire = (r) =>
      P.hire(s, s.market.candidates.find((c) => c.specialty === r).id, 30);
  P.assign(s, "ALPHA", hire("observer").id, hire("sniper").id);
  B.begin(s, { scenario: "recon", seed: 7 });
  const e = s.commandExercise,
    u = e.world.units[1],
    enemy = e.world.actors[0];
  e.world.units[0].extracted = true;
  Object.assign(u, {
    x: 100,
    y: 700,
    prone,
    stance: prone ? "prone" : "standing",
    state: moving ? "moving" : "observing",
    path: moving ? [{ x: 110, y: 700 }] : [],
  });
  Object.assign(enemy, {
    x: 100 + distance,
    y: 700,
    heading: Math.PI,
    skill: 50,
    memory: [],
  });
  return { s, e, u, enemy };
}
function find(x, limit = 120) {
  for (let i = 0; i < limit; i++) {
    x.e.time++;
    x.s.clock.elapsedSeconds++;
    const seen = B.scanEnemy(x.e, x.enemy);
    C.validate(x.s);
    if (seen?.id === x.u.id) return i + 1;
  }
  return Infinity;
}
test("stationary prone sniper concealment requires sustained visual evidence, while exposed movement is noticed sooner", () => {
  const prone = find(make()),
    standing = find(make({ prone: false })),
    moving = find(make({ prone: false, moving: true }));
  assert.ok(prone > 30 && prone > standing * 3, { prone, standing, moving });
  assert.ok(moving < standing);
});
test("an actual suppressed rifle shot raises visual acquisition without granting immunity after firing", () => {
  const x = make(),
    { s, e, u, enemy } = x;
  e.time = 10;
  s.clock.elapsedSeconds = 10;
  const k = { id: enemy.id, x: enemy.x + 3, y: enemy.y, condition: "standing" };
  Object.assign(u.weapon, {
    targetId: enemy.id,
    aimSince: 0,
    aimAnchor: { x: k.x, y: k.y },
    aimOrigin: { x: u.x, y: u.y },
  });
  const shot = B.fire(s, e, u, k);
  assert.ok(shot);
  assert.equal(u.lastShotAt, 10);
  u.prone = true;
  u.stance = "prone";
  const delay = find(x);
  assert.ok(delay < find(make()) && delay < 40, delay);
  C.validate(s);
});
test("a concealed sniper at very close range remains detectable and lost visual contact does not refresh exact position memory", () => {
  const x = make({ distance: 8 });
  assert.ok(find(x) < 5);
  const old = x.enemy.memory.find((m) => m.id === x.u.id).lastSeen;
  x.u.waitingForDeployment = true;
  x.u.x = 130;
  for (let i = 0; i < 12; i++) {
    x.e.time++;
    x.s.clock.elapsedSeconds++;
    assert.ok(!B.scanEnemy(x.e, x.enemy) || i < 8);
  }
  assert.equal(x.enemy.memory.find((m) => m.id === x.u.id).lastSeen, old);
  C.validate(x.s);
});
