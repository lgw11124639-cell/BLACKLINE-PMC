const test = require("node:test"),
  assert = require("node:assert/strict");
const Motion = require("../overwatch/motion");
const unit = {
  role: "sniper",
  pose: "prone",
  health: { alive: true, conscious: true },
  weapon: { reloadUntil: null },
};
test("a delivered shot drives a finite flash, recoil and sniper bolt cycle", () => {
  assert.equal(Motion.sample(unit, { now: 50, shotAt: 0 }).flash, true);
  assert.ok(Motion.sample(unit, { now: 50, shotAt: 0 }).recoil > 0);
  assert.equal(Motion.sample(unit, { now: 300, shotAt: 0 }).flash, false);
  assert.ok(Motion.sample(unit, { now: 550, shotAt: 0 }).bolt > 0);
  assert.equal(Motion.sample(unit, { now: 1200, shotAt: 0 }).mode, "ready");
  assert.equal(Motion.sample(unit, { now: 50 }).flash, false);
});
test("pause, casualty and treatment suppress weapon and locomotion animation", () => {
  for (const change of [
    { paused: true },
    { pose: "dead" },
    { pose: "aid" },
    { pose: "carried" },
    { health: { alive: true, conscious: false } },
  ]) {
    const x = Motion.sample(
      { ...unit, ...change },
      { now: 50, shotAt: 0, moving: true, paused: !!change.paused },
    );
    assert.equal(x.flash, false);
    assert.equal(x.recoil, 0);
    assert.equal(x.leg, 0);
  }
});
test("reload follows actual weapon clock and walking follows actual displacement", () => {
  const reloading = { ...unit, weapon: { reloadUntil: 14 } };
  assert.equal(
    Motion.sample(reloading, { now: 50, simulationTime: 12 }).mode,
    "reload",
  );
  assert.equal(
    Motion.sample(reloading, { now: 50, simulationTime: 14 }).mode,
    "ready",
  );
  assert.equal(
    Motion.sample(
      { ...unit, pose: "standing" },
      { now: 50, moving: true, elapsed: 100 },
    ).mode,
    "walk",
  );
  assert.equal(
    Motion.sample({ ...unit, pose: "standing" }, { now: 50, moving: false })
      .leg,
    0,
  );
});

test("walking faces actual displacement while stationary aiming retains target heading", () => {
  const u = { heading: 0 };
  assert.equal(
    Motion.facing(u, { x: 20, y: 10 }, { x: 10, y: 10 }, true),
    Math.PI,
  );
  assert.equal(
    Motion.facing(u, { x: 10, y: 20 }, { x: 10, y: 10 }, true),
    -Math.PI / 2,
  );
  assert.equal(Motion.facing(u, { x: 20, y: 10 }, { x: 10, y: 10 }, false), 0);
  assert.equal(
    Motion.facing({ heading: 1 }, { x: 10, y: 10 }, { x: 10, y: 10 }, true),
    1,
  );
});
