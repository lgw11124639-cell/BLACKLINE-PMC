const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  B = require("../overwatch/battle"),
  D = require("../overwatch/command"),
  S = require("../overwatch/command-staff"),
  Store = require("../overwatch/storage");
function campaign() {
  const s = C.createCampaign({ id: "DEVELOPMENT" });
  const h = (r) =>
    P.hire(s, s.market.candidates.find((m) => m.specialty === r).id, 30);
  P.assign(s, "ALPHA", h("observer").id, h("sniper").id);
  for (const m of s.members) {
    for (const k of P.SKILLS) m.skills[k] = 60;
    m.fatigue = 0;
    m.stress = 0;
  }
  return s;
}
function battle(s = campaign()) {
  B.begin(s, { scenario: "interdiction", seed: 7291 });
  s.commandExercise.world.actors.forEach((a) => (a.health.conscious = false));
  return s;
}
function shots(shooting, seed = 7291) {
  const s = campaign();
  s.members.find((m) => m.specialty === "sniper").skills.shooting = shooting;
  battle(s);
  const e = s.commandExercise,
    u = e.world.units.find((u) => u.role === "sniper"),
    v = e.world.actors.find((a) => a.side === "red");
  Object.assign(u, {
    x: 100,
    y: 775,
    path: [],
    goal: null,
    roofId: null,
    stance: "standing",
    prone: false,
  });
  Object.assign(v, { x: 1000, y: 775, path: [], goal: null, roofId: null });
  e.battle.rng = seed;
  let hits = 0,
    n = 0;
  for (let i = 0; i < 70 && n < 30; i++) {
    e.time += 10;
    s.clock.elapsedSeconds += 10;
    B.beforeTick(s, e);
    u.lastThreatAt = e.time - 5;
    v.health = B.health();
    v.stance = "standing";
    v.prone = false;
    const shot = B.fire(
      s,
      e,
      u,
      { id: v.id, x: v.x, y: v.y, lastSeen: e.time, condition: "standing" },
      { keepStance: true },
    );
    if (shot) {
      n++;
      if (shot.hit) hits++;
    }
  }
  assert.equal(
    n,
    30,
    JSON.stringify({
      reason: u.fireBlockReason,
      weapon: u.weapon,
      profile: B.firingProfile(u),
      path: u.path,
      health: u.health,
    }),
  );
  return hits;
}
test("shooting skill changes actual ballistic outcomes under identical seeded long-range conditions", () => {
  const low = [7291, 7292, 7293].reduce((n, seed) => n + shots(25, seed), 0),
    high = [7291, 7292, 7293].reduce((n, seed) => n + shots(90, seed), 0);
  assert.ok(high > low * 1.5 && high > low + 10, JSON.stringify({ low, high }));
});
test("live fatigue and stress change the field profile; composure, judgment, teamwork and proficiency affect preparation and recovery", () => {
  const s = battle(),
    e = s.commandExercise,
    u = e.world.units[0],
    m = s.members.find((m) => m.id === u.id);
  B.refreshPerformance(s, e, u);
  const fresh = B.performance(u).shooting;
  m.fatigue = 60;
  m.stress = 30;
  B.refreshPerformance(s, e, u);
  assert.ok(B.performance(u).shooting < fresh);
  const raw = {
    role: "sniper",
    skill: 60,
    weapon: B.weapon("AXMC"),
    combatSkills: Object.fromEntries(P.SKILLS.map((k) => [k, 60])),
    primaryProficiency: 60,
  };
  const inexperienced = B.firingProfile({
      ...raw,
      combatSkills: {
        ...raw.combatSkills,
        composure: 25,
        judgment: 25,
        teamwork: 25,
      },
      primaryProficiency: 30,
    }),
    experienced = B.firingProfile({
      ...raw,
      combatSkills: {
        ...raw.combatSkills,
        composure: 90,
        judgment: 90,
        teamwork: 90,
      },
      primaryProficiency: 90,
    });
  for (const k of [
    "aimSeconds",
    "suppressionSeconds",
    "suppressionPenalty",
    "reloadFactor",
    "reactionSeconds",
  ])
    assert.ok(experienced[k] < inexperienced[k], k);
  const weak = {
      ...raw,
      health: B.health(),
      faction: "allied",
      side: "ally",
      path: [{ x: 20, y: 20 }],
      combatSkills: { ...raw.combatSkills, fitness: 25 },
    },
    fit = { ...weak, combatSkills: { ...weak.combatSkills, fitness: 90 } };
  assert.ok(B.moveFactor(fit) > B.moveFactor(weak));
});
test("visual acquisition uses observation rather than shooting and never changes hidden-target coordinates", () => {
  function acquire(observation, shooting) {
    const s = battle(),
      e = s.commandExercise,
      u = e.world.units[0],
      m = s.members.find((m) => m.id === u.id),
      v = e.world.actors.find((a) => a.side === "red");
    m.skills.observation = observation;
    m.skills.shooting = shooting;
    B.refreshPerformance(s, e, u);
    Object.assign(u, { x: 100, y: 775 });
    Object.assign(v, {
      x: 250,
      y: 775,
      stance: "standing",
      prone: false,
      path: [],
    });
    let found = 0;
    for (let i = 1; i <= 40; i++) {
      e.time = i;
      if (B.visualAcquire(e, u, v, 400)) {
        found = i;
        break;
      }
    }
    assert.equal(v.x, 250);
    return found;
  }
  assert.ok(acquire(90, 25) < acquire(25, 90));
  assert.equal(acquire(60, 25), acquire(60, 90));
});
test("completed coached training raises real ability, preserves fractional progress and survives save/reload; cancellation grants no growth", () => {
  const s = campaign(),
    m = s.members.find((m) => m.specialty === "sniper");
  S.upgrade(s);
  const teacher = S.hire(
    s,
    s.commandStaff.market.find((x) => x.duty === "instructor").id,
  );
  S.assign(s, "instructor", teacher.id);
  const initial = m.skills.shooting;
  P.start(s, {
    kind: "training",
    memberIds: s.members.map((m) => m.id),
    course: "shooting",
    hours: 4,
    instructorId: teacher.id,
  });
  P.advance(s);
  assert.ok(m.skills.shooting > initial);
  assert.ok(
    m.development.log.some(
      (r) => r.after > r.before && r.source === "training",
    ),
  );
  const before = C.clone(m),
    a = P.start(s, {
      kind: "training",
      memberIds: s.members.map((m) => m.id),
      instructorId: teacher.id,
      course: "shooting",
      hours: 4,
    });
  P.elapse(s, 3600);
  P.cancel(s, a.id);
  assert.equal(m.skills.shooting, before.skills.shooting);
  assert.deepEqual(m.development, before.development);
  const memory = {
    map: new Map(),
    getItem(k) {
      return this.map.get(k) ?? null;
    },
    setItem(k, v) {
      this.map.set(k, v);
    },
    removeItem(k) {
      this.map.delete(k);
    },
  };
  const st = Store.create({ storage: memory });
  st.save(s, null);
  const loaded = st.load().state;
  assert.deepEqual(
    loaded.members.find((x) => x.id === m.id).development,
    m.development,
  );
  C.validate(loaded);
});
test("repeated fractional practice cannot grant integer rounding bonuses, and role-specific plans favor relevant weaknesses", () => {
  const s = campaign(),
    m = s.members[0],
    a = C.clone(m),
    b = C.clone(m);
  P.learn(a, "composure", 0.8);
  for (let i = 0; i < 8; i++) P.learn(b, "composure", 0.1);
  assert.equal(a.skills.composure, b.skills.composure);
  assert.equal(
    a.development.progress.composure,
    b.development.progress.composure,
  );
  assert.equal(a.skills.composure, 60);
  for (const k of P.SKILLS) m.skills[k] = 70;
  assert.equal(P.trainingPriorities(m)[0].skill, "observation");
  m.specialty = "sniper";
  assert.equal(P.trainingPriorities(m)[0].skill, "shooting");
});
