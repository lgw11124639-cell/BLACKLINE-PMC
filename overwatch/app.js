(function () {
  "use strict";
  const VERSION = "2026.11.17.07",
    Core = OverwatchCore,
    P = OverwatchPersonnel,
    PersonnelUI = OverwatchPersonnelUI,
    CommandUI = OverwatchCommandUI,
    FieldUI = OverwatchFieldUI,
    MissionUI = OverwatchMissionUI,
    Battle = OverwatchBattle,
    root = document.getElementById("overwatch-root");
  // Display names are translated without changing stable save identifiers or form values.
  const unitLabel = (text) =>
    String(text)
      .replace(
        /본부 보병 (ALPHA|BRAVO|CHARLIE)/g,
        (_, c) => "본부 " + { ALPHA: 1, BRAVO: 2, CHARLIE: 3 }[c] + "팀",
      )
      .replace(/본부 보병 DELTA/g, "본부 보병")
      .replace(
        /\b(ALPHA|BRAVO|CHARLIE)\b/g,
        (c) => "저격 " + { ALPHA: 1, BRAVO: 2, CHARLIE: 3 }[c] + "팀",
      );
  function labelNodes(node) {
    if (node.nodeType === 3) {
      const next = unitLabel(node.nodeValue);
      if (
        next !== node.nodeValue &&
        !["SCRIPT", "STYLE", "INPUT", "TEXTAREA"].includes(
          node.parentElement?.tagName,
        )
      )
        node.nodeValue = next;
      return;
    }
    if (node.nodeType !== 1) return;
    for (const key of ["title", "aria-label"])
      if (node.hasAttribute(key)) {
        const old = node.getAttribute(key),
          next = unitLabel(old);
        if (next !== old) node.setAttribute(key, next);
      }
    for (const child of node.childNodes) labelNodes(child);
  }
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") labelNodes(r.target);
      else for (const node of r.addedNodes) labelNodes(node);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const tabs = [
    ["headquarters", "본부", "01"],
    ["personnel", "대원·편제", "02"],
    ["command", "훈련 관제", "03"],
    ["field", "작전 관제", "04"],
    ["contracts", "작전 승인", "05"],
    ["equipment", "장비 현황", "06"],
    ["records", "기록 보관함", "07"],
    ["storage", "저장 관리", "08"],
  ];
  const roles = { observer: "관측수", sniper: "저격수" },
    statuses = {
      standby: "대기",
      resting: "휴식",
      training: "훈련",
      treatment: "치료",
      deceased: "전사",
      resigned: "퇴사",
      retired: "은퇴",
    };
  let store = null,
    state = null,
    source = "blocked",
    tab = "headquarters",
    notice = "",
    error = "",
    stale = false,
    selectedPerson = null;
  let hqRecruitmentOpen = false;
  let lastSaved = null,
    dirty = false,
    unsavedRecovery = null;
  const updates = OverwatchUpdates.create({
    version: VERSION,
    beforeUpdate() {
      if (unsavedRecovery)
        throw Error(
          "저장되지 않은 진행이 있습니다. 저장 관리에서 복구 백업을 먼저 내보내세요.",
        );
      try {
        saveRuntime();
      } catch (error) {
        throw Error(
          "진행을 저장하지 못했습니다. 저장 공간과 저장 상태를 확인한 뒤 다시 시도하세요.",
        );
      }
      runtime.stop();
      OverwatchAudio.stop();
    },
  });
  function rollbackRuntime(errorValue) {
    try {
      if (state) {
        Core.validate(state);
        unsavedRecovery = Core.clone(state);
      }
    } catch {}
    runtime.stop();
    OverwatchAudio.stop();
    root
      .querySelector(".field-fullscreen")
      ?.classList.remove("field-fullscreen");
    if (lastSaved) state = Core.clone(lastSaved);
    if (
      state?.commandExercise?.battle &&
      state.commandExercise.status === "running"
    )
      Battle.setPaused(state, true);
    dirty = false;
    error =
      "전장 저장·진행을 중단했습니다. 마지막 저장 상태로 되돌렸습니다. " +
      errorValue.message;
    render();
  }
  function saveRuntime() {
    if (!dirty) return;
    if (source !== "primary" || stale)
      throw Error("최신 저장을 다시 불러오세요.");
    state = store.save(state, state.revision);
    lastSaved = Core.clone(state);
    dirty = false;
    for (const b of root.querySelectorAll("[data-save-now]"))
      b.title =
        "최근 저장: " + new Date(state.updatedAt).toLocaleString("ko-KR");
  }
  const runtime = OverwatchRealtime.create({
    baseRate: OverwatchRealtime.GAME_RATE,
    maxWorkMs: 12,
    tick() {
      if (
        source !== "primary" ||
        stale ||
        !state?.commandExercise?.battle ||
        state.commandExercise.paused
      )
        return false;
      OverwatchCommand.step(state, 1);
      dirty = true;
      if (state.commandExercise.status === "ended") setTimeout(render, 0);
      return (
        state.commandExercise.status === "running" &&
        !state.commandExercise.paused
      );
    },
    afterPump() {
      FieldUI.refresh(root, state, { playing: true });
      OverwatchStaffUI.refresh(root, state);
      const liveClock = root.querySelector("[data-live-clock]");
      if (liveClock)
        liveClock.textContent =
          "본부 " + PersonnelUI.timestamp(state.clock.elapsedSeconds);
    },
    checkpoint: saveRuntime,
    onError: rollbackRuntime,
  });
  function pauseField() {
    runtime.stop();
    OverwatchAudio.stop();
    if (state?.commandExercise?.paused && !dirty) return;
    if (
      state?.commandExercise?.battle &&
      state.commandExercise.status === "running" &&
      source === "primary" &&
      !stale
    ) {
      Battle.setPaused(state, true);
      dirty = true;
      try {
        saveRuntime();
        FieldUI.refresh(root, state, { playing: false });
      } catch (e) {
        rollbackRuntime(e);
      }
    } else if (dirty && source === "primary" && !stale) {
      try {
        saveRuntime();
      } catch (e) {
        rollbackRuntime(e);
      }
    }
  }
  function toggleField() {
    if (
      !state?.commandExercise?.battle ||
      state.commandExercise.status !== "running" ||
      source !== "primary" ||
      stale ||
      document.hidden
    )
      return;
    if (
      state.commandExercise.paused &&
      !commit((next) => Battle.setPaused(next, false))
    )
      return;
    if (!runtime.isRunning()) runtime.start(state.commandExercise.battle.speed);
  }
  // Orders are transactional saves; only successful commands may start the live loop.
  function executeField(change) {
    const saved = commit((next) => {
      change(next);
      if (
        next.commandExercise?.battle &&
        next.commandExercise.status === "running"
      )
        Battle.setPaused(next, false);
    });
    if (
      saved &&
      state?.commandExercise?.battle &&
      state.commandExercise.status === "running" &&
      !state.commandExercise.paused &&
      !document.hidden
    ) {
      if (!runtime.isRunning())
        runtime.start(state.commandExercise.battle.speed);
      FieldUI.refresh(root, state, { playing: true });
    }
    return saved;
  }
  function fallbackField(message) {
    setTimeout(() => {
      notice = message;
      if (
        source === "primary" &&
        !stale &&
        state?.fieldPreferences?.view === "3d"
      )
        commit((next) => {
          next.fieldPreferences.view = "2d";
          if (
            next.commandExercise?.battle &&
            next.commandExercise.status === "running"
          )
            Battle.setPaused(next, false);
        });
      else {
        const host = root.querySelector(".field-viewport");
        if (host) host.innerHTML = FieldUI.map2D(OverwatchCommand.frame(state));
      }
    }, 0);
  }
  const id = () =>
    globalThis.crypto?.randomUUID?.() ||
    "campaign-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  function load() {
    runtime.reset();
    dirty = false;
    try {
      store = store || OverwatchStorage.create({ storage: localStorage });
      const loaded = store.load();
      source = loaded.source;
      state = loaded.state;
      notice = loaded.message || "";
      error = "";
      stale = false;
      selectedPerson = null;
      if (source === "primary" && state.schemaVersion < Core.SCHEMA) {
        try {
          state = store.migrate();
          notice =
            "본부를 5단계 실전 계약 저장으로 전환했습니다. 이전 주 저장·백업 원본은 변환 전 보관함에 있습니다.";
        } catch (e) {
          source = "migration";
          error = e.message;
        }
      }
      if (source === "empty") {
        try {
          state = store.save(Core.createCampaign({ id: id() }), null);
          source = "primary";
          notice =
            "OVERWATCH 본부 기록을 개설했습니다. 기존 PMC 저장은 변경하지 않았습니다.";
        } catch (e) {
          source = "blocked";
          error = e.message;
        }
      }
      if (
        state?.commandExercise?.battle &&
        state.commandExercise.status === "running" &&
        source === "primary"
      ) {
        const live = Core.clone(state);
        live.commandExercise.battle.continuous = true;
        live.commandExercise.battle.observerAutonomy = true;
        live.clock.emergencyPause = false;
        Battle.setPaused(live, false);
        try {
          state = store.save(live, state.revision);
        } catch (e) {
          state = live;
          Battle.setPaused(state, true);
          error = e.message;
        }
      }
      if (
        source === "primary" &&
        state?.fieldPreferences &&
        state.fieldPreferences.presentation !== 2
      ) {
        const updated = Core.clone(state);
        updated.fieldPreferences.view = "illustrated";
        updated.fieldPreferences.presentation = 2;
        try {
          state = store.save(updated, state.revision);
        } catch (e) {
          error = e.message;
        }
      }
      if (
        source === "primary" &&
        state?.schemaVersion === 5 &&
        (!state.commandStaff || state.commandStaff.marketVersion !== 3)
      ) {
        const next = Core.clone(state);
        OverwatchStaff.upgrade(next);
        state = store.save(next, state.revision);
      }
      if (
        source === "primary" &&
        state?.schemaVersion === 5 &&
        state.operations.contentVersion !== 5
      ) {
        const next = Core.clone(state);
        OverwatchMissions.upgrade(next);
        state = store.save(next, state.revision);
      }
      lastSaved = state ? Core.clone(state) : null;
      tab = state?.ui.tab || "storage";
    } catch (e) {
      error = "저장소에 접근할 수 없습니다. " + e.message;
      source = "blocked";
      state = null;
      tab = "storage";
    }
    render();
    toggleField();
  }
  function commit(change) {
    if (!state || source !== "primary" || stale) {
      error = "저장 복구 또는 다시 불러오기가 필요합니다.";
      render();
      return false;
    }
    const next = Core.clone(state);
    try {
      change(next);
      if (
        next.commandExercise?.battle &&
        next.commandExercise.status === "running"
      ) {
        next.commandExercise.battle.continuous = true;
        next.commandExercise.battle.observerAutonomy = true;
        next.clock.emergencyPause = false;
        Battle.setPaused(next, false);
      }
      state = store.save(next, state.revision);
      error = "";
      dirty = false;
      lastSaved = Core.clone(state);
      if (state.commandExercise?.battle) {
        runtime.setSpeed(state.commandExercise.battle.speed);
        if (
          state.commandExercise.paused ||
          state.commandExercise.status !== "running"
        )
          runtime.stop();
      }
      render();
      toggleField();
      return true;
    } catch (e) {
      if (dirty) {
        rollbackRuntime(e);
        return false;
      }
      error = e.message;
      render();
      return false;
    }
  }
  function download(name, text) {
    const url = URL.createObjectURL(
        new Blob([text], { type: "application/octet-stream" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function phase(label, title, body) {
    return (
      '<section class="empty-state"><span class="eyebrow">' +
      label +
      "</span><h2>" +
      title +
      "</h2><p>" +
      body +
      '</p><span class="phase-note">실전 계약과 기관 수송·지원, 복귀 후 정산을 사용할 수 있습니다.</span></section>'
    );
  }
  function headquarters() {
    const active = state?.commandExercise?.status === "running",
      training = active && !state.commandExercise.mission,
      ready = state.members.filter(
        (m) => P.readiness(state, m) === null,
      ).length;
    return (
      '<section class="page-title"><span class="eyebrow">BLACKLINE / HEADQUARTERS</span><h1>작전 본부</h1><p>인원을 편성하고 작전을 승인하세요. 현장 운용은 작전통제관에게 위임할 수 있습니다.</p></section><section class="metrics">' +
      [
        ["본부 인원", state.members.length + " / " + P.MAX_MEMBERS],
        ["출격 편성", state.squads.length + "개 조"],
        ["가용 인원", ready + "명"],
        ["운영 자금", PersonnelUI.money(state.headquarters.funds)],
      ]
        .map(
          ([k, v]) =>
            "<article><small>" +
            k +
            "</small><strong>" +
            v +
            "</strong></article>",
        )
        .join("") +
      '</section><div class="hq-dashboard">' +
      '<section class="panel operation-brief"><span class="eyebrow">OPERATIONS</span><h2>' +
      (active
        ? training
          ? "훈련 진행 중"
          : "실전 작전 진행 중"
        : "다음 작전 준비") +
      "</h2><p>" +
      (active
        ? "작전통제관의 판단과 무전, 대원 상태를 관전할 수 있습니다."
        : "현장 저격조 2~6명과 본부 작전통제관을 편성하세요. 훈련에는 교관을 따로 배정할 수 있습니다.") +
      '</p><div class="inline-actions"><button data-tab="personnel">인원·편제</button><button data-tab="contracts">작전 승인</button><button data-tab="' +
      (active && !training ? "field" : "command") +
      '">' +
      (active && !training ? "작전 관제" : "훈련 관제") +
      '</button></div><div class="hq-team-summary">' +
      (state.squads.length
        ? state.squads
            .map(
              (q) =>
                "<article><strong>" +
                esc(q.callsign) +
                "</strong><span>" +
                [q.observerId, q.sniperId]
                  .map((id) =>
                    esc(
                      state.members.find((m) => m.id === id)?.name || "미편성",
                    ),
                  )
                  .join(" · ") +
                "</span></article>",
            )
            .join("")
        : '<p class="muted">출격할 저격조를 편성하세요.</p>') +
      "</div></section>" +
      OverwatchStaffUI.render(state, source === "primary" && !stale, {
        market: false,
      }) +
      '</div><details class="hq-recruitment" data-hq-recruitment' +
      (hqRecruitmentOpen ? " open" : "") +
      "><summary>지원 인력 채용·계약 관리 <span>작전통제관 · 훈련 교관</span></summary>" +
      OverwatchStaffUI.market(state, source === "primary" && !stale) +
      "</details>"
    );
  }
  function personnel() {
    return (
      (state?.commandExercise?.status === "running"
        ? '<div class="notice">지휘 훈련 중에는 본부 활동을 변경할 수 없습니다. 지휘 훈련에서 종료할 수 있습니다.</div>'
        : "") +
      PersonnelUI.render(state, {
        editable:
          source === "primary" &&
          !stale &&
          state?.commandExercise?.status !== "running",
      })
    );
  }
  function records() {
    let legacy = [];
    try {
      legacy = store?.inspectLegacy() || [];
    } catch (e) {}
    return (
      '<section class="page-title"><span class="eyebrow">RECORD ARCHIVE</span><h1>기록을 지우지 않는 전환</h1><p>OVERWATCH 진행과 이전 PMC 원본을 분리해서 보관합니다.</p></section><section class="panel"><h2>OVERWATCH 본부 기록</h2><p>최근 30건을 표시합니다. 전체 저장 기록은 백업에 보존됩니다.</p><ol class="event-log">' +
      (state?.records || [])
        .slice(-30)
        .reverse()
        .map(
          (e) =>
            "<li><time>" +
            PersonnelUI.timestamp(e.time) +
            "</time><div><strong>" +
            esc(e.message) +
            "</strong><small>사건 " +
            esc(e.id) +
            " · " +
            esc(e.type) +
            "</small></div></li>",
        )
        .join("") +
      "</ol></section>" +
      CommandUI.archive(state) +
      (state?.schemaVersion >= 2
        ? '<section class="panel"><h2>운영자금 장부</h2><p>잔액 ' +
          PersonnelUI.money(state.headquarters.funds) +
          " · 시작 이월 " +
          PersonnelUI.money(state.headquarters.openingBalance) +
          '</p><ol class="event-log">' +
          state.headquarters.ledger
            .slice(-20)
            .reverse()
            .map(
              (e) =>
                "<li><time>" +
                PersonnelUI.timestamp(e.time) +
                "</time><div><strong>" +
                esc(e.kind) +
                " · " +
                (e.amount < 0 ? "−" : "+") +
                PersonnelUI.money(Math.abs(e.amount)) +
                "</strong><small>" +
                esc(e.id) +
                "</small></div></li>",
            )
            .join("") +
          "</ol></section>"
        : "") +
      '<section class="panel"><h2>기존 PMC 저장 · 읽기 전용</h2><p>이전 키를 덮어쓰거나 대규모 편제를 잘라내지 않습니다. 예전 게임의 자동 출동·날짜·재무 처리는 이 화면에서 실행하지 않습니다.</p><div class="archive-grid">' +
      legacy
        .map(
          (l) =>
            "<article><h3>" +
            (l.key === store.keys.legacy ? "주 저장" : "백업 저장") +
            "</h3><code>" +
            l.key +
            "</code><p>" +
            (!l.present
              ? "저장 없음"
              : !l.valid
                ? "형식을 읽을 수 없습니다. 원본을 보존합니다."
                : esc(l.date || "날짜 미기록") +
                  " · 명부 " +
                  (l.members ?? "?") +
                  "명<br>작전 " +
                  (l.operations ?? "?") +
                  "건 · 완료 기록 " +
                  (l.history ?? "?") +
                  "건 · 보고 " +
                  (l.reports ?? "?") +
                  "건") +
            "</p>" +
            (l.present
              ? '<button data-raw="' + l.key + '">원본 내려받기</button>'
              : "") +
            "</article>",
        )
        .join("") +
      "</div></section>"
    );
  }
  function storagePage() {
    const enabled = !!state;
    const savedInfo = store?.status();
    const savedTime = state?.updatedAt
      ? new Date(state.updatedAt).toLocaleString("ko-KR")
      : "저장 전";
    return (
      '<section class="page-title"><span class="eyebrow">SAVE & RECOVERY</span><h1>본부 기록 관리</h1><p>자동으로 저장하며 화면을 닫았다 열면 저장한 지점에서 이어집니다. 다른 기기에서는 백업 파일을 가져오세요.</p></section><section class="panel storage-summary"><div><span class="eyebrow">CURRENT RECORD</span><h2>' +
      esc(state?.headquarters.name || "복구 필요") +
      "</h2><p>" +
      (state
        ? "본부 " + PersonnelUI.timestamp(state.clock.elapsedSeconds)
        : "읽을 수 있는 본부 기록 없음") +
      "</p><small>최근 저장 " +
      esc(savedTime) +
      " · 저장 공간 약 " +
      Math.ceil((savedInfo?.bytes || 0) / 1024).toLocaleString() +
      "KB" +
      '</small></div><span class="status-pill">' +
      {
        primary: "주 저장 정상",
        backup: "백업 확인 · 복구 필요",
        blocked: "저장 보호 중",
        empty: "저장 없음",
        migration: "저장 전환 필요",
      }[source] +
      '</span></section><section class="panel save-checkpoints"><h2>자동 저장과 복구</h2><p>기록은 이 브라우저에 저장됩니다. 주 저장과 백업을 함께 갱신하고, 이전 시점도 별도로 보관합니다.</p><div class="actions"><button data-save-now ' +
      (!enabled || source !== "primary" || stale ? "disabled" : "") +
      '>지금 저장</button><button id="recover-previous" ' +
      (!savedInfo?.previous ? "disabled" : "") +
      ">이전 자동 저장 복원</button>" +
      (navigator.storage?.persist
        ? '<button id="protect-storage">브라우저 저장 보호 요청</button>'
        : "") +
      "</div><p data-save-checkpoint>" +
      (savedInfo?.previous
        ? "복원 가능한 시점: 본부 " +
          PersonnelUI.timestamp(savedInfo.previous.elapsedSeconds)
        : "진행이 저장되면 이전 시점도 자동으로 보관합니다.") +
      "</p>" +
      (savedInfo?.recoveryWarning
        ? '<p class="notice">' + esc(savedInfo.recoveryWarning) + "</p>"
        : "") +
      '</section><div class="two-column"><section class="panel"><h2>기기 이동·파일 백업</h2><div class="actions"><button id="export-save" ' +
      (!enabled ? "disabled" : "") +
      '>압축 백업 파일 받기</button><label class="file-button">백업 파일 가져오기<input id="import-save" type="file" accept=".json,.blz,application/json,text/plain"></label><button id="reload-save">저장 다시 불러오기</button>' +
      (source === "backup"
        ? '<button id="recover-backup">확인한 백업으로 주 저장 복구</button>'
        : "") +
      '</div><p class="muted">가져오기 전 기존 OVERWATCH 저장을 사전 보관합니다. PMC 백업은 새 본부 데이터로 가져오지 않습니다.</p></section><section class="panel"><h2>보관 원본</h2><div class="actions">' +
      [
        store?.keys.primary,
        store?.keys.backup,
        store?.keys.previous,
        store?.keys.beforeImport,
        store?.keys.beforeReset,
        store?.keys.beforeMigration,
        store?.keys.beforeCommandMigration,
        store?.keys.beforeFieldMigration,
        store?.keys.beforeMissionMigration,
      ]
        .filter(Boolean)
        .map((k) => {
          let has = false;
          try {
            has = store.raw(k) !== null;
          } catch (e) {}
          return has
            ? '<button data-raw="' +
                k +
                '">' +
                {
                  [store.keys.primary]: "주 저장 원본",
                  [store.keys.backup]: "백업 원본",
                  [store.keys.previous]: "이전 자동 저장",
                  [store.keys.beforeImport]: "가져오기 전 보관본",
                  [store.keys.beforeReset]: "새 본부 개설 전 보관본",
                  [store.keys.beforeMigration]: "2단계 전환 전 원본",
                  [store.keys.beforeCommandMigration]: "3단계 전환 전 원본",
                  [store.keys.beforeFieldMigration]: "4단계 전환 전 원본",
                  [store.keys.beforeMissionMigration]: "5단계 전환 전 원본",
                }[k] +
                " 내려받기</button>"
            : "";
        })
        .join("") +
      '</div><p class="muted">손상된 파일도 원본 그대로 내보낼 수 있습니다.</p></section></div><section class="panel"><h2>표시 설정</h2><label class="setting"><input id="reduced-motion" type="checkbox" ' +
      (state?.settings.reducedMotion ? "checked" : "") +
      " " +
      (!enabled || source !== "primary" || stale ? "disabled" : "") +
      '> 화면 효과 줄이기</label><p class="muted">본부 활동을 진행하면 모든 활동과 계약 시간이 함께 흐릅니다. 재접속만으로 시간이 흐르지 않습니다. 모의 전장은 1·2·4배속을 지원하며 화면을 다시 열면 저장한 지점에서 이어집니다.</p></section><section class="panel caution"><h2>새 본부 기록 개설</h2><p>현재 본부·자동 백업·이전 복원 기록을 모두 삭제하고 처음부터 시작합니다. 필요한 진행은 먼저 백업 파일로 받아두세요.</p><button id="new-campaign" ' +
      (!store ? "disabled" : "") +
      ">새 본부 기록 개설</button></section>"
    );
  }
  function render() {
    const oldFieldForm = root.querySelector("[data-field-command]"),
      oldFieldFocus = oldFieldForm?.contains(document.activeElement)
        ? document.activeElement
        : null,
      oldFieldScroll = scrollY;
    const retainedViewport = root.querySelector(".field-viewport"),
      wasFullscreen = !!root.querySelector(".field-fullscreen"),
      wasInspectorCollapsed = !!root.querySelector(
        ".field-inspector-collapsed",
      ),
      wasHudOpen = !!root.querySelector(".field-hud-open");
    const radioScroll =
        root.querySelector(".command-radio-list")?.scrollTop || 0,
      showInternal = !!root.querySelector("[data-range-internal]")?.checked;
    const dossierScroll =
        root.querySelector(".dossier-content")?.scrollTop || 0,
      hadDossier = !!root.querySelector(".personnel-dossier");
    document.body.classList.toggle(
      "personnel-dossier-open",
      !!selectedPerson && state?.schemaVersion >= 2,
    );
    document.documentElement.dataset.reducedMotion = String(
      state?.settings.reducedMotion || false,
    );
    document.body.dataset.screen = tab;
    root.innerHTML =
      '<header class="topbar"><button class="mobile-menu-button" data-mobile-menu aria-label="본부 메뉴 열기" aria-expanded="false">메뉴</button><a class="brand" href="#" data-tab="headquarters"><span class="brand-emblem" aria-hidden="true">B</span><span>BLACKLINE<small>OVERWATCH</small></span></a><div class="topbar-status"><span class="status-dot"></span><span data-live-clock>본부 ' +
      PersonnelUI.timestamp(state?.clock.elapsedSeconds || 0) +
      ' / 본부</span><button id="version-check" class="quiet" title="현재 버전 ' +
      VERSION +
      ' · 업데이트 확인"><span class="app-version-number">' +
      VERSION +
      '</span><span>업데이트</span></button><button data-save-now aria-label="현재 진행 저장" title="현재 진행을 저장합니다.">저장</button><button data-game-fullscreen aria-label="게임 전체화면">전체화면</button></div></header><button class="mobile-nav-backdrop" data-mobile-menu-close aria-label="본부 메뉴 닫기"></button><div class="rotate-hint"><span>가로 화면 전용 · 기기를 옆으로 돌려주세요.</span><button data-game-fullscreen>전체화면</button></div><div class="workspace"><aside class="sidebar"><span class="eyebrow">COMMAND WORKSPACE</span><nav aria-label="본부 메뉴">' +
      tabs
        .map(
          ([key, label, n]) =>
            '<button data-tab="' +
            key +
            '" ' +
            (tab === key ? 'aria-current="page"' : "") +
            "><span>" +
            n +
            "</span>" +
            label +
            "</button>",
        )
        .join("") +
      '</nav><div class="sidebar-foot">HQ → OBSERVER → SNIPER<br>PHASE 04 / FIELD</div></aside><main id="main" tabindex="-1"><div class="breadcrumb">BLACKLINE / ' +
      tabs.find((t) => t[0] === tab)?.[1] +
      "</div>" +
      (error
        ? '<div role="alert" class="notice error">' +
          esc(error) +
          (unsavedRecovery
            ? '<button id="export-unsaved">저장 실패 직전 진행 파일 받기</button>'
            : "") +
          "</div>"
        : "") +
      (notice
        ? '<div role="status" class="notice">' + esc(notice) + "</div>"
        : "") +
      (stale
        ? '<div role="alert" class="notice error">다른 탭에서 기록이 변경되었습니다. 현재 화면의 저장을 중단했습니다. <button id="stale-reload">최신 저장 불러오기</button></div>'
        : "") +
      (
        {
          headquarters,
          personnel,
          command: () =>
            FieldUI.render(state, {
              mode: "training",
              playing: runtime.isRunning(),
              editable: source === "primary" && !stale,
            }),
          records,
          field: () =>
            FieldUI.render(state, {
              mode: "operation",
              editable: source === "primary" && !stale,
              playing: runtime.isRunning(),
            }),
          storage: storagePage,
          contracts: () =>
            MissionUI.render(state, {
              editable: source === "primary" && !stale,
            }),
          equipment: () => {
            const friends = OverwatchCommand.frame(state)?.friends || [];
            return (
              '<section class="page-title"><span class="eyebrow">FIELD EQUIPMENT</span><h1>지급 장비 · 수신 현황</h1><p>현장에서 전달된 실제 장전·예비 탄약과 무장·방호 상태입니다.</p></section><section class="member-grid">' +
              (friends.length
                ? friends
                    .map(
                      (u) =>
                        '<article class="panel"><h2>' +
                        esc(u.name) +
                        " · " +
                        roles[u.role] +
                        "</h2><p>" +
                        esc(u.weapon?.name || "장비 보고 대기") +
                        "</p><p>장전 " +
                        (u.weapon?.loaded ?? "—") +
                        "발 · 예비 " +
                        (u.weapon?.magazines?.reduce((n, v) => n + v, 0) ??
                          "—") +
                        "발</p><p>무장 상태 " +
                        Math.round(u.weapon?.condition ?? 100) +
                        "% · 헬멧 " +
                        Math.round(u.protection?.helmet ?? 0) +
                        "% · 방탄판 " +
                        Math.round(u.protection?.plate ?? 0) +
                        "%</p><small>마지막 보고 " +
                        u.age +
                        "초 전</small></article>",
                    )
                    .join("")
                : '<article class="panel"><h2>현장 수신 대기</h2><p>대원을 편성하고 훈련 또는 실전 작전을 승인하면 실제 지급 상태를 확인할 수 있습니다.</p></article>') +
              "</section>"
            );
          },
        }[tab] || storagePage
      )() +
      "<footer>BLACKLINE: OVERWATCH · 실전 계약·관측수 지휘·기관 수송·복귀 정산</footer></main></div>" +
      PersonnelUI.dossier(state, selectedPerson, {
        editable:
          source === "primary" &&
          !stale &&
          state?.commandExercise?.status !== "running",
      });
    if (
      ["field", "command"].includes(tab) &&
      state?.commandExercise?.battle &&
      state.commandExercise.status === "running" &&
      (tab === "field") === !!state.commandExercise.mission
    )
      root.querySelector("#main")?.classList.add("battle-screen");
    root
      .querySelector("[data-hq-recruitment]")
      ?.addEventListener("toggle", (event) => {
        hqRecruitmentOpen = event.currentTarget.open;
      });
    OverwatchStaffUI.bind(root, {
      state,
      editable: source === "primary" && !stale,
      commit,
    });
    for (const b of root.querySelectorAll("[data-game-fullscreen]"))
      b.addEventListener("click", async () => {
        try {
          if (!document.fullscreenElement)
            await document.documentElement.requestFullscreen?.();
          await screen.orientation?.lock?.("landscape");
        } catch (e) {}
        FieldUI.mount(root, state, {
          playing: runtime.isRunning(),
          onFallback: fallbackField,
        });
      });
    if (selectedPerson) {
      root.querySelector(".topbar").inert = true;
      root.querySelector(".workspace").inert = true;
      const content = root.querySelector(".dossier-content");
      if (content && hadDossier) content.scrollTop = dossierScroll;
    }
    const radioList = root.querySelector(".command-radio-list");
    if (radioList) radioList.scrollTop = radioScroll;
    const internal = root.querySelector("[data-range-internal]");
    if (internal && showInternal) {
      internal.checked = true;
      root
        .querySelectorAll('[data-channel="internal"]')
        .forEach((row) => (row.hidden = false));
    }
    const nextViewport = root.querySelector(".field-viewport");
    if (
      retainedViewport &&
      nextViewport &&
      retainedViewport.dataset.fieldId === nextViewport.dataset.fieldId
    ) {
      nextViewport.replaceWith(retainedViewport);
      const newForm = root.querySelector("[data-field-command]");
      if (
        oldFieldForm &&
        newForm &&
        oldFieldForm.dataset.fieldEditable ===
          String(source === "primary" && !stale)
      ) {
        oldFieldForm.querySelector("button[type=submit]").disabled =
          newForm.querySelector("button[type=submit]").disabled;
        newForm.replaceWith(oldFieldForm);
        if (oldFieldFocus) {
          oldFieldFocus.focus({ preventScroll: true });
          window.scrollTo(0, oldFieldScroll);
        }
      }
      if (wasHudOpen) {
        root.querySelector(".field-layout")?.classList.add("field-hud-open");
        root
          .querySelector("[data-field-hud]")
          ?.setAttribute("aria-expanded", "true");
      }
      if (wasInspectorCollapsed) {
        root
          .querySelector(".field-layout")
          ?.classList.add("field-inspector-collapsed");
        const b = root.querySelector("[data-field-panel-toggle]");
        if (b) {
          b.setAttribute("aria-expanded", "false");
          b.textContent = "무전·대원";
          b.setAttribute("aria-label", "옆 무전·대원 패널 열기");
        }
      }
      if (wasFullscreen) {
        root.querySelector(".field-layout")?.classList.add("field-fullscreen");
        const button = root.querySelector("[data-field-fullscreen]");
        if (button) button.textContent = "닫기";
      }
    }
    FieldUI.mount(root, state, {
      playing: runtime.isRunning(),
      onFallback: fallbackField,
    });
    MissionUI.bind(root, {
      execute: executeField,
      play: toggleField,
      state,
      editable: source === "primary" && !stale,
      commit,
      navigate(next) {
        if (state && source === "primary" && !stale)
          commit((s) => {
            if (next === "command") P.interruptManaged(s);
            s.ui.tab = next;
          });
        tab = next;
        render();
      },
    });
    FieldUI.bind(root, {
      state,
      editable: source === "primary" && !stale,
      commit,
      play: toggleField,
      execute: executeField,
      onFallback: fallbackField,
    });
    CommandUI.bind(root, {
      state,
      execute: executeField,
      editable: source === "primary" && !stale,
      commit,
    });
    OverwatchInfantry.bind(root, { commit, execute: executeField });
    PersonnelUI.bind(root, {
      state,
      editable:
        source === "primary" &&
        !stale &&
        state?.commandExercise?.status !== "running",
      commit,
      openProfile(id) {
        selectedPerson = id;
        render();
        root.querySelector("[data-close-profile]")?.focus();
      },
      closeProfile() {
        selectedPerson = null;
        render();
      },
    });
    root.querySelectorAll("[data-tab]").forEach((button) =>
      button.addEventListener("click", (e) => {
        e.preventDefault();
        const next = button.dataset.tab;
        if (state && source === "primary" && !stale)
          commit((s) => {
            if (next === "command") P.interruptManaged(s);
            s.ui.tab = next;
          });
        tab = next;
        notice = "";
        render();
      }),
    );
    const on = (selector, fn) =>
      root.querySelector(selector)?.addEventListener("click", fn);
    on("#export-save", () => {
      try {
        download(
          "BLACKLINE-OVERWATCH-" + state.campaignId + ".blz",
          store.exportSave(state, { compressed: true }),
        );
      } catch (e) {
        error = e.message;
        render();
      }
    });
    for (const button of root.querySelectorAll("[data-save-now]")) {
      button.disabled = !state || source !== "primary" || stale;
      button.title =
        "최근 저장: " +
        (state?.updatedAt
          ? new Date(state.updatedAt).toLocaleString("ko-KR")
          : "저장 전");
      button.addEventListener("click", () => {
        notice = "현재 진행을 저장했습니다.";
        commit(() => {});
      });
    }
    on("#export-unsaved", () => {
      try {
        download(
          "BLACKLINE-OVERWATCH-미저장-" + unsavedRecovery.campaignId + ".blz",
          store.exportSave(unsavedRecovery, { compressed: true }),
        );
      } catch (e) {
        error = e.message;
        render();
      }
    });
    on("#recover-previous", () => {
      if (
        !confirm(
          "표시된 이전 자동 저장으로 돌아갈까요? 현재 기록도 복원 전 보관본으로 남깁니다.",
        )
      )
        return;
      try {
        runtime.stop();
        state = store.recoverPrevious();
        lastSaved = Core.clone(state);
        dirty = false;
        runtime.reset();
        source = "primary";
        stale = false;
        tab = "storage";
        notice =
          "이전 자동 저장을 복원했습니다. 복원 직전 기록도 보관했습니다.";
        error = "";
        render();
        toggleField();
      } catch (e) {
        error = e.message;
        render();
      }
    });
    on("#protect-storage", async () => {
      try {
        const granted = await navigator.storage.persist();
        notice = granted
          ? "브라우저 저장 보호가 허용되었습니다. 기기 이동을 위해 파일 백업도 보관하세요."
          : "브라우저에서 저장 보호를 허용하지 않았습니다. 진행은 계속 저장되며 파일 백업을 보관할 수 있습니다.";
        render();
      } catch (e) {
        error = "저장 보호 요청을 처리하지 못했습니다. " + e.message;
        render();
      }
    });
    on("#reload-save", load);
    on("#stale-reload", load);
    root.querySelectorAll("[data-raw]").forEach((b) =>
      b.addEventListener("click", () => {
        try {
          const data = store.raw(b.dataset.raw);
          if (data === null) throw Error("원본이 없습니다.");
          download(b.dataset.raw + ".txt", data);
        } catch (e) {
          error = e.message;
          render();
        }
      }),
    );
    on("#recover-backup", () => {
      if (
        !confirm("손상된 주 저장은 사전 보관하고, 확인한 백업으로 복원할까요?")
      )
        return;
      try {
        state = store.recoverBackup();
        lastSaved = Core.clone(state);
        dirty = false;
        runtime.reset();
        source = "primary";
        stale = false;
        notice =
          "백업을 복원했습니다. 이전 원본은 사전 보관함에 남아 있습니다.";
        error = "";
        render();
      } catch (e) {
        error = e.message;
        render();
      }
    });
    on("#new-campaign", () => {
      if (
        !confirm(
          "현재 본부와 이 브라우저에 보관한 OVERWATCH 백업·복원 기록을 모두 삭제하고 처음부터 시작할까요?",
        )
      )
        return;
      try {
        const fresh = Core.createCampaign({ id: id() });
        OverwatchStaff.upgrade(fresh);
        fresh.fieldPreferences.presentation = 2;
        fresh.fieldPreferences.view = "illustrated";
        state = store.reset(fresh);
        unsavedRecovery = null;
        hqRecruitmentOpen = false;
        hqDirtyTicks = 0;
        hqAutomationFailed = false;
        lastSaved = Core.clone(state);
        dirty = false;
        runtime.reset();
        selectedPerson = null;
        source = "primary";
        tab = "headquarters";
        stale = false;
        notice =
          "기존 본부와 보관 기록을 초기화했습니다. 새 본부에서 처음부터 시작합니다.";
        error = "";
        render();
      } catch (e) {
        error = e.message;
        render();
      }
    });
    root
      .querySelector("#import-save")
      ?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 32 * 1024 * 1024) {
          error = "백업 파일은 32MiB 이하여야 합니다.";
          render();
          return;
        }
        try {
          const text = await file.text();
          store.parseImport(text);
          if (
            !confirm("현재 OVERWATCH 기록을 보관하고 이 백업으로 복원할까요?")
          )
            return;
          state = store.importSave(text);
          lastSaved = Core.clone(state);
          dirty = false;
          runtime.reset();
          selectedPerson = null;
          source = "primary";
          stale = false;
          tab = "storage";
          notice = "백업을 가져왔습니다. 이전 저장은 사전 보관함에 있습니다.";
          error = "";
          render();
        } catch (err) {
          error = "가져오기 실패: " + err.message;
          render();
        }
      });
    root
      .querySelector("#reduced-motion")
      ?.addEventListener("change", (e) =>
        commit((s) => (s.settings.reducedMotion = e.target.checked)),
      );
    on("#version-check", () => updates.check(true));
  }
  window.addEventListener("keydown", (e) => {
    if (!selectedPerson) return;
    if (e.key === "Escape") {
      selectedPerson = null;
      render();
      return;
    }
    if (e.key === "Tab") {
      const dialog = root.querySelector(".personnel-dossier"),
        items = Array.from(
          dialog?.querySelectorAll(
            "button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href]",
          ) || [],
        ).filter((el) => el.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        e.preventDefault();
        last?.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        e.preventDefault();
        first?.focus();
      }
    }
  });
  window.addEventListener("storage", (e) => {
    if (
      [OverwatchStorage.KEYS.primary, OverwatchStorage.KEYS.backup].includes(
        e.key,
      ) ||
      e.key === null
    ) {
      try {
        const latest = store?.load();
        if (
          latest?.source === "primary" &&
          lastSaved &&
          JSON.stringify(latest.state) === JSON.stringify(lastSaved)
        )
          return;
      } catch {}
      stale = true;
      runtime.stop();
      render();
    }
  });
  setInterval(() => runtime.pump(!document.hidden && !stale), 40);
  let lastHQTick = performance.now(),
    hqDirtyTicks = 0,
    hqAutomationFailed = false;
  setInterval(() => {
    const now = performance.now(),
      gap = now - lastHQTick;
    lastHQTick = now;
    if (
      gap > 2500 ||
      document.hidden ||
      stale ||
      source !== "primary" ||
      !state ||
      hqAutomationFailed ||
      state.activeMission ||
      state.commandExercise?.status === "running" ||
      (!OverwatchStaff.trainingEnabled(state) &&
        !OverwatchStaff.personnelEnabled(state))
    )
      return;
    try {
      const signature =
        state.activities.map((a) => a.id + ":" + a.status).join("|") +
        JSON.stringify(state.squads);
      if (!OverwatchStaff.manageHeadquarters(state, 60)) return;
      dirty = true;
      hqDirtyTicks++;
      const after =
        state.activities.map((a) => a.id + ":" + a.status).join("|") +
        JSON.stringify(state.squads);
      if (hqDirtyTicks >= 5 || signature !== after) {
        saveRuntime();
        hqDirtyTicks = 0;
      }
      if (signature !== after) render();
      else {
        OverwatchStaffUI.refreshTraining?.(root, state);
        for (const node of root.querySelectorAll("[data-activity]")) {
          const a = state.activities.find(
            (a) => a.id === node.dataset.activity,
          );
          const bar = node.querySelector("progress");
          if (a && bar) bar.value = a.workedSeconds;
        }
        const clock = root.querySelector("[data-live-clock]");
        if (clock)
          clock.textContent =
            "본부 " + PersonnelUI.timestamp(state.clock.elapsedSeconds);
      }
    } catch (e) {
      hqAutomationFailed = true;
      rollbackRuntime(e);
      error =
        "교관 자동 관리가 중단되었습니다. 마지막 저장을 유지합니다. " +
        e.message;
      render();
    }
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseField();
    else toggleField();
  });
  window.addEventListener("pagehide", pauseField);
  window.addEventListener("pageshow", () => {
    if (!document.hidden) toggleField();
  });
  window.addEventListener("beforeunload", () => {
    if (dirty)
      try {
        saveRuntime();
      } catch {}
  });
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        state?.commandExercise?.status === "running" &&
        event.target.closest("button,select") &&
        !event.target.closest("[data-overwatch-audio]")
      )
        OverwatchAudio.startOnGesture?.();
    },
    { passive: true },
  );
  load();
  updates.check();
})();
