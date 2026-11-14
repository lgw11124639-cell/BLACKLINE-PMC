const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core.js"),
  P = require("../overwatch/personnel.js"),
  D = require("../overwatch/command.js"),
  G = require("../overwatch/geometry.js"),
  S = require("../overwatch/storage.js");
function make(pairs = 1) {
  const s = C.createCampaign({ id: "COMMAND", at: "2026-11-14T00:00:00.000Z" });
  for (let i = 0; i < pairs; i++) {
    const o = P.hire(
        s,
        s.market.candidates.find((m) => m.specialty === "observer").id,
        30,
      ),
      n = P.hire(
        s,
        s.market.candidates.find((m) => m.specialty === "sniper").id,
        30,
      );
    P.assign(s, C.CALLSIGNS[i], o.id, n.id);
  }
  D.begin(s);
  return s;
}
function advance(s, seconds) {
  while (seconds > 0) {
    if (s.commandExercise.paused) D.resume(s);
    const n = Math.min(120, seconds),
      actual = D.step(s, n);
    seconds -= actual;
    if (!actual) break;
  }
  C.validate(s);
}
const own = (s) => s.commandExercise.world.units[0],
  pair = (s) => s.commandExercise.squads[0];
function teleportPair(s, p) {
  const e = s.commandExercise;
  for (let i = 0; i < e.world.units.length; i++) {
    Object.assign(e.world.units[i], {
      x: p.x + i * 18,
      y: p.y,
      path: [],
      goal: null,
    });
  }
}
class Memory {
  constructor() {
    this.m = new Map();
    this.fail = null;
  }
  getItem(k) {
    return this.m.get(k) ?? null;
  }
  setItem(k, v) {
    if (this.fail === k) {
      this.fail = null;
      throw Error("quota");
    }
    this.m.set(k, v);
  }
  removeItem(k) {
    this.m.delete(k);
  }
}
test("schema 2 upgrades without another grant and preserves raw source on migration failure/retry", () => {
  const old = C.createCampaign({ id: "OLD", schemaVersion: 2 }),
    cash = old.headquarters.funds,
    mem = new Memory(),
    store = S.create({ storage: mem });
  store.save(old, null);
  const raw = store.raw(S.KEYS.primary);
  mem.fail = S.KEYS.backup;
  assert.throws(() => store.migrate());
  assert.equal(store.raw(S.KEYS.primary), raw);
  const s = store.migrate();
  assert.equal(s.schemaVersion, 3);
  assert.equal(s.commandExercise, null);
  assert.equal(s.headquarters.funds, cash);
  assert.equal(
    JSON.parse(store.raw(S.KEYS.beforeCommandMigration)).primary,
    raw,
  );
  assert.equal(
    s.headquarters.ledger.filter((e) => e.kind === "startup-grant").length,
    1,
  );
});
test("range requires an actual ready pair and never invents deployed personnel, money or injury", () => {
  const empty = C.createCampaign({ id: "EMPTY" });
  assert.throws(() => D.begin(empty));
  const s = make(3),
    e = s.commandExercise;
  assert.equal(e.world.units.length, 6);
  assert.equal(new Set(e.world.units.map((u) => u.id)).size, 6);
  assert.equal(D.frame(s).friends.length, 0);
  assert.equal(D.frame(s).contacts.length, 0);
  assert.ok(s.members.every((m) => m.injuries.length === 0));
  assert.throws(() => D.begin(s));
  assert.throws(() => P.hire(s, s.market.candidates[0].id, 30));
  C.validate(s);
});
test("order reception, observer decision, internal instruction, movement and completion are separate causal events", () => {
  const s = make(),
    e = s.commandExercise,
    c = D.issue(s, "ALPHA", "move", { x: 220, y: 200 }),
    initial = G.distance(own(s), c.target);
  assert.equal(c.status, "queued");
  D.step(s, 1);
  assert.equal(c.status, "queued");
  assert.equal(own(s).x, 80);
  advance(s, 30);
  assert.ok(c.receivedAt > c.issuedAt);
  assert.ok(
    e.events.some(
      (a) => a.type === "observer-decision" && a.commandId === c.id,
    ),
  );
  assert.ok(
    e.radio.some((r) => r.route === "local" && r.kind === "instruction"),
  );
  assert.ok(G.distance(own(s), c.target) < initial);
  assert.notEqual(c.status, "completed");
  advance(s, 650);
  assert.equal(c.status, "completed");
  assert.equal(D.frame(s).commands[0].status, "completed");
  assert.ok(G.distance(...e.world.units) > 8);
  assert.ok(e.world.units.every((u) => G.distance(u, u.goal) < 1));
});
test("buildings block LOS and grid routes never cut corners through their footprints", () => {
  const a = { x: 420, y: 300 },
    b = { x: 640, y: 300 };
  assert.equal(G.clear(a, b), false);
  const route = G.path(a, b);
  assert.ok(route.length > 2);
  let previous = a;
  for (const p of route) {
    assert.equal(G.blocked(p), false);
    assert.ok(G.clear(previous, p, true));
    previous = p;
  }
  assert.deepEqual(G.path(a, { x: 500, y: 300 }), []);
});
test("hidden actor changes do not change the HQ projection or observed contacts at insertion", () => {
  const s = make(),
    other = C.clone(s);
  other.commandExercise.world.actors[0].x = 1150;
  other.commandExercise.world.actors[0].y = 780;
  assert.deepEqual(D.frame(other), D.frame(s));
  advance(s, 60);
  assert.equal(D.frame(s).contacts.length, 0);
  assert.equal(
    s.commandExercise.radio.filter((r) => r.kind === "observation").length,
    0,
  );
  assert.ok(!JSON.stringify(D.frame(s)).includes("waypoint"));
});
test("observations require actual range, cone and LOS; identification grows before reporting certainty", () => {
  const s = make();
  D.issue(s, "ALPHA", "move", { x: 220, y: 200 });
  advance(s, 600);
  const e = s.commandExercise,
    seen = D.frame(s).contacts;
  assert.ok(seen.length > 0);
  assert.equal(seen[0].classification, "training-target");
  assert.ok(
    e.radio.some((r) => r.kind === "observation" && r.body.includes("미확인")),
  );
  for (const r of e.radio.filter((r) => r.kind === "observation"))
    assert.ok(
      e.events.some((a) => a.id === r.eventId && a.type === "contact-observed"),
    );
  assert.ok(
    seen.every((c) => c.observedAt <= e.time && c.receivedAt >= c.observedAt),
  );
});
test("radio shadow queues commands and reports; silent local actions cannot update HQ positions or completion status", () => {
  const s = make();
  advance(s, 10);
  const known = C.clone(D.frame(s).friends);
  teleportPair(s, { x: 550, y: 550 });
  const c = D.issue(s, "ALPHA", "observe", { x: 900, y: 180 });
  advance(s, 60);
  assert.equal(c.status, "queued");
  assert.deepEqual(
    D.frame(s).friends.map((f) => [f.id, f.x, f.y]),
    known.map((f) => [f.id, f.x, f.y]),
  );
  assert.ok(D.frame(s).friends.every((f) => f.stale));
  assert.equal(D.frame(s).commands[0].status, "queued");
  teleportPair(s, { x: 300, y: 550 });
  advance(s, 30);
  assert.equal(c.status, "completed");
  assert.equal(D.frame(s).commands[0].status, "completed");
  assert.ok(D.frame(s).radio.some((r) => r.delay > 40));
});
test("a locally completed order is still awaiting HQ confirmation until its actual report arrives", () => {
  const s = make(),
    c = D.issue(s, "ALPHA", "hold");
  while (c.status !== "completed") D.step(s, 1);
  assert.notEqual(D.frame(s).commands[0].status, "completed");
  teleportPair(s, { x: 550, y: 550 });
  advance(s, 30);
  assert.notEqual(D.frame(s).commands[0].status, "completed");
  teleportPair(s, { x: 300, y: 550 });
  advance(s, 10);
  assert.equal(D.frame(s).commands[0].status, "completed");
});
test("stale contacts lose confidence and expire without consulting the targets current position", () => {
  const s = make();
  D.issue(s, "ALPHA", "move", { x: 220, y: 200 });
  advance(s, 600);
  const observed = D.frame(s).contacts[0];
  assert.ok(observed);
  D.issue(s, "ALPHA", "observe", { x: 20, y: 700 });
  advance(s, 260);
  const old = D.frame(s).contacts.find((c) => c.id === observed.id);
  assert.ok(old.expired);
  assert.ok(old.confidence < observed.confidence);
  assert.equal(old.current, false);
  const other = C.clone(s);
  other.commandExercise.world.actors[0].x = 1170;
  assert.deepEqual(D.frame(other).contacts, D.frame(s).contacts);
});
test("save and resume preserves queued radio, AI timing, paths and every subsequent deterministic decision", () => {
  const a = make();
  D.issue(a, "ALPHA", "move", { x: 220, y: 200 });
  advance(a, 53);
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 5; i++) {
    advance(a, 120);
    advance(b, 120);
  }
  assert.deepEqual(b, a);
  const before = JSON.stringify(a);
  D.frame(a);
  D.frame(a);
  assert.equal(JSON.stringify(a), before);
});
test("observer skill/experience/personality affects real decision deadlines and communication training reduces latency", () => {
  const slow = make(),
    fast = C.clone(slow),
    sm = slow.members[0],
    fm = fast.members[0];
  sm.personality = "cautious";
  sm.career.years = 1;
  sm.skills.judgment = 40;
  fm.personality = "seasoned";
  fm.career.years = 15;
  fm.skills.judgment = 95;
  fm.secondarySpecialties = ["communications"];
  const a = D.issue(slow, "ALPHA", "hold"),
    b = D.issue(fast, "ALPHA", "hold");
  advance(slow, 30);
  advance(fast, 30);
  assert.ok(b.receivedAt < a.receivedAt);
  const da = slow.commandExercise.events.find(
      (x) => x.type === "order-received",
    ),
    db = fast.commandExercise.events.find((x) => x.type === "order-received");
  assert.ok(db.thinkAt - db.time < da.thinkAt - da.time);
});
test("sniper takes over only after an actual incapacity event; urgent report auto-pauses only on HQ receipt", () => {
  const s = make(),
    e = s.commandExercise,
    q = pair(s);
  advance(s, 10);
  const input = {
    id: "actual-drill-adjudication",
    memberId: q.observerId,
    reason: "훈련 통제관의 모의 행동 불능 판정",
  };
  assert.equal(D.incapacitate(s, input), true);
  assert.equal(D.incapacitate(s, input), false);
  D.step(s, 1);
  assert.equal(q.leaderId, q.sniperId);
  assert.equal(e.paused, false);
  let progressed = D.step(s, 30);
  assert.ok(progressed < 30 && e.paused);
  assert.throws(() => D.step(s, 1));
  D.resume(s);
  D.issue(s, "ALPHA", "move", { x: 220, y: 200 });
  advance(s, 120);
  assert.ok(
    e.world.units.find((u) => u.id === q.observerId).state === "incapacitated",
  );
  assert.ok(e.world.units.find((u) => u.id === q.sniperId).y < 700);
  C.validate(s);
});
test("a failed observer inside radio shadow cannot magically alert or pause HQ", () => {
  const s = make(),
    q = pair(s);
  advance(s, 10);
  teleportPair(s, { x: 550, y: 550 });
  D.incapacitate(s, {
    id: "shadow-incident",
    memberId: q.observerId,
    reason: "통제관 판정",
  });
  D.step(s, 30);
  assert.equal(q.leaderId, q.sniperId);
  assert.equal(s.commandExercise.paused, false);
  assert.ok(!D.frame(s).radio.some((r) => r.kind === "urgent"));
  teleportPair(s, { x: 300, y: 550 });
  D.step(s, 30);
  assert.equal(s.commandExercise.paused, true);
});
test("new commands supersede older orders only when actually received; internal messages cannot revive old movement", () => {
  const s = make(),
    e = s.commandExercise,
    a = D.issue(s, "ALPHA", "move", { x: 220, y: 200 });
  advance(s, 60);
  teleportPair(s, { x: 550, y: 550 });
  const b = D.issue(s, "ALPHA", "hold");
  D.step(s, 1);
  assert.equal(a.status, "executing");
  teleportPair(s, { x: 300, y: 550 });
  advance(s, 30);
  assert.equal(a.status, "superseded");
  assert.equal(b.status, "completed");
  assert.ok(e.world.units.every((u) => u.path.length === 0));
});
test("rules of engagement are acknowledged but cannot fabricate shots, ammunition use or casualties in a command exercise", () => {
  const s = make(),
    cash = s.headquarters.funds;
  D.issue(s, "ALPHA", "roe", null, "authorized");
  advance(s, 60);
  assert.equal(D.frame(s).squads[0].roe, "authorized");
  assert.equal(s.headquarters.funds, cash);
  assert.ok(s.members.every((m) => m.injuries.length === 0));
  assert.ok(s.commandExercise.events.every((e) => e.type !== "shot"));
});
test("ending is idempotent, preserves the actual range report and permits HQ activities without paying mission rewards", () => {
  const s = make(),
    cash = s.headquarters.funds;
  D.issue(s, "ALPHA", "move", { x: 220, y: 200 });
  advance(s, 60);
  D.end(s);
  assert.throws(() => D.end(s));
  assert.equal(s.headquarters.funds, cash);
  assert.equal(
    s.records.filter((e) => e.type === "command-exercise-ended").length,
    1,
  );
  assert.ok(
    s.commandExercise.commands.every(
      (c) => !["queued", "executing", "thinking"].includes(c.status),
    ),
  );
  P.clearSquad(s, "ALPHA");
  P.start(s, { kind: "rest", memberIds: [s.members[0].id], hours: 2 });
  P.advance(s);
  C.validate(s);
});
test("idle non-deployed contracts expire according to actual range time", () => {
  const s = make();
  D.end(s);
  const c = P.hire(
    s,
    s.market.candidates.find((m) => m.specialty === "observer").id,
    30,
  );
  c.contract.endsAt = s.clock.elapsedSeconds + 40;
  D.begin(s);
  advance(s, 60);
  assert.ok(
    s.archive.members.some((m) => m.id === c.id && m.exitReason === "expiry"),
  );
  assert.equal(s.commandExercise.time, 60);
  assert.equal(s.clock.elapsedSeconds, 60);
  C.validate(s);
});
test("range does not advance or remove deployed personnel beyond a contract deadline", () => {
  const s = make();
  own(s);
  s.members[0].contract.endsAt = 20;
  D.step(s, 30);
  assert.equal(s.commandExercise.status, "ended");
  assert.equal(s.commandExercise.endReason, "contract");
  assert.ok(s.members.some((m) => m.id === own(s).id));
  assert.ok(s.clock.elapsedSeconds < 20);
  C.validate(s);
});
test("forged queues, unavailable actors, invented HQ knowledge and inconsistent clocks are rejected before load", () => {
  const source = make();
  D.issue(source, "ALPHA", "move", { x: 220, y: 200 });
  advance(source, 40);
  for (const change of [
    (s) => s.commandExercise.time++,
    (s) => (s.commandExercise.squads[0].leaderId = "missing"),
    (s) => (s.commandExercise.world.units[0].path = [{ x: NaN, y: 20 }]),
    (s) => (s.commandExercise.radio[0].payload.friends[0].id = "missing"),
    (s) => (s.commandExercise.commands[0].target = { x: 5000, y: 5 }),
    (s) =>
      (s.commandExercise.knowledge.contacts.fake = {
        id: "fake",
        x: 20,
        y: 20,
        observedAt: 0,
        receivedAt: 1,
        confidence: 1,
        uncertainty: 0,
        classification: "training-target",
      }),
  ]) {
    const s = C.clone(source);
    change(s);
    assert.throws(() => C.validate(s));
  }
});
test("atomic storage rollback includes both elapsed HQ time and command-range radio/AI state", () => {
  const mem = new Memory(),
    store = S.create({ storage: mem });
  let saved = store.save(make(), null);
  const before = store.raw(S.KEYS.primary),
    next = C.clone(saved);
  D.issue(next, "ALPHA", "move", { x: 220, y: 200 });
  D.step(next, 30);
  mem.fail = S.KEYS.backup;
  assert.throws(() => store.save(next, saved.revision));
  assert.equal(store.raw(S.KEYS.primary), before);
  assert.deepEqual(store.load().state, saved);
});

