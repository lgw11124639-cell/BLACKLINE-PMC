const test = require("node:test"),
  assert = require("node:assert/strict");
const C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  G = require("../overwatch/geometry");
function make(pairs = 1) {
  const s = C.createCampaign({ id: "TACTICAL" });
  for (let i = 0; i < pairs; i++) {
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
    P.assign(s, C.CALLSIGNS[i], o.id, n.id);
  }
  D.begin(s);
  return s;
}
function advance(s, n) {
  while (n > 0) {
    if (s.commandExercise.paused) D.resume(s);
    n -= D.step(s, Math.min(120, n));
  }
  C.validate(s);
}
test("HQ cover without coordinates produces actual observer-selected separated routes and causal radio", () => {
  const s = make(2),
    e = s.commandExercise;
  D.issue(s, "ALPHA", "cover");
  advance(s, 35);
  const c = e.commands[0],
    q = e.squads[0];
  assert.equal(c.target, null, "HQ did not supply a coordinate");
  assert.ok(c.position && !G.blocked(c.position));
  assert.ok(q.tactical);
  assert.ok(e.events.some((v) => v.type === "tactical-position-selected"));
  const [o, n] = e.world.units.filter((u) => u.callsign === "ALPHA");
  assert.ok(o.goal && n.goal);
  assert.ok(G.distance(o.goal, n.goal) >= 14);
  assert.ok(
    e.radio.some(
      (r) =>
        r.kind === "decision" &&
        e.events.some(
          (v) => v.id === r.eventId && v.type === "tactical-position-selected",
        ),
    ),
  );
  assert.equal(
    D.frame(s).commands[0].target,
    null,
    "local AI position must not leak through the original HQ order",
  );
  const restored = C.clone(s);
  advance(s, 50);
  advance(restored, 50);
  assert.deepEqual(restored, s);
});
test("an unseen enemy relocation never changes the observer tactical decision", () => {
  const a = make(),
    b = C.clone(a);
  for (const v of b.commandExercise.world.actors) {
    v.x = 1100;
    v.y = 700;
  }
  D.issue(a, "ALPHA", "cover");
  D.issue(b, "ALPHA", "cover");
  advance(a, 25);
  advance(b, 25);
  assert.deepEqual(
    a.commandExercise.commands[0].position,
    b.commandExercise.commands[0].position,
  );
  assert.deepEqual(
    a.commandExercise.squads[0].tactical.position,
    b.commandExercise.squads[0].tactical.position,
  );
});
test("recon interest area is optional and the observer chooses an accessible stand-off position", () => {
  const s = make();
  D.issue(s, "ALPHA", "recon", { x: 710, y: 140 });
  advance(s, 30);
  const c = s.commandExercise.commands[0];
  assert.deepEqual(c.target, { x: 710, y: 140 });
  assert.ok(c.position);
  assert.ok(G.distance(c.position, c.target) >= 55);
  assert.equal(G.blocked(c.position), false);
  const forged = C.clone(s);
  forged.commandExercise.commands[0].position = { x: 500, y: 300 };
  assert.throws(() => C.validate(forged));
});
