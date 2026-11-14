/* Headquarters personnel screens. Commands execute through the app's revision-safe transaction. */
(function (root) {
  "use strict";
  const P = root.OverwatchPersonnel,
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
    money = (n) => Math.round(n).toLocaleString("ko-KR") + "원";
  const roles = { observer: "관측수", sniper: "저격수" },
    tiers = {
      rookie: "신입",
      experienced: "경력직",
      veteran: "베테랑",
      specialist: "특수 전문가",
    },
    statuses = {
      standby: "대기",
      resting: "휴식",
      training: "훈련",
      treatment: "치료",
      medical: "진료 대기",
      deceased: "전사",
      resigned: "퇴사",
      retired: "은퇴",
    },
    parts = {
      head: "머리",
      chest: "흉부",
      abdomen: "복부",
      leftArm: "왼팔",
      rightArm: "오른팔",
      leftLeg: "왼다리",
      rightLeg: "오른다리",
      unknown: "부위 미상",
    },
    traits = { cautious: "신중형", assertive: "적극형", seasoned: "경험형" };
  function duration(seconds) {
    const hours = Math.max(0, Math.ceil(seconds / P.HOUR));
    return hours >= 24
      ? Math.floor(hours / 24) +
          "일" +
          (hours % 24 ? " " + (hours % 24) + "시간" : "")
      : hours + "시간";
  }
  function timestamp(seconds) {
    const h = Math.floor(seconds / P.HOUR);
    return (
      "D" +
      Math.floor(h / 24) +
      " " +
      String(h % 24).padStart(2, "0") +
      ":" +
      String(Math.floor(seconds / 60) % 60).padStart(2, "0")
    );
  }
  const eventLabels = {
    recruited: "입사 계약",
    "contract-renewed": "계약 연장",
    "contract-expired": "계약 만료",
    resigned: "계약 종료",
    retired: "은퇴",
    casualty: "전사",
    death: "전사",
    injury: "부상 기록",
    "activity-completed": "본부 활동 완료",
  };
  function historyText(s, h) {
    return (
      h?.message ||
      s.records.find((e) => e.id === h?.eventId)?.message ||
      (eventLabels[h?.type] || "이전 기록") +
        (h?.kind
          ? " · " + activityName({ kind: h.kind, course: h.course })
          : "")
    );
  }
  function activityName(a) {
    return a.kind === "training"
      ? P.LABELS[a.course] + " 훈련"
      : {
          rest: "휴식",
          pair: "관측수·저격수 공동 훈련",
          treatment: "협력 의료기관 진료",
          rehab: "후유증 재활",
        }[a.kind];
  }
  const find = (s, id) =>
      [...s.members, ...s.archive.members, ...s.market.candidates].find(
        (m) => m.id === id,
      ),
    disabled = (x) => (x ? " disabled" : ""),
    safeOptions = (items, selected) =>
      items
        .map(
          ([value, label]) =>
            '<option value="' +
            esc(value) +
            '"' +
            (value === selected ? " selected" : "") +
            ">" +
            esc(label) +
            "</option>",
        )
        .join("");
  function activities(s, editable) {
    const active = s.activities.filter((a) => a.status === "running"),
      next = active.length
        ? Math.min(...active.map((a) => a.dueAt)) - s.clock.elapsedSeconds
        : 0;
    return (
      '<section class="panel hq-activities"><div class="personnel-section-title"><div><span class="eyebrow">HEADQUARTERS ACTIVITIES</span><h2>본부 활동 · ' +
      timestamp(s.clock.elapsedSeconds) +
      "</h2></div><button data-advance" +
      disabled(!editable || !active.length) +
      ">다음 활동 완료까지 " +
      duration(next) +
      " 진행</button></div><p>진행 중인 모든 활동과 계약 시간이 함께 흐릅니다. 재접속이나 현실 시간 경과만으로 진행하지 않습니다.</p>" +
      (active.length
        ? '<div class="activity-list">' +
          active
            .map(
              (a) =>
                '<article data-activity="' +
                esc(a.id) +
                '"><div><strong>' +
                esc(activityName(a)) +
                "</strong><span>" +
                a.memberIds
                  .map((id) => esc(find(s, id)?.name || id))
                  .join(" · ") +
                " · 완료 " +
                timestamp(a.dueAt) +
                "</span><small>경과 " +
                duration(a.workedSeconds) +
                " / " +
                duration(a.dueAt - a.startedAt) +
                " · 착수비 " +
                money(a.cost) +
                '</small><progress max="' +
                (a.dueAt - a.startedAt) +
                '" value="' +
                a.workedSeconds +
                '"></progress></div><button data-cancel="' +
                esc(a.id) +
                '"' +
                disabled(!editable) +
                ">중단</button></article>",
            )
            .join("") +
          "</div>"
        : '<p class="muted">대원 상세에서 훈련·휴식·진료를 배정하거나 편성된 조에 공동 훈련을 배정하세요.</p>') +
      "</section>"
    );
  }
  function memberCard(s, m, editable) {
    const q = s.squads.find(
        (q) => q.observerId === m.id || q.sniperId === m.id,
      ),
      effective = P.effectiveSkills(m),
      why = P.readiness(s, m);
    return (
      '<article class="hq-member-card" data-member="' +
      esc(m.id) +
      '" data-search="' +
      esc(m.name + " " + roles[m.specialty]) +
      '"><div class="member-card-header"><span class="member-avatar">' +
      esc(m.name.slice(0, 1)) +
      '</span><span class="member-status ' +
      (why ? "limited" : "ready") +
      '">' +
      esc(statuses[m.status]) +
      "</span></div><small>" +
      esc(m.id) +
      " · " +
      tiers[m.career.tier] +
      "</small><h2>" +
      esc(m.name) +
      "</h2><p>" +
      roles[m.specialty] +
      " · " +
      P.age(s, m) +
      "세 · " +
      m.career.years +
      '년 경력</p><div class="member-skill-summary"><span>사격 <b>' +
      effective.shooting +
      "</b></span><span>관측 <b>" +
      effective.observation +
      "</b></span><span>판단 <b>" +
      effective.judgment +
      '</b></span></div><div class="member-condition"><span>피로 ' +
      Math.round(m.fatigue) +
      "%</span><span>스트레스 " +
      Math.round(m.stress) +
      '%</span></div><p class="member-availability">' +
      esc(q ? q.callsign + " 배속" : why || "편성 가능") +
      " · 계약 " +
      duration(m.contract.endsAt - s.clock.elapsedSeconds) +
      ' 남음</p><button data-profile="' +
      esc(m.id) +
      '">개인 기록·활동</button></article>'
    );
  }
  function market(s, editable) {
    return (
      '<section class="panel"><div class="personnel-section-title"><div><span class="eyebrow">RECRUITMENT MARKET</span><h2>모집 시장 · 후보 ' +
      s.market.candidates.length +
      "명</h2></div><button data-refresh-market" +
      disabled(
        !editable ||
          s.clock.elapsedSeconds < s.market.nextRefreshAt ||
          s.headquarters.funds < 50000,
      ) +
      ">후보 갱신 · 5만원</button></div><p>기간 급여를 계약 시 전액 선지급합니다. 계약 종료·퇴사 시 미사용 기간 급여는 환급하지 않습니다. 후보 갱신까지 " +
      duration(s.market.nextRefreshAt - s.clock.elapsedSeconds) +
      '. 이전 경력은 입사 전 이력이며 BLACKLINE 작전 기록과 구분합니다.</p></section><section class="recruit-grid">' +
      s.market.candidates
        .map(
          (c) =>
            '<article class="hq-member-card recruit-card" data-candidate="' +
            esc(c.id) +
            '"><div class="member-card-header"><span class="tier-badge">' +
            tiers[c.career.tier] +
            "</span><span>" +
            roles[c.specialty] +
            "</span></div><h2>" +
            esc(c.name) +
            "</h2><p>" +
            P.age(s, c) +
            "세 · 이전 경력 " +
            c.career.years +
            "년 · " +
            traits[c.personality] +
            "</p><p>" +
            esc(c.career.summary) +
            '</p><div class="member-skill-summary"><span>사격 <b>' +
            c.skills.shooting +
            "</b></span><span>관측 <b>" +
            c.skills.observation +
            "</b></span><span>판단 <b>" +
            c.skills.judgment +
            '</b></span></div><p class="muted">부특기 ' +
            (c.secondarySpecialties.map((k) => P.LABELS[k]).join(" · ") ||
              "없음") +
            '</p><label class="contract-term">계약 기간<select data-contract-term="' +
            esc(c.id) +
            '">' +
            safeOptions(
              [
                [30, "30일"],
                [90, "90일"],
              ],
              30,
            ) +
            "</select></label><p>일급 " +
            money(c.dailySalary) +
            " · 선지급 <strong data-quote>" +
            money(c.dailySalary * 30) +
            '</strong></p><div class="inline-actions"><button data-profile="' +
            esc(c.id) +
            '">상세 이력</button><button data-hire="' +
            esc(c.id) +
            '"' +
            disabled(
              !editable ||
                s.members.length >= 10 ||
                s.headquarters.funds < c.dailySalary * 30,
            ) +
            ">계약·영입</button></div></article>",
        )
        .join("") +
      "</section>"
    );
  }
  function squads(s, editable) {
    return (
      '<section class="squad-grid">' +
      ["ALPHA", "BRAVO", "CHARLIE"]
        .map((callsign) => {
          const q = s.squads.find((q) => q.callsign === callsign),
            job = s.activities.find(
              (a) => a.status === "running" && a.callsign === callsign,
            ),
            used = new Set(
              s.squads
                .filter((q) => q.callsign !== callsign)
                .flatMap((q) => [q.observerId, q.sniperId]),
            ),
            options = (role) => [
              ["", "대원 선택"],
              ...s.members
                .filter(
                  (m) =>
                    m.specialty === role &&
                    !used.has(m.id) &&
                    (P.readiness(s, m) === null ||
                      (q && (q.observerId === m.id || q.sniperId === m.id))),
                )
                .map((m) => [
                  m.id,
                  m.name + (P.readiness(s, m) ? " · " + P.readiness(s, m) : ""),
                ]),
            ],
            r = q ? P.relationship(s, q) : null;
          return (
            '<article class="panel squad"><span class="eyebrow">' +
            callsign +
            "</span><h2>" +
            (q ? "2인 저격조" : "미편성") +
            '</h2><form data-squad-form="' +
            callsign +
            '"><label>관측수 · 조장<select name="observer" required' +
            disabled(!editable || !!job) +
            ">" +
            safeOptions(options("observer"), q?.observerId || "") +
            '</select></label><label>저격수<select name="sniper" required' +
            disabled(!editable || !!job) +
            ">" +
            safeOptions(options("sniper"), q?.sniperId || "") +
            '</select></label><button type="submit"' +
            disabled(!editable || !!job) +
            ">편성 저장</button></form>" +
            (q
              ? "<p>두 사람의 팀워크 " +
                Math.round(r.cohesion) +
                " / 100 · 공동 훈련 " +
                r.hours +
                '시간</p><div class="inline-actions"><button data-pair-training="' +
                callsign +
                '"' +
                disabled(
                  !editable ||
                    !!job ||
                    [q.observerId, q.sniperId].some(
                      (id) => P.readiness(s, find(s, id)) !== null,
                    ),
                ) +
                '>공동 훈련 · 4시간 / 20만원</button><button data-clear-squad="' +
                callsign +
                '"' +
                disabled(!editable || !!job) +
                ">편성 해제</button></div>"
              : '<p class="muted">관측수 1명과 저격수 1명을 선택하세요. 다른 조와 중복 배정할 수 없습니다.</p>') +
            "</article>"
          );
        })
        .join("") +
      '</section><section class="panel"><p>편성은 최대 3개 조·6명입니다. 개인 활동을 시작하려면 해당 조를 먼저 해제하세요. 공동 훈련은 편성을 유지하며, 활동 중에는 출격 준비가 완료되지 않습니다. 실제 출격·무전 지휘는 후속 단계에서 연결합니다.</p></section>'
    );
  }
  function archived(s) {
    return (
      '<section class="panel"><span class="eyebrow">PERMANENT PERSONNEL ARCHIVE</span><h2>전사·퇴사·은퇴 기록</h2>' +
      (s.archive.members.length
        ? '<ul class="personnel-list">' +
          s.archive.members
            .slice()
            .reverse()
            .map(
              (m) =>
                "<li><div><strong>" +
                esc(m.name) +
                " · " +
                statuses[m.status] +
                "</strong><span>" +
                roles[m.specialty] +
                " · 기록 시점 " +
                timestamp(m.endedAt) +
                " · " +
                esc(m.exitReason) +
                '</span></div><button data-profile="' +
                esc(m.id) +
                '">기록 열기</button></li>',
            )
            .join("") +
          "</ul>"
        : "<p>등록된 전사·퇴사·은퇴 기록이 없습니다.</p>") +
      '<p class="muted">전사자는 영구 손실입니다. 보관 인원은 현직 정원 10명에 포함하지 않습니다.</p></section>'
    );
  }
  function render(s, { editable = true } = {}) {
    if (![2, 3].includes(s?.schemaVersion))
      return '<section class="panel"><h2>2단계 저장 전환이 필요합니다.</h2><p>저장 관리에서 원본을 보존한 뒤 주 저장을 복구하세요.</p></section>';
    const view = s.ui.personnelTab || "roster";
    return (
      '<section class="page-title"><span class="eyebrow">PERSONNEL & PAIRS / PHASE 02</span><h1>대원과 저격조</h1><p>현직 ' +
      s.members.length +
      "/10명 · 편성 " +
      s.squads.length +
      "/3개 조 · 운영자금 " +
      money(s.headquarters.funds) +
      '</p></section><nav class="personnel-subnav" aria-label="인원 관리">' +
      [
        ["roster", "현직 명부"],
        ["market", "모집 시장"],
        ["squads", "저격조 편성"],
        ["archive", "보관 명부"],
      ]
        .map(
          ([key, label]) =>
            '<button data-personnel-tab="' +
            key +
            '"' +
            (view === key ? ' aria-current="page"' : "") +
            ">" +
            label +
            "</button>",
        )
        .join("") +
      "</nav>" +
      activities(s, editable) +
      (
        {
          roster: () =>
            s.members.length
              ? '<label class="personnel-search">이름·주특기 검색<input data-personnel-search type="search" placeholder="대원 이름 또는 관측수·저격수"></label><section class="member-grid">' +
                s.members.map((m) => memberCard(s, m, editable)).join("") +
                "</section>"
              : '<section class="empty-state"><h2>첫 저격조를 모집하세요.</h2><p>모집 시장에서 관측수와 저격수를 계약한 뒤 ALPHA에 편성할 수 있습니다. 기존 PMC 명부는 기록 보관함에 그대로 남아 있습니다.</p><button data-personnel-tab="market">모집 시장 열기</button></section>',
          market: () => market(s, editable),
          squads: () => squads(s, editable),
          archive: () => archived(s),
        }[view] || (() => "")
      )()
    );
  }
  function dossier(s, id, { editable = true } = {}) {
    if (![2, 3].includes(s?.schemaVersion)) return "";
    const m = find(s, id);
    if (!m) return "";
    const hired = s.members.some((x) => x.id === id),
      candidate = m.status === "candidate",
      effective = P.effectiveSkills(m),
      plan = P.treatmentPlan(m),
      busy = !!m.activityId,
      q = s.squads.find((q) => q.observerId === id || q.sniperId === id);
    return (
      '<div class="dossier-backdrop"><section class="personnel-dossier" role="dialog" aria-modal="true" aria-labelledby="dossier-name"><header><div><span class="eyebrow">PERSONNEL / ' +
      esc(m.id) +
      '</span><h1 id="dossier-name">' +
      esc(m.name) +
      "</h1><p>" +
      roles[m.specialty] +
      " · " +
      P.age(s, m) +
      "세 · " +
      tiers[m.career.tier] +
      " · " +
      (candidate ? "계약 후보" : statuses[m.status]) +
      '</p></div><button data-close-profile aria-label="개인 기록 닫기">닫기 ×</button></header><div class="dossier-content"><div class="dossier-two-columns"><section class="panel"><h2>경력·전문성</h2><p>' +
      esc(m.career.summary) +
      " · " +
      m.career.years +
      "년</p><p>주특기 " +
      roles[m.specialty] +
      " · 판단 경향 " +
      traits[m.personality] +
      "</p><p>부특기 " +
      (m.secondarySpecialties.map((k) => P.LABELS[k]).join(" / ") || "없음") +
      "</p><p>경험치 " +
      m.experience +
      " · 성장 단계 " +
      (Math.floor(m.experience / 100) + 1) +
      "</p>" +
      (!candidate
        ? "<p>주특기 숙련도 " +
          Math.round(m.proficiency.primary) +
          ' / 100</p><p class="muted">부특기 교육 진행: ' +
          P.SECONDARIES.map(
            (k) =>
              P.LABELS[k] + " " + Math.round(m.proficiency.secondary[k]) + "%",
          ).join(" · ") +
          "</p>"
        : "") +
      '<p class="muted">판단 경향·부특기의 현장 AI 행동 연결은 지휘 AI 단계에서 진행합니다.</p></section><section class="panel"><h2>급여·계약</h2><p>일급 ' +
      money(m.dailySalary) +
      "</p>" +
      (candidate
        ? "<p>30일 선지급 " +
          money(m.dailySalary * 30) +
          " / 90일 " +
          money(m.dailySalary * 90) +
          "</p>"
        : "<p>시작 " +
          timestamp(m.contract.startsAt) +
          " · 종료 " +
          timestamp(m.contract.endsAt) +
          "</p><p>총 선지급 " +
          money(m.contract.paidAmount) +
          (m.contract.migrated ? " · 이전 계약 승계" : "") +
          "</p>") +
      (hired
        ? '<button data-renew="' +
          esc(m.id) +
          '"' +
          disabled(!editable) +
          ">30일 연장 · " +
          money(m.dailySalary * 30) +
          "</button>"
        : "") +
      '</section></div><section class="panel"><h2>주요 역량 · 기본 / 현재 적용</h2><div class="dossier-skills">' +
      P.SKILLS.map(
        (k) =>
          "<div><label>" +
          P.LABELS[k] +
          " <b>" +
          Math.round(m.skills[k]) +
          " / " +
          effective[k] +
          '</b></label><progress max="100" value="' +
          effective[k] +
          '"></progress></div>',
      ).join("") +
      "</div><p>피로 " +
      Math.round(m.fatigue) +
      "% · 스트레스 " +
      Math.round(m.stress) +
      '%. 현재 적용 값에는 피로·스트레스·후유증이 반영됩니다.</p></section><section class="panel"><h2>건강·부상 이력</h2>' +
      (m.injuries.length
        ? '<ul class="plain-list">' +
          m.injuries
            .map(
              (w) =>
                "<li>" +
                esc(parts[w.part] || "부위 미상") +
                " · " +
                esc(w.type) +
                " · " +
                w.severity +
                "단계 · " +
                (w.healed ? "치료 완료" : "진료·회복 필요") +
                (w.legacy
                  ? " · 이전 기록"
                  : " · 사건 " + esc(w.sourceEventId)) +
                "</li>",
            )
            .join("") +
          "</ul>"
        : "<p>기록된 부상 없음</p>") +
      (m.aftereffects.length
        ? "<p>잔여 후유증: " +
          m.aftereffects
            .map((e) => P.LABELS[e.skill] + " 적용값 −" + e.penalty)
            .join(" / ") +
          "</p>"
        : '<p class="muted">기록된 후유증 없음</p>') +
      "</section>" +
      (hired
        ? '<section class="panel"><h2>본부 활동 배정</h2>' +
          (q
            ? "<p>" +
              q.callsign +
              " 배속 중입니다. 개인 활동 전 조 편성을 해제하거나 조 단위 공동 훈련을 선택하세요.</p>"
            : "") +
          '<form data-training="' +
          esc(m.id) +
          '" class="activity-form"><label>훈련 과목<select name="course">' +
          safeOptions(
            [...P.SKILLS, ...P.SECONDARIES].map((k) => [k, P.LABELS[k]]),
            "shooting",
          ) +
          '</select></label><label>시간<select name="hours">' +
          safeOptions(
            [
              [4, "4시간 / 10만원"],
              [8, "8시간 / 20만원"],
            ],
            4,
          ) +
          '</select></label><button type="submit"' +
          disabled(!editable || busy || !!q || P.injured(m)) +
          '>훈련 시작</button></form><form data-rest="' +
          esc(m.id) +
          '" class="activity-form"><label>휴식 시간<select name="hours">' +
          safeOptions(
            [
              [2, "2시간"],
              [6, "6시간"],
              [12, "12시간"],
            ],
            6,
          ) +
          '</select></label><button type="submit"' +
          disabled(!editable || busy || !!q || P.injured(m)) +
          '>휴식 배정</button></form><div class="inline-actions"><button data-treatment="' +
          esc(m.id) +
          '"' +
          disabled(!editable || busy || !!q || !plan) +
          ">진료 배정" +
          (plan
            ? " · " + duration(plan.seconds) + " / " + money(plan.cost)
            : "") +
          '</button><button data-rehab="' +
          esc(m.id) +
          '"' +
          disabled(
            !editable || busy || !!q || !!plan || !m.aftereffects.length,
          ) +
          '>후유증 재활 · 24시간 / 20만원</button></div><p class="muted">치료는 실제 부상 기록이 있을 때만 배정합니다. 부상 없는 대원에게 의료 처치를 생성하지 않습니다. 활동 비용은 착수 시 지출하며 중단해도 환급하지 않습니다.</p></section>'
        : "") +
      '<section class="panel"><h2>개인 기록</h2>' +
      (m.history.length
        ? '<ul class="plain-list">' +
          m.history
            .slice(-20)
            .reverse()
            .map(
              (h) =>
                "<li>" +
                timestamp(h?.time || 0) +
                " · " +
                esc(historyText(s, h)) +
                "</li>",
            )
            .join("") +
          "</ul>"
        : "<p>BLACKLINE 소속 활동 기록 없음</p>") +
      "</section>" +
      (hired
        ? '<section class="panel caution"><h2>복무 종료</h2><p>미사용 기간 급여는 환급하지 않습니다. 종료 기록과 부상 이력은 보관 명부에 남습니다.</p><div class="inline-actions"><button data-release="' +
          esc(m.id) +
          '"' +
          disabled(!editable) +
          '>계약 조기 종료</button><button data-retire="' +
          esc(m.id) +
          '"' +
          disabled(!editable || (P.age(s, m) < 50 && !m.aftereffects.length)) +
          ">은퇴 처리</button></div></section>"
        : "") +
      "</div></section></div>"
    );
  }
  function bind(
    root,
    { state: s, commit, openProfile, closeProfile, editable },
  ) {
    if (![2, 3].includes(s?.schemaVersion)) return;
    const each = (selector, fn) =>
      root.querySelectorAll(selector).forEach((el) =>
        el.addEventListener("click", (e) => {
          e.preventDefault();
          fn(el);
        }),
      );
    each("[data-personnel-tab]", (el) =>
      commit((next) => (next.ui.personnelTab = el.dataset.personnelTab)),
    );
    each("[data-profile]", (el) => openProfile(el.dataset.profile));
    each("[data-close-profile]", closeProfile);
    each("[data-hire]", (el) => {
      const c = s.market.candidates.find((m) => m.id === el.dataset.hire),
        days = Number(
          Array.from(root.querySelectorAll("[data-contract-term]")).find(
            (input) => input.dataset.contractTerm === c.id,
          ).value,
        );
      if (
        confirm(
          c.name +
            " · " +
            days +
            "일 기간 급여 " +
            money(c.dailySalary * days) +
            "을 선지급하고 계약할까요?",
        )
      )
        commit((next) => P.hire(next, c.id, days));
    });
    root.querySelectorAll("[data-contract-term]").forEach((el) =>
      el.addEventListener("change", () => {
        const c = s.market.candidates.find(
            (m) => m.id === el.dataset.contractTerm,
          ),
          cost = c.dailySalary * Number(el.value),
          card = el.closest("[data-candidate]");
        card.querySelector("[data-quote]").textContent = money(cost);
        card.querySelector("[data-hire]").disabled =
          !editable || s.members.length >= 10 || s.headquarters.funds < cost;
      }),
    );
    each("[data-advance]", () => commit((next) => P.advance(next)));
    each("[data-refresh-market]", () =>
      commit((next) => P.refreshMarket(next)),
    );
    each("[data-cancel]", (el) => {
      if (
        confirm(
          "활동을 중단할까요? 실제 경과는 남고 착수 비용은 환급하지 않습니다.",
        )
      )
        commit((next) => P.cancel(next, el.dataset.cancel));
    });
    root.querySelectorAll("[data-squad-form]").forEach((form) =>
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        commit((next) =>
          P.assign(
            next,
            form.dataset.squadForm,
            form.elements.observer.value,
            form.elements.sniper.value,
          ),
        );
      }),
    );
    each("[data-clear-squad]", (el) =>
      commit((next) => P.clearSquad(next, el.dataset.clearSquad)),
    );
    each("[data-pair-training]", (el) => {
      const q = s.squads.find((q) => q.callsign === el.dataset.pairTraining);
      commit((next) =>
        P.start(next, {
          kind: "pair",
          callsign: q.callsign,
          memberIds: [q.observerId, q.sniperId],
        }),
      );
    });
    root.querySelectorAll("[data-training],[data-rest]").forEach((form) =>
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        commit((next) =>
          P.start(next, {
            kind: form.dataset.training ? "training" : "rest",
            memberIds: [form.dataset.training || form.dataset.rest],
            course: form.elements.course?.value || null,
            hours: Number(form.elements.hours.value),
          }),
        );
      }),
    );
    each("[data-treatment]", (el) =>
      commit((next) =>
        P.start(next, { kind: "treatment", memberIds: [el.dataset.treatment] }),
      ),
    );
    each("[data-rehab]", (el) =>
      commit((next) =>
        P.start(next, { kind: "rehab", memberIds: [el.dataset.rehab] }),
      ),
    );
    each("[data-renew]", (el) => {
      const m = find(s, el.dataset.renew);
      if (
        confirm(
          m.name +
            " 계약 30일을 " +
            money(m.dailySalary * 30) +
            " 선지급으로 연장할까요?",
        )
      )
        commit((next) => P.renew(next, m.id, 30));
    });
    for (const [attr, reason] of [
      ["release", "release"],
      ["retire", "retirement"],
    ])
      each("[data-" + attr + "]", (el) => {
        if (
          confirm(
            "복무를 종료하고 보관 명부에 기록할까요? 미사용 급여는 환급하지 않습니다.",
          )
        )
          commit((next) => P.release(next, el.dataset[attr], reason));
      });
    root
      .querySelector("[data-personnel-search]")
      ?.addEventListener("input", (e) => {
        const text = e.target.value.trim().toLocaleLowerCase();
        for (const card of root.querySelectorAll("[data-member]"))
          card.hidden = !card.dataset.search.toLocaleLowerCase().includes(text);
      });
  }
  root.OverwatchPersonnelUI = {
    render,
    dossier,
    bind,
    money,
    duration,
    timestamp,
  };
})(typeof window === "undefined" ? globalThis : window);
