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
    lastFrame = null;
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
      (u) => !u.stale && (!u.health || u.health.alive),
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
      '<svg viewBox="0 0 1200 800" role="img" aria-label="3D와 같은 본부 수신 정보의 2D 전술지도"><rect width="1200" height="800" fill="#e6edde"/>' +
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
      '<rect x="80" y="680" width="40" height="40" fill="#637b5c"/>' +
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
      f.friends
        .map(
          (u) =>
            '<g opacity="' +
            (u.stale ? 0.4 : 1) +
            '"><path d="M' +
            (u.x - 7) +
            " " +
            (u.y - 10) +
            'h14v20h-14z" fill="' +
            (u.role === "observer" ? "#52765c" : "#547a9c") +
            '" stroke="white" stroke-width="2"/><title>' +
            esc(u.name) +
            " · " +
            u.age +
            "초 전 보고</title></g>",
        )
        .join("") +
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
              " <small>" +
              esc(u.callsign) +
              "</small></strong><p>" +
              (u.role === "observer" ? "관측수" : "저격수") +
              " · " +
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
              "</p><small>" +
              esc(u.weapon?.name || "장비 보고 대기") +
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
              "</small><small>" +
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
              "</small></div></article>",
          )
          .join("")
      : "<p>텔레메트리 수신 대기. 아직 조원 위치를 본부에 공개하지 않았습니다.</p>";
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
    if(f.mission)return root.OverwatchMissionUI.result(f.mission.report);
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
    if (![4,5].includes(s?.schemaVersion))
      return '<section class="panel">본부 저장을 복구한 뒤 전장을 열 수 있습니다.</section>';
    const f = D.frame(s),
      battle = f?.battle,
      active = battle && f.status === "running";
    return (
      '<section class="page-title"><span class="eyebrow">PHASE 04 / FIELD SIMULATOR</span><h1>OVERWATCH 전장</h1><p>관측수 지휘 아래 움직이는 실시간 모의 전장입니다. 적 AI·탄약·총상·응급처치는 연습 상태에 저장하며, 본부 대원의 영구 손실·재고·계약 보수에는 아직 반영하지 않습니다.</p></section>' +
      (!battle || !active
        ? '<section class="panel"><h2>전장 연습 편성</h2><p>현재 편성한 저격조를 사용합니다. 정찰은 무장 인원 2개 접촉 식별, 위협 차단은 현장 무장 인원의 행동 중지를 확인한 뒤 집결지로 복귀합니다. 지원 헬기·차량은 계약 시스템 연결 전이므로 출동하지 않습니다.</p><label class="field-label">연습 과업<select data-field-scenario><option value="recon">능선 정찰·감시</option><option value="interdiction">위협 차단·복귀</option></select></label><button data-field-start' +
          (!editable ||
          !s.squads.length ||
          s.commandExercise?.status === "running"
            ? " disabled"
            : "") +
          ">편성 저격조 모의 전장 시작</button></section>"
        : "") +
      (battle
        ? '<div class="field-layout"><section><div class="panel field-stage" data-field-stage><div class="field-stage-toolbar"><span data-field-clock>' +
          stamp(f.time) +
          '</span><div><button data-field-view="2d">2D</button><button data-field-view="3d">3D</button><button data-field-zoom=".65" aria-label="지도 확대">+</button><button data-field-zoom="1.5" aria-label="지도 축소">−</button><button data-field-follow>추적 고정</button><button data-field-overview>전체 지역</button><button data-field-fullscreen>지도 전체화면</button></div></div><div class="field-viewport" data-field-id="' +
          esc(s.campaignId + ":" + f.id) +
          '"></div><div class="field-stage-caption">수신된 위치만 표시 · 적은 실제 관측·보고 후 표시 · 드래그 시점 회전</div></div><section class="panel"><div class="field-controls">' +
          (active
            ? "<button data-field-play" +
              (!editable ? " disabled" : "") +
              ">" +
              (!f.paused && playing ? "일시정지" : "재생") +
              "</button>" +
              [1, 2, 4]
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
              "<button data-field-withdraw" +
              (!editable ? " disabled" : "") +
              ">조 전체 복귀 명령</button><button data-field-end" +
              (!editable ? " disabled" : "") +
              ">연습 통제 종료</button>"
            : "<span>연습 종료</span>") +
          "</div><p data-field-status>" +
          esc(f.pauseReason || "본부 명령 대기") +
          "</p><p data-field-weather></p><p data-field-objective>본부 수신 목표: " +
          (battle.objective ? "확인 완료 · 복귀 필요" : "관측·교전 보고 대기") +
          '</p><p class="muted">재접속·다른 탭·백그라운드 전환 시 정지합니다. 2D/3D 전환은 전장 상태를 다시 생성하지 않습니다.</p>' +
          (active
            ? '<form data-field-command><label>저격조<select name="callsign">' +
              f.squads
                .map(
                  (q) =>
                    "<option" +
                    (s.ui.fieldCallsign === q.callsign ? " selected" : "") +
                    ">" +
                    q.callsign +
                    "</option>",
                )
                .join("") +
              '</select></label><label>명령<select name="kind">' +
              Object.entries(D.ORDERS)
                .map(([k, v]) => '<option value="' + k + '">' + v + "</option>")
                .join("") +
              '</select></label><label>X (m)<input name="x" type="number" min="10" max="1190" value="220" required></label><label>Y (m)<input name="y" type="number" min="10" max="790" value="200" required></label><label>교전 규칙<select name="roe"><option value="hold">사격 금지</option><option value="selfDefense">자위 대응</option><option value="authorized">확인된 무장 인원 대응</option></select></label><button type="submit"' +
              (!editable ? " disabled" : "") +
              ">관측수에게 송신</button></form>"
            : "") +
          "</section><div data-field-result>" +
          result(f) +
          '</div></section><aside><section class="panel"><h2>조원 상태 · 수신 정보</h2><div data-field-roster>' +
          roster(f) +
          '</div></section><section class="panel"><h2>현장 무전</h2><ol class="field-radio" data-field-radio>' +
          radio(f) +
          "</ol></section></aside></div>"
        : "")
    );
  }
  function render(s,opts){let html=renderBase(s,opts);if(!s?.commandExercise?.mission)return html;const f=D.frame(s);html=html.replace(/<section class="page-title">[\s\S]*?<\/section>/,'<section class="page-title"><span class="eyebrow">LIVE OPERATION / AGENCY CONTRACT</span><h1>실전 작전 지휘</h1><p>실제 부상·전사·미회수·소모품·보수가 본부 기록에 반영됩니다. 기관이 계약에서 제공한 수송·지원만 사용할 수 있습니다.</p></section>'+root.OverwatchMissionUI.livePanel(s));html=html.replace(/<section class="panel"><h2>전장 연습 편성[\s\S]*?<\/section>/,'');return html.replace('연습 통제 종료','작전 중단·철수').replace('조 전체 복귀 명령','철수·제공 수송 요청');}
  function refresh(rootNode, s, { playing = false } = {}) {
    const f = D.frame(s);
    if (!f?.battle) return;
    if(f.mission)root.OverwatchMissionUI.refresh(rootNode,s);
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
      f.pauseReason || (!f.paused && playing ? "실시간 전장 진행" : "일시정지"),
    );
    set(
      "[data-field-objective]",
      "본부 수신 목표: " +
        (f.battle.objective ? "확인 완료 · 복귀 필요" : "관측·교전 보고 대기"),
    );
    set("[data-field-play]", !f.paused && playing ? "일시정지" : "재생");
    const people = rootNode.querySelector("[data-field-roster]");
    if(f.mission)root.OverwatchMissionUI.refresh(rootNode,s);
    if (people) {
      const text = roster(f);
      if (people.innerHTML !== text) people.innerHTML = text;
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
    const viewport = rootNode.querySelector(".field-viewport");
    if (viewport) {
      if (s.fieldPreferences.view === "3d") R.get()?.update(f);
      else {
        const viewBox = viewport.querySelector("svg")?.getAttribute("viewBox");
        viewport.innerHTML = map2D(f);
        const svg = viewport.querySelector("svg");
        if (viewBox) svg.setAttribute("viewBox", viewBox);
        if (follow2D) followFlat(svg, f);
      }
    }
  }
  function mount(rootNode, s, { onFallback = () => {}, playing = false } = {}) {
    const f = D.frame(s),
      host = rootNode.querySelector(".field-viewport");
    if (!host || !f?.battle) {
      R.dispose();
      return;
    }
    if (s.fieldPreferences.view === "3d") {
      if (R.get()?.host !== host) {
        R.dispose();
        host.replaceChildren();
        R.create(host, f, { onFallback });
      } else R.get().update(f);
    } else {
      R.dispose();
      host.innerHTML = map2D(f);
    }
    refresh(rootNode, s, { playing });
  }
  function bind(rootNode, { state: s, editable, commit, play, onFallback }) {
    const on = (sel, fn) =>
      rootNode.querySelector(sel)?.addEventListener("click", fn);
    on("[data-field-start]", () => {
      if (editable)
        commit((next) =>
          B.begin(next, {
            scenario: rootNode.querySelector("[data-field-scenario]").value,
          }),
        );
    });
    on("[data-field-play]", () => {
      if (editable) play();
    });
    on("[data-field-withdraw]", () => {
      if (editable) commit((next) => B.withdraw(next));
    });
    on("[data-field-end]", () => {
      if (
        editable &&
        confirm(
          "모의 전장을 통제 종료할까요? 집결지에 도착하지 않은 인원은 복귀 완료로 처리하지 않습니다.",
        )
      )
        commit((next) => next.commandExercise.mission?root.OverwatchMissions.requestReturn(next,{abort:true}):D.end(next, "control"));
    });
    rootNode.querySelectorAll("[data-field-speed]").forEach((b) =>
      b.addEventListener("click", () => {
        if (editable)
          commit((next) => B.speed(next, Number(b.dataset.fieldSpeed)));
      }),
    );
    rootNode.querySelectorAll("[data-field-view]").forEach((b) =>
      b.addEventListener("click", () => {
        if (editable)
          commit((next) => (next.fieldPreferences.view = b.dataset.fieldView));
      }),
    );
    const commandForm = rootNode.querySelector("[data-field-command]");
    if (commandForm && !commandForm.dataset.fieldBound) {
      commandForm.dataset.fieldBound = "1";
      commandForm.dataset.fieldEditable = String(editable);
      commandForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!editable) return;
        const f = event.currentTarget;
        commit((next) => {
          next.ui.fieldCallsign = f.elements.callsign.value;
          D.issue(
            next,
            f.elements.callsign.value,
            f.elements.kind.value,
            { x: Number(f.elements.x.value), y: Number(f.elements.y.value) },
            f.elements.roe.value,
          );
        });
      });
    }
    rootNode
      .querySelectorAll("[data-field-zoom]")
      .forEach((b) =>
        b.addEventListener("click", () =>
          R.get()
            ? R.get().zoom(Number(b.dataset.fieldZoom))
            : zoom2D(rootNode, Number(b.dataset.fieldZoom)),
        ),
      );
    on("[data-field-follow]", () => {
      const follow = R.get() ? R.get().follow() : (follow2D = !follow2D);
      if (!R.get() && follow2D && lastFrame)
        followFlat(rootNode.querySelector(".field-viewport svg"), lastFrame);
      rootNode.querySelector("[data-field-follow]").textContent = follow
        ? "추적 고정"
        : "자유 시점";
    });
    on("[data-field-overview]", () => {
      if (R.get()) R.get().overview();
      else {
        follow2D = false;
        rootNode
          .querySelector(".field-viewport svg")
          ?.setAttribute("viewBox", "0 0 1200 800");
      }
    });
    on("[data-field-fullscreen]", async () => {
      const stage = rootNode.querySelector(".field-stage"),
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
          screen.orientation?.unlock?.();
        } catch {}
      }
      R.get()?.resize();
    });
  }
  function closeMap() {
    const stage = document.querySelector(".field-fullscreen");
    if (!stage) return;
    stage.classList.remove("field-fullscreen");
    const button = stage.querySelector("[data-field-fullscreen]");
    if (button) button.textContent = "지도 전체화면";
    try {
      screen.orientation?.unlock?.();
      if (document.fullscreenElement)
        document.exitFullscreen()?.catch(() => {});
    } catch {}
    R.get()?.resize();
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMap();
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) closeMap();
  });
  root.OverwatchFieldUI = { render, refresh, mount, bind, map2D };
})(typeof window === "undefined" ? globalThis : window);
