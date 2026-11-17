const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  Store = require("../overwatch/storage");
class Memory {
  constructor() {
    this.data = new Map();
    this.limit = Infinity;
    this.blockPrevious = false;
  }
  getItem(k) {
    return this.data.get(k) ?? null;
  }
  setItem(k, v) {
    if (this.blockPrevious && k === Store.KEYS.previous) throw Error("quota");
    const next = new Map(this.data);
    next.set(k, String(v));
    if ([...next.values()].reduce((n, v) => n + v.length, 0) > this.limit)
      throw Error("The quota has been exceeded.");
    this.data = next;
  }
  removeItem(k) {
    this.data.delete(k);
  }
}
function make() {
  const memory = new Memory(),
    store = Store.create({ storage: memory });
  let s = store.save(C.createCampaign({ id: "SAVE-RECOVERY" }), null);
  return { memory, store, s };
}
test("older automatic checkpoint is distinct from mirrored latest save and restores without losing the replaced campaign", () => {
  const { store, s } = make();
  P.hire(s, s.market.candidates[0].id, 30);
  const paid = store.save(s, s.revision);
  assert.equal(store.load().state.members.length, 1);
  assert.equal(
    store.parseImport(store.raw(Store.KEYS.backup)).members.length,
    1,
  );
  assert.equal(
    store.parseImport(store.raw(Store.KEYS.previous)).members.length,
    0,
  );
  assert.ok(store.status().previous);
  const restored = store.recoverPrevious();
  assert.equal(restored.members.length, 0);
  assert.ok(restored.revision > paid.revision);
  const archive = store.parseImport(store.raw(Store.KEYS.beforeImport));
  assert.equal(archive.members.length, 1);
  assert.equal(archive.headquarters.funds, paid.headquarters.funds);
  assert.throws(() => store.save(paid, paid.revision), /다른 탭/);
  C.validate(restored);
});
test("checkpoint storage pressure does not turn a successfully saved primary and backup into a false save failure", () => {
  const { memory, store, s } = make();
  memory.blockPrevious = true;
  P.hire(s, s.market.candidates[0].id, 30);
  const saved = store.save(s, s.revision);
  assert.deepEqual(store.load().state, saved);
  assert.deepEqual(store.parseImport(store.raw(Store.KEYS.backup)), saved);
  assert.match(store.status().recoveryWarning, /현재 진행 저장은 완료/);
});
test("a full storage retries after lossless compression of owned recovery archives, preserving legacy values and archived exact originals", () => {
  const { memory, store, s } = make();
  const archived = C.clone(s);
  archived.records = Array.from({ length: 400 }, (_, i) => ({
    id: "real-" + i,
    time: 0,
    type: "hq-established",
    message: ("구역 관측 및 이동 기록 " + i + " ").repeat(20),
  }));
  C.validate(archived);
  const original = JSON.stringify(archived);
  const envelope = JSON.stringify({
    game: "BLACKLINE_OVERWATCH_RECOVERY",
    primary: original,
    backup: original,
  });
  memory.setItem(Store.KEYS.beforeReset, envelope);
  memory.setItem(Store.KEYS.legacy, "original PMC data");
  memory.limit =
    [...memory.data.values()].reduce((n, v) => n + v.length, 0) + 20;
  P.hire(s, s.market.candidates[0].id, 30);
  const saved = store.save(s, s.revision);
  assert.equal(store.load().state.members.length, 1);
  assert.equal(memory.getItem(Store.KEYS.legacy), "original PMC data");
  assert.ok(store.raw(Store.KEYS.beforeReset).startsWith("OWG1:"));
  assert.deepEqual(
    store.parseImport(store.raw(Store.KEYS.beforeReset)),
    archived,
  );
  assert.ok(saved.revision > s.revision);
});
test("compressed portable backups round-trip actual funds, personnel, history and Unicode through normal file import", () => {
  const { store, s } = make();
  P.hire(s, s.market.candidates[0].id, 30);
  const packed = store.exportSave(s, { compressed: true });
  assert.ok(packed.startsWith("OWG1:"));
  assert.deepEqual(store.parseImport(packed), s);
  const imported = store.importSave(packed);
  assert.equal(imported.headquarters.funds, s.headquarters.funds);
  assert.deepEqual(imported.members, s.members);
  C.validate(imported);
});
test("automatic recovery point advances by actual game progress rather than every UI save", () => {
  const { store, s } = make();
  let next = store.save(s, s.revision);
  const first = store.raw(Store.KEYS.previous);
  next = store.save(next, next.revision);
  assert.equal(store.raw(Store.KEYS.previous), first);
  P.elapse(next, 310);
  next = store.save(next, next.revision);
  next = store.save(next, next.revision);
  assert.equal(
    store.parseImport(store.raw(Store.KEYS.previous)).clock.elapsedSeconds,
    310,
  );
});

