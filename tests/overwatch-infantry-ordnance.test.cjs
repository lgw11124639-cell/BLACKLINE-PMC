const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  B = require("../overwatch/battle"),
  D = require("../overwatch/command"),
  M = require("../overwatch/missions"),
  I = require("../overwatch/infantry"),
  O = require("../overwatch/ordnance"),
  S = require("../overwatch/command-staff"),
  G = require("../overwatch/geometry");
function make(key = "high-value-target", deploy = true) {
  const s = C.createCampaign({ id: "INFANTRY-ORDNANCE" });
  S.upgrade(s);
  const h = (r) =>
    P.hire(s, s.market.candidates.find((m) => m.specialty === r).id, 30);
  for (let i = 0; i < (key === "rescue-cover" ? 2 : 1); i++)
    P.assign(s, C.CALLSIGNS[i], h("observer").id, h("sniper").id);
  const chief = S.hire(
    s,
    s.commandStaff.market.find((m) => m.duty === "controller").id,
  );
  S.assign(s, "controller", chief.id);
  S.delegate(s, false);
  I.initialize(s);
  for (const c of s.infantry.market) I.hire(s, c.id);
  s.infantry.deploy = deploy;
  const c = s.contracts.find((c) => c.key === key);
  M.accept(s, c.id);
  M.launch(s, c.id);
  const e = s.commandExercise;
  for (const u of e.world.actors.filter((u) => u.side === "red"))
    u.health.conscious = false;
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      B.setPaused(s, false);
      D.step(s, 1);
    }
  };
  step(120);
  for (let i = 0; i < 500 && e.mission.fieldStartedAt == null; i++) step(1);
  return { s, e, step };
}
test("headquarters owns a separate paid 4-role roster, with conserved grenades and an independent agency sniper pair", () => {
  const { s, e } = make();
  assert.equal(s.members.length, 2);
  assert.equal(s.infantry.members.length, 4);
  assert.equal(I.units(e).length, 4);
  assert.equal(e.world.actors.filter((u) => u.agencySniperRole).length, 2);
  assert.equal(s.infantry.stock.smoke, 4);
  assert.equal(s.infantry.stock.frag, 8);
  assert.equal(
    I.units(e).find((u) => u.assignmentRole === "gunner").weapon.model,
    "M249",
  );
  C.validate(C.clone(s));
});
test("a deselected infantry squad stays at headquarters and consumes neither grenades nor deployment funds", () => {
  const { s, e } = make("high-value-target", false);
  assert.equal(I.units(e).length, 0);
  assert.equal(s.infantry.stock.smoke, 8);
  assert.ok(s.infantry.members.every((m) => m.status === "standby"));
  C.validate(s);
});
test("HQ infantry obeys a separately delivered command without changing the independent agency command", () => {
  const { s, e, step } = make();
  const old = e.mission.agencyDirective?.mode;
  I.command(s, "hold");
  const packet = e.radio.findLast((r) => r.payload?.infantryDirective);
  assert.equal(packet.status, "queued");
  step(5);
  assert.equal(e.mission.hqInfantry.directive.mode, "hold");
  assert.equal(e.mission.hqInfantry.directive.source, "headquarters");
  assert.equal(e.mission.agencyDirective?.mode, old);
  const u = I.units(e)[0],
    p = { x: u.x, y: u.y };
  step(40);
  assert.ok(G.distance(u, p) < 35);
  I.command(s, "advance", { x: 600, y: 775 });
  step(5);
  assert.equal(e.mission.hqInfantry.directive.mode, "advance");
  C.validate(C.clone(s));
  const forged = C.clone(s);
  forged.commandExercise.mission.hqInfantry.directive.source = "controller";
  assert.throws(() => C.validate(forged), /수신/);
});
test("smoke consumes a saved grenade, blooms after its fuse, blocks sight but never blocks walking, and expires", () => {
  const { s, e, step } = make();
  const u = I.units(e)[0];
  Object.assign(u, { x: 100, y: 775, path: [], waitingForDeployment: false });
  O.throwGrenade(s, e, u, "smoke", { x: 120, y: 775 });
  assert.equal(u.grenades.smoke, 0);
  assert.equal(e.battle.ordnance.smokes.length, 0);
  step(2);
  assert.equal(e.battle.ordnance.smokes.length, 1);
  assert.equal(G.clear({ x: 100, y: 775 }, { x: 145, y: 775 }), true);
  assert.equal(G.visible({ x: 100, y: 775 }, { x: 145, y: 775 }, e), false);
  C.validate(C.clone(s));
  step(46);
  assert.equal(e.battle.ordnance.smokes.length, 0);
  assert.equal(G.visible({ x: 100, y: 775 }, { x: 145, y: 775 }, e), true);
});
test("fragmentation requires an observed threat, rejects allies/civilians nearby, and inflicts actual distance-limited injury after a fuse", () => {
  const { s, e, step } = make();
  const u = I.units(e)[0];
  Object.assign(u, { x: 100, y: 775, path: [], waitingForDeployment: false });
  for (const a of [
    ...I.units(e).slice(1),
    ...e.world.actors.filter((a) => a.side === "ally" && !a.hqMemberId),
  ])
    Object.assign(a, { x: 700, y: 775, path: [] });
  const target = e.world.actors.find((a) => a.side === "red");
  Object.assign(target, { x: 125, y: 775, path: [], health: B.health() });
  target.health.conscious = false;
  assert.throws(
    () => O.throwGrenade(s, e, u, "frag", { x: 125, y: 775 }),
    /식별/,
  );
  u.memory = [
    {
      id: target.id,
      x: 125,
      y: 775,
      firstSeen: e.time,
      lastSeen: e.time,
      confidence: 0.9,
    },
  ];
  const civilian = e.world.actors.find((a) => a.side === "ally" && !a.armed);
  if (civilian) {
    Object.assign(civilian, { x: 125, y: 778 });
    assert.throws(
      () => O.throwGrenade(s, e, u, "frag", { x: 125, y: 775 }),
      /아군|민간인/,
    );
    civilian.x = 700;
  }
  O.throwGrenade(s, e, u, "frag", { x: 125, y: 775 });
  assert.equal(u.grenades.frag, 1);
  assert.equal(target.health.wounds.length, 0);
  step(3);
  assert.ok(target.health.wounds.some((w) => w.type === "파편상"));
  assert.equal(
    u.grenades.initial.frag,
    u.grenades.frag + u.grenades.spent.frag,
  );
  C.validate(C.clone(s));
});
test("near-miss trajectories accumulate suppression, narrow observation and recover with time without fabricating wounds", () => {
  const { s, e, step } = make();
  const u = e.world.units[0];
  Object.assign(u, { x: 150, y: 775, path: [] });
  for (let i = 0; i < 5; i++)
    O.pressure(e, {
      side: "red",
      model: "M249",
      from: { x: 100, y: 772 },
      to: { x: 200, y: 772 },
    });
  assert.ok(u.suppression > 80);
  assert.ok(O.factor(u) < 0.6);
  assert.equal(u.health.wounds.length, 0);
  const copy = C.clone(s);
  C.validate(copy);
  step(60);
  assert.ok(u.suppression < 10);
});
test("agency annihilation alone never requests headquarters withdrawal and a surviving HQ soldier can take over rescue", () => {
  const { s, e, step } = make("rescue-cover");
  for (const a of e.world.actors.filter(
    (a) => a.side === "ally" && !a.hqMemberId && a.armed,
  )) {
    a.health.alive = false;
    a.health.conscious = false;
  }
  step(10);
  assert.equal(e.mission.returnRequested, false);
  assert.ok(I.units(e).some((u) => u.id === e.mission.taskLeaderId));
  assert.notEqual(e.mission.knowledge.objective, "failed");
  C.validate(s);
});

