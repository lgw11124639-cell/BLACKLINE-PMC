/* Contract decisions and debriefs. Tactical displays use the delivered projection only. */
(function (root) {
  "use strict";
  const M = root.OverwatchMissions,
    D = root.OverwatchCommand,
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
    cash = (n) => Math.round(n).toLocaleString("ko-KR") + "원",
    labels = {
      offered: "제안",
      accepted: "수락·준비",
      active: "작전 중",
      settled: "정산 완료",
      expired: "기한 만료",
    },
    phases = {
      settled: "작전 종료 · 정산 완료",
      boarding: "탑승 중",
      inserting: "작전지 수송 중",
      infiltration: "도보 투입 중",
      field: "현장 임무",
      extracting: "집결·회수 대기",
      returning: "본부 복귀 수송 중",
      withdrawing: "도보 철수 중",
    },
    ts = (t) =>
      "D" +
      Math.floor(t / 86400) +
      " " +
      String(Math.floor(t / 3600) % 24).padStart(2, "0") +
      ":" +
      String(Math.floor(t / 60) % 60).padStart(2, "0");
  const dis = {
    returned: "실제 복귀",
    deceased: "전사 확인",
    missing: "미회수·실종 보관",
  };
  function proposal(c) {
    const map = root.OverwatchGeometry.maps[c.mapId],
      stories = {
        recon: [
          "현지 연락망의 보고가 서로 엇갈리고 있습니다. 의뢰 기관은 병력을 즉시 투입하기보다, 주요 접근로와 건물 밀집 구역을 확인할 독립 정찰을 요청했습니다.",
          "구역별 접촉 식별·활동 변화·안전 통로를 종합 보고합니다. 인원 한 명 발견만으로 정찰을 종료하지 않습니다.",
        ],
        rescue: [
          "현장 의료 지원 인원의 정기 연락이 끊겼습니다. 마지막 목격 정보만으로 소재와 경비 상태를 확정할 수 없어, 기관은 수색과 구출을 함께 수행할 본부 지원을 요청했습니다.",
          "정찰로 대상 신원을 확인하고 현장에서 합류합니다. 구출 대상과 호송 인원의 실제 탑승·본부 도착을 확인해야 합니다.",
        ],
        escort: [
          "위험 지역을 통과해야 하는 연락관의 이동이 예정되어 있습니다. 기존 경로는 노출 가능성이 있어 고정 통로 대신 현장 관측에 따라 호송로를 재평가해야 합니다.",
          "대상은 호위 인원 뒤에서 이동합니다. 선행 경계·측면 엄호·대상 호송을 분리하고 실제 안전 지역 도착을 확인합니다.",
        ],
        eliminate: [
          "의뢰 기관은 지역 무장 조직의 핵심 인물에 관한 단편적인 동향을 확보했습니다. 오인 교전을 피하기 위해 현장 재식별과 별도의 사격 판단이 필요합니다.",
          "정찰·영상·관측으로 신원을 확인한 뒤 지정 표적을 저지합니다. 보병은 접근로·사격 후 확인·철수 엄호를 나눠 수행합니다.",
        ],
        interdict: [
          "무장 조직의 인원과 물자가 지역 거점을 따라 이동한다는 보고가 접수되었습니다. 이동 시점과 경로는 유동적이므로 먼저 감시 구역을 분담해야 합니다.",
          "계약상 지정된 이동·보급 활동을 식별하고 저지합니다. 저격팀은 관측·대저격, 보병팀은 수색·접근로 통제·현장 확인을 담당합니다.",
        ],
      },
      story = stories[c.task] || stories.recon;
    return (
      '<details class="contract-proposal"><summary>작전 제안서 상세 · 정보 보고서</summary><article class="operation-report"><header><span class="eyebrow">OPERATIONS / INTELLIGENCE BRIEF</span><h3>' +
      esc(c.title) +
      "</h3><p>문서번호 " +
      esc(c.id) +
      " · 발신 " +
      esc(c.issuer) +
      "</p></header>" +
      (map?.image
        ? '<figure><img src="' +
          esc(map.image) +
          '" alt="' +
          esc(map.name) +
          ' 작전 지역 지도" loading="lazy"><figcaption>' +
          esc(map.name) +
          " · 사전 지형 자료 / 적·목표 위치는 현장 확인 필요</figcaption></figure>"
        : "") +
      "<section><h4>01 · 배경과 상황</h4><p>" +
      esc(story[0]) +
      "</p><p>" +
      esc(c.brief) +
      "</p></section><section><h4>02 · 임무와 완료 조건</h4><p>" +
      esc(story[1]) +
      "</p></section><section><h4>03 · 편성·운용 구상</h4><p>본부 1팀: 선행 수색·대상 확보. 본부 2팀: 측면 경계·전투 엄호. 본부 3팀: 후방·철수로 확보. 저격 1·2·3팀은 서로 다른 관측 구역과 사격 임무를 부여받습니다.</p><p>최소 인원 제한 없음. 권장 " +
      c.recommended +
      "명은 참고 정보이며, 보병 또는 저격팀만 투입할 수도 있습니다. 실제 편성은 본부 승인에 따릅니다.</p></section><section><h4>04 · 지원·유의 사항</h4><p>기관 보병·기관 저격조는 기관 지휘망으로 운용합니다. 본부 작전통제관은 본부 팀별 임무를 지시하고, 관측·정찰 보고에 따라 재배치합니다.</p><p>민간인 식별, 사격각·엄폐 확인, 부상자 회수와 실제 귀환을 별도로 확인하십시오. 지도에 표시되지 않은 적·목표를 이미 파악한 것으로 간주하지 않습니다.</p></section></article></details>"
    );
  }
  function result(r) {
    if (!r) return "";
    return (
      '<section class="panel live-debrief"><span class="eyebrow">ACTUAL OPERATION / DEBRIEF</span><h2>' +
      esc(r.title) +
      " · " +
      (r.success ? "계약 목표 달성" : "실패·중단") +
      "</h2><p>" +
      esc(r.issuer) +
      " · " +
      ts(r.startedAt) +
      " → " +
      ts(r.endedAt) +
      " · " +
      Math.floor(r.fieldSeconds / 60) +
      "분</p><p>목표 " +
      (r.objective ? "달성" : "미달성") +
      " / 생존 인원 복귀 " +
      (r.returnComplete ? "완료" : "미완료") +
      " / 미회수 " +
      r.missing.length +
      "명</p>" +
      (r.targets
        ? "<p>계약 표적 신원 확인 " +
          r.targets.identified.length +
          "명 · 저지·사살 확인 " +
          r.targets.confirmed.length +
          "명 · 탈출 " +
          r.targets.escaped.length +
          "명</p>"
        : "") +
      '<div class="live-money">' +
      [
        ["실제 비용 납부", r.postpaid ? r.paid : r.consumed],
        ["실제 사용·손실", r.consumed],
        ["미지급 비용", r.outstanding || 0],
        ["계약 보수", r.reward],
        ["성과 보너스", r.bonus],
      ]
        .map(
          ([a, b]) =>
            "<div><small>" +
            a +
            "</small><strong>" +
            cash(b) +
            "</strong></div>",
        )
        .join("") +
      "</div>" +
      (r.protectedHome
        ? "<p>구출·호송 대상: 실제 탑승 및 본부 도착 확인</p>"
        : "") +
      '<div class="live-report-roster">' +
      (r.headquartersInfantry?.length
        ? ["ALPHA", "BRAVO", "CHARLIE"]
            .map((call) => {
              const people = r.headquartersInfantry.filter(
                (u) => (u.team || "ALPHA") === call,
              );
              if (!people.length)
                return (
                  "<section><h3>" +
                  root.OverwatchInfantry.teamLabel(call) +
                  " · 미출격</h3><p>" +
                  esc(
                    r.infantryDeployment?.find((q) => q.callsign === call)
                      ?.reason || "당시 상세 기록 없음",
                  ) +
                  "</p></section>"
                );
              return (
                "<section><h3>" +
                root.OverwatchInfantry.teamLabel(call) +
                " · " +
                people.length +
                "명</h3>" +
                people
                  .map(
                    (u) =>
                      "<p>" +
                      esc(u.name) +
                      " · " +
                      esc(
                        {
                          leader: "분대장",
                          rifleman: "소총수",
                          gunner: "지원화기병",
                          medic: "의무병",
                        }[u.role] || u.role,
                      ) +
                      " · " +
                      esc(
                        {
                          standby: "복귀 완료",
                          medical: "진료 필요",
                          deceased: "전사",
                          missing: "미회수",
                        }[u.status] || u.status,
                      ) +
                      " · 사격 " +
                      u.spent +
                      "발 · 연막 " +
                      u.grenades.spent.smoke +
                      " · 수류탄 " +
                      u.grenades.spent.frag +
                      "</p>",
                  )
                  .join("") +
                "</section>"
              );
            })
            .join("")
        : "") +
      r.roster
        .map(
          (u) =>
            "<article><strong>" +
            esc(u.name) +
            " · " +
            dis[u.disposition] +
            "</strong><p>사격 " +
            u.stats.shots +
            "발 · 관측 보고 " +
            u.stats.observations +
            "건 · 조원 처치 " +
            u.stats.aid +
            "건</p><p>탄약 소모 · " +
            esc(
              Object.entries(u.stats.shotsByModel)
                .map(([model, n]) => model + " " + n + "발")
                .join(" / ") || "소모 없음",
            ) +
            "<br>주무장 " +
            esc(u.weapon.model) +
            " · 상태 " +
            Math.round(u.weapon.condition) +
            "%</p><p>" +
            u.injuries
              .map(
                (w) =>
                  esc(
                    {
                      head: "머리",
                      chest: "흉부",
                      abdomen: "복부",
                      leftArm: "왼팔",
                      rightArm: "오른팔",
                      leftLeg: "왼다리",
                      rightLeg: "오른다리",
                    }[w.part] || "미상",
                  ) +
                  " 총상 " +
                  w.severity +
                  "단계 · " +
                  (w.treated ? "현장 처치 완료·복귀 치료 필요" : "미처치"),
              )
              .join("<br>") +
            "</p></article>",
        )
        .join("") +
      "</div>" +
      (r.agencySecurity
        ? "<p>기관 보병 보안조 " +
          r.agencySecurity.length +
          "명 · 생존 " +
          r.agencySecurity.filter((a) => a.alive).length +
          "명 · 사망 " +
          r.agencySecurity.filter((a) => !a.alive).length +
          "명 · 실제 사격 " +
          r.agencySecurity.reduce((n, a) => n + a.shots, 0) +
          "발</p>"
        : "") +
      "<p>기관 신뢰 " +
      r.clientTrust +
      "/100 · 지원 사용: 드론 " +
      r.supports.drone +
      "회 / 의료 회수 " +
      r.supports.medical +
      "회 / 보급 " +
      r.supports.supply +
      '회</p><p class="muted">같은 작전의 보수·경력·부상은 한 번만 반영됩니다. 현장 처치가 완료되어도 본부에서 치료가 끝나기 전에는 편성하지 못합니다.</p></section>'
    );
  }
  function render(s, { editable = true } = {}) {
    if (s?.schemaVersion !== 5)
      return '<section class="panel">저장 복구·전환 후 실전 의뢰를 열 수 있습니다.</section>';
    const accepted = s.contracts.find((c) => c.status === "accepted"),
      active = !!s.activeMission,
      inspection = s.operations.inspection;
    return (
      '<section class="page-title"><span class="eyebrow">OPERATIONS / AGENCY CONTRACTS</span><h1>작전 의뢰·계약</h1><p>실전 계약은 실제 부상·전사·미회수, 소모품 사용과 보수에 영향을 줍니다. 단 한 작전만 진행하며 귀환 점검 후 다음 출격이 가능합니다.</p></section>' +
      (active
        ? '<section class="panel"><h2>실전 작전 진행 중</h2><p>의뢰 기관 수송·지원과 철수 진행을 전장에서 확인할 수 있습니다.</p><button data-live-open-field>진행 중 작전 관찰</button></section>'
        : "") +
      (inspection && !inspection.completed
        ? '<section class="panel"><h2>귀환 후 점검·재정비</h2><p>의료 인계·무장 확인·보고 검토를 완료해야 다음 계약을 출격할 수 있습니다. 실제 부상 치료는 대원 상세에서 별도로 배정합니다.</p><button data-live-inspect' +
          (!editable || active ? " disabled" : "") +
          ">귀환 점검 · 남은 " +
          Math.max(
            0,
            Math.ceil((inspection.dueAt - s.clock.elapsedSeconds) / 3600),
          ) +
          "시간 진행</button></section>"
        : "") +
      (accepted
        ? '<section class="panel accepted-contract"><span class="eyebrow">ACCEPTED CONTRACT</span><h2>' +
          esc(accepted.title) +
          "</h2><p>" +
          esc(accepted.issuer) +
          " · 권장 " +
          accepted.recommended +
          "명 · 현재 편성 " +
          M.selectedSquads(s, accepted).length * 2 +
          '명</p><fieldset class="sortie-teams" data-sortie-teams="' +
          esc(accepted.id) +
          '"><legend>투입 저격조 선택 · ' +
          M.selectedSquads(s, accepted).length +
          "개 조 / " +
          M.selectedSquads(s, accepted).length * 2 +
          "명</legend>" +
          s.squads
            .map(
              (q) =>
                '<label><input type="checkbox" value="' +
                esc(q.callsign) +
                '"' +
                (M.selectedSquads(s, accepted).some(
                  (t) => t.callsign === q.callsign,
                )
                  ? " checked"
                  : "") +
                (!editable || active ? " disabled" : "") +
                ">" +
                esc(q.callsign) +
                "</label>",
            )
            .join("") +
          "</fieldset>" +
          root.OverwatchInfantry.sortie(s) +
          "<p>선택하지 않은 팀은 본부에 대기합니다. 최소 인원 제한 없이 직접 편성을 결정합니다.</p><p>예치금 없이 출격합니다. 실제 사용·손실은 귀환 후 보수와 정산하며 부족분은 미지급 비용으로 기록합니다.</p><p>미지급 작전 비용 " +
          cash(s.operations.payable || 0) +
          "</p><p>" +
          esc(M.ready(s, accepted) || "편성·계약·회복 조건 충족") +
          '</p><div class="inline-actions"><button data-live-launch="' +
          esc(accepted.id) +
          '"' +
          (!editable || M.ready(s, accepted) ? " disabled" : "") +
          '>실전 계약 출격</button><button data-live-cancel="' +
          esc(accepted.id) +
          '"' +
          (!editable || active ? " disabled" : "") +
          ">수락 취소</button></div></section>"
        : "") +
      '<section class="panel"><div class="personnel-section-title"><h2>접수된 의뢰</h2><button data-live-refresh' +
      (!editable ||
      active ||
      accepted ||
      s.clock.elapsedSeconds < s.operations.nextRefreshAt
        ? " disabled"
        : "") +
      '>새 제안 접수</button></div><p class="muted">다음 접수 ' +
      ts(s.operations.nextRefreshAt) +
      ' · 제안 마감은 출발 전 계약에만 적용되며 이미 출격한 작전은 철회하지 않습니다.</p></section><div class="live-contract-grid">' +
      s.contracts
        .filter((c) => !["settled", "expired"].includes(c.status))
        .map(
          (c) =>
            '<article class="panel"><div class="personnel-section-title"><span class="eyebrow">' +
            esc(c.issuer) +
            '</span><span class="status-pill">' +
            labels[c.status] +
            "</span></div><h2>" +
            esc(c.title) +
            "</h2><p>" +
            esc(c.type) +
            " · " +
            esc(c.region || "능선") +
            " · 위험도 " +
            c.risk +
            " · 권장 " +
            c.recommended +
            "명</p><p>" +
            esc(c.brief) +
            "</p>" +
            proposal(c) +
            "<p>기관 보병 보안조 " +
            (c.agencyInfantry || 4) +
            "명 제공 · 저격조 접근로·철수로 경계 / 엄폐·대응 사격</p>" +
            (c.status === "offered"
              ? '<label class="contract-region">작전 지역<select data-live-region="' +
                esc(c.id) +
                '"' +
                (!editable || active ? " disabled" : "") +
                ">" +
                M.regionsFor(c)
                  .map(
                    (map) =>
                      '<option value="' +
                      esc(map.id) +
                      '"' +
                      (map.id === c.mapId ? " selected" : "") +
                      ">" +
                      esc(map.name) +
                      "</option>",
                  )
                  .join("") +
                "</select></label>"
              : "") +
            "<p>기본 " +
            cash(c.reward) +
            " / 성과 " +
            cash(c.bonus) +
            "<br>제안 마감 " +
            ts(c.expiresAt) +
            "</p><p>수송 " +
            { foot: "도보", vehicle: "제공 차량", helicopter: "제공 헬기" }[
              c.transport
            ] +
            " · 드론 " +
            c.support.drone +
            "회 / 의료 회수 " +
            c.support.medical +
            "회 / 보급 " +
            c.support.supply +
            '회</p><p class="muted">민간인 안전 준수 · 보너스는 목표·실제 생존 복귀·인명 손실 없음·' +
            Math.round(c.bonusWindow / 60) +
            '분 이내 조건입니다. 시간 초과로 작전을 강제 종료하지 않습니다.</p><button data-live-accept="' +
            esc(c.id) +
            '"' +
            (!editable || active || accepted || c.status !== "offered"
              ? " disabled"
              : "") +
            ">계약 수락</button></article>",
        )
        .join("") +
      '</div><section class="panel"><h2>작전 종료·정산 기록 · ' +
      s.operations.reports.length +
      '건</h2><div class="live-reports">' +
      s.operations.reports
        .slice(-10)
        .reverse()
        .map(
          (r) =>
            "<details><summary>" +
            esc(r.title) +
            " · " +
            (r.success ? "성공" : "실패·철수") +
            " · " +
            ts(r.endedAt) +
            "</summary>" +
            result(r) +
            (r.radio
              ? '<details><summary>실제 무전 기록</summary><ol class="plain-list">' +
                r.radio
                  .slice(-40)
                  .map(
                    (a) =>
                      "<li>" +
                      esc(a.from.name) +
                      " → " +
                      esc(a.to.name) +
                      " · " +
                      esc(a.body) +
                      "</li>",
                  )
                  .join("") +
                "</ol></details>"
              : "") +
            "</details>",
        )
        .join("") +
      "</div></section>"
    );
  }
  function livePanel(s) {
    const m = D.frame(s)?.mission;
    if (!m) return "";
    return (
      '<section class="panel live-field-panel"><span class="eyebrow">LIVE CONTRACT / AGENCY SUPPORT</span><h2>' +
      esc(m.title) +
      "</h2><p>" +
      (m.targetLabel
        ? "BLACKLINE 저격조: 계약 표적 식별·정밀 사격 / 기관 보병: 접근로·철수로 경계·엄호. 일반 경계병 사살은 계약 목표에 포함하지 않습니다."
        : "BLACKLINE 저격조: 원거리 관측·정밀 엄호 / 기관 보병·구출조: 현장 접근·구출·호송") +
      "</p><p>" +
      esc(m.issuer) +
      " · <strong data-live-phase>" +
      esc(phases[m.phase] || m.phase) +
      '</strong></p><p data-agency-control>기관 보병: 현장 투입 대기</p><section class="agency-command-controls"><h3>기관 작전 지휘</h3><p>기관 자체 지휘 · 본부 부대와 별도 운용</p><div class="inline-actions">' +
      (m.agencyAutonomous
        ? "기관 저격조·보병은 기관 지휘망으로 독립 작전 중"
        : [
            ["auto", "자율 수색"],
            ["hold", "엄폐·엄호"],
            ["advance", "구역 진출"],
            ["withdraw", "보병 철수"],
          ]
            .map(
              ([mode, label]) =>
                '<button data-agency-order="' +
                mode +
                '" aria-pressed="' +
                (m.agencyDirective === mode) +
                '"' +
                (s.commandExercise.status !== "running" ? " disabled" : "") +
                ">" +
                label +
                "</button>",
            )
            .join("")) +
      "</div><p data-agency-order-status></p></section><p data-live-objective></p><p data-live-transport-status></p><p>제공 수송 " +
      { foot: "도보", vehicle: "차량", helicopter: "헬기" }[m.transport] +
      " · 귀환 후 실제 사용분 정산" +
      '</p><div class="inline-actions">' +
      [
        ["drone", "UAV 정찰 요청"],
        ["medical", "보고된 부상자 의료 회수"],
      ]
        .map(
          ([k, v]) =>
            '<button data-live-support="' +
            k +
            '"' +
            (s.commandExercise.status !== "running" ||
            m.usedSupport[k] >= m.support[k]
              ? " disabled"
              : "") +
            ">" +
            v +
            " · " +
            m.usedSupport[k] +
            "/" +
            m.support[k] +
            "</button>",
        )
        .join("") +
      "</div><button data-live-drone-retask" +
      (!s.commandExercise.mission.transports.some(
        (t) => t.trip === "drone" && t.state !== "home",
      )
        ? " disabled"
        : "") +
      '>UAV 관측구역 변경</button><button data-live-drone-camera disabled>UAV 추적 관전</button><p class="muted">지원은 출발 준비와 이동 시간이 필요합니다. 위협이 관측되면 착륙을 보류합니다. 계약에 없는 지원은 제공되지 않습니다.</p><details><summary>회수·미회수 통제</summary><button data-live-pickup' +
      (s.commandExercise.status !== "running" || m.transport === "foot"
        ? " disabled"
        : "") +
      ">아군 마지막 보고 위치에서 회수 요청</button><p>회수 불가능한 인원은 미회수·실종으로 보관합니다. 정상 복귀 보수는 지급하지 않습니다.</p><button data-live-missing" +
      (s.commandExercise.status !== "running" ||
      !m.returnRequested ||
      fTime(s) < 60
        ? " disabled"
        : "") +
      ">미회수·실종 보관 후 종료</button></details></section>"
    );
  }
  function fTime(s) {
    return s.commandExercise?.time || 0;
  }
  function refresh(rootNode, s) {
    const f = D.frame(s),
      m = f?.mission;
    if (!m) return;
    const names = {
      home: "본부 대기",
      settled: "작전 종료 · 정산 완료",
      boarding: "탑승 중",
      driving: "지상 이동",
      flying: "비행",
      takeoff: "이륙",
      landing: "착륙",
      loading: "회수 인원 확인·탑승",
      "ground-hold": "위협으로 접근 보류",
      "air-hold": "위협으로 착륙 보류",
      "route-blocked": "이동 경로 없음",
      "medical-work": "현장 회수",
    };
    const transportStatus = rootNode.querySelector(
      "[data-live-transport-status]",
    );
    if (transportStatus)
      transportStatus.textContent = (m.diagnosis || [])
        .map(
          (t) =>
            (t.id === "primary" ? "주 수송" : t.id) +
            " · " +
            (names[t.state] || t.state) +
            " · 남은 경로 " +
            Math.round(t.remainingDistance || 0) +
            "m · 탑승 " +
            t.passengers +
            "명",
        )
        .join(" / ");
    const infantry = rootNode.querySelector("[data-infantry-doctrine]");
    if (infantry && m.hqInfantry)
      infantry.textContent =
        Object.entries(m.hqInfantry.teamDirectives || {})
          .map(
            ([call, d]) =>
              root.OverwatchInfantry.teamLabel(call) +
              " · " +
              (d.assignment ||
                {
                  auto: "통제관 위임",
                  hold: "분산 엄폐",
                  advance: "구역 진출",
                  withdraw: "철수",
                }[d.mode]) +
              " · " +
              (d.source === "headquarters" ? "본부 직접" : "작전통제관"),
          )
          .join(" / ") || "본부 보병 · 명령 대기";
    const commandTeam = rootNode.querySelector(
        "[data-infantry-command-team]",
      )?.value,
      currentInfantryDirective =
        m.hqInfantry?.teamDirectives?.[commandTeam] || m.hqInfantry?.directive;
    for (const b of rootNode.querySelectorAll("[data-infantry-order]")) {
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.infantryOrder === currentInfantryDirective?.mode),
      );
      b.disabled = s.commandExercise.status !== "running" || m.returnRequested;
    }
    const throwStatus = rootNode.querySelector("[data-infantry-throw-status]");
    if (throwStatus)
      throwStatus.textContent = m.hqInfantry?.lastThrowFailure || "";
    const phase = rootNode.querySelector("[data-live-phase]");
    if (phase) phase.textContent = phases[m.phase] || m.phase;
    const agency = rootNode.querySelector("[data-agency-control]");
    if (agency && m.targetLabel)
      agency.textContent =
        "지정 표적 " + m.targetLabel + " · 저격조 자율 관측·신원 식별";
    if (
      agency &&
      m.securityControl &&
      ["eliminate", "interdict", "recon"].includes(m.task)
    )
      agency.textContent =
        (m.targetLabel ? "지정 표적 " + m.targetLabel + " · " : "") +
        "기관 보병 " +
        m.agencyInfantry +
        "명 · " +
        m.securityControl.reason;
    else if (agency && m.agencyControl)
      agency.textContent =
        "기관 보병: " + m.agencyControl.reason + " · 자체 수색·경계·교전";
    for (const b of rootNode.querySelectorAll("[data-agency-order]")) {
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.agencyOrder === m.agencyDirective),
      );
      b.disabled = s.commandExercise.status !== "running" || m.returnRequested;
    }
    const directive = rootNode.querySelector("[data-agency-order-status]");
    if (directive)
      directive.textContent =
        "수신 지시: " +
        ({
          auto: "현장 자율 수색",
          hold: "분산 엄폐·엄호",
          advance: "담당 구역 진출",
          withdraw: "보병 회수 지점 철수",
        }[m.agencyDirective] || "현장 자율 수색") +
        (m.agencyDirectiveSource === "controller"
          ? " · 작전통제관 지시"
          : m.agencyDirectiveSource === "headquarters"
            ? " · 본부 직접 지시"
            : "");
    const goal = rootNode.querySelector("[data-live-objective]");
    if (goal)
      goal.textContent =
        "본부 수신 목표: " +
        {
          pending: "진행 중",
          complete: "확인 완료 · 철수 필요",
          failed: "목표 실패 · 철수 판단 필요",
        }[m.objective];
    if (goal && m.reconProgress)
      goal.textContent +=
        " · 구역 확인 " +
        m.reconProgress.checked +
        "/" +
        m.reconProgress.required +
        (m.reconProgress.current ? " · " + m.reconProgress.current : "");
    if (goal && m.groundSearch)
      goal.textContent +=
        " · 보병 수색 " +
        m.groundSearch.checked +
        "/" +
        m.groundSearch.required +
        " · " +
        m.groundSearch.area +
        (m.targetProgress
          ? " · 현장 확보 " +
            (m.groundSearch.secured || 0) +
            "/" +
            m.targetProgress.required
          : "");
    if (goal && m.targetProgress)
      goal.textContent +=
        " · 신원 " +
        m.targetProgress.identified +
        "/" +
        m.targetProgress.required +
        " · 저지·사살 " +
        m.targetProgress.confirmed +
        "/" +
        m.targetProgress.required;
    if (m.phase === "settled" && goal)
      goal.textContent =
        "작전 종료 · " +
        (m.report?.success ? "목표 달성" : "목표 미달성·중단") +
        " · 정산 완료";
    const clock = rootNode.querySelector("[data-field-objective]");
    if (clock)
      clock.textContent =
        "실전 계약 · " +
        { pending: "임무 진행", complete: "목표 확인", failed: "목표 실패" }[
          m.objective
        ];
    const camera = rootNode.querySelector("[data-live-drone-camera]");
    if (camera)
      camera.disabled = !f.transports.some(
        (t) => t.type === "drone" && t.state !== "home",
      );
    const retask = rootNode.querySelector("[data-live-drone-retask]");
    if (retask)
      retask.disabled = !s.commandExercise.mission.transports.some(
        (t) => t.trip === "drone" && t.state !== "home",
      );
    for (const el of rootNode.querySelectorAll("[data-live-support]"))
      el.disabled =
        s.commandExercise.status !== "running" ||
        m.usedSupport[el.dataset.liveSupport] >=
          m.support[el.dataset.liveSupport];
    const missing = rootNode.querySelector("[data-live-missing]");
    if (missing)
      missing.disabled =
        s.commandExercise.status !== "running" ||
        !m.returnRequested ||
        f.time < 60;
  }
  function bind(
    rootNode,
    { state: s, editable, commit, execute = commit, play, navigate },
  ) {
    const each = (sel, fn) =>
      rootNode.querySelectorAll(sel).forEach((b) =>
        b.addEventListener("click", () => {
          if (editable) fn(b);
        }),
      );
    each("[data-live-accept]", (b) =>
      commit((next) => M.accept(next, b.dataset.liveAccept)),
    );
    each("[data-live-cancel]", (b) =>
      commit((next) => M.cancel(next, b.dataset.liveCancel)),
    );
    rootNode.querySelectorAll(".contract-proposal").forEach((el) =>
      el.addEventListener("toggle", () => {
        if (el.open) el.scrollIntoView({ block: "start", behavior: "smooth" });
      }),
    );
    each("[data-live-launch]", (b) => {
      root.OverwatchAudio?.startOnGesture?.();
      if (
        confirm(
          "실전 계약 출격: 부상·전사·미회수는 영구 기록됩니다. 출격합니까?",
        )
      )
        if (
          commit((next) => {
            M.launch(next, b.dataset.liveLaunch);
            next.ui.tab = "field";
          })
        ) {
          navigate("field");
          play?.();
        }
    });
    each("[data-live-inspect]", () => commit((next) => M.inspection(next)));
    each("[data-live-refresh]", () => commit((next) => M.refresh(next)));
    rootNode.querySelectorAll("[data-sortie-teams] input").forEach((input) =>
      input.addEventListener("change", () => {
        const field = input.closest("[data-sortie-teams]"),
          calls = [...field.querySelectorAll("input:checked")].map(
            (i) => i.value,
          );
        commit((next) => M.setTeams(next, field.dataset.sortieTeams, calls));
      }),
    );
    rootNode
      .querySelectorAll("[data-live-region]")
      .forEach((select) =>
        select.addEventListener("change", () =>
          commit((next) =>
            M.selectRegion(next, select.dataset.liveRegion, select.value),
          ),
        ),
      );
    each("[data-live-open-field]", () => navigate("field"));
    each("[data-agency-order]", (b) =>
      execute((next) => M.commandAgency(next, b.dataset.agencyOrder)),
    );
    each("[data-live-support]", (b) =>
      execute((next) =>
        M.requestSupport(
          next,
          b.dataset.liveSupport,
          b.dataset.liveSupport === "drone"
            ? root.OverwatchFieldUI?.selectedPoint?.()
            : null,
        ),
      ),
    );
    each("[data-live-drone-camera]", () =>
      root.OverwatchFieldUI?.focusSupport?.(),
    );
    each("[data-live-drone-retask]", () =>
      execute((next) =>
        M.retaskDrone(next, root.OverwatchFieldUI?.selectedPoint?.()),
      ),
    );
    each("[data-live-pickup]", () =>
      execute((next) => M.requestReturn(next, { pickup: M.pickupPoint(next) })),
    );
    each("[data-live-missing]", () => {
      if (confirm("미회수 인원을 실종으로 보관하고 작전을 종료합니까?"))
        commit((next) => M.declareMissing(next));
    });
  }
  root.OverwatchMissionUI = { render, result, livePanel, refresh, bind };
})(typeof window === "undefined" ? globalThis : window);
