const test = require("node:test"),
  assert = require("node:assert/strict");
const C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  M = require("../overwatch/missions"),
  G = require("../overwatch/geometry"),
  S = require("../overwatch/storage");
function make(key = "ridge-watch", pairs = 1) {
  const s = C.createCampaign({ id: "LIVE" });
  for (let i = 0; i < pairs; i++) {
    const a = P.hire(
        s,
        s.market.candidates.find((c) => c.specialty === "observer").id,
        30,
      ),
      b = P.hire(
        s,
        s.market.candidates.find((c) => c.specialty === "sniper").id,
        30,
      );
    P.assign(s, C.CALLSIGNS[i], a.id, b.id);
  }
  const c = s.contracts.find((c) => c.key === key);
  M.accept(s, c.id);
  return { s, c };
}
function advance(s, n) {
  for (let i = 0; i < n && s.commandExercise.status === "running"; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
    C.validate(s);
  }
}
function launch(key = "ridge-watch", pairs = 1) {
  const { s, c } = make(key, pairs);
  M.launch(s, c.id);
  C.validate(s);
  return s;
}
test("schema 4 migration archives exact saves and never resets money, personnel, display or old training", () => {
  const s = C.createCampaign({ schemaVersion: 4, id: "OLD4" }),
    map = new Map(),
    mem = {
      getItem: (k) => map.get(k) || null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    },
    st = S.create({ storage: mem });
  st.save(s, null);
  const raw = st.raw(S.KEYS.primary),
    up = st.migrate();
  assert.equal(up.schemaVersion, 5);
  assert.equal(up.headquarters.funds, s.headquarters.funds);
  assert.deepEqual(up.fieldPreferences, s.fieldPreferences);
  assert.equal(JSON.parse(st.raw(S.KEYS.beforeMissionMigration)).primary, raw);
  assert.equal(up.contracts.length, 5);
  assert.equal(st.migrate().contracts.length, 5);
});
test("contracts enforce single operation, minimum crew, readiness and real escrow without double launch", () => {
  const { s, c } = make("rescue-cover");
  assert.match(M.ready(s, c), /4~6/);
  assert.throws(() => M.launch(s, c.id));
  assert.equal(s.activeMission, null);
  const x = make();
  const before = x.s.headquarters.funds,
    cost = M.reserveFor(x.s).total;
  M.launch(x.s, x.c.id);
  assert.equal(x.s.headquarters.funds, before - cost);
  assert.throws(() => M.launch(x.s, x.c.id));
  assert.throws(() =>
    M.accept(x.s, x.s.contracts.find((c) => c.status === "offered").id),
  );
  C.validate(x.s);
});
for (const key of ["ridge-watch", "aid-cover", "vip-cover", "quiet-watch"])
  test(
    key + " physically inserts and returns before exactly-once failure debrief",
    () => {
      const s = launch(key),
        e = s.commandExercise,
        m = e.mission;
      assert.equal(s.operations.reports.length, 0);
      advance(s, 150);
      for (let i = 0; i < 300 && m.fieldStartedAt === null; i++) advance(s, 1);
      assert.ok(m.fieldStartedAt !== null);
      if (m.contract.transport !== "foot")
        assert.ok(m.log.some((x) => x.type === "transport-disembarked"));
      M.requestReturn(s, { abort: true });
      assert.equal(s.operations.reports.length, 0);
      advance(s, 800);
      assert.equal(e.status, "ended");
      assert.equal(s.activeMission, null);
      assert.equal(s.operations.reports.length, 1);
      const r = s.operations.reports[0];
      assert.equal(r.reward, 0);
      assert.equal(r.refund + r.consumed, r.escrow);
      assert.ok(r.roster.every((x) => x.disposition === "returned"));
      const cash = s.headquarters.funds;
      M.settle(s, e);
      assert.equal(s.headquarters.funds, cash);
      assert.equal(s.operations.reports.length, 1);
      const c = s.contracts.find((c) => c.status === "offered");
      M.accept(s, c.id);
      assert.match(M.ready(s, c), /점검/);
      M.inspection(s);
      assert.equal(s.operations.inspection.completed, true);
      C.validate(s);
    },
  );