test("an escort target stays behind its leader and stops while the leader is under fire", () => {
  const { s, e } = make("vip-cover");
  const guide = e.world.actors.find((a) => a.id === e.mission.taskLeaderId),
    vip = e.world.actors.find((a) => a.id === "agency-protected");
  Object.assign(guide, {
    x: 400,
    y: 775,
    path: [],
    health: B.health(),
    state: "escorting",
    lastThreatAt: -1000,
  });
  Object.assign(vip, {
    x: 415,
    y: 775,
    path: [],
    health: B.health(),
    lastThreatAt: -1000,
    carriedBy: null,
  });
  e.mission.taskGoal = { x: 900, y: 775 };
  e.mission.agencyControl.waypoint = { x: 600, y: 775 };
  for (let i = 0; i < 30; i++) {
    e.time++;
    s.clock.elapsedSeconds++;
    e.mission.agencyControl.authorized = true;
    e.mission.agencyControl.lastAssessment = e.time;
    M.actorTaskTick(s, e, vip);
  }
  assert.ok(
    vip.x < guide.x,
    JSON.stringify({
      vip: {
        x: vip.x,
        y: vip.y,
        state: vip.state,
        path: vip.path,
        waiting: vip.waitingForDeployment,
      },
      guide: { x: guide.x, state: guide.state },
      phase: e.mission.phase,
      field: e.mission.fieldStartedAt,
    }),
  );
  const before = { x: vip.x, y: vip.y };
  guide.lastThreatAt = e.time;
  M.actorTaskTick(s, e, vip);
  assert.equal(vip.path.length, 0);
  assert.equal(vip.state, "protected-hold");
  assert.deepEqual({ x: vip.x, y: vip.y }, before);
  C.validate(s);
});
test("paid squad training finishes on HQ time and survives save validation without changing the sniper roster", () => {
  const s = C.createCampaign({ id: "INFANTRY-TRAINING" });
  I.initialize(s);
  for (const c of s.infantry.market) I.hire(s, c.id);
  const before = s.infantry.members.map((m) => m.skills.teamwork),
    funds = s.headquarters.funds;
  I.train(s);
  assert.equal(s.headquarters.funds, funds - 100000);
  assert.ok(s.infantry.members.every((m) => m.status === "training"));
  assert.match(I.readiness(s), /훈련/);
  P.elapse(s, 14400);
  assert.ok(
    s.infantry.members.every(
      (m, i) => m.status === "standby" && m.skills.teamwork > before[i],
    ),
  );
  assert.equal(s.members.length, 0);
  C.validate(C.clone(s));
});
test("manual smoke orders wait for their own radio receipt and conserve inventory exactly once", () => {
  const { s, e, step } = make();
  I.command(s, "hold");
  step(5);
  for (const [i, u] of I.units(e).entries())
    Object.assign(u, {
      x: 100 + i * 4,
      y: 775,
      path: [],
      waitingForDeployment: false,
    });
  step(6);
  const reports = e.mission.knowledge.actors.filter((a) => a.hqMemberId);
  assert.ok(reports.length);
  const before = I.units(e).reduce((n, u) => n + u.grenades.smoke, 0);
  I.orderThrow(s, "smoke");
  assert.equal(
    I.units(e).reduce((n, u) => n + u.grenades.smoke, 0),
    before,
  );
  step(5);
  assert.equal(
    I.units(e).reduce((n, u) => n + u.grenades.smoke, 0),
    before - 1,
  );
  step(3);
  assert.ok(e.battle.ordnance.smokes.length);
  C.validate(C.clone(s));
});
test("postpaid operations launch at zero funds and physical return creates a single honest payable instead of a negative balance", () => {
  const s = C.createCampaign({ id: "ZERO-DEPOSIT" });
  const h = (r) =>
    P.hire(s, s.market.candidates.find((m) => m.specialty === r).id, 30);
  P.assign(s, "ALPHA", h("observer").id, h("sniper").id);
  S.upgrade(s);
  const chief = S.hire(
    s,
    s.commandStaff.market.find((m) => m.duty === "controller").id,
  );
  S.assign(s, "controller", chief.id);
  S.delegate(s, false);
  I.initialize(s);
  for (const c of s.infantry.market) I.hire(s, c.id);
  const c = s.contracts.find((c) => c.key === "high-value-target");
  M.accept(s, c.id);
  P.finance(s, -s.headquarters.funds, "test-zero-funds");
  assert.equal(M.ready(s, c), null);
  M.launch(s, c.id);
  assert.equal(s.headquarters.funds, 0);
  const e = s.commandExercise;
  for (const u of e.world.actors.filter((a) => a.side === "red"))
    u.health.conscious = false;
  M.requestReturn(s, { abort: true });
  for (let i = 0; i < 1800 && e.status === "running"; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
  }
  assert.equal(
    e.status,
    "ended",
    JSON.stringify({
      time: e.time,
      phase: e.mission.phase,
      transport: e.mission.hqInfantry.transport,
    }),
  );
  assert.equal(s.headquarters.funds, 0);
  assert.ok(s.operations.payable >= 120000);
  const due = s.operations.payable;
  M.settle(s, e);
  assert.equal(s.operations.payable, due);
  assert.equal(e.mission.hqInfantry.settled, true);
  assert.ok(s.infantry.members.every((m) => m.status === "standby"));
  assert.equal(s.infantry.stock.smoke, 8);
  assert.equal(s.infantry.stock.frag, 16);
  C.validate(C.clone(s));
});
test("a legacy active deposit is released once on resume while preserving costs for postpaid settlement", () => {
  const { s, e, step } = make();
  const reserve = e.mission.budget.total;
  e.mission.postpaid = false;
  e.mission.escrow = reserve;
  P.finance(s, -reserve, "legacy-deposit-fixture");
  const before = s.headquarters.funds;
  C.validate(s);
  step(1);
  assert.equal(s.headquarters.funds, before + reserve);
  assert.equal(e.mission.escrow, 0);
  assert.equal(e.mission.postpaid, true);
  step(1);
  assert.equal(s.headquarters.funds, before + reserve);
  C.validate(C.clone(s));
});

