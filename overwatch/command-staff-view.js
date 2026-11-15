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
  function render(s, editable = true) {
    const c = s.commandStaff || {},
      running = s.commandExercise?.status === "running";
    return (
      '<section class="panel staff-panel"><div class="section-heading"><span class="eyebrow">COMMAND STAFF</span><h2>지휘 편성</h2></div><p class="muted">본부 승인 → 작전통제관 → 관측수 → 저격수. 본부 담당자는 현장 편성과 중복할 수 없습니다.</p><div class="staff-assignments">' +
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
            s.members
              .filter(
                (m) =>
                  m.id === c[k + "Id"] ||
                  (S().available(s, m) &&
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
                  (m.specialty === "observer" ? "관측수" : "저격수") +
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
      '>통제관 지원 자동 배분</label></div><p class="muted">UAV·의료 회수·보급은 계약 제공분 안에서 운용합니다. 본부의 직접 요청은 계속 가능합니다.</p></section>'
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
    ])
      for (const el of node.querySelectorAll(selector))
        el.addEventListener("change", () => {
          if (editable)
            commit((next) => {
              if (key === "delegated") S().delegate(next, el.checked);
              else S().initialize(next)[key] = el.checked;
            });
        });
  }
  root.OverwatchStaffUI = { render, field, refresh, bind };
})(window);
