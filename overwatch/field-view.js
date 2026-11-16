/* 2D and 3D both consume OverwatchCommand.frame, never truth/world actors. */
(function (root) {
  "use strict";
  const D = root.OverwatchCommand,
    B = root.OverwatchBattle,
    R = root.OverwatchFieldRenderer,
    esc = (x) =>
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
      ),
    part = {
      head: "머리",
      chest: "흉부",
      abdomen: "복부",
      leftArm: "왼팔",
      rightArm: "오른팔",
      leftLeg: "왼다리",
      rightLeg: "오른다리",
    },
    num = (x) => Math.round(x),
    stamp = (t) =>
      String(Math.floor(t / 60)).padStart(2, "0") +
      ":" +
      String(t % 60).padStart(2, "0");
  let follow2D = false,
    lastFrame = null,
    selection = null,
    rangeIds = new Set(),
    rangeExercise = null;
  const currentRenderer = () =>
    R.get() || root.OverwatchIllustratedRenderer?.get();
  function syncRanges(node) {
    currentRenderer()?.setRange?.([...rangeIds]);
    for (const button of node.querySelectorAll("[data-field-range]")) {
      const active = rangeIds.has(button.dataset.fieldRange);
      button.setAttribute("aria-pressed", String(active));
      button.textContent = active ? "범위 표시 중" : "시야·사거리";
    }
    const tools = node.querySelector(".field-range-tools");
    if (tools) tools.hidden = rangeIds.size === 0;
    const summary = node.querySelector("[data-range-summary]");
    if (summary)
      summary.textContent = rangeIds.size
        ? "선택 " +
          rangeIds.size +
          "명 · 점선: 사거리 / 부채꼴: 탐지 시야 / 가는 점선: 식별 · 건물·지형에 따라 실제 시야 제한"
        : "시야·사거리: 대원 패널에서 여러 명 선택 가능";
  }
  function rangeMarkup(f) {
    return f.friends
      .filter((u) => rangeIds.has(u.id))
      .map((u, i) => {
        const color = [
            "#55ddff",
            "#ffd166",
            "#a4f28b",
            "#e6a6ff",
            "#ff91a4",
            "#a6cbff",
          ][i % 6],
          r = u.visionRange || 200,
          a = (u.heading || 0) - (u.visionHalfAngle || 0.5),
          b = (u.heading || 0) + (u.visionHalfAngle || 0.5);
        return (
          '<g data-range-overlay fill="none" stroke="' +
          color +
          '" stroke-width="3" vector-effect="non-scaling-stroke"><circle cx="' +
          u.x +
          '" cy="' +
          u.y +
          '" r="' +
          (u.weapon?.range || 0) +
          '" stroke-dasharray="8 5"/><path d="M' +
          u.x +
          " " +
          u.y +
          " L" +
          (u.x + Math.cos(a) * r) +
          " " +
          (u.y + Math.sin(a) * r) +
          " A" +
          r +
          " " +
          r +
          " 0 0 1 " +
          (u.x + Math.cos(b) * r) +
          " " +
          (u.y + Math.sin(b) * r) +
          ' Z" fill="' +
          color +
          '18"/><circle cx="' +
          u.x +
          '" cy="' +
          u.y +
          '" r="' +
          (u.identificationRange || 0) +
          '" stroke-dasharray="2 5"/></g>'
        );
      })
      .join("");
  }
  function paintSelection(rootNode) {
    const form = rootNode.querySelector("[data-field-command]");
    const caption = rootNode.querySelector("[data-field-target]");
    if (caption)
      caption.textContent = selection
        ? "관심 구역 지정됨 · 세부 진지는 관측수가 판단"
        : "관측수 자율 판단 · 지도 선택은 선택 사항";
    currentRenderer()?.setTarget?.(selection);
    const svg = rootNode.querySelector(".field-viewport svg");
    svg?.querySelector("[data-target-marker]")?.remove();
    if (svg && selection) {
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("cx", selection.x);
      circle.setAttribute("cy", selection.y);
      circle.setAttribute("r", "14");
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", "#f8e7ae");
      circle.setAttribute("stroke-width", "3");
      circle.setAttribute("data-target-marker", "");
      svg.appendChild(circle);
    }
  }
  function zoom2D(rootNode, factor) {
    const svg = rootNode.querySelector(".field-viewport svg");
    if (!svg) return;
    const b = svg.viewBox.baseVal,
      w = Math.max(40, Math.min(1600, b.width * factor)),
      h = (w * 2) / 3;
    svg.setAttribute(
      "viewBox",
      [b.x + b.width / 2 - w / 2, b.y + b.height / 2 - h / 2, w, h].join(" "),
    );
  }
  function followFlat(svg, f) {
    const known = f.friends.filter(
      (u) => !u.home && !u.stale && (!u.health || u.health.alive),
    );
    if (!svg || !known.length) return;
    const b = svg.viewBox.baseVal,
      x = known.reduce((n, u) => n + u.x, 0) / known.length,
      y = known.reduce((n, u) => n + u.y, 0) / known.length;
    svg.setAttribute(
      "viewBox",
      [x - b.width / 2, y - b.height / 2, b.width, b.height].join(" "),
    );
  }
  function map2D(f) {
    return (
      '<svg viewBox="0 0 ' +
      f.map.width +
      " " +
      f.map.height +
      '" role="img" aria-label="3D와 같은 본부 수신 정보의 2D 전술지도"><rect width="' +
      f.map.width +
      '" height="' +
      f.map.height +
      '" fill="#e6edde"/>' +
      f.map.heights
        .map(
          (h) =>
            '<g><circle cx="' +
            h.x +
            '" cy="' +
            h.y +
            '" r="' +
            h.r +
            '" fill="#c1d1b1"/><text x="' +
            h.x +
            '" y="' +
            (h.y - 60) +
            '" text-anchor="middle" fill="#6c8060" font-size="24">' +
            esc(h.name) +
            "</text></g>",
        )
        .join("") +
      f.map.buildings
        .map(
          (b) =>
            '<rect x="' +
            b[0] +
            '" y="' +
            b[1] +
            '" width="' +
            (b[2] - b[0]) +
            '" height="' +
            (b[3] - b[1]) +
            '" fill="#a6afa0"/>',
        )
        .join("") +
      '<rect x="' +
      (f.map.base.x - 3) +
      '" y="' +
      (f.map.base.y - 3) +
      '" width="6" height="6" fill="#637b5c"/>' +
      (f.map.covers || [])
        .map(
          (c) =>
            '<rect x="' +
            (c.x - c.w / 2) +
            '" y="' +
            (c.y - c.h / 2) +
            '" width="' +
            c.w +
            '" height="' +
            c.h +
            '" fill="#7d7f6b"/>',
        )
        .join("") +
      f.contacts
        .filter((c) => !c.expired)
        .map(
          (c) =>
            '<path d="M' +
            c.x +
            " " +
            (c.y - 10) +
            'l10 10-10 10-10-10z" fill="' +
            (c.classification === "armed-person" ? "#ad7555" : "#b0a589") +
            '" opacity="' +
            Math.max(0.15, c.confidence) +
            '"/>',
        )
        .join("") +
      [...f.friends, ...(f.supportActors || [])]
        .filter((u) => !u.boardedBy && !u.home && !u.waitingForDeployment)
        .map(
          (u) =>
            '<g opacity="' +
            (u.stale ? 0.4 : 1) +
            '"><path d="M' +
            (u.x - 0.75) +
            " " +
            (u.y - 1.2) +
            'h1.5v2.4h-1.5z" fill="' +
            (u.role === "observer" ? "#52765c" : "#547a9c") +
            '" stroke="white" stroke-width=".3"/><title>' +
            esc(u.name) +
            " · " +
            u.age +
            '초 전 보고</title><text x="' +
            u.x +
            '" y="' +
            (u.y - 3.5) +
            '" text-anchor="middle" fill="#eff7ef" stroke="#17291e" stroke-width="0.8" paint-order="stroke" font-size="' +
            (f.map.width < 500 ? 3.2 : 7) +
            '">' +
            esc(u.name) +
            " · " +
            (u.role === "sniper"
              ? "저격수"
              : u.role === "observer"
                ? "관측수"
                : u.roleLabel ||
                  (u.role === "medic" ? "의무요원" : "기관 보병")) +
            "</text></g>",
        )
        .join("") +
      (f.transports || [])
        .map(
          (t) =>
            '<g transform="translate(' +
            t.x +
            " " +
            t.y +
            ") rotate(" +
            ((t.heading || 0) * 180) / Math.PI +
            ')"><rect x="-6" y="-2" width="12" height="4" fill="#647961"/><title>' +
            esc(t.type) +
            " · " +
            t.manifest.length +
            "명</title></g>",
        )
        .join("") +
      rangeMarkup(f) +
      "</svg>"
    );
  }
  function healthBody(u) {
    const wounds = u.health?.wounds || [],
      color = (p) => (wounds.some((w) => w.part === p) ? "#c57266" : "#d6e0d0");
    return (
      '<svg viewBox="0 0 70 135" aria-label="부위별 부상 표시"><circle cx="35" cy="15" r="10" fill="' +
      color("head") +
      '"/><rect x="23" y="29" width="24" height="34" rx="5" fill="' +
      color("chest") +
      '"/><rect x="24" y="65" width="22" height="18" rx="4" fill="' +
      color("abdomen") +
      '"/><path d="M19 31l-8 45h9l7-43z" fill="' +
      color("leftArm") +
      '"/><path d="M51 31l8 45h-9l-7-43z" fill="' +
      color("rightArm") +
      '"/><path d="M24 85h10l-3 43H20z" fill="' +
      color("leftLeg") +
      '"/><path d="M36 85h10l4 43H39z" fill="' +
      color("rightLeg") +
      '"/></svg>'
    );
  }
  function roster(f) {
    return f.friends.length
      ? f.friends
          .map(
            (u) =>
              '<article class="field-person" data-field-person="' +
              esc(u.id) +
              '">' +
              healthBody(u) +
              "<div><strong>" +
              esc(u.name) +
              (u.stale
                ? '<span class="field-stale">마지막 수신 ' +
                  Math.floor(u.age / 60) +
                  "분 전 · 현재 상태 미확인</span>"
                : "") +
              " <small>" +
              esc(u.callsign) +
              (u.assignmentLabel ? " · " + esc(u.assignmentLabel) : "") +
              "</small></strong><p>" +
              (u.role === "observer" ? "관측수" : "저격수") +
              " · " +
              (u.stale ? "최종 보고: " : "") +
              esc(
                u.pose === "aid"
                  ? "처치 중"
                  : u.pose === "down"
                    ? "행동 불능"
                    : u.pose === "dead"
                      ? "생체 신호 소실"
                      : {
                          holding: "위치 유지",
                          moving: "이동",
                          climbing: "옥상 계단 이동",
                          covering: "경계·사격 준비",
                          spacing: "간격 조정",
                          "first-aid": "응급처치",
                          carrying: "조원 운반",
                          carried: "후송 운반 중",
                          "aid-approach": "부상자 접근",
                          wounded: "부상",
                          observing: "관측",
                        }[u.state] || u.state,
              ) +
              (u.roofId ? " · 옥상 진지" : "") +
              "</p><p>" +
              ((u.health?.wounds || [])
                .map(
                  (w) =>
                    esc(part[w.part]) +
                    " " +
                    esc(w.type) +
                    " · " +
                    (w.treated ? "처치 완료" : "미처치"),
                )
                .join("<br>") || "부상 보고 없음") +
              "</p><details data-field-unit-extra><summary>장비·생체 수신 정보</summary><small>" +
              (u.weapon?.reloadUntil != null && u.weapon.reloadUntil > f.time
                ? "재장전 중 · "
                : "") +
              esc(u.weapon?.name || "장비 보고 대기") +
              (u.weapon?.range
                ? " · 유효 사거리 " + u.weapon.range + "m"
                : "") +
              (u.weapon
                ? " · 장전 " +
                  u.weapon.loaded +
                  "/" +
                  u.weapon.capacity +
                  " · 예비 " +
                  u.weapon.magazines.length +
                  "탄창 / " +
                  u.weapon.magazines.reduce((a, b) => a + b, 0) +
                  "발"
                : "") +
              "</small><small>탐지 시야 " +
              Math.round(u.visionRange || 0) +
              "m · 식별 " +
              Math.round(u.identificationRange || 0) +
              "m</small><small>" +
              (u.health
                ? "혈액량 추정 " +
                  num(u.health.bloodMl) +
                  "mL · 의식 " +
                  (u.health.conscious ? "유지" : "소실")
                : "생체 정보 수신 대기") +
              " · " +
              u.age +
              "초 전" +
              (u.stale ? " · 통신 갱신 지연" : "") +
              '</small></details><div class="field-person-actions"><button data-field-focus="' +
              esc(u.id) +
              '">대원 보기</button><button data-field-range="' +
              esc(u.id) +
              '">시야·사거리</button></div></div></article>',
          )
          .join("")
      : "<p>텔레메트리 수신 대기. 아직 조원 위치를 본부에 공개하지 않았습니다.</p>";
  }
  function contacts(f) {
    const labels = {
      unknown: "미확인 인원",
      "armed-person": "무장 인원",
      "unarmed-person": "비무장 인원",
      "friendly-person": "지원 아군",
    };
    return (
      f.contacts
        .filter((c) => !c.expired)
        .map(
          (c) =>
            '<article class="field-contact"><strong>' +
            esc(
              c.specialty === "sniper"
                ? "저격수 식별"
                : labels[c.classification] || "인원 관측",
            ) +
            "</strong><small>" +
            esc(
              {
                regular: "정규군",
                insurgent: "반군",
                allied: "지원 아군",
                civilian: "민간인",
              }[c.faction] || "소속 확인 중",
            ) +
            " · 신뢰 " +
            Math.round(c.confidence * 100) +
            "% · " +
            c.age +
            '초 전 보고</small><button data-field-focus="' +
            esc(c.id) +
            '">마지막 확인 위치 보기</button></article>',
        )
        .join("") ||
      '<p class="muted">관측 보고 대기 · 미확인 적의 위치는 표시하지 않습니다.</p>'
    );
  }
  function radio(f) {
    return f.radio
      .slice(-60)
      .reverse()
      .map(
        (r) =>
          "<li><small>" +
          stamp(r.createdAt) +
          " · " +
          esc(r.from.name) +
          " [" +
          esc(r.from.callsign) +
          "] → " +
          esc(r.to.name) +
          "</small><p>" +
          esc(r.body) +
          "</p><small>" +
          (r.deliveredAt === null
            ? "전달·회신 대기"
            : "전달 " + stamp(r.deliveredAt)) +
          " · 사건 " +
          esc(r.eventId) +
          "</small></li>",
      )
      .join("");
  }
  function result(f) {
    if (f.mission)
      return (
        root.OverwatchMissionUI.result(f.mission.report) +
        (f.status === "ended"
          ? "<button data-field-clear-contract>작전 검토 종료</button>"
          : "")
      );
    const r = f.battle?.result;
    if (!r) return "";
    return (
      '<section class="panel"><h2>모의 전장 결과</h2><p>' +
      (r.returned
        ? "생존 인원 실제 집결지 복귀 완료"
        : "통제 종료 · 집결지 복귀 미완료") +
      " · 목표 " +
      (r.objective ? "달성" : "미달성") +
      " · 사격 " +
      r.shots +
      '회</p><p class="muted">연습 판정입니다. 본부의 영구 사망·치료·재고·보수는 변경하지 않았습니다.</p>' +
      r.roster
        .map(
          (u) =>
            "<p>" +
            esc(u.name) +
            " · " +
            (u.health.alive ? "생존" : "연습 전사 판정") +
            " · 사격 " +
            u.weapon.spent +
            "발 · 부상 " +
            u.health.wounds.length +
            "건 · " +
            (u.extracted ? "복귀" : "현장 잔류") +
            "</p>",
        )
        .join("") +
      "</section>"
    );
  }
  function renderBase(s, { editable = true, playing = false } = {}) {
    if (![4, 5].includes(s?.schemaVersion))
      return '<section class="panel">본부 저장을 복구한 뒤 전장을 열 수 있습니다.</section>';
    const f = D.frame(s),
      battle = f?.battle,
      active = battle && f.status === "running";
    return (
      '<section class="page-title"><span class="eyebrow">TRAINING CONTROL</span><h1>저격조 모의 훈련</h1><p>교관이 과업을 통제하는 실시간 훈련입니다. 관측수와 저격수의 행동을 관전하며 연습 부상·전사는 실전 인사 손실로 반영하지 않습니다.</p></section>' +
      (!s?.commandExercise?.mission && (!battle || !active)
        ? '<section class="panel"><h2>전장 연습 편성</h2><p>현재 편성한 저격조를 사용합니다. 정찰은 무장 인원 2개 접촉 식별, 위협 차단은 현장 무장 인원의 행동 중지를 확인한 뒤 집결지로 복귀합니다. 훈련에는 계약 기관의 실전 수송·지원이 출동하지 않습니다.</p><label class="field-label">전투지도<select data-field-map><option value="ridge-field">능선·물류 단지</option><option value="command-range">이전 지휘 훈련장</option><option value="urban-quarter">구도심 주거지</option><option value="urban-modern">신도심 업무지구</option><option value="urban-port">항만·물류 지구</option><option value="urban-market">시장·광장 지구</option></select></label><label class="field-label">연습 과업<select data-field-scenario><option value="support">지원 아군·민간인 엄호</option><option value="recon">능선 정찰·감시</option><option value="interdiction">위협 차단·복귀</option></select></label><button data-field-start' +
          (!editable ||
          !s.squads.length ||
          s.commandExercise?.status === "running"
            ? " disabled"
            : "") +
          ">편성 저격조 모의 전장 시작</button></section>"
        : "") +
      (battle && f.map.id === "command-range" && active
        ? '<p class="notice">이전 훈련장 진행 중 · 훈련 종료 후 새 능선·시가지 지도를 선택할 수 있습니다.</p>'
        : "") +
      (battle
        ? '<div class="field-layout"><section><div class="panel field-stage" data-field-stage><div class="field-stage-toolbar"><span data-field-clock>' +
          stamp(f.time) +
          '</span><div><select data-field-view-select aria-label="지도 표현"><option value="illustrated">입체 지도</option><option value="2d">전술도</option><option value="3d">3D 보기</option></select><button data-field-zoom=".65" aria-label="지도 확대">+</button><button data-field-zoom="1.5" aria-label="지도 축소">−</button><button data-overwatch-audio aria-pressed="false">소리 켜기</button><button data-field-follow>추적 고정</button><button data-field-overview>전체 지역</button><button data-field-fullscreen>지도 전체화면</button></div></div><div class="field-viewport" data-field-id="' +
          esc(s.campaignId + ":" + f.id) +
          '"></div><div class="field-range-tools"><span class="field-range-summary" data-range-summary></span><button data-field-range-clear>범위 해제</button></div><div class="field-stage-caption">본부는 임무 지시 · 세부 이동은 관측수 판단</div>' +
          (active
            ? '<div class="field-quick-orders"><select data-field-quick-team aria-label="저격조 선택">' +
              f.squads
                .map((q) => "<option>" + esc(q.callsign) + "</option>")
                .join("") +
              "</select>" +
              (s.commandStaff?.delegated &&
              root.OverwatchStaff?.authority(s, s.commandExercise)
                ? '<span class="delegated-label">작전권 위임 · 관전 중</span>'
                : [
                    ["cover", "아군 엄호"],
                    ["recon", "정찰"],
                    ["hold", "경계"],
                    ["withdraw", "전체 철수"],
                  ]
                    .map(
                      ([k, v]) =>
                        '<button data-field-quick="' +
                        k +
                        '"' +
                        (!editable ? " disabled" : "") +
                        ">" +
                        v +
                        "</button>",
                    )
                    .join("")) +
              '<p class="field-target-hint" data-field-target>관측수 자율 판단 · 지도 선택은 선택 사항</p><button type="button" data-field-clear-target>관심 구역 해제</button></div>'
            : "") +
          '</div><section class="panel field-comms"><div class="personnel-section-title"><h2>현장 무전</h2><span class="status-pill">LIVE COMMS</span><label class="field-audio-volume">음량<input data-overwatch-volume type="range" min="0" max="100" value="35" aria-label="전장 효과음 음량"></label><a class="audio-credits" href="audio/credits.html" target="_blank" rel="noopener">음원</a></div><ol class="field-radio" data-field-radio></ol></section><section class="panel"><div class="field-controls">' +
          (active
            ? [1, 2, 4]
                .map(
                  (v) =>
                    '<button data-field-speed="' +
                    v +
                    '"' +
                    (!editable ? " disabled" : "") +
                    ">" +
                    v +
                    "×</button>",
                )
                .join("") +
              "<button data-field-end" +
              (!editable ? " disabled" : "") +
              ">연습 통제 종료</button>"
            : "<span>연습 종료</span>") +
          "</div><p data-field-status>" +
          esc(f.pauseReason || "본부 명령 대기") +
          "</p><p data-field-weather></p><p data-field-objective>본부 수신 목표: " +
          (battle.objective ? "확인 완료 · 복귀 필요" : "관측·교전 보고 대기") +
          '</p><p class="muted">명령을 보내면 관측수가 판단해 이동·관측·교전을 이어갑니다. 본부·장비 화면에서도 작전은 계속됩니다. 백그라운드에서 돌아오면 자동으로 이어집니다. 2D/3D 전환은 전장 상태를 다시 생성하지 않습니다.</p>' +
          '<p class="muted">교전·사격 보류·은밀 회피는 관측수가 현장 정보를 보고 판단합니다.</p>' +
          "</section><div data-field-result>" +
          result(f) +
          '</div></section><aside><section class="panel"><h2>조원 상태 · 수신 정보</h2><div data-field-roster>' +
          roster(f) +
          '</div></section><section class="panel"><h2>관측 접촉</h2><div data-field-contacts>' +
          contacts(f) +
          "</div></section></aside></div>"
        : "")
    );
  }
  function render(s, opts) {
    const mode =
        opts?.mode || (s.ui.tab === "command" ? "training" : "operation"),
      isMission = !!s.commandExercise?.mission;
    if (mode === "operation" && !isMission)
      return '<section class="page-title"><h1>실전 작전 관제</h1><p>실전 계약과 작전통제관의 현장 지휘를 확인합니다.</p></section><section class="panel"><h2>진행 중인 실전 작전 없음</h2><p>작전 의뢰에서 계약을 승인하고 출격하세요. 모의 훈련은 훈련 관제에서 확인할 수 있습니다.</p><button data-tab="contracts">작전 의뢰·승인</button><button data-tab="command">훈련 관제</button></section>';
    if (mode === "training" && isMission)
      return (
        '<section class="page-title"><h1>훈련 관제</h1></section><section class="panel"><h2>모의 훈련 대기</h2><p>실전 작전과 훈련은 동시에 진행하지 않습니다. 실전 현장과 복귀 결과는 작전 관제에서 확인하세요.</p><button data-tab="field">실전 작전 관제</button>' +
        (s.commandExercise.status === "ended"
          ? "<button data-field-clear-contract>실전 검토 종료·훈련 준비</button>"
          : "") +
        "</section>"
      );
    let html = renderBase(s, opts);
    const e = s?.commandExercise;
    if (!e?.battle)
      return html + (root.OverwatchStaffUI?.render(s, opts?.editable) || "");
    const radio =
      html.match(
        /<section class="panel field-comms">[\s\S]*?<\/section>/,
      )?.[0] || "";
    if (radio) html = html.replace(radio, "");
    const support =
      (root.OverwatchStaffUI?.field(s) || "") +
      (e.mission ? root.OverwatchMissionUI.livePanel(s) : "");
    html = html.replace(
      "<aside>",
      '<aside><nav class="field-panel-tabs" aria-label="관제 패널"><button data-inspector="radio">무전</button><button data-inspector="roster">대원</button><button data-inspector="support">본부·지원</button></nav>' +
        radio +
        support,
    );
    html = html
      .replace(
        'class="field-layout"',
        'class="field-layout" data-inspector="' +
          (s.ui.fieldInspector || "radio") +
          '" data-battle-state="' +
          e.status +
          '"',
      )
      .replace(
        'class="panel field-comms"',
        'class="panel field-comms" data-inspector-panel="radio"',
      )
      .replace(
        'class="panel field-control-staff"',
        'class="panel field-control-staff" data-inspector-panel="support"',
      )
      .replace(
        'class="panel live-field-panel"',
        'class="panel live-field-panel" data-inspector-panel="support"',
      )
      .replace(
        '<section class="panel"><h2>조원 상태',
        '<section class="panel" data-inspector-panel="roster"><h2>조원 상태',
      )
      .replace(
        '<section class="panel"><h2>관측 접촉',
        '<section class="panel" data-inspector-panel="roster"><h2>관측 접촉',
      );
    if (e.mission)
      html = html
        .replace(
          /<section class="page-title">[\s\S]*?<\/section>/,
          '<section class="page-title"><span class="eyebrow">LIVE OPERATION</span><h1>실전 작전 관제 · ' +
            esc(e.mission.contract.title) +
            "</h1></section>",
        )
        .replace(
          /<section class="panel"><h2>전장 연습 편성[\s\S]*?<\/section>/,
          "",
        )
        .replace("연습 통제 종료", "작전 중단·철수")
        .replace("연습 종료", "실전 작전 종료");
    return html;
  }
  function refresh(rootNode, s, { playing = false } = {}) {
    const f = D.frame(s);
    if (!f?.battle) return;
    if (rangeExercise !== f.id) {
      rangeExercise = f.id;
      rangeIds.clear();
    }
    if (f.mission) root.OverwatchMissionUI.refresh(rootNode, s);
    lastFrame = f;
    const set = (selector, text) => {
      const el = rootNode.querySelector(selector);
      if (el && el.textContent !== text) el.textContent = text;
    };
    set("[data-field-clock]", stamp(f.time) + " / " + f.battle.speed + "×");
    set(
      "[data-field-weather]",
      "주간 · " +
        (f.battle.weather.timeOfDay === "overcast" ? "흐림" : "맑음") +
        " · 횡풍 " +
        f.battle.weather.wind.toFixed(1) +
        "m/s · 시계 " +
        Math.round(f.battle.weather.visibility * 100) +
        "%",
    );
    set(
      "[data-field-status]",
      f.status === "running"
        ? (f.mission?.waitReason ||
            "실시간 작전 진행 · 보고 수신 중에도 계속 진행") +
            (f.friends.some((u) => u.stale)
              ? " · 통신 지연: 대원 카드는 마지막 보고입니다."
              : "")
        : "작전 종료",
    );
    set(
      "[data-field-objective]",
      "본부 수신 목표: " +
        (f.battle.objective ? "확인 완료 · 복귀 필요" : "관측·교전 보고 대기"),
    );
    set("[data-field-play]", !f.paused && playing ? "일시정지" : "재생");
    const people = rootNode.querySelector("[data-field-roster]");
    if (f.mission) root.OverwatchMissionUI.refresh(rootNode, s);
    if (people) {
      const text = roster(f);
      if (people.innerHTML !== text) {
        const expanded = [...people.querySelectorAll("[data-field-person]")]
          .filter((n) => n.querySelector("details")?.open)
          .map((n) => n.dataset.fieldPerson);
        people.innerHTML = text;
        for (const n of people.querySelectorAll("[data-field-person]"))
          if (expanded.includes(n.dataset.fieldPerson))
            n.querySelector("details")?.setAttribute("open", "");
      }
    }
    const contactList = rootNode.querySelector("[data-field-contacts]");
    if (contactList) {
      const html = contacts(f);
      if (contactList.innerHTML !== html) {
        const top = contactList.scrollTop;
        contactList.innerHTML = html;
        contactList.scrollTop = top;
      }
    }
    const messages = rootNode.querySelector("[data-field-radio]");
    if (messages) {
      const key = f.radio.at(-1)?.id || "";
      if (messages.dataset.last !== key) {
        const old = messages.scrollTop;
        messages.innerHTML = radio(f);
        messages.scrollTop = old;
        messages.dataset.last = key;
      }
    }
    const res = rootNode.querySelector("[data-field-result]");
    if (res && f.status === "ended") res.innerHTML = result(f);
    syncRanges(rootNode);
    const viewport = rootNode.querySelector(".field-viewport");
    if (viewport) {
      if (s.fieldPreferences.view !== "2d") currentRenderer()?.update(f);
      else {
        const viewBox = viewport.querySelector("svg")?.getAttribute("viewBox");
        viewport.innerHTML = map2D(f);
        const svg = viewport.querySelector("svg");
        if (viewBox) svg.setAttribute("viewBox", viewBox);
        if (follow2D) followFlat(svg, f);
      }
    }
    paintSelection(rootNode);
    root.OverwatchAudio?.sync(f, { active: playing });
  }
  function mount(rootNode, s, { onFallback = () => {}, playing = false } = {}) {
    const f = D.frame(s),
      host = rootNode.querySelector(".field-viewport");
    if (f?.id !== lastFrame?.id) selection = null;
    if (!host || !f?.battle) {
      R.dispose();
      root.OverwatchIllustratedRenderer?.dispose();
      root.OverwatchAudio?.sync(f, { active: false });
      return;
    }
    if (s.fieldPreferences.view === "illustrated") {
      R.dispose();
      const A = root.OverwatchIllustratedRenderer;
      if (A.get()?.host !== host) {
        A.dispose();
        A.create(host, f);
      } else A.get().update(f);
    } else if (s.fieldPreferences.view === "3d") {
      root.OverwatchIllustratedRenderer?.dispose();
      if (R.get()?.host !== host) {
        R.dispose();
        host.replaceChildren();
        R.create(host, f, { onFallback });
      } else R.get().update(f);
    } else {
      R.dispose();
      root.OverwatchIllustratedRenderer?.dispose();
      host.innerHTML = map2D(f);
    }
    refresh(rootNode, s, { playing });
    syncRanges(rootNode);
  }
  function bind(
    rootNode,
    { state: s, editable, commit, execute = commit, play, onFallback },
  ) {
    const on = (sel, fn) =>
      rootNode.querySelector(sel)?.addEventListener("click", fn);
    if (!rootNode.dataset.fieldActions) {
      rootNode.dataset.fieldActions = "1";
      rootNode.addEventListener("click", (event) => {
        const button = event.target.closest(
          "[data-field-focus],[data-field-range]",
        );
        if (!button) return;
        const id = button.dataset.fieldFocus || button.dataset.fieldRange;
        if (
          ![
            ...(lastFrame?.friends || []),
            ...(lastFrame?.contacts || []).filter((c) => !c.expired),
          ].some((u) => u.id === id)
        )
          return;
        if (button.hasAttribute("data-field-focus"))
          currentRenderer()?.focus?.(id);
        else {
          if (rangeIds.has(id)) rangeIds.delete(id);
          else rangeIds.add(id);
          syncRanges(rootNode);
          if (!currentRenderer()) {
            const host = rootNode.querySelector(".field-viewport");
            if (host) host.innerHTML = map2D(lastFrame);
          }
        }
      });
    }
    on("[data-field-clear-contract]", () => {
      if (editable)
        commit((next) => {
          if (next.commandExercise?.status === "ended" && !next.activeMission)
            next.commandExercise = null;
        });
    });
    for (const button of rootNode.querySelectorAll(
      "[data-inspector] button[data-inspector]",
    ))
      button.addEventListener("click", () => {
        if (editable)
          commit((next) => {
            next.ui.fieldInspector = button.dataset.inspector;
          });
      });
    const quickTeam = rootNode.querySelector("[data-field-quick-team]");
    if (quickTeam) {
      quickTeam.value =
        s.ui.fieldCallsign || lastFrame?.squads[0]?.callsign || "ALPHA";
      quickTeam.dataset.fieldEditable = String(editable);
      quickTeam.addEventListener("change", () => {
        commit((next) => {
          next.ui.fieldCallsign = quickTeam.value;
        });
      });
    }
    for (const b of rootNode.querySelectorAll("[data-field-quick]"))
      b.addEventListener("click", () => {
        if (!editable) return;
        root.OverwatchAudio?.startOnGesture?.();
        const kind = b.dataset.fieldQuick,
          team = quickTeam?.value || lastFrame?.squads[0]?.callsign;
        execute((next) => {
          if (kind === "withdraw") return B.withdraw(next);
          next.commandExercise.battle.observerAutonomy = true;
          next.ui.fieldCallsign = team;
          D.issue(
            next,
            team,
            kind,
            ["cover", "recon"].includes(kind) ? selection : null,
          );
        });
      });
    on("[data-field-start]", () => {
      if (editable) root.OverwatchAudio?.startOnGesture?.();
      if (editable)
        execute((next) => {
          const why = root.OverwatchStaff?.ready(next, true);
          if (why) throw Error(why);
          return B.begin(next, {
            scenario: rootNode.querySelector("[data-field-scenario]").value,
            mapId: rootNode.querySelector("[data-field-map]").value,
          });
        });
    });
    on("[data-overwatch-audio]", () => root.OverwatchAudio.toggle());
    rootNode
      .querySelector("[data-overwatch-volume]")
      ?.addEventListener("input", (event) =>
        root.OverwatchAudio.setVolume(event.target.value),
      );
    root.OverwatchAudio?.controls();
    on("[data-field-play]", () => {
      if (editable) play();
    });
    on("[data-field-withdraw]", () => {
      if (editable) execute((next) => B.withdraw(next));
    });
    on("[data-field-end]", () => {
      if (
        editable &&
        confirm(
          s.commandExercise?.mission
            ? "작전을 중단하고 실제 철수·수송 절차를 요청할까요?"
            : "모의 전장을 통제 종료할까요? 집결지에 도착하지 않은 인원은 복귀 완료로 처리하지 않습니다.",
        )
      )
        commit((next) =>
          next.commandExercise.mission
            ? root.OverwatchMissions.requestReturn(next, { abort: true })
            : D.end(next, "control"),
        );
    });
    rootNode.querySelectorAll("[data-field-speed]").forEach((b) =>
      b.addEventListener("click", () => {
        if (editable)
          commit((next) => B.speed(next, Number(b.dataset.fieldSpeed)));
      }),
    );
    const viewSelect = rootNode.querySelector("[data-field-view-select]");
    if (viewSelect) {
      viewSelect.value = s.fieldPreferences.view;
      viewSelect.addEventListener("change", () => {
        if (editable)
          commit((next) => {
            next.fieldPreferences.view = viewSelect.value;
          });
      });
    }
    rootNode.querySelectorAll("[data-field-view]").forEach((b) =>
      b.addEventListener("click", () => {
        if (editable)
          commit((next) => (next.fieldPreferences.view = b.dataset.fieldView));
      }),
    );
    const pick = (p) => {
      if (quickTeam?.dataset.fieldEditable !== "true" || !p) return;
      if (root.OverwatchGeometry.blocked(p)) {
        const hint = rootNode.querySelector("[data-field-target]");
        if (hint)
          hint.textContent =
            "건물 밖의 관심 구역을 선택하세요. 세부 진지는 관측수가 결정합니다.";
        return;
      }
      selection = { x: p.x, y: p.y };
      paintSelection(rootNode);
    };
    currentRenderer()?.setPickHandler?.(pick);
    const viewport = rootNode.querySelector(".field-viewport");
    if (viewport && !viewport.dataset.pickBound) {
      viewport.dataset.pickBound = "1";
      viewport.addEventListener("click", (event) => {
        const svg = event.target.closest("svg");
        if (!svg || !svg.getScreenCTM()) return;
        const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
          svg.getScreenCTM().inverse(),
        );
        pick(p);
      });
    }
    on("[data-field-range-clear]", () => {
      rangeIds.clear();
      syncRanges(rootNode);
      if (!currentRenderer()) {
        const host = rootNode.querySelector(".field-viewport");
        if (host) host.innerHTML = map2D(lastFrame);
      }
    });
    on("[data-field-clear-target]", () => {
      selection = null;
      paintSelection(rootNode);
    });
    paintSelection(rootNode);
    rootNode
      .querySelectorAll("[data-field-zoom]")
      .forEach((b) =>
        b.addEventListener("click", () =>
          currentRenderer()
            ? currentRenderer().zoom(Number(b.dataset.fieldZoom))
            : zoom2D(rootNode, Number(b.dataset.fieldZoom)),
        ),
      );
    on("[data-field-follow]", () => {
      const follow = currentRenderer()
        ? currentRenderer().follow()
        : (follow2D = !follow2D);
      if (!currentRenderer() && follow2D && lastFrame)
        followFlat(rootNode.querySelector(".field-viewport svg"), lastFrame);
      rootNode.querySelector("[data-field-follow]").textContent = follow
        ? "추적 고정"
        : "자유 시점";
    });
    on("[data-field-overview]", () => {
      if (currentRenderer()) currentRenderer().overview();
      else {
        follow2D = false;
        rootNode
          .querySelector(".field-viewport svg")
          ?.setAttribute(
            "viewBox",
            "0 0 " + lastFrame.map.width + " " + lastFrame.map.height,
          );
      }
    });
    on("[data-field-fullscreen]", async () => {
      const stage = rootNode.querySelector(".field-layout"),
        full = !stage.classList.contains("field-fullscreen");
      stage.classList.toggle("field-fullscreen", full);
      rootNode.querySelector("[data-field-fullscreen]").textContent = full
        ? "전체화면 닫기"
        : "지도 전체화면";
      if (full) {
        try {
          await document.documentElement.requestFullscreen?.();
          await screen.orientation?.lock?.("landscape");
        } catch {}
      } else {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
        } catch {}
      }
      currentRenderer()?.resize();
    });
  }
  function closeMap() {
    const stage = document.querySelector(".field-fullscreen");
    if (!stage) return;
    stage.classList.remove("field-fullscreen");
    const button = stage.querySelector("[data-field-fullscreen]");
    if (button) button.textContent = "지도 전체화면";
    try {
      if (document.fullscreenElement)
        document.exitFullscreen()?.catch(() => {});
    } catch {}
    currentRenderer()?.resize();
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMap();
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) closeMap();
  });
  root.OverwatchFieldUI = {
    render,
    refresh,
    mount,
    bind,
    map2D,
    selectedPoint: () => (selection ? { ...selection } : null),
    focusSupport(id) {
      const t = lastFrame?.transports?.find((t) =>
        id ? t.id === id : t.type === "drone" && t.state !== "home",
      );
      if (!t) return false;
      if (currentRenderer()) currentRenderer().focus(t.id);
      else {
        const svg = document.querySelector(".field-viewport svg"),
          span = Math.min(lastFrame.map.height, 520);
        svg?.setAttribute(
          "viewBox",
          [t.x - span * 0.75, t.y - span * 0.5, span * 1.5, span].join(" "),
        );
      }
      return true;
    },
  };
})(typeof window === "undefined" ? globalThis : window);
