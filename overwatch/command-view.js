/* This view receives HQ projection only. It never reads world actors or local contacts. */
(function (root) {
  "use strict";
  const D = root.OverwatchCommand,
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
    n = (x) => Math.round(x),
    stamp = (t) =>
      String(Math.floor(t / 60)).padStart(2, "0") +
      ":" +
      String(t % 60).padStart(2, "0");
  const labels = {
      queued: "전달·회신 대기",
      acknowledged: "관측수 수신 확인",
      completed: "완료 보고 수신",
      superseded: "후속 명령 수신 확인",
      failed: "수행 불가 보고",
      cancelled: "훈련 종료",
    },
    states = {
      holding: "위치 유지",
      moving: "이동",
      spacing: "간격 조정",
      blocked: "경로 재평가 필요",
      observing: "관측",
      incapacitated: "행동 불능 판정",
    },
    types = {
      order: "본부 명령",
      ack: "수신·복창",
      position: "위치 보고",
      observation: "관측 보고",
      instruction: "조 내부 지시",
      complete: "수행 완료",
      ready: "준비 보고",
      urgent: "긴급 보고",
      request: "추가 지시 요청",
    };
  function friendMarkers(f) {
    const boxes = [];
    return f.friends
      .map((u, index) => {
        let label = null;
        for (const dy of [-18, 40, -48, 70, -78, 100])
          for (const dx of [18, -90]) {
            if (label) break;
            const p = {
              x: Math.max(12, Math.min(1100, u.x + dx)),
              y: Math.max(30, Math.min(770, u.y + dy)),
            };
            if (
              boxes.every(
                (b) =>
                  p.x + 80 < b.x ||
                  b.x + 80 < p.x ||
                  p.y + 8 < b.y - 24 ||
                  b.y + 8 < p.y - 24,
              )
            )
              label = p;
          }
        label = label || {
          x: Math.min(1100, u.x + 25),
          y: Math.max(30, u.y - 40 - index * 32),
        };
        boxes.push(label);
        return (
          '<g class="range-friend ' +
          (u.stale ? "stale" : "") +
          '" data-known-unit="' +
          esc(u.id) +
          '"><line x1="' +
          u.x +
          '" y1="' +
          u.y +
          '" x2="' +
          label.x +
          '" y2="' +
          label.y +
          '" stroke="#77916c" stroke-width="1"/><path d="M' +
          (u.x - 9) +
          " " +
          (u.y - 12) +
          'h18v24h-18z" fill="' +
          (u.role === "observer" ? "#44664f" : "#718b99") +
          '" stroke="#fff" stroke-width="3"/><text x="' +
          label.x +
          '" y="' +
          label.y +
          '" class="range-unit-label">' +
          esc(u.callsign.slice(0, 1)) +
          "·" +
          (u.role === "observer" ? "관" : "저") +
          "</text><title>" +
          esc(u.name) +
          " · " +
          esc(u.callsign) +
          " · " +
          esc(states[u.state] || u.state) +
          " · " +
          u.age +
          "초 전 위치</title></g>"
        );
      })
      .join("");
  }
  function map(f) {
    return (
      '<svg class="command-map" viewBox="0 0 1200 800" role="img" aria-label="본부에 전달된 정보만 표시하는 지휘 훈련 지도"><rect width="1200" height="800" fill="#edf1e6"/><defs><pattern id="range-grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="#cfd9c7" stroke-width="1"/></pattern></defs><rect width="1200" height="800" fill="url(#range-grid)"/>' +
      f.map.heights
        .map(
          (h) =>
            '<g><circle cx="' +
            h.x +
            '" cy="' +
            h.y +
            '" r="' +
            h.r +
            '" fill="#c8d7b9" opacity=".65"/><circle cx="' +
            h.x +
            '" cy="' +
            h.y +
            '" r="' +
            h.r * 0.65 +
            '" fill="none" stroke="#9db28c"/><text x="' +
            h.x +
            '" y="' +
            (h.y - 45) +
            '" text-anchor="middle" class="range-terrain-label">' +
            esc(h.name) +
            "</text></g>",
        )
        .join("") +
      f.map.shadows
        .map(
          (b) =>
            '<g><rect x="' +
            b[0] +
            '" y="' +
            b[1] +
            '" width="' +
            (b[2] - b[0]) +
            '" height="' +
            (b[3] - b[1]) +
            '" rx="15" fill="#d4c6ac" fill-opacity=".4" stroke="#b5a180" stroke-dasharray="8 8"/><text x="' +
            (b[0] + 15) +
            '" y="' +
            (b[1] + 30) +
            '" class="range-terrain-label">알려진 통신 음영</text></g>',
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
            '" fill="#aeb8aa" stroke="#7a8b76" stroke-width="3"/>',
        )
        .join("") +
      '<path d="M80 680h45v40H80z" fill="#536c53"/><text x="100" y="755" text-anchor="middle" class="range-terrain-label">집결지</text>' +
      f.contacts
        .map(
          (c) =>
            '<g class="range-contact ' +
            (c.expired ? "expired" : "") +
            '"><circle cx="' +
            c.x +
            '" cy="' +
            c.y +
            '" r="' +
            Math.max(15, c.uncertainty) +
            '" fill="none" stroke="#ab8b52" stroke-dasharray="5 4"/><path d="M' +
            c.x +
            " " +
            (c.y - 12) +
            'l12 12-12 12-12-12z" fill="' +
            (c.current ? "#ad8d53" : "#fff") +
            '" stroke="#ad8d53" stroke-width="3"/><title>' +
            esc(
              c.classification === "unknown"
                ? "미확인 인원"
                : c.classification === "unarmed-target"
                  ? "비무장 훈련 인원"
                  : "훈련 표적 인원",
            ) +
            " · " +
            n(c.confidence * 100) +
            "% · " +
            c.age +
            "초 전 보고</title></g>",
        )
        .join("") +
      friendMarkers(f) +
      "</svg>"
    );
  }
  function radio(f) {
    return (
      '<section class="panel command-comms"><div class="personnel-section-title"><div><span class="eyebrow">EVENT-BASED RADIO</span><h2>본부 수신함</h2></div><label class="setting"><input type="checkbox" data-range-internal> 조 내부 교신 보기</label></div><p class="muted">통신 두절 중 현장 기록은 본부에 표시하지 않습니다. 통신 복구 후 전달된 기록은 발생 시각과 수신 시각을 구분합니다.</p><ol class="command-radio-list">' +
      f.radio
        .slice(-90)
        .reverse()
        .map(
          (r) =>
            '<li data-radio-id="' +
            esc(r.id) +
            '" data-channel="' +
            r.channel +
            '"' +
            (r.channel === "internal" ? " hidden" : "") +
            '><div class="radio-route"><strong>' +
            esc(r.from.name) +
            " <small>" +
            esc(r.from.callsign) +
            "</small></strong><span>→</span><strong>" +
            esc(r.to.name) +
            " <small>" +
            esc(r.to.callsign) +
            '</small></strong></div><div class="radio-meta">' +
            esc(types[r.kind] || r.kind) +
            " · " +
            (r.channel === "internal" ? "조 내부" : "본부망") +
            " · 발생 " +
            stamp(r.createdAt) +
            " / " +
            (r.deliveredAt === null
              ? "전달 대기"
              : "수신 " +
                stamp(r.deliveredAt) +
                (r.delay > 8 ? " · 지연 " + r.delay + "초" : "")) +
            "</div><p>" +
            esc(r.body) +
            "</p><details><summary>근거 사건</summary><code>" +
            esc(r.eventId) +
            "</code></details></li>",
        )
        .join("") +
      "</ol></section>"
    );
  }
  function render(s, { editable = true } = {}) {
    if (s?.schemaVersion !== 3)
      return '<section class="panel">본부 저장 복구 후 지휘 훈련을 열 수 있습니다.</section>';
    const f = D.frame(s),
      active = f?.status === "running";
    return (
      '<section class="page-title"><span class="eyebrow">PHASE 03 / COMMAND RANGE</span><h1>관측수 지휘 훈련</h1><p>편성한 저격조에게 본부 명령을 내리면 관측수가 판단해 조원을 지휘합니다. 현재는 시간을 직접 진행하는 2D 훈련장입니다. 실제 계약 출격·실탄 교전·3D 전장이 아닙니다.</p></section><section class="panel"><div class="personnel-section-title"><div><h2>' +
      (active
        ? "훈련 " + stamp(f.time) + (f.paused ? " · 긴급 보고 일시정지" : "")
        : f
          ? "지난 지휘 훈련 · " + stamp(f.time)
          : "훈련 대기") +
      '</h2><p>지형·시야·보고 지연·통신 음영을 실제 좌표와 사건으로 계산합니다. 훈련 시간은 본부 계약 시간과 함께 흐릅니다.</p></div><div class="inline-actions">' +
      (!active
        ? "<button data-range-start" +
          (!editable ||
          !s.squads.length ||
          s.activities.some((a) => a.status === "running")
            ? " disabled"
            : "") +
          ">편성 저격조 훈련 시작</button>"
        : "<button data-range-end" +
          (!editable ? " disabled" : "") +
          ">훈련 종료</button>") +
      "</div></div>" +
      (!s.squads.length
        ? '<p class="notice">대원·저격조에서 관측수와 저격수를 먼저 편성하세요.</p>'
        : "") +
      "</section>" +
      (f
        ? '<div class="command-layout"><section><div class="panel range-map-panel"><div class="personnel-section-title"><h2>본부 상황도</h2><span class="status-pill">수신 아군 ' +
          f.friends.length +
          " · 관측 기록 " +
          f.contacts.length +
          "</span></div>" +
          map(f) +
          '<p class="muted">사각형: 보고된 아군 / 마름모: 관측 인원 / 점선: 마지막 확인·불확실성. 오래된 위치는 흐리게 표시합니다. 지도 선택으로 아래 명령 좌표를 지정할 수 있습니다.</p></div>' +
          (active
            ? '<section class="panel"><div class="range-time-controls">' +
              (f.paused
                ? '<p role="status">' +
                  esc(f.pauseReason) +
                  "</p><button data-range-resume" +
                  (!editable ? " disabled" : "") +
                  ">긴급 보고 확인·계속</button>"
                : [10, 30, 120]
                    .map(
                      (t) =>
                        '<button data-range-step="' +
                        t +
                        '"' +
                        (!editable ? " disabled" : "") +
                        ">" +
                        t +
                        "초 진행</button>",
                    )
                    .join("")) +
              '</div><p class="muted">재접속·다른 화면 열기만으로는 진행하지 않습니다. 실제 시간·배속 전장 루프는 4단계에서 연결합니다.</p><form data-range-command><label>수신 저격조<select name="callsign">' +
              f.squads
                .map(
                  (q) =>
                    "<option" +
                    (s.ui.commandCallsign === q.callsign ? " selected" : "") +
                    ">" +
                    q.callsign +
                    "</option>",
                )
                .join("") +
              '</select></label><label>명령<select name="kind">' +
              Object.entries(D.ORDERS)
                .map(([k, v]) => '<option value="' + k + '">' + v + "</option>")
                .join("") +
              '</select></label><div class="coordinate-inputs"><label>X (m)<input name="x" type="number" min="10" max="1190" value="220" required></label><label>Y (m)<input name="y" type="number" min="10" max="790" value="200" required></label></div><label>교전 규칙<select name="roe"><option value="hold">사격 금지</option><option value="selfDefense">자위 대응</option><option value="authorized">확인 표적 교전 허가</option></select></label><button type="submit"' +
              (!editable ? " disabled" : "") +
              '>본부 → 관측수 명령 송신</button></form><p class="muted">이동 지역만 지정합니다. 관측수가 지형·사주 경계·조원 간격을 고려해 세부 위치를 고릅니다. 교전 규칙을 바꿔도 훈련장에서는 실탄 사격하지 않습니다.</p></section>'
            : "") +
          '<section class="panel"><h2>본부가 알고 있는 조원 상태</h2><div class="range-known-roster">' +
          (f.friends.length
            ? f.friends
                .map(
                  (u) =>
                    "<article><b>" +
                    esc(u.name) +
                    " · " +
                    esc(u.callsign) +
                    "</b><span>" +
                    (u.role === "observer" ? "관측수" : "저격수") +
                    " · " +
                    esc(states[u.state] || u.state) +
                    "</span><small>" +
                    n(u.x) +
                    ", " +
                    n(u.y) +
                    " · " +
                    u.age +
                    "초 전 보고" +
                    (u.stale ? " · 통신 두절 추정" : "") +
                    "</small></article>",
                )
                .join("")
            : "<p>아직 위치 보고가 전달되지 않았습니다.</p>") +
          '</div></section><section class="panel"><h2>명령 전달 이력</h2><ol class="range-order-list">' +
          f.commands
            .slice(-15)
            .reverse()
            .map(
              (c) =>
                "<li><b>" +
                esc(c.callsign) +
                " · " +
                D.ORDERS[c.kind] +
                "</b><span>" +
                esc(labels[c.status]) +
                " · 송신 " +
                stamp(c.issuedAt) +
                (c.completedAt !== null
                  ? " / 완료 수신 " + stamp(c.completedAt)
                  : "") +
                "</span></li>",
            )
            .join("") +
          "</ol></section></section>" +
          radio(f) +
          "</div>"
        : "")
    );
  }
  function bind(root, { state: s, editable, commit }) {
    const on = (key, fn) =>
      root.querySelector(key)?.addEventListener("click", () => {
        if (editable) fn();
      });
    on("[data-range-start]", () => commit((next) => D.begin(next)));
    on("[data-range-end]", () => {
      if (confirm("지휘 훈련을 종료하고 현재 명령·무전 기록을 보관할까요?"))
        commit((next) => D.end(next));
    });
    on("[data-range-resume]", () => commit((next) => D.resume(next)));
    root.querySelectorAll("[data-range-step]").forEach((b) =>
      b.addEventListener("click", () => {
        if (editable)
          commit((next) => D.step(next, Number(b.dataset.rangeStep)));
      }),
    );
    root
      .querySelector("[data-range-command]")
      ?.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!editable) return;
        const f = e.currentTarget;
        commit((next) => {
          next.ui.commandCallsign = f.elements.callsign.value;
          D.issue(
            next,
            f.elements.callsign.value,
            f.elements.kind.value,
            { x: Number(f.elements.x.value), y: Number(f.elements.y.value) },
            f.elements.roe.value,
          );
        });
      });
    root.querySelector(".command-map")?.addEventListener("click", (e) => {
      const svg = e.currentTarget,
        point = new DOMPoint(e.clientX, e.clientY).matrixTransform(
          svg.getScreenCTM().inverse(),
        ),
        form = root.querySelector("[data-range-command]");
      if (form) {
        form.elements.x.value = n(point.x);
        form.elements.y.value = n(point.y);
      }
    });
    root
      .querySelector("[data-range-internal]")
      ?.addEventListener("change", (e) => {
        for (const r of root.querySelectorAll('[data-channel="internal"]'))
          r.hidden = !e.target.checked;
      });
  }
  function archive(s) {
    const reports = s?.commandArchive || [];
    return (
      '<section class="panel"><h2>지휘 훈련 결과 · ' +
      reports.length +
      '건</h2><p class="muted">각 훈련 종료 시 본부에 실제로 전달된 명령·무전 기록을 보관합니다. 여기서는 최근 10개 훈련의 마지막 30개 교신을 표시하며 전체 보관본은 저장 백업에 포함됩니다.</p>' +
      reports
        .slice(-10)
        .reverse()
        .map(
          (r) =>
            '<details class="range-archived-report"><summary>' +
            esc(r.id) +
            " · " +
            stamp(r.frame.time) +
            " · 명령 " +
            r.frame.commands.length +
            "건 / 교신 " +
            r.frame.radio.length +
            '건</summary><ol class="plain-list">' +
            r.frame.radio
              .slice(-30)
              .map(
                (m) =>
                  "<li>" +
                  stamp(m.createdAt) +
                  " · " +
                  esc(m.from.name) +
                  " → " +
                  esc(m.to.name) +
                  "<br>" +
                  esc(m.body) +
                  "</li>",
              )
              .join("") +
            "</ol></details>",
        )
        .join("") +
      "</section>"
    );
  }
  root.OverwatchCommandUI = { render, bind, archive };
})(typeof window === "undefined" ? globalThis : window);
