const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core.js"),
  P = require("../overwatch/personnel.js"),
  S = require("../overwatch/storage.js"),
  codec = require("../save-codec.js");
const make = () =>
    C.createCampaign({ id: "PERSONNEL", at: "2026-11-14T00:00:00.000Z" }),
  clone = C.clone;
const recruit = (s, role = "observer", days = 30) =>
  P.hire(s, s.market.candidates.find((c) => c.specialty === role).id, days);
const check = (s) => C.validate(s);
function duo() {
  const s = make(),
    o = recruit(s, "observer"),
    n = recruit(s, "sniper");
  P.assign(s, "ALPHA", o.id, n.id);
  return { s, o, n };
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
test("new phase-two HQ has balanced one-time capital and twelve uncontracted qualified candidates", () => {
  const s = make();
  check(s);
  assert.equal(s.schemaVersion, 2);
  assert.equal(s.headquarters.funds, 100000000);
  assert.equal(s.members.length, 0);
  assert.equal(s.market.candidates.length, 12);
  assert.throws(() => P.initialize(s));
  assert.equal(C.upgrade(s).headquarters.funds, 100000000);
  assert.equal(C.upgrade(s).headquarters.ledger.length, 1);
  assert.deepEqual(
    new Set(s.market.candidates.map((c) => c.career.tier)),
    new Set(["rookie", "experienced", "veteran", "specialist"]),
  );
});
test("phase-one upgrade preserves identities, settings, histories and saved pairings without truncating legacy PMC", () => {
  const s = C.createCampaign({
    id: "V1",
    schemaVersion: 1,
    at: "2026-11-14T00:00:00.000Z",
  });
  s.settings.reducedMotion = true;
  const original = JSON.stringify(s),
    upgraded = C.upgrade(s);
  assert.equal(JSON.stringify(s), original);
  assert.equal(upgraded.campaignId, s.campaignId);
  assert.equal(upgraded.settings.reducedMotion, true);
  assert.equal(upgraded.records[0].id, s.records[0].id);
  check(upgraded);
});
test("recruiting charges exact prepaid wages once and removes the candidate", () => {
  const s = make(),
    c = clone(s.market.candidates[0]),
    before = s.headquarters.funds,
    m = P.hire(s, c.id, 30);
  assert.equal(before - s.headquarters.funds, c.dailySalary * 30);
  assert.equal(m.contract.endsAt, 30 * P.DAY);
  assert.equal(m.contract.paidAmount, c.dailySalary * 30);
  assert.ok(!s.market.candidates.some((x) => x.id === m.id));
  const after = JSON.stringify(s);
  assert.throws(() => P.hire(s, c.id, 30));
  assert.equal(JSON.stringify(s), after);
  check(s);
});
test("ten active members, insufficient funds and invalid terms cannot be bypassed", () => {
  const s = make();
  for (let i = 0; i < 10; i++) P.hire(s, s.market.candidates[0].id, 30);
  const before = JSON.stringify(s);
  assert.throws(() => P.hire(s, s.market.candidates[0].id, 30));
  assert.equal(JSON.stringify(s), before);
  const empty = make();
  empty.headquarters.funds = 1;
  assert.throws(() => P.hire(empty, empty.market.candidates[0].id, 30));
  assert.throws(() => P.hire(make(), "missing", 7));
});
test("three legal observer/sniper pairs use six unique people; role, duplicate and injured assignments fail", () => {
  const s = make();
  for (const q of C.CALLSIGNS) {
    const o = recruit(s, "observer"),
      n = recruit(s, "sniper");
    P.assign(s, q, o.id, n.id);
  }
  check(s);
  assert.equal(
    new Set(s.squads.flatMap((q) => [q.observerId, q.sniperId])).size,
    6,
  );
  const q = s.squads[0];
  assert.throws(() => P.assign(s, "BRAVO", q.observerId, q.sniperId));
  assert.throws(() => P.assign(s, "ALPHA", q.sniperId, q.observerId));
  assert.throws(() => P.assign(s, "DELTA", q.observerId, q.sniperId));
});
test("individual activities require explicit pair release and apply only after actual elapsed activity time", () => {
  const { s, o } = duo();
  assert.throws(() =>
    P.start(s, {
      kind: "training",
      memberIds: [o.id],
      course: "observation",
      hours: 4,
    }),
  );
  P.clearSquad(s, "ALPHA");
  const skill = o.skills.observation,
    before = s.headquarters.funds,
    a = P.start(s, {
      kind: "training",
      memberIds: [o.id],
      course: "observation",
      hours: 4,
    });
  assert.equal(o.skills.observation, skill);
  assert.equal(before - s.headquarters.funds, 100000);
  P.advance(s);
  assert.equal(s.clock.elapsedSeconds, 4 * P.HOUR);
  assert.ok(o.skills.observation > skill);
  assert.equal(a.workedSeconds, 4 * P.HOUR);
  assert.equal(a.status, "completed");
  assert.equal(o.status, "standby");
  check(s);
});
test("simultaneous activities advance together and resume saved absolute deadlines without repeated fees or rewards", () => {
  const s = make(),
    o = recruit(s, "observer"),
    n = recruit(s, "sniper");
  n.fatigue = 60;
  n.stress = 40;
  const a = P.start(s, {
      kind: "training",
      memberIds: [o.id],
      course: "shooting",
      hours: 4,
    }),
    b = P.start(s, { kind: "rest", memberIds: [n.id], hours: 6 }),
    cash = s.headquarters.funds;
  P.advance(s);
  assert.equal(n.fatigue, 48);
  assert.equal(b.workedSeconds, 4 * P.HOUR);
  const loaded = JSON.parse(JSON.stringify(s));
  check(loaded);
  P.advance(loaded);
  assert.equal(loaded.clock.elapsedSeconds, 6 * P.HOUR);
  assert.equal(loaded.members.find((m) => m.id === n.id).fatigue, 42);
  assert.equal(loaded.headquarters.funds, cash);
  assert.equal(
    loaded.records.filter(
      (e) => e.type === "activity-completed" && e.activityId === a.id,
    ).length,
    1,
  );
  assert.throws(() => P.advance(loaded));
  check(loaded);
});
test("pair training retains the pair and improves only the actual two-person relationship", () => {
  const { s, o, n } = duo(),
    before = P.relationship(s, s.squads[0]).cohesion;
  const a = P.start(s, {
    kind: "pair",
    callsign: "ALPHA",
    memberIds: [o.id, n.id],
  });
  assert.throws(() => P.clearSquad(s, "ALPHA"));
  assert.throws(() =>
    P.start(s, { kind: "rest", memberIds: [o.id], hours: 2 }),
  );
  check(s);
  P.advance(s);
  assert.equal(P.relationship(s, s.squads[0]).cohesion, before + 5);
  assert.equal(s.relationships[0].hours, 4);
  assert.equal(a.status, "completed");
  check(s);
});
test("secondary training grants a qualification at the curriculum threshold and never exceeds two specialties", () => {
  const s = make(),
    m = recruit(s, "observer");
  assert.equal(m.secondarySpecialties.length, 0);
  for (let i = 0; i < 2; i++) {
    P.start(s, {
      kind: "training",
      memberIds: [m.id],
      course: "firstAid",
      hours: 4,
    });
    P.advance(s);
  }
  assert.deepEqual(m.secondarySpecialties, ["firstAid"]);
  for (let i = 0; i < 2; i++) {
    P.start(s, {
      kind: "training",
      memberIds: [m.id],
      course: "communications",
      hours: 4,
    });
    P.advance(s);
  }
  assert.equal(m.secondarySpecialties.length, 2);
  assert.throws(() =>
    P.start(s, {
      kind: "training",
      memberIds: [m.id],
      course: "drone",
      hours: 4,
    }),
  );
  check(s);
});
test("fatigue/stress reduce effective skills and prevent new training or deployment pairing when severe", () => {
  const s = make(),
    m = recruit(s, "observer"),
    n = recruit(s, "sniper"),
    normal = P.effectiveSkills(m).observation;
  m.fatigue = 90;
  m.stress = 85;
  assert.ok(P.effectiveSkills(m).observation < normal);
  assert.throws(() => P.assign(s, "ALPHA", m.id, n.id));
  assert.throws(() =>
    P.start(s, {
      kind: "training",
      memberIds: [m.id],
      course: "shooting",
      hours: 4,
    }),
  );
  P.start(s, { kind: "rest", memberIds: [m.id], hours: 12 });
  P.advance(s);
  assert.equal(m.fatigue, 54);
  assert.equal(P.readiness(s, m), null);
  check(s);
});
test("real injury intake is idempotent, clears pairing, keeps anatomical history and blocks movement readiness until treatment", () => {
  const { s, o } = duo(),
    e = {
      id: "shot-real",
      missionId: "M-1",
      memberId: o.id,
      kind: "injury",
      part: "leftLeg",
      severity: 3,
      injuryType: "총상",
    };
  assert.equal(P.casualty(s, e), true);
  assert.equal(P.casualty(s, e), false);
  assert.equal(s.squads.length, 0);
  assert.equal(o.injuries.length, 1);
  assert.equal(P.readiness(s, o), "치료·복귀 평가 필요");
  P.start(s, { kind: "treatment", memberIds: [o.id] });
  assert.equal(o.injuries[0].healed, false);
  P.advance(s);
  assert.equal(o.injuries[0].healed, true);
  assert.equal(o.injuries[0].part, "leftLeg");
  assert.ok(o.aftereffects.some((e) => e.skill === "fitness"));
  const skill = P.effectiveSkills(o).fitness;
  P.start(s, { kind: "rehab", memberIds: [o.id] });
  P.advance(s);
  assert.equal(o.aftereffects.length, 0);
  assert.ok(P.effectiveSkills(o).fitness > skill);
  assert.equal(o.injuries.length, 1);
  check(s);
});
test("one explosion can affect multiple members while repeating each subject event cannot duplicate wounds", () => {
  const { s, o, n } = duo(),
    e = {
      id: "impact-1",
      missionId: "M-1",
      kind: "injury",
      part: "unknown",
      severity: 1,
      injuryType: "충격 손상",
    };
  assert.equal(P.casualty(s, { ...e, memberId: o.id }), true);
  assert.equal(P.casualty(s, { ...e, memberId: n.id }), true);
  s.records = s.records.filter((r) => r.type !== "injury");
  assert.equal(P.casualty(s, { ...e, memberId: o.id }), false);
  assert.equal(o.injuries.length, 1);
  check(s);
});
test("death is permanent, frees capacity, preserves contracts/history, and can never become a new hire", () => {
  const { s, o } = duo();
  const e = { id: "fatal-1", missionId: "M-1", memberId: o.id, kind: "death" };
  P.casualty(s, e);
  assert.ok(!s.members.some((m) => m.id === o.id));
  assert.equal(s.archive.members[0].status, "deceased");
  assert.equal(s.squads.length, 0);
  assert.equal(P.casualty(s, e), false);
  s.market.candidates.push({ ...o, status: "candidate" });
  assert.throws(() => P.hire(s, o.id, 30));
  s.market.candidates = s.market.candidates.filter((m) => m.id !== o.id);
  check(s);
});
test("contract renewal charges only the extension and expiry during another member activity archives exactly once", () => {
  const s = make(),
    o = recruit(s, "observer"),
    n = recruit(s, "sniper", 90),
    before = s.headquarters.funds;
  P.renew(s, o.id, 30);
  assert.equal(o.contract.endsAt, 60 * P.DAY);
  assert.equal(before - s.headquarters.funds, o.dailySalary * 30);
  s.clock.elapsedSeconds = o.contract.endsAt - P.HOUR;
  P.start(s, { kind: "rest", memberIds: [n.id], hours: 2 });
  P.advance(s);
  assert.equal(
    s.archive.members.find((m) => m.id === o.id).exitReason,
    "expiry",
  );
  assert.equal(
    s.records.filter(
      (e) => e.type === "contract-expired" && e.memberId === o.id,
    ).length,
    1,
  );
  check(s);
});
test("early release has no invented refund and valid retirement keeps a separate permanent record", () => {
  const s = make(),
    m = recruit(s, "observer"),
    before = s.headquarters.funds;
  assert.throws(() => P.release(s, m.id, "retirement"));
  P.release(s, m.id);
  assert.equal(s.headquarters.funds, before);
  assert.equal(s.archive.members[0].status, "resigned");
  const n = recruit(s, "sniper");
  n.birthDate = "1970-01-01";
  n.age = P.age(s, n);
  P.release(s, n.id, "retirement");
  assert.equal(s.archive.members[1].status, "retired");
  check(s);
});
test("market refresh uses activity time, has a real fee, and never recycles contracted or archived identities", () => {
  const s = make(),
    m = recruit(s, "observer"),
    original = new Set(s.market.candidates.map((m) => m.id));
  assert.throws(() => P.refreshMarket(s));
  P.start(s, { kind: "rest", memberIds: [m.id], hours: 12 });
  P.advance(s);
  const before = s.headquarters.funds;
  P.refreshMarket(s);
  assert.equal(before - s.headquarters.funds, 50000);
  assert.ok(
    s.market.candidates.every((c) => c.id !== m.id && !original.has(c.id)),
  );
  check(s);
});
test("activity cancellation records actual progress without granting completion, healing or cost refunds", () => {
  const s = make(),
    m = recruit(s, "observer"),
    n = recruit(s, "sniper");
  const a = P.start(s, {
      kind: "training",
      memberIds: [m.id],
      course: "shooting",
      hours: 8,
    }),
    skill = m.skills.shooting;
  P.start(s, { kind: "rest", memberIds: [n.id], hours: 2 });
  P.advance(s);
  const cash = s.headquarters.funds;
  P.cancel(s, a.id);
  assert.equal(a.workedSeconds, 2 * P.HOUR);
  assert.equal(m.skills.shooting, skill);
  assert.equal(s.headquarters.funds, cash);
  assert.ok(m.fatigue > 0);
  check(s);
});
test("phase-two validator catches forged finances, orphan activities, duplicate people and expired assignments", () => {
  for (const mutate of [
    (s) => s.headquarters.funds++,
    (s) => s.members.push(clone(s.members[0])),
    (s) => (s.members[0].activityId = "missing"),
    (s) => (s.members[0].contract.endsAt = 0),
    (s) => (s.records[0].time = 99999),
  ]) {
    const s = make();
    recruit(s, "observer");
    mutate(s);
    assert.throws(() => check(s));
  }
});
test("storage migrates once with byte-exact phase-one originals and persists new activities and every ledger entry", () => {
  const memory = new Memory(),
    store = S.create({
      storage: memory,
      codec,
      clock: () => "2026-11-14T00:00:00.000Z",
    }),
    s = C.createCampaign({
      id: "OLD",
      schemaVersion: 1,
      at: "2026-11-14T00:00:00.000Z",
    });
  store.save(s, null);
  const before = store.raw(S.KEYS.primary),
    next = store.migrate();
  assert.equal(next.schemaVersion, 2);
  assert.equal(JSON.parse(store.raw(S.KEYS.beforeMigration)).primary, before);
  const money = next.headquarters.funds;
  assert.equal(store.migrate().headquarters.funds, money);
  const m = recruit(next, "observer");
  P.start(next, { kind: "rest", memberIds: [m.id], hours: 6 });
  const saved = store.save(next, next.revision),
    restored = store.load().state;
  assert.deepEqual(restored, saved);
  P.advance(restored);
  check(restored);
  assert.equal(restored.clock.elapsedSeconds, 6 * P.HOUR);
});
test("migration failure rolls back the old schema and grants no duplicate funds on retry", () => {
  const memory = new Memory(),
    store = S.create({
      storage: memory,
      codec,
      clock: () => "2026-11-14T00:00:00.000Z",
    });
  store.save(
    C.createCampaign({
      id: "OLD",
      schemaVersion: 1,
      at: "2026-11-14T00:00:00.000Z",
    }),
    null,
  );
  const before = store.raw(S.KEYS.primary);
  memory.fail = S.KEYS.backup;
  assert.throws(() => store.migrate());
  assert.equal(store.raw(S.KEYS.primary), before);
  assert.equal(store.load().state.schemaVersion, 1);
  assert.equal(store.migrate().headquarters.funds, 100000000);
  assert.equal(store.migrate().headquarters.funds, 100000000);
});

test("populated V1 migration keeps individual histories, safe pairs and unknown wounds while reserving old identifiers", () => {
  const s = C.createCampaign({
    id: "POPULATED",
    schemaVersion: 1,
    at: "2026-11-14T00:00:00.000Z",
  });
  const person = (id, specialty, status = "standby") => ({
    id,
    name: id,
    age: 31,
    specialty,
    secondarySpecialties: ["firstAid"],
    status,
    skills: Object.fromEntries(P.SKILLS.map((k) => [k, 70])),
    experience: 120,
    fatigue: 10,
    stress: 5,
    injuries: [],
    history: [{ message: "승계할 실제 이전 기록" }],
  });
  s.members = [
    person("candidate-3", "observer"),
    person("old-sniper", "sniper"),
    person("old-injured", "observer", "treatment"),
    person("old-fallen", "sniper", "deceased"),
  ];
  s.members[2].injuries = [
    { description: "원래 부위 정보가 없던 부상", grade: 3 },
  ];
  s.squads = [
    { callsign: "ALPHA", observerId: "candidate-3", sniperId: "old-sniper" },
  ];
  s.records[0].id = "event-2";
  C.validate(s);
  const up = C.upgrade(s);
  check(up);
  assert.deepEqual(up.squads, s.squads);
  assert.equal(up.members[0].id, "candidate-3");
  assert.deepEqual(up.members[0].history, s.members[0].history);
  assert.equal(up.members[2].injuries[0].part, "unknown");
  assert.equal(
    up.members[2].injuries[0].description,
    "원래 부위 정보가 없던 부상",
  );
  assert.equal(up.members[2].status, "medical");
  assert.equal(up.archive.members[0].id, "old-fallen");
  assert.ok(!up.market.candidates.some((m) => m.id === "candidate-3"));
  assert.equal(new Set(up.records.map((r) => r.id)).size, up.records.length);
  const m = up.members[2];
  P.start(up, { kind: "treatment", memberIds: [m.id] });
  P.advance(up);
  assert.equal(m.injuries[0].healed, true);
  assert.equal(m.aftereffects.length, 0);
  check(up);
});