test("in-flight save resumes identically, has no offline advancement and exposes only reported support", () => {
  const s = launch("aid-cover");
  advance(s, 12);
  const restored = C.clone(s);
  C.validate(restored);
  advance(s, 18);
  advance(restored, 18);
  assert.deepEqual(restored, s);
  const f = D.frame(s);
  assert.ok(f.transports.length);
  assert.ok(!f.contacts.some((c) => c.id === "opposition-3"));
  assert.ok(!f.supportActors.some((a) => a.id === "agency-guide"));
});
test("no phantom casualty support, contract limits and physical drone preparation", () => {
  const s = launch(),
    e = s.commandExercise;
  advance(s, 130);
  assert.throws(() => M.requestSupport(s, "medical"));
  assert.throws(() => M.requestSupport(s, "supply"));
  const count = e.mission.transports.length;
  M.requestSupport(s, "drone");
  const t = e.mission.transports.at(-1);
  assert.equal(t.state, "dispatch");
  assert.equal(e.mission.transports.length, count + 1);
  assert.equal(t.x, G.MAP.base.x);
  advance(s, 10);
  assert.equal(t.state, "dispatch");
  assert.throws(() => M.requestSupport(s, "drone"));
  advance(s, 25);
  assert.ok(["flying", "takeoff", "on-station"].includes(t.state));
  C.validate(s);
});

test("rescue requires actual link and escorted arrival, then physical extraction pays once", () => {
  const s = launch("rescue-cover", 2),
    e = s.commandExercise;
  for (const u of e.world.actors.filter((a) => a.side === "red"))
    u.health.conscious = false;
  for (let i = 0; i < 800 && !e.mission.objective; i++) advance(s, 1);
  assert.equal(e.mission.taskLinked, true);
  assert.equal(e.mission.objective, true);
  assert.equal(s.operations.reports.length, 0);
  M.requestReturn(s);
  advance(s, 800);
  assert.equal(e.status, "ended");
  const r = s.operations.reports[0];
  assert.equal(r.success, true);
  assert.equal(r.reward, e.mission.contract.reward);
  assert.ok(r.events.some((x) => x.type === "protected-linked"));
  assert.ok(r.roster.every((x) => x.disposition === "returned"));
  C.validate(s);
});
test("medical transport waits, physically treats and returns a real casualty; permanent injury survives debrief", () => {
  const s = launch("aid-cover"),
    e = s.commandExercise;
  for (const u of e.world.actors.filter((a) => a.side === "red"))
    u.health.conscious = false;
  advance(s, 100);
  const u = e.world.units[0];
  B.injure(s, e, u, {
    eventId: "medical-fixture",
    part: "leftLeg",
    severity: 3,
  });
  advance(s, 12);
  M.requestSupport(s, "medical");
  const t = e.mission.transports.at(-1);
  assert.equal(t.state, "dispatch");
  advance(s, 50);
  assert.equal(t.state, "dispatch");
  assert.equal(e.mission.home.includes(u.id), false);
  advance(s, 350);
  assert.equal(e.mission.home.includes(u.id), true);
  assert.ok(e.mission.log.some((x) => x.type === "medical-boarded"));
  M.requestReturn(s, { abort: true });
  advance(s, 500);
  assert.equal(e.status, "ended");
  const p = s.members.find((p) => p.id === u.id);
  assert.ok(p.injuries.some((w) => w.part === "leftLeg" && !w.healed));
  assert.match(P.readiness(s, p), /치료/);
  C.validate(s);
});

