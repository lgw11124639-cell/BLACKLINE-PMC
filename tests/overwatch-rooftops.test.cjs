const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  G = require("../overwatch/geometry"),
  Storage = require("../overwatch/storage");
function make(mapId) {
  const s = C.createCampaign({ id: "ROOFS" });
  const hire = (role) =>
    P.hire(s, s.market.candidates.find((c) => c.specialty === role).id, 30);
  const o = hire("observer"),
    n = hire("sniper");
  P.assign(s, "ALPHA", o.id, n.id);
  B.begin(s, { mapId, seed: 7 });
  return { s, e: s.commandExercise, u: s.commandExercise.world.units[1] };
}
for (const mapId of [
  "urban-quarter",
  "urban-modern",
  "urban-port",
  "urban-market",
])
  test(
    mapId +
      " rooftop requires a real ground route, timed ascent and descent and survives saving",
    () => {
      const { s, e, u } = make(mapId);
      e.world.units[0].home = true;
      const origin = { x: u.x, y: u.y },
        roof = G.roofs().find((r) => G.path(u, r.point).length);
      assert.ok(roof);
      assert.ok(G.blocked({ ...roof.point, roofId: null }));
      assert.ok(!G.blocked(roof.point));
      u.path = G.path(u, roof.point);
      u.goal = { ...roof.point };
      const points = u.path;
      assert.ok(points.some((p) => p.roofTransition === "up"));
      let climbing = 0;
      for (let i = 0; i < 1500 && u.path.length; i++) {
        e.time++;
        s.clock.elapsedSeconds++;
        D.internals.moveUnit(e, u, 0.8);
        if (u.roofTransit) climbing++;
        C.validate(s);
      }
      assert.equal(u.roofId, roof.id);
      assert.ok(climbing >= Math.max(12, roof.height * 2) - 1);
      assert.equal(G.elevation(u), roof.height);
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
      };
      const st = Storage.create({ storage: memory });
      st.save(s, null);
      assert.equal(
        st.load().state.commandExercise.world.units[1].roofId,
        roof.id,
      );
      u.path = G.path(u, origin);
      u.goal = origin;
      assert.ok(u.path.some((p) => p.roofTransition === "down"));
      for (let i = 0; i < 1500 && u.path.length; i++) {
        e.time++;
        s.clock.elapsedSeconds++;
        D.internals.moveUnit(e, u, 0.8);
        C.validate(s);
      }
      assert.equal(u.roofId, undefined);
      assert.ok(G.distance(u, origin) < 1);
      assert.equal(
        e.events.filter((ev) => ev.type === "roof-access-completed").length,
        2,
      );
    },
  );
test("observer chooses an accessible rooftop when its actual sightline is better than the street", () => {
  const { s, e } = make("urban-modern");
  e.battle.observerAutonomy = true;
  for (const a of e.world.actors) a.health.conscious = false;
  D.issue(s, "ALPHA", "cover");
  for (let i = 0; i < 30; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
    C.validate(s);
  }
  const c = e.commands.find((c) => c.kind === "cover");
  assert.ok(c.position?.roofId, c.position);
  assert.ok(
    e.events.some(
      (ev) => ev.type === "tactical-position-selected" && ev.position.roofId,
    ),
  );
  for (let i = 0; i < 700 && !e.world.units.some((u) => u.roofId); i++) {
    B.setPaused(s, false);
    D.step(s, 1);
    C.validate(s);
  }
  assert.ok(
    e.world.units.some((u) => u.roofId),
    "a real team member must physically reach the selected roof",
  );
});
