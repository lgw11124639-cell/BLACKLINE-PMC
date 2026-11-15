const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  Sprites = require("../overwatch/sprites");
const base = {
  role: "observer",
  pose: "standing",
  health: { alive: true, conscious: true, wounds: [] },
  mobility: true,
  activity: "observing",
};
test("observer observes while sniper engages; actual observer shot overrides scope pose independently", () => {
  assert.equal(Sprites.select(base).key, "observer-observe");
  assert.equal(
    Sprites.select({ ...base, activity: "moving" }).key,
    "observer-move",
  );
  assert.equal(Sprites.select(base, { mode: "fire" }).key, "observer-standing");
  assert.equal(
    Sprites.select({ ...base, pose: "kneeling" }, { mode: "fire" }).key,
    "observer-kneeling",
  );
  assert.equal(
    Sprites.select({ ...base, pose: "prone" }, { mode: "fire" }).key,
    "observer-prone",
  );
});
test("wounded image follows combat cessation; treated mobile people return to normal, deaths remain deaths", () => {
  const wounded = {
    ...base,
    activity: "guarding",
    health: {
      alive: true,
      conscious: true,
      wounds: [{ part: "leftArm", treated: false }],
    },
    combatActive: true,
  };
  assert.equal(Sprites.select(wounded).key, "observer-move");
  assert.equal(
    Sprites.select({ ...wounded, combatActive: false }).key,
    "observer-wounded",
  );
  const treated = {
    ...wounded,
    state: "wounded",
    combatActive: false,
    health: { ...wounded.health, wounds: [{ part: "leftArm", treated: true }] },
  };
  assert.equal(Sprites.select(treated).key, "observer-move");
  assert.equal(
    Sprites.select({
      ...treated,
      pose: "dead",
      health: { ...treated.health, alive: false },
    }).key,
    "observer-dead",
  );
  assert.equal(Sprites.select({ ...treated, pose: "down" }).action, "down");
});
test("all six character families use separate posture and casualty files, never an atlas cell", () => {
  for (const role of [
    "sniper",
    "observer",
    "regular",
    "insurgent",
    "allied",
    "civilian",
  ]) {
    for (const action of role === "civilian"
      ? ["walk", "flee", "cower", "wounded", "dead"]
      : role === "sniper"
        ? ["move", "observe", "standing", "kneeling", "wounded", "dead"]
        : role === "observer"
          ? [
              "move",
              "observe",
              "standing",
              "kneeling",
              "prone",
              "wounded",
              "dead",
            ]
          : ["move", "standing", "kneeling", "prone", "wounded", "dead"]) {
      const art = Sprites.data[role + "-" + action];
      assert.ok(art, role + "-" + action);
      assert.ok(
        fs.statSync(path.resolve(__dirname, "..", art.src)).size > 1000,
      );
      assert.equal(art.bounds.length, 4);
      assert.ok(
        art.bounds[0] >= 0 &&
          art.bounds[1] >= 0 &&
          art.bounds[2] <= art.size[0] &&
          art.bounds[3] <= art.size[1],
      );
    }
  }
  assert.equal(
    Sprites.select({
      pose: "prone",
      specialty: "sniper",
      faction: "regular",
      activity: "aiming",
    }).key,
    "enemy-sniper",
  );
  assert.equal(
    Sprites.select({
      pose: "kneeling",
      specialty: "sniper",
      faction: "regular",
      activity: "aiming",
    }).key,
    "enemy-sniper-kneeling",
  );
});