test("total confirmed deaths are permanent losses and never count as successful return or payment", () => {
  const s = launch("aid-cover"),
    e = s.commandExercise;
  advance(s, 80);
  for (const u of e.world.units)
    B.injure(s, e, u, { eventId: "fatal-" + u.id, part: "head", severity: 3 });
  advance(s, 10);
  M.requestReturn(s, { abort: true });
  advance(s, 60);
  M.requestSupport(s, "medical");
  advance(s, 500);
  assert.equal(e.status, "ended");
  assert.equal(s.members.length, 0);
  assert.equal(
    s.archive.members.filter((m) => m.status === "deceased").length,
    2,
  );
  const r = s.operations.reports[0];
  assert.equal(r.returnComplete, false);
  assert.equal(r.reward, 0);
  C.validate(s);
});
test("unrecovered personnel are archived as missing without invented death or reward", () => {
  const s = launch("ridge-watch"),
    e = s.commandExercise;
  advance(s, 100);
  M.requestReturn(s, { abort: true });
  M.declareMissing(s);
  assert.equal(s.members.length, 0);
  assert.ok(s.archive.members.every((m) => m.status === "missing"));
  assert.equal(s.operations.reports[0].reward, 0);
  assert.equal(s.operations.reports[0].missing.length, 2);
  C.validate(s);
});
test("mission validator rejects broken operation links, invalid transport state and duplicate boarding", () => {
  const s = launch("aid-cover");
  for (const edit of [
    (v) => (v.activeMission.contractId = "missing"),
    (v) => (v.commandExercise.mission.transports[0].state = "teleported"),
    (v) =>
      v.commandExercise.mission.memberIds.push(
        v.commandExercise.mission.memberIds[0],
      ),
  ]) {
    const other = C.clone(s);
    edit(other);
    assert.throws(() => C.validate(other));
  }
});

test("unsafe landing holds the medical helicopter until the crew can observe a safe site", () => {
  const s = launch("aid-cover"),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  advance(s, 80);
  B.injure(s, e, e.world.units[0], {
    eventId: "landing-test",
    part: "leftLeg",
    severity: 2,
  });
  advance(s, 8);
  M.requestSupport(s, "medical");
  const t = e.mission.transports.at(-1),
    red = e.world.actors.find((a) => a.side === "red");
  red.health.conscious = true;
  Object.assign(
    red,
    G.project({ x: t.supportTarget.x + 15, y: t.supportTarget.y }),
  );
  red.route = [{ x: red.x, y: red.y }];
  red.waypoint = 0;
  for (const w of [red.weapon, red.sidearm]) {
    w.loaded = 0;
    w.magazines = [];
    w.initial = w.spent;
  }
  // Isolate landing safety from an escort neutralizing the deliberately placed threat.
  for (const actor of [
    ...e.world.units,
    ...e.world.actors.filter((a) => a.side === "ally"),
  ])
    for (const w of [actor.weapon, actor.sidearm]) {
      w.loaded = 0;
      w.magazines = [];
      w.initial = w.spent;
    }
  advance(s, 130);
  assert.equal(t.state, "air-hold");
  assert.equal(t.manifest.length, 0);
  assert.equal(t.crew, null);
  red.health.conscious = false;
  advance(s, 60);
  assert.notEqual(t.state, "air-hold");
  C.validate(s);
});

test("observer cover uses delivered agency escort positions and chooses a real accessible position", () => {
  const s = launch("aid-cover"),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  advance(s, 70);
  D.issue(s, "ALPHA", "cover");
  advance(s, 20);
  const q = e.squads[0];
  assert.ok(q.tactical.protectedPoint);
  assert.equal(G.blocked(q.tactical.position), false);
  assert.ok(e.events.some((ev) => ev.type === "tactical-position-selected"));
  C.validate(s);
});

