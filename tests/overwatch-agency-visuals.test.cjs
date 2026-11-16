const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  M = require("../overwatch/missions"),
  S = require("../overwatch/command-staff"),
  G = require("../overwatch/geometry"),
  Sprites = require("../overwatch/sprites");
function setup(key = "high-value-target", pairs = 1) {
  const s = C.createCampaign({ id: "AGENCY-VISUAL-" + key });
  S.upgrade(s);
  const h = (r) =>
    P.hire(s, s.market.candidates.find((x) => x.specialty === r).id, 30);
  for (let i = 0; i < pairs; i++)
    P.assign(s, C.CALLSIGNS[i], h("observer").id, h("sniper").id);
  const officer = S.hire(
    s,
    s.commandStaff.market.find((x) => x.duty === "controller").id,
  );
  S.assign(s, "controller", officer.id);
  S.delegate(s, false);
  const c = s.contracts.find((c) => c.key === key);
  M.accept(s, c.id);
  M.launch(s, c.id);
  const e = s.commandExercise;
  function step(n = 1) {
    for (let i = 0; i < n; i++) {
      for (const a of e.world.actors.filter((a) => a.side === "red"))
        a.weapon.nextFireAt = e.time + 20;
      if (step.holdAgency)
        for (const a of e.world.actors.filter(
          (a) => a.side === "ally" && a.armed,
        ))
          a.weapon.nextFireAt = e.time + 20;
      B.setPaused(s, false);
      D.step(s, 1);
    }
  }
  e.world.actors
    .filter((a) => a.side === "red")
    .forEach((a) => (a.health.conscious = false));
  step(100);
  e.world.units.forEach((a) =>
    Object.assign(a, {
      ...G.project({ x: 1100, y: 100 }),
      path: [],
      goal: null,
      roofId: null,
      roofTransit: null,
    }),
  );
  const troops = e.world.actors.filter((a) => a.side === "ally" && a.armed),
    u = troops[0],
    enemy = e.world.actors.find((a) => a.id === "opposition-4");
  troops.forEach((a, i) =>
    Object.assign(a, {
      x: 400 - i * 15,
      y: 775,
      path: [],
      goal: null,
      waitingForDeployment: false,
    }),
  );
  Object.assign(enemy, {
    x: 450,
    y: 775,
    path: [],
    goal: null,
    deployment: null,
    route: [{ x: 450, y: 775 }],
  });
  enemy.health.conscious = true;
  return { s, e, u, enemy, step };
}
test("real agency shots, firing stance and discovered opponents reach HQ without a sniper seeing the firefight", () => {
  const { s, e, u, enemy, step } = setup();
  let frame, found;
  for (let i = 0; i < 120 && !found; i++) {
    step();
    frame = D.frame(s);
    found = frame.battle.effects.find(
      (fx) => fx.actorId === u.id && fx.kind === "shot",
    );
  }
  assert.ok(found);
  assert.equal(found.side, "ally");
  assert.equal(found.model, "HK416");
  assert.ok(u.weapon.spent > 0);
  assert.ok(
    frame.contacts.some((c) => c.id === enemy.id && c.source === "agency"),
  );
  assert.ok(e.squads.every((q) => !q.contacts.some((c) => c.id === enemy.id)));
  assert.ok(frame.supportActors.find((a) => a.id === u.id).weapon.spent > 0);
  assert.ok(
    e.battle.delivered.some(
      (p) =>
        p.callsign === "AGENCY" &&
        p.effects.some((fx) => fx.eventId === found.eventId),
    ),
  );
  assert.ok(
    !frame.contacts.some((c) => c.id === "opposition-8"),
    "unseen opponents must remain hidden",
  );
  C.validate(s);
  C.validate(C.clone(s));
});
test("agency-observed opposing gunfire is visible with the opposing side and real weapon", () => {
  const { s, e, u, enemy, step } = setup();
  step(6);
  let shot;
  for (let i = 0; i < 20 && !shot; i++) {
    enemy.weapon.nextFireAt = 0;
    enemy.weapon.aimSince = 0;
    shot = B.fire(s, e, enemy, {
      id: u.id,
      x: u.x,
      y: u.y,
      lastSeen: e.time,
      condition: "standing",
    });
    if (!shot) step();
  }
  assert.ok(shot);
  step(4);
  const fx = D.frame(s).battle.effects.find((fx) => fx.eventId === shot.id);
  assert.ok(fx);
  assert.equal(fx.side, "red");
  assert.equal(fx.actorId, enemy.id);
  C.validate(s);
});
test("agency personnel have one marker and guards and infantry use the same physical sprite scale", () => {
  const { s, e, step } = setup("vip-cover");
  step(2);
  const guard = e.world.actors.find((a) => a.id === "agency-guide");
  e.knowledge.contacts[guard.id] = {
    id: guard.id,
    x: guard.x,
    y: guard.y,
    observedAt: e.time,
    confidence: 1,
    classification: "friendly-person",
  };
  const frame = D.frame(s);
  assert.equal(frame.supportActors.filter((a) => a.id === guard.id).length, 1);
  assert.ok(!frame.contacts.some((c) => c.id === guard.id));
  for (const pose of ["standing", "kneeling", "prone"]) {
    const style = {
      pose,
      activity: "aiming",
      health: { alive: true, conscious: true, wounds: [] },
      faction: "allied",
      combatActive: true,
    };
    const a = Sprites.select({
        ...style,
        role: "infantry",
        roleLabel: "기관 경호 보병",
      }),
      b = Sprites.select({
        ...style,
        role: "infantry",
        roleLabel: "기관 보병",
      });
    assert.equal(a.key, b.key);
    assert.equal(a.widthM, b.widthM);
  }
});

