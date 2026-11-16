(function (root) {
  "use strict";
  const S = () => root.OverwatchStaff,
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
      );
  function render(s, editable = true, options = {}) {
    const c = s.commandStaff || {},
      running = s.commandExercise?.status === "running";
    return (
      '<section class="panel staff-panel"><div class="section-heading"><span class="eyebrow">COMMAND STAFF</span><h2>지휘 편성</h2></div><p class="muted">본부 승인 → 작전통제관 → 관측수 → 저격수. 지원 인력은 별도 시장에서 계약하며 전투대원 20명·출격 편제에 포함되지 않습니다.</p><div class="staff-assignments">' +
      [
        ["controller", "작전통제관", "정찰·조별 임무·철수와 지원 배분"],
        ["instructor", "훈련 교관", "모의 훈련의 과업·관측·복귀 통제"],
      ]
        .map(
          ([k, label, desc]) =>
            '<form data-staff-duty="' +
            k +
            '"><label>' +
            label +
            '<select name="memberId"' +
            (!editable || (running && c[k + "Id"]) ? " disabled" : "") +
            '><option value="">미편성</option>' +
            (c.members || [])
              .filter(
                (m) =>
                  m.id === c[k + "Id"] ||
                  (m.duty === k &&
                    S().available(s, m) &&
                    !S().reserved(s, m.id) &&
                    !s.squads.some((q) =>
                      [q.observerId, q.sniperId].includes(m.id),
                    )),
              )
              .map(
                (m) =>
                  '<option value="' +
                  esc(m.id) +
                  '"' +
                  (c[k + "Id"] === m.id ? " selected" : "") +
                  ">" +
                  esc(m.name) +
                  " · 판단 " +
                  m.skills.judgment +
                  " · " +
                  (m.duty === "controller" ? "작전통제관" : "훈련 교관") +
                  "</option>",
              )
              .join("") +
            "</select></label><small>" +
            desc +
            "</small><button" +
            (!editable || (running && c[k + "Id"]) ? " disabled" : "") +
            ">배정 적용</button></form>",
        )
        .join("") +
      '</div><div class="staff-toggles"><label><input type="checkbox" data-staff-delegated' +
      (c.delegated ? " checked" : "") +
      (!editable ? " disabled" : "") +
      '>작전권 위임</label><label><input type="checkbox" data-staff-support' +
      (c.autoSupport ? " checked" : "") +
      (!editable ? " disabled" : "") +
      '>통제관 지원 자동 배분</label><label><input type="checkbox" data-staff-training' +
      (c.autoTraining !== false ? " checked" : "") +
      (!editable ? " disabled" : "") +
      ">훈련·휴식 교관 위임</label></div><p data-instructor-status>" +
      esc(c.trainingPlan?.status || "교관 배정 시 2~4명 훈련·휴식 자동 관리") +
      '</p><p class="muted">본부 훈련은 1초에 1분씩 자동 진행 · 훈련비 하루 최대 50만원 · 작전 수락 시 자동 중단</p><p class="muted">UAV·의료 회수·보급은 계약 제공분 안에서 운용합니다. 본부의 직접 요청은 계속 가능합니다.</p></section>' +
      (options.market === false ? "" : market(s, editable))
    );
  }
  function market(s, editable) {
    const c = s.commandStaff || {},
      running = s.commandExercise?.status === "running";
    const role = (m) => (m.duty === "controller" ? "작전통제관" : "훈련 교관");
    return (
      '<section class="panel staff-market"><span class="eyebrow">SUPPORT STAFF MARKET</span><h2>교관·통제관 별도 채용</h2><p class="muted">전투 편제와 별도 · 직책별 현역 계약 최대 2명 · 30일 급여 선지급</p><div class="staff-market-grid">' +
      (c.market || [])
        .map(
          (m) =>
            '<article class="staff-market-card"><h3>' +
            esc(m.name) +
            " · " +
            role(m) +
            "</h3><p>" +
            m.age +
            "세 · 경력 " +
            m.years +
            "년 · 판단 " +
            m.skills.judgment +
            "</p><p>일급 " +
            m.dailySalary.toLocaleString() +
            '원</p><button data-staff-hire="' +
            esc(m.id) +
            '"' +
            (!editable || running ? " disabled" : "") +
            ">30일 계약 · " +
            (m.dailySalary * 30).toLocaleString() +
            "원</button></article>",
        )
        .join("") +
      "</div><h3>계약 중인 지원 인력</h3>" +
      (c.members || [])
        .map(
          (m) =>
            '<article class="staff-market-card"><b>' +
            esc(m.name) +
            " · " +
            role(m) +
            "</b><p>남은 계약 " +
            Math.max(
              0,
              Math.ceil((m.contract.endsAt - s.clock.elapsedSeconds) / 86400),
            ) +
            "일 · " +
            (S().reserved(s, m.id) ? "직책 배정 중" : "배정 대기") +
            '</p><button data-staff-renew="' +
            esc(m.id) +
            '"' +
            (!editable ? " disabled" : "") +
            ">30일 연장 · " +
            (m.dailySalary * 30).toLocaleString() +
            "원</button></article>",
        )
        .join("") +
      "<button data-staff-refresh" +
      (!editable || running || s.clock.elapsedSeconds < (c.nextMarketAt || 0)
        ? " disabled"
        : "") +
      ">지원 인력 후보 갱신 · 12시간 간격</button></section>"
    );
  }
  function field(s) {
    const e = s.commandExercise,
      a = S().authority(s, e),
      c = e.control,
      phase = {
        waiting: "투입 대기",
        infiltration: "도보 투입 이동",
        reconnaissance: "정찰 구역 분담",
        overwatch: "엄호 운용",
        extraction: "회수·철수",
      };
    return (
      '<section class="panel field-control-staff"><span class="eyebrow">OPERATION CONTROL</span><h2 data-control-name>' +
      esc(a ? a.role + " " + a.name : "지휘 담당자 미편성") +
      "</h2><p data-control-phase>" +
      esc(
        c
          ? phase[c.phase] || c.phase
          : "본부에서 교관·작전통제관을 편성하세요.",
      ) +
      '</p><label><input type="checkbox" data-staff-delegated' +
      (s.commandStaff?.delegated ? " checked" : "") +
      '>작전권 위임</label><label><input type="checkbox" data-staff-support' +
      (s.commandStaff?.autoSupport ? " checked" : "") +
      '>지원 자동 배분</label><button data-tab="headquarters">지휘 편성</button></section>'
    );
  }
  function refresh(node, s) {
    const e = s.commandExercise,
      a = e && S().authority(s, e),
      p = node.querySelector("[data-control-phase]"),
      n = node.querySelector("[data-control-name]");
    if (n)
      n.textContent = !s.commandStaff?.delegated
        ? "본부 직접 통제"
        : a
          ? a.role + " " + a.name
          : "지휘 담당자 미편성";
    if (p)
      p.textContent =
        {
          waiting: "투입 대기",
          infiltration: "도보 투입 이동",
          reconnaissance: "조별 은밀 정찰·관측",
          overwatch: "아군 엄호·위협 대응",
          extraction: "회수·철수",
        }[e?.control?.phase] || "명령·현장 보고 대기";
  }
  function bind(node, { state: s, editable, commit }) {
    for (const b of node.querySelectorAll("[data-staff-refresh]"))
      b.addEventListener("click", () => {
        if (editable) commit((next) => S().refreshMarket(next));
      });
    for (const b of node.querySelectorAll("[data-staff-hire]"))
      b.addEventListener("click", () => {
        if (editable) commit((next) => S().hire(next, b.dataset.staffHire));
      });
    for (const b of node.querySelectorAll("[data-staff-renew]"))
      b.addEventListener("click", () => {
        if (editable) commit((next) => S().renew(next, b.dataset.staffRenew));
      });
    for (const f of node.querySelectorAll("[data-staff-duty]"))
      f.addEventListener("submit", (event) => {
        event.preventDefault();
        if (editable)
          commit((next) =>
            S().assign(
              next,
              f.dataset.staffDuty,
              f.elements.memberId.value || null,
            ),
          );
      });
    for (const [selector, key] of [
      ["[data-staff-delegated]", "delegated"],
      ["[data-staff-support]", "autoSupport"],
      ["[data-staff-training]", "autoTraining"],
    ])
      for (const el of node.querySelectorAll(selector))
        el.addEventListener("change", () => {
          if (editable)
            commit((next) => {
              if (key === "delegated") S().delegate(next, el.checked);
              else {
                S().initialize(next)[key] = el.checked;
                if (key === "autoTraining" && !el.checked)
                  root.OverwatchPersonnel.interruptManaged(next);
              }
            });
        });
  }
  function refreshTraining(node, s) {
    for (const el of node.querySelectorAll("[data-instructor-status]"))
      el.textContent =
        s.commandStaff?.trainingPlan?.status || "교관 상태 확인 중";
  }
  root.OverwatchStaffUI = {
    render,
    market,
    field,
    refresh,
    refreshTraining,
    bind,
  };
})(window);