test("a vehicle already driving to insertion turns back on abort without inventing field experience", () => {
  const s = launch(),
    e = s.commandExercise,
    t = e.mission.transports[0],
    before = s.members.map((m) => m.proficiency.primary);
  for (
    let i = 0;
    i < 80 && !(t.state === "driving" && G.distance(t, G.MAP.base) > 15);
    i++
  )
    advance(s, 1);
  assert.equal(e.mission.fieldStartedAt, null);
  assert.equal(t.state, "driving");
  M.requestReturn(s, { abort: true });
  assert.equal(e.mission.phase, "returning");
  assert.deepEqual(t.target, G.MAP.base);
  advance(s, 150);
  assert.equal(e.status, "ended");
  assert.equal(s.operations.reports[0].reward, 0);
  assert.deepEqual(
    s.members.map((m) => m.proficiency.primary),
    before,
  );
  C.validate(s);
});

for (const key of ["ridge-watch", "aid-cover"])
  test(
    key +
      " returned transport leaves the battlefield projection while its actual saved state and report remain",
    () => {
      const s = launch(key),
        e = s.commandExercise;
      advance(s, 5);
      const count = e.mission.transports.length;
      M.requestReturn(s, { abort: true });
      advance(s, 500);
      assert.equal(e.status, "ended");
      assert.equal(e.mission.transports[0].state, "home");
      assert.equal(e.mission.transports.length, count);
      assert.ok(!D.frame(s).transports.some((t) => t.id === "primary"));
      assert.equal(s.operations.reports.length, 1);
      C.validate(s);
    },
  );

test("personnel waiting to board at HQ cannot be attacked or shown as deployed battlefield troops", () => {
  const s = launch("aid-cover", 2),
    e = s.commandExercise;
  advance(s, 15);
  for (const u of e.world.units.filter((u) => u.waitingForDeployment)) {
    assert.equal(u.health.wounds.length, 0);
    assert.equal(B.snapshot(u).waitingForDeployment, true);
  }
  assert.ok(e.world.units.some((u) => u.waitingForDeployment));
  assert.ok(!D.frame(s).supportActors.some((a) => a.id === "agency-protected"));
  C.validate(s);
});

test("a UAV physically returns home after its station time and never restarts departure on every tick", () => {
  const s = launch("ridge-watch"),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  advance(s, 100);
  M.requestSupport(s, "drone");
  const t = e.mission.transports.at(-1);
  advance(s, 400);
  assert.equal(t.state, "home");
  assert.equal(t.altitude, 0);
  const departures = e.mission.log.filter(
    (ev) => ev.type === "transport-departed" && ev.transportId === t.id,
  ).length;
  advance(s, 40);
  assert.equal(
    e.mission.log.filter(
      (ev) => ev.type === "transport-departed" && ev.transportId === t.id,
    ).length,
    departures,
  );
  assert.ok(!D.frame(s).transports.some((x) => x.id === t.id));
  assert.equal(e.mission.supports.drone, 1);
  C.validate(s);
});