test("new HQ clears prior personnel, activities, deployment and every owned recovery slot while leaving unrelated browser data intact", () => {
  const { memory, store, s } = make();
  P.hire(s, s.market.candidates[0].id, 30);
  let current = store.save(s, s.revision);
  memory.setItem(Store.KEYS.beforeImport, store.exportSave(current));
  memory.setItem(Store.KEYS.beforeMissionMigration, "old migration bytes");
  memory.setItem(Store.KEYS.legacy, "old other game");
  memory.setItem("unrelated_game", "unrelated");
  const fresh = C.createCampaign({ id: "BRAND-NEW-HQ" }),
    funds = fresh.headquarters.funds,
    next = store.reset(fresh);
  assert.equal(next.campaignId, "BRAND-NEW-HQ");
  assert.equal(next.headquarters.funds, funds);
  assert.deepEqual(next.members, []);
  assert.deepEqual(next.squads, []);
  assert.deepEqual(next.activities, []);
  assert.equal(next.activeMission, null);
  assert.equal(next.commandExercise, null);
  assert.equal(next.clock.elapsedSeconds, 0);
  assert.deepEqual(next.operations.reports, []);
  for (const [name, key] of Object.entries(Store.KEYS))
    if (!["primary", "backup"].includes(name) && !name.startsWith("legacy"))
      assert.equal(store.raw(key), null, name);
  assert.equal(memory.getItem(Store.KEYS.legacy), "old other game");
  assert.equal(memory.getItem("unrelated_game"), "unrelated");
  current = store.save(next, next.revision);
  assert.equal(
    store.parseImport(store.raw(Store.KEYS.previous)).campaignId,
    "BRAND-NEW-HQ",
  );
  C.validate(current);
});

test("quota on the mirrored save releases only the optional checkpoint and keeps both current copies", () => {
  const { memory, store, s } = make();
  const before = store.raw(Store.KEYS.primary);
  memory.setItem(Store.KEYS.previous, before);
  memory.setItem(Store.KEYS.legacy, "untouched");
  memory.limit = before.length * 2 + 100 + "untouched".length;
  s.settings.reducedMotion = true;
  const saved = store.save(s, s.revision);
  assert.equal(saved.settings.reducedMotion, true);
  assert.deepEqual(store.load().state, saved);
  assert.deepEqual(store.parseImport(store.raw(Store.KEYS.backup)), saved);
  assert.equal(store.raw(Store.KEYS.previous), null);
  assert.equal(memory.getItem(Store.KEYS.legacy), "untouched");
  assert.match(store.status().recoveryWarning, /현재 진행 저장은 완료/);
});

test("when only one copy fits an atomic current save survives and the next save can restore the mirror", () => {
  const { memory, store, s } = make();
  const before = store.raw(Store.KEYS.primary);
  memory.limit = before.length * 2 + 100;
  const content = require("node:crypto")
    .randomBytes(Math.ceil(before.length / 2))
    .toString("hex");
  for (let i = 0; i < content.length; i += 500)
    s.records.push({
      id: "larger-real-record-" + i,
      time: 0,
      type: "hq-established",
      message: content.slice(i, i + 500),
    });
  const saved = store.save(s, s.revision);
  assert.deepEqual(store.load().state, saved);
  assert.equal(store.raw(Store.KEYS.backup), null);
  assert.match(store.status().recoveryWarning, /자동 백업 사본은 생략/);
  memory.limit = Infinity;
  const again = store.save(saved, saved.revision);
  assert.deepEqual(store.parseImport(store.raw(Store.KEYS.backup)), again);
});

test("a rejected primary write restores removed checkpoint and backup instead of losing the last good save", () => {
  const { memory, store, s } = make();
  const before = store.raw(Store.KEYS.primary);
  memory.setItem(Store.KEYS.previous, before);
  const set = memory.setItem.bind(memory);
  memory.setItem = (key, value) => {
    if (key === Store.KEYS.primary && value !== before) {
      const error = Error("quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    set(key, value);
  };
  s.settings.reducedMotion = true;
  assert.throws(() => store.save(s, s.revision), /이전 저장을 복원/);
  for (const key of [
    Store.KEYS.primary,
    Store.KEYS.backup,
    Store.KEYS.previous,
  ])
    assert.equal(store.raw(key), before);
});
