const test = require("node:test"),
  assert = require("node:assert/strict");
const C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  G = require("../overwatch/geometry");
function make(mapId = "command-range", scenario = "recon") {
  const s = C.createCampaign({ id: "URBAN" });
  const o = P.hire(
      s,
      s.market.candidates.find((v) => v.specialty === "observer").id,
      30,
    ),
    n = P.hire(
      s,
      s.market.candidates.find((v) => v.specialty === "sniper").id,
      30,
    );
  P.assign(s, "ALPHA", o.id, n.id);
  B.begin(s, { mapId, scenario, seed: 7 });
  B.setPaused(s, false);
  return s;
}
function advance(s, n) {
  while (n > 0 && s.commandExercise.status === "running") {
    if (s.commandExercise.paused) B.setPaused(s, false);
    const used = D.step(s, Math.min(10, n));
    n -= used;
    C.validate(s);
  }
}
for (const id of [
  "urban-quarter",
  "urban-modern",
  "urban-port",
  "urban-market",
])
  test(
    id +
      " has distinct saved geometry, valid actual actors and reproducible autonomous orders",
    () => {
      const s = make(id, "support");
      C.validate(s);
      const e = s.commandExercise;
      assert.equal(e.mapId, id);
      assert.equal(D.frame(s).map.width, 240);
      assert.ok(D.frame(s).map.image.includes(id));
      assert.ok(e.world.actors.some((a) => a.side === "ally"));
      assert.ok(e.world.actors.some((a) => a.specialty === "sniper"));
      D.issue(s, "ALPHA", "cover");
      advance(s, 30);
      const restored = C.clone(s);
      advance(s, 30);
      advance(restored, 30);
      assert.deepEqual(restored, s);
      G.activate(id);
      for (const u of e.world.units) assert.equal(G.blocked(u), false);
    },
  );
test("cover geometry blocks low sightlines and routes but allows a high sightline", () => {
  G.activate("urban-market");
  const c = G.MAP.covers.find((v) => v.type === "barrier"),
    a = { x: c.x - 10, y: c.y, stance: "prone" },
    b = { x: c.x + 10, y: c.y, stance: "prone" };
  assert.equal(G.clear(a, b), false);
  assert.equal(
    G.clear({ ...a, stance: "standing" }, { ...b, stance: "standing" }),
    true,
  );
  assert.equal(G.clear(a, b, true), false);
  const route = G.path(a, b);
  assert.ok(route.length > 1);
  let prev = a;
  for (const p of route) {
    assert.equal(G.clear(prev, p, true), true);
    prev = p;
  }
});
test("actual rifle range prevents ammunition use outside the supported envelope", () => {
  function tryShot(distance) {
    const s = make(),
      e = s.commandExercise;
    advance(s, 10);
    const u = e.world.units[0],
      t = e.world.actors[0];
    Object.assign(u, { x: 100, y: 700, path: [], goal: null });
    Object.assign(e.world.units[1], { x: 80, y: 680, path: [], goal: null });
    Object.assign(t, {
      x: 100 + distance,
      y: 700,
      prone: false,
      stance: "standing",
    });
    u.weapon.targetId = t.id;
    u.weapon.aimAnchor = { x: t.x, y: t.y };
    u.weapon.aimOrigin = { x: u.x, y: u.y };
    u.weapon.aimSince = 0;
    const before = u.weapon.loaded;
    B.fire(s, e, u, { id: t.id, x: t.x, y: t.y, condition: "standing" });
    return { used: before - u.weapon.loaded, model: u.weapon.model };
  }
  assert.equal(tryShot(449).used, 1);
  assert.equal(tryShot(451).used, 0);
});
test("posture uses distance and actual clear sightline; optional imported posture is validated", () => {
  const s = make(),
    e = s.commandExercise,
    u = e.world.units[1];
  Object.assign(u, { x: 100, y: 700, path: [] });
  assert.equal(B.chooseStance(e, u, { x: 140, y: 700 }), "standing");
  assert.equal(B.chooseStance(e, u, { x: 240, y: 700 }), "kneeling");
  assert.equal(B.chooseStance(e, u, { x: 500, y: 700 }), "prone");
  C.validate(s);
  u.stance = "hovering";
  assert.throws(() => C.validate(s));
});

test("long city exercises retain valid paths, uncertain reports and stale telemetry evidence", () => {
  for (const mapId of ["urban-modern", "urban-port", "urban-market"]) {
    const s = make(mapId, "support");
    D.end(s, "controlled");
    const o = P.hire(
        s,
        s.market.candidates.find((v) => v.specialty === "observer").id,
        30,
      ),
      n = P.hire(
        s,
        s.market.candidates.find((v) => v.specialty === "sniper").id,
        30,
      );
    P.assign(s, "BRAVO", o.id, n.id);
    B.begin(s, { mapId, scenario: "support", seed: 7 });
    for (const q of s.commandExercise.squads) {
      D.issue(s, q.callsign, "roe", null, "authorized");
      D.issue(s, q.callsign, "cover");
    }
    for (let i = 0; i < 900 && s.commandExercise.status === "running"; i++) {
      B.setPaused(s, false);
      D.step(s, 1);
      C.validate(s);
    }
    const restored = C.clone(s);
    C.validate(restored);
    assert.deepEqual(D.frame(restored), D.frame(s));
  }
});