for (const key of ["high-value-target", "vip-cover", "rescue-cover"])
  test(
    "delegated own infantry " +
      key +
      " completes with physical own transport recovery and one postpaid settlement",
    () => {
      const { s, e, step } = make(key);
      if (key === "rescue-cover")
        for (const u of e.world.actors.filter(
          (u) => u.side === "ally" && u.armed && !u.hqMemberId,
        )) {
          B.injure(s, e, u, {
            eventId: "agency-loss-" + u.id,
            part: "head",
            severity: 3,
          });
        }
      if (key === "high-value-target")
        for (const u of e.world.actors.filter((u) => u.missionTargetCode))
          u.health = B.health();
      S.delegate(s, true);
      for (let i = 0; i < 9000 && e.status === "running"; i++) {
        for (const u of e.world.actors.filter((u) => u.side === "red"))
          u.weapon.nextFireAt = e.time + 20;
        step(1);
        if (i % 100 === 0) C.validate(s);
      }
      assert.equal(
        e.status,
        "ended",
        JSON.stringify({
          key,
          time: e.time,
          phase: e.mission.phase,
          objective: e.mission.knowledge.objective,
          transport: e.mission.hqInfantry.transport,
        }),
      );
      assert.equal(e.mission.knowledge.objective, "complete");
      assert.equal(s.operations.reports.length, 1);
      assert.equal(s.operations.reports[0].postpaid, true);
      assert.equal(e.mission.hqInfantry.transport.state, "home");
      assert.ok(
        s.infantry.members.every((m) => m.status === "standby"),
        JSON.stringify(s.infantry.members.map((m) => [m.name, m.status])),
      );
      const cash = s.headquarters.funds;
      M.settle(s, e);
      assert.equal(s.headquarters.funds, cash);
      C.validate(C.clone(s));
    },
  );

