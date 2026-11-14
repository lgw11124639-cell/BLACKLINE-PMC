/* Independent, validated saves. Legacy PMC keys are strictly read-only. */
(function (root) {
  "use strict";
  const Core =
    root.OverwatchCore ||
    (typeof require === "function" ? require("./core.js") : null);
  const KEYS = Object.freeze({
    primary: "blackline_overwatch_v1",
    backup: "blackline_overwatch_v1_backup",
    beforeImport: "blackline_overwatch_v1_before_import",
    beforeReset: "blackline_overwatch_v1_before_reset",
    beforeCommandMigration: "blackline_overwatch_v1_before_migration_v3",
    beforeMigration: "blackline_overwatch_v1_before_migration_v2",
    legacy: "blackline_pmc_v1",
    legacyBackup: "blackline_pmc_v1_backup",
  });
  function create({
    storage,
    codec = root.blacklineSaveCodec,
    clock = () => new Date().toISOString(),
  } = {}) {
    if (!storage) throw Error("브라우저 저장소를 사용할 수 없습니다.");
    const raw = (key) =>
      storage === root.localStorage && codec?.rawGet
        ? codec.rawGet(key)
        : storage.getItem(key);
    const decode = (value) => (codec?.unpack ? codec.unpack(value) : value);
    function parse(value) {
      if (value === null) return null;
      return Core.validate(JSON.parse(decode(value)));
    }
    function load() {
      let primary, backup;
      try {
        primary = raw(KEYS.primary);
        backup = raw(KEYS.backup);
      } catch (e) {
        return {
          state: null,
          source: "blocked",
          message: "저장소 접근이 차단되었습니다. " + e.message,
        };
      }
      if (primary === null && backup === null)
        return { state: null, source: "empty" };
      try {
        const state = parse(primary);
        if (state) return { state: Core.clone(state), source: "primary" };
      } catch (e) {}
      try {
        const state = parse(backup);
        if (state)
          return {
            state: Core.clone(state),
            source: "backup",
            message:
              "주 저장을 읽을 수 없어 백업을 열었습니다. 복구 전 원본은 유지됩니다.",
          };
      } catch (e) {}
      return {
        state: null,
        source: "blocked",
        message:
          "주 저장과 백업을 읽을 수 없습니다. 원본을 내려받거나 검증된 백업을 가져오세요. 자동 저장은 중단했습니다.",
      };
    }
    function transaction(rows) {
      const previous = new Map(rows.map(([key]) => [key, raw(key)])),
        written = [];
      try {
        for (const [key, value] of rows) {
          storage.setItem(key, value);
          written.push(key);
        }
      } catch (error) {
        let restored = true;
        for (const key of written.reverse())
          try {
            const value = previous.get(key);
            if (value === null) storage.removeItem(key);
            else storage.setItem(key, value);
          } catch (e) {
            restored = false;
          }
        throw Error(
          "저장하지 못했습니다. " +
            (restored
              ? "이전 저장을 복원했습니다."
              : "저장소가 복원을 거부했습니다. 남아 있는 주 저장·백업을 내려받으세요.") +
            " " +
            error.message,
        );
      }
    }
    function encode(s) {
      const json = JSON.stringify(s);
      if (!codec?.pack || json.length < 4096) return json;
      const packed = codec.pack(json);
      return packed.length < json.length ? packed : json;
    }
    function persist(
      state,
      { expectedRevision, archiveKey, allowRecovery = false } = {},
    ) {
      Core.validate(state);
      const before = raw(KEYS.primary),
        backup = raw(KEYS.backup),
        current = load();
      if (!allowRecovery) {
        if (current.source === "blocked" || current.source === "backup")
          throw Error("저장 복구가 필요합니다. 원본을 먼저 보존하세요.");
        if (
          (expectedRevision === null && current.source !== "empty") ||
          (expectedRevision !== null &&
            expectedRevision !== undefined &&
            current.state?.revision !== expectedRevision)
        )
          throw Error(
            "다른 탭에서 저장이 변경되었습니다. 다시 불러온 뒤 작업하세요.",
          );
        if (
          expectedRevision !== null &&
          expectedRevision !== undefined &&
          current.state?.campaignId !== state.campaignId
        )
          throw Error("캠페인이 변경되었습니다. 다시 불러오세요.");
      }
      const next = Core.clone(state);
      next.revision =
        Math.max(state.revision, current.state?.revision || 0) + 1;
      next.updatedAt = clock();
      Core.validate(next);
      const data = encode(next),
        rows = [];
      if (archiveKey && (before !== null || backup !== null))
        rows.push([
          archiveKey,
          JSON.stringify({
            game: "BLACKLINE_OVERWATCH_RECOVERY",
            archivedAt: clock(),
            primary: before,
            backup,
          }),
        ]);
      rows.push([KEYS.primary, data], [KEYS.backup, data]);
      transaction(rows);
      return next;
    }
    function parseImport(fileText) {
      if (
        typeof fileText !== "string" ||
        new TextEncoder().encode(fileText).length > 8 * 1024 * 1024
      )
        throw Error("백업은 8MiB 이하의 텍스트 파일이어야 합니다.");
      const data = JSON.parse(decode(fileText));
      if (data?.game === "BLACKLINE_OVERWATCH_RECOVERY") {
        for (const value of [data.primary, data.backup])
          try {
            const s = parse(value);
            if (s) return s;
          } catch (e) {}
        throw Error("보관본에서 복원할 수 있는 저장을 찾지 못했습니다.");
      }
      return Core.validate(data.state || data);
    }
    function importSave(fileText) {
      const state = Core.upgrade(parseImport(fileText));
      return persist(state, {
        archiveKey: KEYS.beforeImport,
        allowRecovery: true,
      });
    }
    function recoverBackup() {
      const state = parse(raw(KEYS.backup));
      if (!state) throw Error("복원할 백업이 없습니다.");
      return persist(Core.upgrade(state), {
        archiveKey: KEYS.beforeImport,
        allowRecovery: true,
      });
    }
    function migrate() {
      const loaded = load();
      if (loaded.source !== "primary" || !loaded.state)
        throw Error("주 저장 복구 후 형식을 변환하세요.");
      if (loaded.state.schemaVersion === Core.SCHEMA) return loaded.state;
      return persist(Core.upgrade(loaded.state), {
        expectedRevision: loaded.state.revision,
        archiveKey: KEYS.beforeCommandMigration,
      });
    }
    function reset(state) {
      return persist(state, {
        archiveKey: KEYS.beforeReset,
        allowRecovery: true,
      });
    }
    function inspectLegacy() {
      return [KEYS.legacy, KEYS.legacyBackup].map((key) => {
        try {
          const value = raw(key);
          if (value === null) return { key, present: false };
          try {
            const x = JSON.parse(decode(value)),
              s = x.state || x;
            return {
              key,
              present: true,
              valid: true,
              bytes: new TextEncoder().encode(value).length,
              date: s.date || null,
              members: Array.isArray(s.team) ? s.team.length : null,
              operations: Array.isArray(s.operations)
                ? s.operations.length
                : null,
              history: Array.isArray(s.history) ? s.history.length : null,
              reports: Array.isArray(s.reports) ? s.reports.length : null,
            };
          } catch (e) {
            return {
              key,
              present: true,
              valid: false,
              bytes: new TextEncoder().encode(value).length,
            };
          }
        } catch (e) {
          return { key, present: false, error: "접근 불가" };
        }
      });
    }
    function exportSave(state) {
      return JSON.stringify(
        {
          game: Core.GAME,
          schemaVersion: state.schemaVersion,
          exportedAt: clock(),
          state: Core.validate(Core.clone(state)),
        },
        null,
        2,
      );
    }
    return {
      load,
      save: (s, r) => persist(s, { expectedRevision: r }),
      reset,
      migrate,
      importSave,
      parseImport,
      recoverBackup,
      inspectLegacy,
      exportSave,
      raw,
      keys: KEYS,
    };
  }
  const api = { KEYS, create };
  root.OverwatchStorage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