test("agency assault/rescue personnel use infantry roles and allied sprites rather than observer identities", () => {
  const s = launch("rescue-cover", 2),
    e = s.commandExercise;
  assert.ok(e.world.actors.filter((a) => a.side === "red").length >= 8);
  assert.ok(
    e.world.actors.filter((a) => a.side === "ally" && a.armed).length >= 4,
  );
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  advance(s, 120);
  const support = D.frame(s).supportActors.filter(
    (a) => a.role !== "medic" && a.armed,
  );
  assert.ok(support.length >= 4);
  assert.ok(support.every((a) => a.role === "infantry"));
  const sprites = require("../overwatch/sprites");
  assert.ok(support.every((a) => sprites.select(a).role === "allied"));
  C.validate(s);
});
test("an extraction vehicle cannot take a casualty already carried by an actual medical transport crew", () => {
  const s = launch("aid-cover"),
    e = s.commandExercise,
    m = e.mission;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  advance(s, 100);
  const u = e.world.units[0];
  B.injure(s, e, u, {
    eventId: "contested-casualty",
    part: "leftLeg",
    severity: 3,
  });
  advance(s, 8);
  M.requestSupport(s, "medical");
  const medical = m.transports.at(-1),
    primary = m.transports[0];
  const p = G.project({ x: u.x, y: u.y });
  Object.assign(primary, {
    ...p,
    state: "loading",
    trip: "extraction",
    manifest: [],
    boarding: { id: u.id, until: e.time - 1 },
    crew: null,
  });
  m.returnRequested = true;
  m.recoveryVersion = 2;
  Object.assign(medical, {
    ...p,
    state: "medical-work",
    altitude: 0,
    manifest: [],
    crew: {
      id: medical.id + "-medic",
      name: "기관 의무요원",
      ...p,
      state: "carrying",
      targetId: u.id,
      patientId: u.id,
      path: [],
      dueAt: null,
    },
  });
  u.carriedBy = medical.crew.id;
  u.boardedBy = null;
  u.path = [];
  M.beforeTick(s, e);
  assert.equal(u.boardedBy, medical.id);
  assert.equal(primary.manifest.includes(u.id), false);
  assert.equal(m.transports.filter((t) => t.manifest.includes(u.id)).length, 1);
  C.validate(s);
  // A legacy in-progress handoff must never overwrite a completed board in another vehicle.
  medical.crew.patientId = u.id;
  medical.crew.targetId = u.id;
  M.beforeTick(s, e);
  assert.equal(m.transports.filter((t) => t.manifest.includes(u.id)).length, 1);
  C.validate(s);
});

test("medical recovery reaches an actually injured rooftop member through stairs before boarding", () => {
  const s = launch("aid-cover"),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  advance(s, 160);
  const u = e.world.units[0],
    roof = G.roofs().find((r) => G.path(u, r.point).length);
  assert.ok(roof);
  u.path = G.path(u, roof.point);
  u.goal = { ...roof.point };
  for (let i = 0; i < 1500 && u.path.length; i++) {
    e.time++;
    s.clock.elapsedSeconds++;
    D.internals.moveUnit(e, u, 0.8);
    C.validate(s);
  }
  assert.ok(u.roofId);
  B.injure(s, e, u, {
    eventId: "rooftop-casualty",
    part: "leftLeg",
    severity: 3,
  });
  advance(s, 12);
  M.requestSupport(s, "medical");
  advance(s, 1800);
  assert.equal(e.mission.home.includes(u.id), true);
  assert.equal(u.roofId, undefined);
  assert.ok(
    e.mission.log.some(
      (ev) => ev.type === "medical-boarded" && ev.memberId === u.id,
    ),
  );
  C.validate(s);
});

test("expanded forces can all be actually observed without exceeding the former twelve-contact save limit", () => {
  const s = launch("rescue-cover", 2),
    e = s.commandExercise;
  for (const a of e.world.actors.filter((a) => a.side === "red"))
    a.health.conscious = false;
  advance(s, 120);
  for (let i = 0; i < 4; i++) {
    const a = C.clone(e.world.actors.find((a) => a.side === "red"));
    a.id = "reserve-test-" + i;
    e.world.actors.push(a);
  }
  const origin = { ...G.MAP.base },
    seen = G.project({ x: origin.x + 3, y: origin.y });
  for (const a of e.world.actors) a.health.conscious = false;
  for (const u of e.world.units)
    Object.assign(u, { ...origin, path: [], goal: null });
  for (const q of e.squads) D.issue(s, q.callsign, "observe", seen);
  advance(s, 25);
  for (const a of e.world.actors) {
    const saved = { x: a.x, y: a.y },
      p = { ...seen };
    Object.assign(a, p, { path: [], goal: null, route: [p], waypoint: 0 });
    advance(s, 8);
    Object.assign(a, saved, { route: [saved] });
  }
  assert.ok(e.squads.some((q) => q.contacts.length > 12));
  C.validate(s);
});
