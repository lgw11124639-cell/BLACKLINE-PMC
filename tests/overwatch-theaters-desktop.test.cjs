const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  M = require("../overwatch/missions"),
  G = require("../overwatch/geometry");
function campaign() {
  const s = C.createCampaign({ id: "THEATERS" }),
    h = (r) =>
      P.hire(s, s.market.candidates.find((c) => c.specialty === r).id, 30);
  P.assign(s, "ALPHA", h("observer").id, h("sniper").id);
  return s;
}
test("renewed offers rotate actual maps and observation objectives instead of repeating a fixed task location", () => {
  const s = campaign(),
    old = s.contracts.filter((c) => c.status === "offered");
  s.clock.elapsedSeconds = s.operations.nextRefreshAt;
  M.refresh(s);
  for (const key of ["aid-cover", "rescue-cover", "vip-cover"]) {
    const prev = old.find((c) => c.key === key),
      next = s.contracts.findLast((c) => c.key === key);
    assert.notEqual(next.mapId, prev.mapId);
    assert.notDeepEqual(next.interest, prev.interest);
  }
  C.validate(s);
});
test("pre-sortie area choice changes actual saved terrain and squad objectives and cannot move an active mission", () => {
  const s = campaign(),
    c = s.contracts.find((c) => c.key === "aid-cover");
  M.selectRegion(s, c.id, "urban-market-operation");
  assert.equal(c.region, G.maps[c.mapId].name);
  M.accept(s, c.id);
  M.launch(s, c.id);
  const e = s.commandExercise;
  assert.equal(e.mapId, "urban-market-operation");
  assert.deepEqual(e.squads[0].sector, c.interest);
  assert.throws(() => M.selectRegion(s, c.id, "urban-port-operation"));
  C.validate(C.clone(s));
});
test("an old roof-routed ground vehicle resumes on a real road without carrying a rooftop layer into its passengers", () => {
  const s = campaign(),
    c = s.contracts.find((c) => c.key === "aid-cover");
  c.transport = "vehicle";
  M.accept(s, c.id);
  M.launch(s, c.id);
  const e = s.commandExercise,
    m = e.mission,
    t = m.transports[0],
    u = e.world.units[0],
    roof = G.roofs()[0];
  t.manifest = [u.id];
  t.state = "driving";
  t.target = { ...roof.point };
  t.path = [
    { ...roof.point },
    { ...roof.access, roofTransition: "down", roofFrom: roof.id },
  ];
  t.x = roof.point.x;
  t.y = roof.point.y;
  t.arrival = "pickup-landed";
  t.trip = "extraction";
  Object.assign(u, roof.point, {
    boardedBy: t.id,
    state: "aboard",
    waitingForDeployment: false,
  });
  m.returnRequested = true;
  m.recoveryVersion = 2;
  m.phase = "extracting";
  const before = JSON.stringify(u.health);
  C.validate(s);
  const restored = C.clone(s);
  for (let i = 0; i < 20; i++) {
    B.setPaused(restored, false);
    D.step(restored, 1);
    C.validate(restored);
  }
  const after = restored.commandExercise.world.units[0],
    vehicle = restored.commandExercise.mission.transports[0];
  assert.equal(after.roofId, undefined);
  assert.equal(after.roofTransit, undefined);
  assert.equal(JSON.stringify(after.health), before);
  assert.equal(G.blocked(vehicle), false);
  assert.ok(
    restored.commandExercise.events.some(
      (ev) => ev.type === "transport-ground-route-recovered",
    ),
  );
  assert.equal(after.boardedBy, vehicle.id);
});
test("opposition starts at assembly points and physically approaches the operation instead of spawning at its destination", () => {
  const s = campaign(),
    c = s.contracts.find((c) => c.key === "aid-cover");
  M.accept(s, c.id);
  M.launch(s, c.id);
  const e = s.commandExercise,
    reds = e.world.actors.filter((a) => a.side === "red");
  assert.ok(reds.length >= 8);
  assert.ok(
    reds.every(
      (a) =>
        a.deployment.phase === "approach" &&
        G.distance(a, a.deployment.destination) > 20,
    ),
  );
  assert.ok(reds.some((a) => a.faction === "regular"));
  assert.ok(reds.some((a) => a.faction === "insurgent"));
  assert.equal(D.frame(s).contacts.length, 0);
  C.validate(C.clone(s));
});
test("regular pairs bound with a stationary covering member while insurgents advance without coordinated bounds", () => {
  const s = campaign(),
    c = s.contracts.find((c) => c.key === "aid-cover");
  M.accept(s, c.id);
  M.launch(s, c.id);
  const e = s.commandExercise,
    regular = e.world.actors.filter(
      (a) => a.side === "red" && a.deployment.group === 0,
    ),
    rebel = e.world.actors.find((a) => a.faction === "insurgent");
  e.world.actors = [...regular, rebel];
  for (const u of e.world.units) u.waitingForDeployment = true;
  e.time = 200;
  s.clock.elapsedSeconds = 200;
  for (const [i, a] of e.world.actors.entries()) {
    Object.assign(a, { x: 1080, y: 775 - i * 5, heading: Math.PI });
    Object.assign(a.deployment, {
      releaseAt: 200,
      destination: { x: 950, y: 775 - i * 5 },
    });
  }
  const before = e.world.actors.map((a) => ({ x: a.x, y: a.y }));
  B.actorTick(s, e);
  assert.ok(G.distance(regular[0], before[0]) > 0);
  assert.equal(G.distance(regular[1], before[1]), 0);
  assert.ok(G.distance(rebel, before[2]) > 0);
  assert.equal(B.snapshot(regular[0]).activity, "moving");
  assert.equal(regular[1].state, "covering");
  const copy = C.clone(s);
  C.validate(copy);
  e.time = 219;
  s.clock.elapsedSeconds = 219;
  const prev = regular.map((a) => ({ x: a.x, y: a.y }));
  B.actorTick(s, e);
  assert.equal(G.distance(regular[0], prev[0]), 0);
  assert.ok(G.distance(regular[1], prev[1]) > 0);
});
