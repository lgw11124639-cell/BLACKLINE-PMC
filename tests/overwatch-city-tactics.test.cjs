const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  B = require("../overwatch/battle"),
  D = require("../overwatch/command"),
  M = require("../overwatch/missions"),
  G = require("../overwatch/geometry"),
  S = require("../overwatch/command-staff");
function campaign() {
  const s = C.createCampaign({ id: "CITY-TACTICS" });
  S.upgrade(s);
  for (let i = 0; i < 2; i++) {
    const h = (r) =>
      P.hire(s, s.market.candidates.find((m) => m.specialty === r).id, 30);
    P.assign(s, C.CALLSIGNS[i], h("observer").id, h("sniper").id);
  }
  const officer = S.hire(
    s,
    s.commandStaff.market.find((m) => m.duty === "controller").id,
  );
  S.assign(s, "controller", officer.id);
  return s;
}
test("Gwangju, Seoul and Busan have separate large images, 24 building blocks and varied physical roof heights", () => {
  const images = new Set();
  for (const id of [
    "city-gwangju-operation",
    "city-seoul-operation",
    "city-busan-operation",
  ]) {
    G.activate(id);
    assert.equal(G.MAP.width, 1200);
    assert.equal(G.MAP.height, 800);
    assert.equal(G.MAP.buildings.length, 24);
    assert.ok(new Set(G.MAP.buildings.map((b) => b[4])).size >= 4);
    assert.equal(G.roofs().length, 24);
    assert.ok(!G.blocked(G.MAP.base));
    assert.ok(G.path(G.MAP.base, G.project(G.MAP.sector)).length);
    assert.ok(fs.statSync(G.MAP.image).size > 10000);
    images.add(G.MAP.image);
  }
  assert.equal(images.size, 3);
});
test("new district missions launch with actual institution infantry and valid independent geometry", () => {
  for (const key of [
    "gwangju-rescue",
    "seoul-watch",
    "busan-escort",
    "radar-watch",
    "hillside-rescue",
    "depot-intercept",
  ]) {
    const s = campaign(),
      c = s.contracts.find((c) => c.key === key);
    M.accept(s, c.id);
    M.launch(s, c.id);
    C.validate(s);
    const e = s.commandExercise;
    assert.equal(
      e.world.actors.filter((a) => a.id.startsWith("agency-infantry-")).length,
      4,
    );
    for (const a of e.world.actors.filter((a) => a.side === "red"))
      a.health.conscious = false;
    for (let i = 0; i < 150; i++) {
      B.setPaused(s, false);
      D.step(s, 1);
    }
    assert.ok(e.mission.fieldStartedAt !== null, key);
    assert.ok(
      e.mission.contract.mapId.includes(c.mapId.split("-operation")[0]),
    );
    C.validate(s);
  }
});
test("tactical infantry routes stay physically clear and prefer building edges over exposed shortest lines", () => {
  G.activate("city-gwangju-operation");
  const start = G.project({ x: 55, y: 760 }),
    goal = G.project({ x: 1120, y: 75 }),
    normal = G.path(start, goal),
    tactical = G.tacticalPath(start, goal);
  assert.ok(normal.length && tactical.length);
  function exposure(route) {
    let a = start,
      total = 0,
      length = 0;
    for (const b of route) {
      assert.ok(G.clear(a, b, true));
      const d = G.distance(a, b);
      for (let n = 0; n < Math.ceil(d / 5); n++) {
        const t = (n + 0.5) / Math.ceil(d / 5),
          p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        total += (Math.min(100, G.coverDistance(p)) * d) / Math.ceil(d / 5);
      }
      length += d;
      a = b;
    }
    return total / length;
  }
  assert.ok(
    exposure(tactical) < exposure(normal),
    JSON.stringify({ normal: exposure(normal), tactical: exposure(tactical) }),
  );
});
test("a settled rooftop sniper gains stability and field of regard; movement and roof transit remove the advantage", () => {
  G.activate("city-seoul-operation");
  const roof = G.roofs()[0],
    u = {
      ...roof.point,
      id: "roof-preview",
      role: "sniper",
      health: B.health(),
      weapon: B.weapon("AXMC"),
      skill: 70,
      roofHoldSeconds: 3,
      path: [],
      primaryProficiency: 70,
    };
  const roofBonus = B.roofAdvantage(u),
    ground = { ...u, roofId: null };
  assert.equal(roofBonus.active, true);
  assert.equal(roofBonus.height, roof.height);
  assert.equal(roofBonus.dispersion, 0.85);
  assert.equal(roofBonus.angle, 1.5);
  assert.ok(B.firingProfile(u).aimSeconds < B.firingProfile(ground).aimSeconds);
  assert.equal(
    B.roofAdvantage({ ...u, path: [{ ...roof.point, x: u.x + 1 }] }).active,
    false,
  );
  assert.equal(
    B.roofAdvantage({ ...u, roofTransit: { dueAt: 20 } }).active,
    false,
  );
  assert.equal(B.roofAdvantage({ ...u, roofHoldSeconds: 2 }).active, false);
});
test("unseen enemy gunfire supplies a coarse bearing at a friendly listener, never an exact hostile marker", () => {
  const s = campaign();
  B.begin(s, { scenario: "interdiction", seed: 7 });
  const e = s.commandExercise,
    listener = e.world.units[0],
    enemy = e.world.actors.find((a) => a.side === "red");
  Object.assign(listener, { x: 100, y: 775, path: [], goal: null });
  Object.assign(enemy, {
    x: 430,
    y: 775,
    path: [],
    goal: null,
    route: [{ x: 430, y: 775 }],
    stance: "standing",
    prone: false,
  });
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.weapon.nextFireAt = 100;
  let shot;
  for (let i = 0; i < 20 && !shot; i++) {
    enemy.weapon.nextFireAt = 0;
    enemy.weapon.aimSince = 0;
    shot = B.fire(s, e, enemy, {
      id: listener.id,
      x: listener.x + 6,
      y: listener.y,
      lastSeen: e.time,
      condition: "standing",
    });
    e.time++;
    s.clock.elapsedSeconds++;
    B.beforeTick(s, e);
  }
  assert.ok(shot);
  for (let i = 0; i < 5; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
  }
  const f = D.frame(s),
    fx = f.battle.effects.find((fx) => fx.eventId === shot.id);
  assert.ok(fx);
  assert.equal(fx.sourceKnown, false);
  assert.equal(fx.actorId, null);
  assert.equal(typeof fx.bearing, "number");
  assert.equal(fx.bearingUncertainty, Math.PI / 8);
  assert.ok(G.distance(fx.from, enemy) > 100);
  assert.ok(!f.contacts.some((c) => c.id === enemy.id));
});