test("the controller acts on delivered agency contacts and selects a clear firing lane before a nearer blocked squad", () => {
  const { s, e, enemy, step } = setup("high-value-target", 2);
  const grid = [];
  for (let x = 30; x < 1170; x += 20)
    for (let y = 30; y < 770; y += 20) {
      const p = { x, y };
      if (!G.blocked(p)) grid.push(p);
    }
  const blocked = grid
    .filter((p) => G.distance(p, enemy) < 220 && !G.clear(p, enemy))
    .sort((a, b) => G.distance(a, enemy) - G.distance(b, enemy))[0];
  const clear = grid.filter(
    (p) =>
      G.distance(p, enemy) > 400 &&
      G.distance(p, enemy) < 900 &&
      G.clear(p, enemy),
  )[0];
  assert.ok(blocked && clear);
  for (const u of e.world.units) {
    const p = u.callsign === "ALPHA" ? blocked : clear;
    Object.assign(u, {
      ...p,
      path: [],
      goal: null,
      roofId: null,
      roofTransit: null,
    });
  }
  step.holdAgency = true;
  for (
    let i = 0;
    i < 80 &&
    !D.frame(s).contacts.some(
      (c) => c.id === enemy.id && c.source === "agency",
    );
    i++
  )
    step();
  assert.ok(
    D.frame(s).contacts.some((c) => c.id === enemy.id && c.source === "agency"),
    JSON.stringify({
      contacts: D.frame(s).contacts,
      enemy: { x: enemy.x, y: enemy.y },
      reports: e.world.actors
        .filter((a) => a.side === "ally")
        .map((a) => ({ id: a.id, x: a.x, y: a.y, reports: a.agencyReports })),
    }),
  );
  S.delegate(s, true);
  step(15);
  const decision = e.events.find(
    (ev) => ev.type === "controller-agency-contact-cover",
  );
  assert.ok(decision);
  assert.equal(decision.callsign, "BRAVO");
  assert.equal(decision.reposition, false);
  const orders = e.commands.filter(
    (c) => c.kind === "cover" && c.supportContact?.id === enemy.id,
  );
  assert.equal(orders.length, 1);
  assert.equal(
    orders[0].supportContact.lastSeen,
    orders[0].supportContact.observedAt,
  );
  step(12);
  assert.equal(
    e.commands.filter(
      (c) => c.kind === "cover" && c.supportContact?.id === enemy.id,
    ).length,
    1,
  );
  if (enemy.health.alive)
    B.ballisticImpact(s, e, enemy, {
      eventId: "support-threat-ended",
      model: "AXMC",
      part: "chest",
      lateral: 0,
      height: 1.2,
      distance: 50,
    });
  step(30);
  assert.ok(
    e.events.some(
      (ev) =>
        ev.type === "controller-support-complete" && ev.contactId === enemy.id,
    ),
  );
  C.validate(s);
});

test("an unseen opposing muzzle never becomes an exact map marker through agency telemetry", () => {
  const { s, e, u, enemy, step } = setup();
  Object.assign(enemy, {
    x: 700,
    y: 775,
    path: [],
    goal: null,
    route: [{ x: 700, y: 775 }],
  });
  step.holdAgency = true;
  let shot;
  for (let i = 0; i < 20 && !shot; i++) {
    enemy.weapon.nextFireAt = 0;
    enemy.weapon.aimSince = 0;
    shot = B.fire(s, e, enemy, {
      id: u.id,
      x: u.x,
      y: u.y,
      lastSeen: e.time,
      condition: "standing",
    });
    if (!shot) step();
  }
  assert.ok(shot);
  step(4);
  const frame = D.frame(s);
  assert.ok(!frame.contacts.some((c) => c.id === enemy.id));
  assert.ok(
    !frame.battle.effects.some(
      (fx) =>
        fx.eventId === shot.id && fx.actorId === enemy.id && fx.sourceKnown,
    ),
  );
  C.validate(s);
});
