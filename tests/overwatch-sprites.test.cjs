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
    "observer-move",
  );
  assert.equal(
    Sprites.select({ ...wounded, combatActive: false, mobility: false }).key,
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

test("agency medic only uses treatment art for an actual treating phase and never carries a rifle sprite", () => {
  assert.equal(
    Sprites.select({ role: "medic", pose: "aid", state: "treating" }).key,
    "medic-aid",
  );
  assert.equal(
    Sprites.select(
      { role: "medic", pose: "standing", state: "approaching" },
      { moving: true },
    ).key,
    "medic-move",
  );
  assert.equal(
    Sprites.select({ role: "medic", pose: "standing", state: "recovering" })
      .key,
    "medic-move",
  );
});

test("observed unconscious contacts share the fallen image while their down state remains unconfirmed", () => {
  for (const faction of [
    "regular",
    "insurgent",
    "allied",
    "civilian",
    "unknown",
  ]) {
    const u = {
      faction,
      classification: "armed-person",
      pose: "standing",
      medicalCondition: "dead",
    };
    assert.equal(Sprites.select(u).action, "dead");
    assert.ok(Sprites.select(u).key.endsWith("-dead"));
    const unconscious = Sprites.select({
      ...u,
      medicalCondition: "down",
      pose: "down",
    });
    assert.notEqual(unconscious.action, "dead");
    assert.ok(unconscious.key.endsWith("-dead"));
  }
  assert.equal(
    Sprites.select({
      faction: "regular",
      specialty: "sniper",
      medicalCondition: "dead",
    }).key,
    "enemy-sniper-dead",
  );
});
test("hit and death crops never enlarge the same character beyond its standing extent", () => {
  for (const faction of ["regular", "insurgent", "allied", "civilian"]) {
    const extent = (u) => {
      const x = Sprites.select(u),
        b = x.art.bounds;
      return Math.max(x.widthM, (x.widthM * (b[3] - b[1])) / (b[2] - b[0]));
    };
    const standing = extent({ faction, pose: "standing" });
    for (const pose of ["down", "dead"])
      assert.ok(extent({ faction, pose }) <= standing + 1e-9);
    assert.ok(
      extent({ faction, medicalCondition: "wounded" }) <= standing + 1e-9,
    );
  }
});

test("map-space display scale grows exactly with zoom and never plateaus at a viewport pixel cap", () => {
  for (const height of [160, 800]) {
    const map = { height };
    for (const ppm of [0.2, 0.5, 1, 2, 4, 8, 16]) {
      const before = Sprites.mapScale(map, ppm),
        after = Sprites.mapScale(map, ppm * 2);
      assert.ok(before > 0);
      assert.equal(after, before * 2);
      assert.ok(Math.abs(before / ppm - Sprites.mapScale(map, 1)) < 1e-12);
    }
  }
});

test("map dimensions never inflate a character world scale", () => {
  for (const ppm of [0.5, 1, 3, 10])
    assert.equal(
      Sprites.mapScale({ height: 320 }, ppm),
      Sprites.mapScale({ height: 2400 }, ppm),
    );
  assert.equal(Sprites.mapScale({ height: 800 }, 1), 2);
});

test("readable people use a fixed threefold boost without map-dependent growth", () => {
  for (const height of [160, 800, 2400]) {
    const map = { height };
    for (const ppm of [0.2, 0.5, 1, 2, 8]) {
      assert.equal(Sprites.actorScale(map, ppm), Sprites.mapScale(map, ppm) * 3);
      assert.equal(Sprites.actorScale(map, ppm * 2), Sprites.actorScale(map, ppm) * 2);
      assert.equal(Sprites.actorScale(map, ppm), Sprites.actorScale({ height: 800 }, ppm));
    }
  }
});