test("shared elapsed-time helper finishes concurrent HQ jobs at their own deadlines, even across a longer step", () => {
  const s = C.createCampaign({ id: "JOBS" }),
    a = P.hire(s, s.market.candidates[0].id, 30),
    b = P.hire(s, s.market.candidates[0].id, 30);
  P.start(s, {
    kind: "training",
    memberIds: [a.id],
    course: "observation",
    hours: 4,
  });
  P.start(s, { kind: "rest", memberIds: [b.id], hours: 6 });
  P.elapse(s, 6 * P.HOUR);
  assert.deepEqual(
    s.activities.map((a) => a.completedAt),
    [4 * P.HOUR, 6 * P.HOUR],
  );
  C.validate(s);
});

test("three pairs sent to one ridge reserve separate positions and bypass stationary teammates without deadlock", () => {
  const s = make(3);
  for (const q of C.CALLSIGNS) D.issue(s, q, "move", { x: 220, y: 200 });
  advance(s, 1200);
  assert.ok(s.commandExercise.commands.every((c) => c.status === "completed"));
  const units = s.commandExercise.world.units;
  for (let i = 0; i < units.length; i++)
    for (let j = i + 1; j < units.length; j++)
      assert.ok(G.distance(units[i], units[j]) >= 8);
});

test("downlink delivery is not leaked before the actual observer acknowledgement reaches HQ", () => {
  const s = make(),
    c = D.issue(s, "ALPHA", "hold");
  while (c.status === "queued") D.step(s, 1);
  const r = D.frame(s).radio.find((r) => r.kind === "order");
  assert.equal(r.deliveredAt, null);
  assert.equal(D.frame(s).commands[0].status, "queued");
  advance(s, 15);
  assert.notEqual(
    D.frame(s).radio.find((r) => r.kind === "order").deliveredAt,
    null,
  );
});

test("starting a new exercise never erases the previous received command/radio report", () => {
  const s = make();
  D.issue(s, "ALPHA", "report");
  advance(s, 40);
  D.end(s);
  const report = C.clone(s.commandArchive[0]);
  D.begin(s);
  assert.deepEqual(s.commandArchive[0], report);
  assert.ok(report.frame.radio.length > 0);
  assert.equal(report.frame.status, "ended");
  C.validate(s);
});