test("support gunner braces and spends a real round against recent last-seen coordinates through smoke without tracking hidden movement", () => {
  const { s, e } = make();
  const u = I.units(e).find((u) => u.assignmentRole === "gunner"),
    target = e.world.actors.find((a) => a.side === "red");
  Object.assign(u, {
    x: 100,
    y: 775,
    path: [],
    goal: null,
    waitingForDeployment: false,
    agencyCoverGoal: null,
    agencyFireGoal: null,
  });
  Object.assign(target, { x: 130, y: 775, health: B.health() });
  target.health.conscious = false;
  u.memory = [
    {
      id: target.id,
      x: 130,
      y: 775,
      confidence: 0.9,
      firstSeen: e.time - 10,
      lastSeen: e.time,
    },
  ];
  u.agencyReports = { [target.id]: { condition: "normal", at: e.time } };
  const o = O.state(e);
  o.smokes.push({
    id: "test-screen",
    x: 115,
    y: 775,
    radius: 10,
    startsAt: e.time,
    expiresAt: e.time + 45,
  });
  Object.assign(u.weapon, {
    targetId: target.id,
    aimSince: e.time - 10,
    aimAnchor: { x: 130, y: 775 },
    aimOrigin: { x: 100, y: 775 },
    aimAnchorAt: e.time - 1,
    nextFireAt: e.time,
  });
  const before = u.weapon.spent;
  M.actorTaskTick(s, e, u);
  assert.equal(u.state, "suppressing");
  assert.equal(u.path.length, 0);
  assert.equal(u.weapon.spent, before + 1);
  assert.equal(e.battle.shots.at(-1).to.y, 775);
  C.validate(C.clone(s));
});

test("HQ infantry waits at staging until the first actual commander order is received", () => {
  const { s, e, step } = make();
  const unit = I.units(e)[0],
    start = { x: unit.x, y: unit.y };
  step(15);
  assert.ok(G.distance(unit, start) < 0.1);
  I.command(s, "advance", { x: 600, y: 775 });
  step(3);
  assert.ok(G.distance(unit, start) < 0.1);
  step(12);
  assert.equal(e.mission.hqInfantry.directive.mode, "advance");
  assert.ok(G.distance(unit, start) > 2);
  C.validate(C.clone(s));
});
