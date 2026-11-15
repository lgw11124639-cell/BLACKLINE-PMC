const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle");
function scenario(distance, optics = true) {
  const s = C.createCampaign({ id: "VISION" }),
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
  const e = s.commandExercise,
    u = e.world.units[0],
    t = e.world.actors[0];
  Object.assign(u, { x: 100, y: 700, path: [], goal: null });
  Object.assign(e.world.units[1], { x: 80, y: 680, path: [], goal: null });
  Object.assign(t, {
    x: 100 + distance,
    y: 700,
    heading: 0,
    route: [{ x: 100 + distance, y: 700 }],
    waypoint: 0,
    speed: 0,
  });
  e.world.actors = [t];
  if (optics) D.issue(s, "ALPHA", "observe", { x: 1190, y: 700 });
  else D.issue(s, "ALPHA", "hold");
  for (let i = 0; i < 45; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
    C.validate(s);
  }
  return { s, e, u, t };
}
test("an observer identifies a target beyond rifle range but cannot fire at it", () => {
  const { s, e, u, t } = scenario(500);
  assert.ok(
    u.visionRange > u.weapon.range ||
      u.visionRange > B.WEAPONS[u.weapon.model].range,
  );
  assert.ok(
    D.frame(s).contacts.some(
      (c) => c.id === t.id && c.classification === "armed-person",
    ),
  );
  const before = u.weapon.loaded;
  u.weapon.targetId = t.id;
  u.weapon.aimSince = 0;
  B.fire(s, e, u, { id: t.id, x: t.x, y: t.y, condition: "standing" });
  assert.equal(u.weapon.loaded, before);
  assert.ok(u.visionRange > B.WEAPONS[u.weapon.model].range);
});
test("a detected distant person does not become an identified armed target outside identification range", () => {
  const { s, u, t } = scenario(900);
  const c = D.frame(s).contacts.find((c) => c.id === t.id);
  assert.ok(c);
  assert.equal(c.classification, "unknown");
  assert.ok(c.confidence < 0.8);
  assert.ok(u.visionRange > 900);
  assert.ok(u.identificationRange < 900);
});
test("weapon range never reveals someone outside unassisted sight", () => {
  const { s, e, u, t } = scenario(400, false);
  assert.equal(D.frame(s).contacts.length, 0);
  assert.ok(B.WEAPONS[u.weapon.model].range > 400);
  assert.ok(u.visionRange < 400);
  assert.equal(e.battle.totalShots, 0);
});
