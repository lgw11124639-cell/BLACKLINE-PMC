(function () {
  "use strict";
  const VERSION = "2026.11.15.12",
    Core = OverwatchCore,
    P = OverwatchPersonnel,
    PersonnelUI = OverwatchPersonnelUI,
    CommandUI = OverwatchCommandUI,
    FieldUI = OverwatchFieldUI,
    MissionUI = OverwatchMissionUI,
    Battle = OverwatchBattle,
    root = document.getElementById("overwatch-root");
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
    ["personnel", "대원·저격조", "02"],
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
  let lastSaved = null,
    dirty = false;
  function rollbackRuntime(errorValue) {
    runtime.stop();
    OverwatchAudio.stop();
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
  }
  const runtime = OverwatchRealtime.create({
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
      FieldUI.refresh(root, state, { playing: true });
      OverwatchStaffUI.refresh(root, state);
      const liveClock = root.querySelector("[data-live-clock]");
      if (liveClock)
        liveClock.textContent =
          "본부 " + PersonnelUI.timestamp(state.clock.elapsedSeconds);
      return (
        state.commandExercise.status === "running" &&
        !state.commandExercise.paused
      );
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
        (!state.commandStaff || state.commandStaff.marketVersion !== 2)
      ) {
        const next = Core.clone(state);
        OverwatchStaff.upgrade(next);
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
      ready = state.members.filter(
        (m) => P.readiness(state, m) === null,
      ).length;
    return (
      '<section class="page-title"><span class="eyebrow">BLACKLINE / HEADQUARTERS</span><h1>작전 본부</h1><p>인원을 편성하고 작전을 승인하세요. 현장 운용은 작전통제관에게 위임할 수 있습니다.</p></section><section class="metrics">' +
      [
        ["본부 인원", state.members.length + " / 10"],
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
      OverwatchStaffUI.render(state, source === "primary" && !stale) +
      '<section class="panel operation-brief"><span class="eyebrow">OPERATIONS</span><h2>' +
      (active ? "전장 진행 중" : "다음 작전 준비") +
      "</h2><p>" +
      (active
        ? "작전통제관의 판단과 무전, 대원 상태를 관전할 수 있습니다."
        : "현장 저격조 2~6명과 본부 작전통제관을 편성하세요. 훈련에는 교관을 따로 배정할 수 있습니다.") +
      '</p><div class="inline-actions"><button data-tab="personnel">인원·편제</button><button data-tab="contracts">작전 승인</button><button data-tab="' +
      (active ? "field" : "command") +
      '">' +
      (active ? "작전 관제" : "훈련장") +
      '</button></div><div class="hq-terrain" aria-hidden="true"></div></section></div>'
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
    return (
      '<section class="page-title"><span class="eyebrow">SAVE & RECOVERY</span><h1>본부 기록 관리</h1><p>백업 파일을 내려받아 기기와 브라우저 사이에 진행을 옮길 수 있습니다.</p></section><section class="panel storage-summary"><div><span class="eyebrow">CURRENT RECORD</span><h2>' +
      esc(state?.headquarters.name || "복구 필요") +
      "</h2><p>" +
      esc(state?.campaignId || "읽을 수 있는 본부 기록 없음") +
      "</p><small>저장 revision " +
      (state?.revision ?? "—") +
      " · " +
      esc(state?.updatedAt || "저장 전") +
      '</small></div><span class="status-pill">' +
      {
        primary: "주 저장 정상",
        backup: "백업 확인 · 복구 필요",
        blocked: "저장 보호 중",
        empty: "저장 없음",
        migration: "저장 전환 필요",
      }[source] +
      '</span></section><div class="two-column"><section class="panel"><h2>백업과 복원</h2><div class="actions"><button id="export-save" ' +
      (!enabled ? "disabled" : "") +
      '>OVERWATCH 백업 내보내기</button><label class="file-button">백업 파일 가져오기<input id="import-save" type="file" accept=".json,.blz,application/json,text/plain"></label><button id="reload-save">저장 다시 불러오기</button>' +
      (source === "backup"
        ? '<button id="recover-backup">확인한 백업으로 주 저장 복구</button>'
        : "") +
      '</div><p class="muted">가져오기 전 기존 OVERWATCH 저장을 사전 보관합니다. PMC 백업은 새 본부 데이터로 가져오지 않습니다.</p></section><section class="panel"><h2>보관 원본</h2><div class="actions">' +
      [
        store?.keys.primary,
        store?.keys.backup,
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
      '> 화면 효과 줄이기</label><p class="muted">본부 활동을 진행하면 모든 활동과 계약 시간이 함께 흐릅니다. 재접속만으로 시간이 흐르지 않습니다. 모의 전장은 1·2·4배속을 지원하며 재접속·백그라운드 전환 시 정지합니다.</p></section><section class="panel caution"><h2>새 본부 기록 개설</h2><p>현재 OVERWATCH 기록은 개설 전 보관본으로 남깁니다. 기존 PMC 주 저장과 백업은 변경하지 않습니다.</p><button id="new-campaign" ' +
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
      wasFullscreen = !!root.querySelector(".field-fullscreen");
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
      '<header class="topbar"><a class="brand" href="#" data-tab="headquarters"><span class="brand-emblem" aria-hidden="true">B</span><span>BLACKLINE<small>OVERWATCH</small></span></a><div class="topbar-status"><span class="status-dot"></span><span data-live-clock>본부 ' +
      PersonnelUI.timestamp(state?.clock.elapsedSeconds || 0) +
      ' / 본부</span><button id="version-check" class="quiet">' +
      VERSION +
      '</button><button data-game-fullscreen aria-label="게임 전체화면">전체화면</button></div></header><div class="rotate-hint"><span>가로 화면 전용 · 기기를 옆으로 돌려주세요.</span><button data-game-fullscreen>전체화면</button></div><div class="workspace"><aside class="sidebar"><span class="eyebrow">COMMAND WORKSPACE</span><nav aria-label="본부 메뉴">' +
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
        ? '<div role="alert" class="notice error">' + esc(error) + "</div>"
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
      if (wasFullscreen) {
        root.querySelector(".field-layout")?.classList.add("field-fullscreen");
        const button = root.querySelector("[data-field-fullscreen]");
        if (button) button.textContent = "전체화면 닫기";
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
          commit((s) => (s.ui.tab = next));
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
          commit((s) => (s.ui.tab = next));
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
          "BLACKLINE-OVERWATCH-" + state.campaignId + ".json",
          store.exportSave(state),
        );
      } catch (e) {
        error = e.message;
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
          "기존 OVERWATCH 저장을 보관하고 새 본부를 개설할까요? PMC 저장은 그대로 유지합니다.",
        )
      )
        return;
      try {
        state = store.reset(Core.createCampaign({ id: id() }));
        lastSaved = Core.clone(state);
        dirty = false;
        runtime.reset();
        selectedPerson = null;
        source = "primary";
        tab = "headquarters";
        stale = false;
        notice =
          "새 본부를 개설했습니다. 이전 진행은 개설 전 보관본에 있습니다.";
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
        if (file.size > 8 * 1024 * 1024) {
          error = "백업 파일은 8MiB 이하여야 합니다.";
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
    on("#version-check", async () => {
      try {
        const r = await fetch("version.json?check=" + Date.now(), {
          cache: "no-store",
        });
        if (!r.ok) throw Error("HTTP " + r.status);
        const v = await r.json();
        notice =
          v.version === VERSION
            ? "최신 개발 빌드입니다."
            : "배포 버전 " +
              v.version +
              " · 새로고침하면 배포된 화면을 확인할 수 있습니다.";
        error = "";
      } catch (e) {
        error = "업데이트를 확인하지 못했습니다. " + e.message;
      }
      render();
    });
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
  setInterval(() => runtime.pump(!document.hidden && !stale), 100);
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
})();
