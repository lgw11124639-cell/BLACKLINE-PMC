(function () {
  "use strict";
  const VERSION = "2026.11.14.03",
    Core = OverwatchCore,
    P = OverwatchPersonnel,
    PersonnelUI = OverwatchPersonnelUI,
    CommandUI = OverwatchCommandUI,
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
    ["command", "지휘 훈련", "03"],
    ["contracts", "작전 의뢰", "04"],
    ["equipment", "장비고", "05"],
    ["records", "기록 보관함", "06"],
    ["storage", "저장 관리", "07"],
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
  const id = () =>
    globalThis.crypto?.randomUUID?.() ||
    "campaign-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  function load() {
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
            "본부를 3단계 지휘 저장으로 전환했습니다. 이전 주 저장·백업 원본은 변환 전 보관함에 있습니다.";
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
      tab = state?.ui.tab || "storage";
    } catch (e) {
      error = "저장소에 접근할 수 없습니다. " + e.message;
      source = "blocked";
      state = null;
      tab = "storage";
    }
    render();
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
      state = store.save(next, state.revision);
      error = "";
      render();
      return true;
    } catch (e) {
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
      '</p><span class="phase-note">현재 릴리스는 인원·편제·본부 활동과 관측수 지휘 훈련까지 연결되어 있습니다.</span></section>'
    );
  }
  function headquarters() {
    const members = state?.members || [],
      ready = members.filter((m) => m.status === "standby").length;
    return (
      '<section class="hq-hero"><div><span class="eyebrow">BLACKLINE / HEADQUARTERS</span><h1>관측하고, 판단하고,<br>명령한다.</h1><p>본부의 명령은 관측수를 통해 저격수에게 전달됩니다.<br>현장에서 확인된 정보가 판단의 기준입니다.</p><span class="build-tag">3단계 · 관측수 지휘 훈련</span></div><div class="terrain-preview" role="img" aria-label="기존 프로젝트에서 보존한 산악 전장 이미지"><span>보존된 전장 자산 / 실시간 전장 연결 전</span></div></section><section class="metrics" aria-label="본부 현황">' +
      [
        [
          "본부 대원",
          members.filter(
            (m) => !["deceased", "resigned", "retired"].includes(m.status),
          ).length + " / 10",
          "모집 시장에서 기간 계약",
        ],
        ["대기 인원", ready + "명", "저격수·관측수 상태 기준"],
        [
          "편성 저격조",
          (state?.squads.length || 0) + " / 3",
          "조당 관측수 1명 + 저격수 1명",
        ],
        [
          "운영자금",
          PersonnelUI.money(state?.headquarters.funds || 0),
          "급여·활동비 실제 장부 기준",
        ],
      ]
        .map(
          ([a, b, c]) =>
            "<article><small>" +
            a +
            "</small><strong>" +
            b +
            "</strong><span>" +
            c +
            "</span></article>",
        )
        .join("") +
      '</section><div class="two-column"><section class="panel"><div class="section-heading"><span class="eyebrow">CHAIN OF COMMAND</span><h2>저격조 지휘 구조</h2></div><ol class="command-chain"><li><b>본부 · 플레이어</b><span>임무·지역·관측·교전·철수 명령</span></li><li><b>관측수 · 현장 지휘관</b><span>명령 수신·판단·저격수 지휘·상황 보고</span></li><li><b>저격수</b><span>세부 지시 수행·사격 준비·생존 행동</span></li></ol><p class="muted">지휘 훈련에서 관측수의 명령 수신·판단·보고를 확인할 수 있습니다.</p></section><section class="panel"><span class="eyebrow">DEVELOPMENT STATUS</span><h2>현재 가능한 작업</h2><ul class="plain-list"><li>대원 모집·기간 계약·2인조 편성</li><li>훈련·휴식·진료·재활·공동 훈련</li><li>자금·활동·경력 저장과 이전 기록 보존</li><li>조 단위 명령·무전·제한 정보 지휘 훈련</li></ul><button data-tab="storage">저장 관리 열기 <span aria-hidden="true">↗</span></button><p class="muted">실제 계약 출격·실탄 교전·3D 전장은 후속 단계에서 연결합니다.</p></section></div>'
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
                }[k] +
                " 내려받기</button>"
            : "";
        })
        .join("") +
      '</div><p class="muted">손상된 파일도 원본 그대로 내보낼 수 있습니다.</p></section></div><section class="panel"><h2>표시 설정</h2><label class="setting"><input id="reduced-motion" type="checkbox" ' +
      (state?.settings.reducedMotion ? "checked" : "") +
      " " +
      (!enabled || source !== "primary" || stale ? "disabled" : "") +
      '> 화면 효과 줄이기</label><p class="muted">본부 활동을 진행하면 모든 활동과 계약 시간이 함께 흐릅니다. 재접속만으로 시간이 흐르지 않습니다. 실시간 전장 속도는 후속 단계에서 연결합니다.</p></section><section class="panel caution"><h2>새 본부 기록 개설</h2><p>현재 OVERWATCH 기록은 개설 전 보관본으로 남깁니다. 기존 PMC 주 저장과 백업은 변경하지 않습니다.</p><button id="new-campaign" ' +
      (!store ? "disabled" : "") +
      ">새 본부 기록 개설</button></section>"
    );
  }
  function render() {
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
    root.innerHTML =
      '<header class="topbar"><a class="brand" href="#" data-tab="headquarters"><span class="brand-emblem" aria-hidden="true">B</span><span>BLACKLINE<small>OVERWATCH</small></span></a><div class="topbar-status"><span class="status-dot"></span><span>본부 ' +
      PersonnelUI.timestamp(state?.clock.elapsedSeconds || 0) +
      ' / 전장 연결 전</span><button id="version-check" class="quiet">' +
      VERSION +
      '</button></div></header><div class="workspace"><aside class="sidebar"><span class="eyebrow">COMMAND WORKSPACE</span><nav aria-label="본부 메뉴">' +
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
      '</nav><div class="sidebar-foot">HQ → OBSERVER → SNIPER<br>PHASE 03 / COMMAND</div></aside><main id="main" tabindex="-1"><div class="breadcrumb">BLACKLINE / ' +
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
            CommandUI.render(state, {
              editable: source === "primary" && !stale,
            }),
          records,
          storage: storagePage,
          contracts: () =>
            phase(
              "PHASE 05",
              "작전 의뢰 연결 대기",
              "실제 목표·기관·제약·제공 수송 및 지원을 확인하고 계약하는 단계입니다. 현재 생성된 의뢰나 출격 기능은 없습니다.",
            ),
          equipment: () =>
            phase(
              "PHASE 02 / 06",
              "장비고 연결 대기",
              "개별 무기·탄창·의료품·통신기와 본부 재고를 연결할 예정입니다. 이전 장비 재고는 PMC 원본에 남아 있습니다.",
            ),
        }[tab] || storagePage
      )() +
      "<footer>BLACKLINE: OVERWATCH · 3단계 관측수 지휘 훈련 · 실제 계약·전투·3D는 후속 단계입니다.</footer></main></div>" +
      PersonnelUI.dossier(state, selectedPerson, {
        editable:
          source === "primary" &&
          !stale &&
          state?.commandExercise?.status !== "running",
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
    CommandUI.bind(root, {
      state,
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
      stale = true;
      render();
    }
  });
  load();
})();
