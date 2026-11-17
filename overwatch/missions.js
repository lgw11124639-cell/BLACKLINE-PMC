/* Live operations: signed offers, physical agency transport/support and exactly-once debrief.
   The training engine is retained; only explicitly launched contracts have permanent effects. */
(function (root) {
  "use strict";
  const P =
      root.OverwatchPersonnel ||
      (typeof require === "function" ? require("./personnel.js") : null),
    G =
      root.OverwatchGeometry ||
      (typeof require === "function" ? require("./geometry.js") : null),
    D = () =>
      root.OverwatchCommand ||
      (typeof require === "function" ? require("./command.js") : null),
    B = () =>
      root.OverwatchBattle ||
      (typeof require === "function" ? require("./battle.js") : null),
    copy = (x) => JSON.parse(JSON.stringify(x)),
    ok = (v, m) => {
      if (!v) throw Error(m);
    },
    I = () => D().internals,
    Infantry = () =>
      root.OverwatchInfantry ||
      (typeof require === "function" ? require("./infantry.js") : null),
    Ordnance = () =>
      root.OverwatchOrdnance ||
      (typeof require === "function" ? require("./ordnance.js") : null);
  const PRICES = {
    ".338 Lapua Magnum": 12000,
    "5.56×45mm": 800,
    "9×19mm": 450,
  };
  const TEMPLATES = [
    {
      key: "ridge-watch",
      issuer: "세라 합동군",
      title: "서측 능선 위협 감시",
      type: "정찰·감시",
      task: "recon",
      min: 2,
      recommended: 2,
      risk: 2,
      reward: 4500000,
      bonus: 900000,
      transport: "vehicle",
      drone: true,
      medical: false,
      supply: false,
      brief:
        "순찰 증가 보고의 진위를 확인한다. 여섯 담당 구역의 접근로와 위협을 실제 관측·식별하고 복귀한다.",
    },
    {
      key: "aid-cover",
      issuer: "국제구호조정단",
      title: "구호대 이동 저격 엄호",
      type: "아군 부대 지원",
      task: "escort",
      min: 2,
      recommended: 4,
      risk: 2,
      reward: 6500000,
      bonus: 1300000,
      transport: "helicopter",
      drone: false,
      medical: true,
      supply: true,
      brief:
        "현장 구호대 두 명이 남부 통로로 이동한다. 이들이 도착할 때까지 관측·엄호한다. 사전 사살 목표는 없다.",
    },
    {
      key: "rescue-cover",
      issuer: "합동특수작전사령부",
      title: "억류 의료인 구출 지원",
      type: "구조 작전 지원",
      task: "rescue",
      min: 4,
      recommended: 6,
      risk: 3,
      reward: 10500000,
      bonus: 2100000,
      transport: "helicopter",
      drone: true,
      medical: true,
      supply: false,
      brief:
        "기관 구출조가 억류 의료인에게 접근한다. 실제 합류·처치·이송과 집결지 도착까지 엄호한다. 실내 진입 임무는 아니다.",
    },
    {
      key: "vip-cover",
      issuer: "세라 외교보호국",
      title: "연락관 이동 경호",
      type: "VIP 경호",
      task: "vip",
      min: 2,
      recommended: 4,
      risk: 3,
      reward: 7200000,
      bonus: 1400000,
      transport: "vehicle",
      drone: true,
      medical: true,
      supply: false,
      brief:
        "의뢰 기관의 경호조와 연락관이 이동한다. 보호 대상의 생존·목적지 도착이 계약 조건이다.",
    },
    {
      key: "quiet-watch",
      issuer: "지역 정보연락실",
      title: "원거리 경계 관측",
      type: "위협 감시",
      task: "recon",
      min: 2,
      recommended: 2,
      risk: 1,
      reward: 3200000,
      bonus: 600000,
      transport: "foot",
      drone: false,
      medical: false,
      supply: false,
      brief:
        "도보로 출발해 담당 여섯 구역을 실제 정찰한다. 별도 수송·의료 회수·공습 지원은 제공되지 않는다.",
    },
    {
      key: "high-value-target",
      issuer: "지역 정보연락실",
      title: "지휘관 암살",
      type: "지정 표적 암살",
      task: "eliminate",
      targetCount: 1,
      targetLabel: "RAVEN",
      min: 2,
      recommended: 4,
      risk: 3,
      reward: 9800000,
      bonus: 2000000,
      transport: "vehicle",
      drone: true,
      medical: true,
      supply: false,
      brief:
        "무장 지휘관 RAVEN이 이동해 회합 장소에 도착한다. 관측수가 계약 표적의 신원을 실제 식별한 뒤 사살을 확인하고 철수한다. 일반 경계병 사살은 목표에 포함하지 않는다.",
    },
    {
      key: "counter-sniper",
      issuer: "세라 합동군",
      title: "적 저격수 제거",
      type: "대저격 작전",
      task: "eliminate",
      targetCount: 1,
      targetLabel: "NEEDLE",
      min: 2,
      recommended: 4,
      risk: 3,
      reward: 8500000,
      bonus: 1700000,
      transport: "helicopter",
      drone: true,
      medical: true,
      supply: true,
      brief:
        "NEEDLE로 지정된 적 저격조가 고지로 진입한다. 저격수를 실제 관측·식별하고 제거 확인 후 복귀한다. 다른 경계병과 혼동하지 않아야 한다.",
    },
    {
      key: "courier-intercept",
      issuer: "지역 정보연락실",
      title: "무장 전달책 이동 차단",
      type: "표적 이동 차단",
      task: "interdict",
      targetCount: 2,
      targetLabel: "COURIER",
      min: 2,
      recommended: 4,
      risk: 2,
      reward: 7600000,
      bonus: 1500000,
      transport: "vehicle",
      drone: true,
      medical: false,
      supply: true,
      brief:
        "서로 다른 시각에 이동하는 무장 전달책 두 명을 신원 확인 후 저지한다. 실제 행동 불능 또는 사망을 관측해야 하며, 살아서 탈출 지점에 도착하면 실패한다. 비무장 인원은 표적이 아니다.",
    },
  ];
  for (const [key, title, task, mapId, transport, risk] of [
    [
      "gwangju-rescue",
      "광주 도심 고립 인원 수색·구출",
      "rescue",
      "city-gwangju",
      "vehicle",
      3,
    ],
    [
      "seoul-watch",
      "서울 고층 관측망 정찰",
      "recon",
      "city-seoul",
      "helicopter",
      3,
    ],
    [
      "busan-escort",
      "부산 도심 연락관 호송",
      "escort",
      "city-busan",
      "vehicle",
      3,
    ],
    [
      "radar-watch",
      "고원 레이더 기지 동향 정찰",
      "recon",
      "urban-radar",
      "vehicle",
      2,
    ],
    [
      "hillside-rescue",
      "산악 마을 인원 구출",
      "rescue",
      "urban-hillside",
      "helicopter",
      3,
    ],
    [
      "depot-intercept",
      "사막 보급 연락책 이동 차단",
      "interdict",
      "urban-depot",
      "vehicle",
      3,
    ],
  ])
    TEMPLATES.push({
      key,
      title,
      task,
      mapId,
      issuer: "합동 작전지원본부",
      type: {
        rescue: "수색·구출",
        recon: "구역 정찰",
        escort: "호송·엄호",
        interdict: "이동 표적 차단",
      }[task],
      min: task === "rescue" ? 4 : 2,
      recommended: task === "rescue" ? 6 : 4,
      risk,
      reward: risk * 3200000,
      bonus: risk * 600000,
      transport,
      drone: true,
      medical: true,
      supply: task !== "recon",
      ...(task === "interdict" ? { targetCount: 2, targetLabel: "DEPOT" } : {}),
      brief:
        task === "recon"
          ? "여섯 담당 구역을 실제 관측하고 접근로·위협·미확인 구역을 보고한 뒤 복귀한다."
          : task === "rescue"
            ? "목표 위치를 미리 알지 못한 상태에서 구역을 수색한다. 저격조·UAV의 식별 보고를 기관 보병에 전달해 현장 확보 후 구출한다."
            : task === "escort"
              ? "기관 보병과 보호 대상을 호송한다. 옥상 관측·교대 엄호와 실제 접촉 보고를 바탕으로 경로를 조정한다."
              : "무장 연락책 두 명을 실제 식별·차단한다. 일반 경계병과 구분하고 기관 보병이 현장을 확인·확보한 뒤 복귀한다.",
    });
  const participant = (s, id) => s.activeMission?.memberIds.includes(id),
    member = (s, id) =>
      s.members.find((m) => m.id === id) ||
      s.archive.members.find((m) => m.id === id),
    blue = (e, id) => e.world.units.find((u) => u.id === id),
    actor = (e, id) =>
      [...e.world.units, ...e.world.actors].find((u) => u.id === id),
    point = (p) =>
      p &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      p.x >= 10 &&
      p.x <= 1190 &&
      p.y >= 10 &&
      p.y <= 790;
  function initialize(s) {
    ok(s.schemaVersion === 4, "4단계 원본에서 전환해야 합니다.");
    s.schemaVersion = 5;
    s.operations = {
      sequence: 0,
      contentVersion: 5,
      reports: [],
      nextRefreshAt: 0,
      inspection: null,
      clients: Object.fromEntries(
        TEMPLATES.map((t) => [t.issuer, { trust: 50, completed: 0 }]),
      ),
    };
    offers(s);
    return s;
  }
  function event(s, type, message, data = {}) {
    return P.recordEvent(s, type, message, data);
  }
  function offers(s, templates = TEMPLATES) {
    const seq = ++s.operations.sequence;
    for (const t of templates) {
      s.operations.clients[t.issuer] ||= { trust: 50, completed: 0 };
      const cityMaps = [
          "urban-modern",
          "urban-quarter",
          "urban-port",
          "urban-market",
          "urban-embassy",
          "urban-rail",
          "urban-research",
        ],
        original = { "aid-cover": 1, "rescue-cover": 2, "vip-cover": 0 }[t.key],
        baseMapId =
          t.mapId ||
          (t.task === "eliminate" || t.task === "interdict"
            ? {
                "high-value-target": "urban-embassy",
                "counter-sniper": "urban-research",
                "courier-intercept": "urban-rail",
              }[t.key]
            : original === undefined
              ? seq % 3 === 1
                ? "ridge-field"
                : cityMaps[
                    (seq + (t.key === "quiet-watch" ? 2 : 0)) % cityMaps.length
                  ]
              : cityMaps[(original + seq - 1) % cityMaps.length]),
        mapId = G.maps[baseMapId + "-operation"]
          ? baseMapId + "-operation"
          : baseMapId,
        map = G.maps[mapId];
      const previous = G.MAP.id;
      G.activate(mapId);
      const insertion = G.project(
        map.urban || map.width < 500
          ? { x: map.base.x + 12, y: map.base.y }
          : { x: 220, y: 550 },
      );
      G.activate(previous);
      const c = {
        ...copy(t),
        agencyInfantry: 4,
        title: map.name + " · " + t.type,
        mapId,
        interest:
          seq === 1
            ? map.sector
              ? copy(map.sector)
              : null
            : (() => {
                const old = G.MAP.id;
                G.activate(mapId);
                const p = G.project(
                  map.spawnPoints?.[(seq - 2) % map.spawnPoints.length] ||
                    map.sector || { x: 500, y: 150 },
                );
                G.activate(old);
                return p;
              })(),
        region: map.name,
        id: "offer-" + seq + "-" + t.key,
        status: "offered",
        offeredAt: s.clock.elapsedSeconds,
        expiresAt: s.clock.elapsedSeconds + 2 * P.DAY,
        acceptedAt: null,
        launchedAt: null,
        missionId: null,
        bonusWindow: 3600,
        restrictions: { civilianSafety: true },
        support: {
          drone: t.drone ? 1 : 0,
          medical: t.medical ? 2 : 0,
          supply: t.supply ? 1 : 0,
        },
        insertion,
        extraction: copy(insertion),
      };
      s.contracts.push(c);
      event(s, "mission-offered", c.issuer + " · " + c.title + " 의뢰 접수.", {
        contractId: c.id,
      });
    }
    s.operations.nextRefreshAt = s.clock.elapsedSeconds + 6 * P.HOUR;
  }
  const targeted = (m) =>
    ["eliminate", "interdict"].includes(m?.contract?.task);
  function upgrade(s) {
    const repaired = repairInfantryResult(s);
    if (s.schemaVersion !== 5 || s.operations.contentVersion === 5)
      return repaired;
    const missing = TEMPLATES.filter(
      (t) => !s.contracts.some((c) => c.key === t.key),
    );
    if (missing.length) offers(s, missing);
    for (const c of s.contracts)
      if (["offered", "accepted", "active"].includes(c.status))
        c.agencyInfantry = 4;
    if (s.commandExercise?.status === "running" && s.commandExercise.mission)
      ensureSecurity(s, s.commandExercise);
    s.operations.contentVersion = 5;
    return true;
  }
  function updateOffers(s) {
    if (s.schemaVersion !== 5) return;
    for (const c of s.contracts)
      if (
        ["offered", "accepted"].includes(c.status) &&
        s.clock.elapsedSeconds >=
          (c.status === "accepted" ? c.launchBy : c.expiresAt)
      ) {
        c.status = "expired";
        event(
          s,
          "mission-offer-expired",
          c.title + " 제안 기한 만료. 이미 출발한 작전에는 영향을 주지 않는다.",
          { contractId: c.id },
        );
      }
  }
  function refresh(s) {
    ok(!s.activeMission, "진행 중인 실전 작전이 있습니다.");
    ok(
      s.clock.elapsedSeconds >= s.operations.nextRefreshAt,
      "의뢰 기관의 다음 접수 시각 전입니다.",
    );
    updateOffers(s);
    ok(
      !s.contracts.some((c) => c.status === "accepted"),
      "수락한 의뢰를 먼저 처리하거나 취소하세요.",
    );
    s.contracts = s.contracts.filter((c) =>
      ["offered", "accepted", "active"].includes(c.status),
    );
    ok(
      s.contracts.length <= Math.max(10, TEMPLATES.length + 2),
      "현재 제안을 처리한 뒤 다시 접수하세요.",
    );
    offers(s);
  }
  function regionsFor(contract) {
    return Object.values(G.maps).filter(
      (map) =>
        map.id.endsWith("-operation") ||
        (contract.task === "recon" && map.id === "ridge-field"),
    );
  }
  function selectRegion(s, id, mapId) {
    const c = s.contracts.find((c) => c.id === id);
    ok(
      c?.status === "offered" && !s.activeMission,
      "출격 전 접수된 의뢰만 지역을 변경할 수 있습니다.",
    );
    const map = regionsFor(c).find((map) => map.id === mapId);
    ok(map, "이 의뢰에 사용할 수 없는 작전 지역입니다.");
    const previous = G.MAP.id;
    G.activate(mapId);
    c.mapId = mapId;
    c.region = map.name;
    c.title = map.name + " · " + c.type;
    c.interest = G.project(map.sector || { x: 500, y: 150 });
    c.insertion = G.project(
      map.urban ? { x: map.base.x + 12, y: map.base.y } : { x: 220, y: 550 },
    );
    c.extraction = copy(c.insertion);
    G.activate(previous);
    event(s, "mission-region-selected", c.region + " 작전 정보 수신.", {
      contractId: c.id,
      mapId,
    });
    return c;
  }
  function accept(s, id) {
    updateOffers(s);
    ok(
      !s.activeMission && !s.contracts.some((c) => c.status === "accepted"),
      "동시에 한 계약만 수락·출격할 수 있습니다.",
    );
    const c = s.contracts.find((c) => c.id === id);
    ok(c?.status === "offered", "유효한 제안이 아닙니다.");
    P.interruptManaged(s);
    c.status = "accepted";
    c.acceptedAt = s.clock.elapsedSeconds;
    c.launchBy = s.clock.elapsedSeconds + P.DAY;
    event(
      s,
      "mission-accepted",
      c.title + " 계약 수락. 출격 전 인원·예산·수송 조건을 검사한다.",
      { contractId: id },
    );
  }
  function cancel(s, id) {
    const c = s.contracts.find((c) => c.id === id);
    ok(
      c?.status === "accepted" && !s.activeMission,
      "출발 전 수락한 계약만 취소할 수 있습니다.",
    );
    c.status = s.clock.elapsedSeconds < c.expiresAt ? "offered" : "expired";
    event(
      s,
      "mission-cancelled",
      c.title + " 출발 전 수락 취소. 출격 비용은 지출하지 않았다.",
      { contractId: id },
    );
  }
  function selectedSquads(s, c = null) {
    c ||= s.contracts.find((c) => c.status === "accepted");
    return c?.teamCallsigns
      ? s.squads.filter((q) => c.teamCallsigns.includes(q.callsign))
      : s.squads;
  }
  function setTeams(s, id, callsigns) {
    const c = s.contracts.find((c) => c.id === id);
    ok(
      c?.status === "accepted" && !s.activeMission,
      "출격 전 수락한 의뢰에서 저격조를 선택하세요.",
    );
    ok(
      Array.isArray(callsigns) &&
        callsigns.length <= 3 &&
        new Set(callsigns).size === callsigns.length &&
        callsigns.every((call) => s.squads.some((q) => q.callsign === call)),
      "출격 저격조 선택이 잘못되었습니다.",
    );
    c.teamCallsigns = [...callsigns];
    return c.teamCallsigns;
  }
  function reserveFor(s, c = null) {
    const ammo = {};
    let medical = 0;
    for (const q of selectedSquads(s, c))
      for (const id of [q.observerId, q.sniperId]) {
        const model = member(s, id).specialty === "sniper" ? "AXMC" : "HK416",
          w = B().WEAPONS[model];
        ammo[w.calibre] = (ammo[w.calibre] || 0) + w.capacity * 5;
        ammo["9×19mm"] = (ammo["9×19mm"] || 0) + 45;
        medical++;
      }
    return {
      ammo,
      medical,
      total:
        Object.entries(ammo).reduce((n, [cal, nr]) => n + PRICES[cal] * nr, 0) +
        medical * 30000,
    };
  }
  function ready(s, c) {
    if (!c || c.status !== "accepted") return "수락한 계약이 없습니다.";
    if (s.commandStaff?.delegated) {
      const Staff =
        root.OverwatchStaff ||
        (typeof require === "function" ? require("./command-staff.js") : null);
      const why = Staff.ready(s);
      if (why) return why;
    }
    if (s.activeMission || s.commandExercise?.status === "running")
      return "진행 중인 전장·훈련을 먼저 종료하세요.";
    if (s.operations.inspection && !s.operations.inspection.completed)
      return "귀환 후 점검·재정비가 필요합니다.";
    const infantryWhy = Infantry().readiness(s);
    if (infantryWhy) return infantryWhy;
    const selectedIds = selectedSquads(s, c).flatMap((q) => [
      q.observerId,
      q.sniperId,
    ]);
    if (
      s.activities.some(
        (a) =>
          a.status === "running" &&
          a.memberIds.some((id) => selectedIds.includes(id)),
      )
    )
      return "선택한 출격 대원의 본부 활동을 마치거나 해당 조를 출격에서 제외하세요.";
    const teams = selectedSquads(s, c);
    if (c.teamCallsigns && teams.length !== c.teamCallsigns.length)
      return "선택한 저격조의 본부 편성이 변경되었습니다. 투입 조를 다시 선택하세요.";
    const ids = teams.flatMap((q) => [q.observerId, q.sniperId]);
    if (ids.length > 6) return "저격팀은 최대 3개 팀까지 선택할 수 있습니다.";
    if (
      !ids.length &&
      !(
        s.infantry?.deploy &&
        Infantry()
          .squads(s)
          .some((q) => !(s.infantry.disabledSquads || []).includes(q.callsign))
      )
    )
      return "저격팀 또는 보병팀을 하나 이상 선택하세요.";
    for (const id of ids) {
      const m = member(s, id),
        why = P.readiness(s, m);
      if (why) return m.name + " · " + why;
      if (m.contract.endsAt - s.clock.elapsedSeconds < P.DAY)
        return m.name + " · 계약 잔여 24시간 이상이 필요합니다.";
    }
    return null;
  }
  function log(e, type, data = {}) {
    const ev = I().event(e, type, data);
    e.mission.log.push(copy(ev));
    return ev;
  }
  function say(s, e, kind, body, ev, payload = {}, reporter = null) {
    if (reporter?.hqMemberId)
      return Infantry().report(s, e, reporter, kind, body, ev, payload);
    const q = e.squads[0],
      r = I().radio(
        s,
        e,
        q,
        "up",
        "AGENCY",
        "HQ",
        kind,
        e.mission.contract.issuer + " 지원망. " + body,
        ev,
        payload,
      );
    r.delay = 2;
    return r;
  }
  function transport(id, type, x, y, capacity = 6) {
    return {
      id,
      type,
      x,
      y,
      altitude: 0,
      heading: 0,
      state: "home",
      path: [],
      target: null,
      arrival: null,
      capacity,
      manifest: [],
      boarding: null,
      dispatchAt: 0,
      trip: "insertion",
      crew: null,
      sorties: 0,
      lastReportState: null,
    };
  }
  function launch(s, id) {
    updateOffers(s);
    const c = s.contracts.find((c) => c.id === id),
      why = ready(s, c);
    ok(!why, why);
    const expanded = G.maps[(c.mapId || "") + "-operation"];
    if (expanded) {
      c.previousMapId = c.mapId;
      c.mapId = expanded.id;
      c.region = expanded.name;
      const old = G.MAP.id;
      G.activate(expanded.id);
      c.insertion = G.project({ x: expanded.base.x + 12, y: expanded.base.y });
      c.extraction = copy(c.insertion);
      G.activate(old);
    }
    const budget = reserveFor(s, c);
    const seed = [...(c.id + ":" + s.clock.elapsedSeconds)].reduce(
      (n, ch) => Math.imul(n ^ ch.charCodeAt(0), 16777619) >>> 0,
      2166136261,
    );
    const e = B().begin(s, {
        scenario: "recon",
        seed,
        live: true,
        callsigns: selectedSquads(s, c).map((q) => q.callsign),
        mapId: c.mapId || "command-range",
      }),
      mid =
        "operation-" + ++s.operations.sequence + "-" + s.clock.elapsedSeconds;
    const primary = transport(
      "primary",
      c.transport,
      G.MAP.base.x,
      G.MAP.base.y,
    );
    const m = {
      version: 1,
      id: mid,
      contract: copy(c),
      phase: c.transport === "foot" ? "infiltration" : "boarding",
      startedAt: s.clock.elapsedSeconds,
      fieldStartedAt: null,
      agencyControl: {
        version: 1,
        authorized: false,
        phase: "staging",
        reason: "저격조 외곽 진지·관측 보고 대기",
        waypoint: null,
        lastAssessment: -100,
        everAuthorized: false,
        readyTeams: [],
        history: [],
      },
      extractionPoint:
        c.transport === "foot" ? copy(G.MAP.base) : copy(c.extraction),
      memberIds: e.world.units.map((u) => u.id),
      home: [],
      missing: [],
      transports: [primary],
      supports: { drone: 0, medical: 0, supply: 0 },
      log: [],
      stats: {},
      lastSequence: e.sequence,
      lastTrack: -2,
      knowledge: {
        phase: "boarding",
        transports: [],
        crew: [],
        actors: [],
        objective: "pending",
      },
      objective: false,
      objectiveFailed: false,
      lastObjectiveReport: null,
      returnRequested: false,
      declaringMissing: false,
      finalizing: false,
      settled: false,
      reportId: null,
      budget,
      escrow: 0,
      postpaid: true,
      taskLinked: false,
    };
    e.mission = m;
    s.activeMission = {
      id: mid,
      contractId: id,
      memberIds: m.memberIds.slice(),
      startedAt: s.clock.elapsedSeconds,
    };
    // Costs are settled against actual consumption after return.
    c.status = "active";
    c.missionId = mid;
    c.launchedAt = s.clock.elapsedSeconds;
    for (const u of e.world.units) {
      u.medicalUses = 0;
      u.waitingForDeployment = c.transport !== "foot";
      u.deployedAt = c.transport === "foot" ? 0 : null;
      u.home = false;
      m.stats[u.id] = {
        shots: 0,
        shotsByModel: {},
        observations: 0,
        commands: 0,
        aid: 0,
        carried: 0,
        kills: 0,
      };
    }
    setupTask(e);
    setupForces(e);
    if (targeted(m)) setupTargets(e);
    ensureSecurity(s, e);
    (
      root.OverwatchAgency ||
      (typeof require === "function" ? require("./agency.js") : null)
    ).initialize(s, e);
    Infantry().launch(s, e);
    for (const q of e.squads) {
      q.roe = "selfDefense";
      if (c.interest) q.sector = copy(c.interest);
    }
    primary.state = c.transport === "foot" ? "unused" : "boarding";
    primary.trip = "insertion";
    e.pauseReason =
      "실전 계약 출격 준비 · 영구 손실과 소모품 정산이 적용됩니다.";
    const ev = log(e, "mission-launched", {
      missionId: mid,
      contractId: id,
      memberIds: m.memberIds,
    });
    say(
      s,
      e,
      "ready",
      c.title +
        " 출격. 수송 " +
        { foot: "도보", vehicle: "차량", helicopter: "헬기" }[c.transport] +
        ". 예치금 없이 출격한다. 귀환 후 실제 사용·손실만 정산한다.",
      ev,
    );
    event(
      s,
      "mission-launched",
      c.title + " 실전 출격. 예치금 없이 실제 사용분을 귀환 후 정산.",
      { missionId: mid },
    );
    if (c.transport === "foot") {
      const Staff =
          root.OverwatchStaff ||
          (typeof require === "function"
            ? require("./command-staff.js")
            : null),
        authority = s.commandStaff?.delegated ? Staff.authority(s, e) : null;
      for (const q of e.squads)
        D().issue(s, q.callsign, "move", c.insertion, null, authority);
    }
    return e;
  }
  function setupForces(e) {
    const m = e.mission,
      city = G.MAP.urban || G.MAP.width < 500,
      seed = e.world.actors.find((a) => a.side === "red");
    const wanted = city ? 10 : 8;
    for (let i = 4; i < wanted; i++) {
      const angle = i * 2.399963 + (e.battle.rng % 31) / 31,
        r =
          ((city ? 38 : 180) + (i % 3) * (city ? 8 : 35)) *
          (G.MAP.districtScale || 1);
      const p = G.project({
        x: Math.max(
          12,
          Math.min(G.MAP.width - 12, G.MAP.sector?.x || G.MAP.width * 0.6) +
            Math.cos(angle) * r,
        ),
        y: Math.max(
          12,
          Math.min(
            G.MAP.height - 12,
            (G.MAP.sector?.y || G.MAP.height * 0.4) + Math.sin(angle) * r,
          ),
        ),
      });
      if (
        G.distance(p, m.contract.insertion) <
        (city ? 35 * (G.MAP.districtScale || 1) : 100)
      )
        continue;
      const a = copy(seed);
      Object.assign(a, {
        id: "opposition-" + i,
        ...p,
        health: B().health(),
        weapon: B().weapon(i === 7 ? "SVD" : "AKM", 3),
        sidearm: B().weapon("G19", 1),
        specialty: i === 7 ? "sniper" : "rifleman",
        role: i === 7 ? "enemy-sniper" : "infantry",
        skill: 48 + (i % 4) * 3,
        path: [],
        goal: null,
        memory: [],
        waypoint: 0,
        route: [p, G.project({ x: p.x + 5, y: p.y + 4 })],
      });
      e.world.actors.push(a);
    }
    for (const [i, a] of e.world.actors
      .filter((a) => a.side === "red")
      .entries()) {
      const destination = copy(a.route[0]),
        regular = i < Math.ceil(wanted / 2),
        group = Math.floor(i / 2);
      const start = G.project({
        x: G.MAP.width - 30 - (i % 3) * 8,
        y: regular ? 24 + group * 18 : G.MAP.height * 0.3 + (i % 4) * 14,
      });
      Object.assign(a, start, {
        faction: regular ? "regular" : "insurgent",
        state: "assembling",
        path: [],
        memory: [],
      });
      a.deployment = {
        phase: "approach",
        startedAt: e.time,
        releaseAt: e.time + 45 + group * 20,
        destination,
        group,
        index: i % 2,
        doctrine: regular ? "bounding-overwatch" : "loose-advance",
      };
      a.heading = Math.atan2(destination.y - a.y, destination.x - a.x);
    }
    if (m.contract.task !== "recon" && !targeted(m))
      for (let i = 0; i < 3; i++) {
        const p = G.project({
          x: m.contract.insertion.x + 5 + i * 3,
          y: m.contract.insertion.y - 5,
        });
        const a = taskPerson(
          e,
          "agency-infantry-" + i,
          "기관 보병 " + (i + 1),
          p,
          true,
        );
        a.taskDuty = "security";
        a.faction = "allied";
        a.role = "infantry";
        a.roleLabel = "기관 보병";
        e.world.actors.push(a);
      }
    m.forcePackage = {
      version: 1,
      opposition: e.world.actors.filter((a) => a.side === "red").length,
      agency: e.world.actors.filter((a) => a.side === "ally" && a.armed).length,
    };
  }
  const securityOnly = (m) => targeted(m) || m.contract.task === "recon";
  function ensureSecurity(s, e) {
    const m = e.mission;
    if (!m || m.settled || e.status !== "running") return;
    const previous = G.MAP.id;
    G.activate(e.mapId || "command-range");
    let added = 0;
    m.contract.agencyInfantry = 4;
    for (let i = 0; i < 4; i++) {
      const id = "agency-infantry-" + i;
      if (e.world.actors.some((a) => a.id === id)) continue;
      const p = G.project({
        x: m.contract.insertion.x + (i % 2) * 4,
        y: m.contract.insertion.y - 5 - Math.floor(i / 2) * 4,
      });
      const a = taskPerson(e, id, "기관 보병 " + (i + 1), p, true);
      a.taskDuty = "security";
      a.securitySlot = i;
      a.waitingForDeployment = m.fieldStartedAt == null;
      e.world.actors.push(a);
      added++;
    }
    m.securityControl ||= {
      version: 1,
      authorized: false,
      lastAssessment: -100,
      readyTeams: [],
      goals: {},
      reason: "저격조 선행 확보·보고 대기",
      returning: false,
    };
    m.forcePackage = {
      ...(m.forcePackage || {}),
      version: 1,
      opposition: e.world.actors.filter((a) => a.side === "red").length,
      agency: e.world.actors.filter((a) => a.side === "ally" && a.armed).length,
    };
    if (added) {
      const ev = log(e, "agency-security-attached", {
        added,
        total: 4,
        insertion: copy(m.contract.insertion),
      });
      say(
        s,
        e,
        "support",
        "기관 보병 보안조 4명 지원. 저격조 선행 확보 보고에 따라 접근로·철수로 경계와 피격 대응을 수행한다.",
        ev,
      );
    }
    G.activate(previous);
  }
  function reconPlan(e) {
    const m = e.mission;
    if (m.contract.task !== "recon") return null;
    if (!m.reconPlan) {
      const w = G.MAP.width,
        h = G.MAP.height;
      const points = [
        ["접근로", m.contract.insertion],
        ["서측 구역", { x: w * 0.23, y: h * 0.38 }],
        ["북측 구역", { x: w * 0.5, y: h * 0.25 }],
        ["동측 구역", { x: w * 0.77, y: h * 0.38 }],
        ["중앙·남측 구역", { x: w * 0.5, y: h * 0.65 }],
        [
          "철수로",
          m.extractionPoint || m.contract.extraction || m.contract.insertion,
        ],
      ];
      m.reconPlan = {
        version: 1,
        areas: points.map(([label, p], i) => ({
          id: i,
          label,
          point: G.project(p),
          dwell: 0,
          checkedAt: null,
        })),
        lastTick: e.time,
      };
    }
    return m.reconPlan;
  }
  function updateRecon(s, e) {
    const m = e.mission,
      plan = reconPlan(e);
    if (!plan || m.fieldStartedAt == null || m.returnRequested || m.objective)
      return;
    const elapsed = Math.max(0, Math.min(2, e.time - plan.lastTick));
    plan.lastTick = e.time;
    const area = plan.areas.find((a) => a.checkedAt == null);
    if (!area) return;
    // A contact count never substitutes for physically checking a search area.
    // Only a mobile, conscious ground patrol at the checkpoint can inspect it.
    const patrol = e.world.actors.filter(
      (a) =>
        a.side === "ally" &&
        a.armed &&
        !a.waitingForDeployment &&
        a.health?.alive &&
        a.health.conscious &&
        !a.health.aid &&
        !a.path?.length &&
        !a.combatActive &&
        e.time - (a.lastShotAt ?? -100) > 4 &&
        B().moveFactor(a) > 0 &&
        !a.roofId &&
        G.distance(a, area.point) < 18 &&
        G.clear(a, area.point) &&
        e.time - (a.lastThreatAt ?? -100) > 8,
    );
    if (m.securityControl?.authorized && patrol.length) area.dwell += elapsed;
    if (area.dwell >= 20) {
      area.checkedAt = e.time;
      const ev = log(e, "recon-area-checked", {
        areaId: area.id,
        label: area.label,
        point: copy(area.point),
        actorIds: patrol.map((a) => a.id),
      });
      say(
        s,
        e,
        "decision",
        area.label +
          " 수색 완료. 접근·엄폐와 통행 가능 여부 확인. " +
          (plan.areas.some((a) => a.checkedAt == null)
            ? "다음 분담 구역으로 이동한다."
            : "전 구역 및 철수로 확인 완료. 복귀를 요청한다."),
        ev,
        {
          reconProgress: {
            checked: plan.areas.filter((a) => a.checkedAt != null).length,
            required: plan.areas.length,
            current: plan.areas.find((a) => a.checkedAt == null)?.label || null,
            currentId: plan.areas.find((a) => a.checkedAt == null)?.id ?? null,
          },
        },
      );
    }
  }
  function searchAreas(e) {
    const w = G.MAP.width,
      h = G.MAP.height;
    const labels = ["북서", "북부", "북동", "남동", "남부", "남서"];
    const fractions = [
      [0.22, 0.28],
      [0.5, 0.28],
      [0.78, 0.28],
      [0.78, 0.7],
      [0.5, 0.7],
      [0.22, 0.7],
    ];
    const areas = fractions.map(([x, y], i) => ({
      id: i,
      label: labels[i] + " 수색 구역",
      point: G.project({ x: w * x, y: h * y }),
      checkedAt: null,
      dwell: 0,
    }));
    let start = 0;
    for (let i = 1; i < areas.length; i++)
      if (
        G.distance(areas[i].point, e.mission.contract.insertion) <
        G.distance(areas[start].point, e.mission.contract.insertion)
      )
        start = i;
    return [...areas.slice(start), ...areas.slice(0, start)];
  }
  function groundSearch(e) {
    const m = e.mission;
    if (m.contract.task !== "rescue" && !targeted(m)) return null;
    return (m.groundSearch ||= {
      version: 1,
      areas: searchAreas(e),
      pass: 1,
      phase: "searching",
      lead: null,
      relayed: {},
      localRecognized: {},
      securedIds: [],
      leadQueue: [],
      lastAssessment: -100,
      lastTick: e.time,
      lastReportKey: null,
    });
  }
  function searchPoint(e) {
    const g = groundSearch(e);
    return (
      (g?.lead?.point && G.project(g.lead.point)) ||
      g?.areas.find((a) => a.checkedAt == null)?.point ||
      e.mission.contract.insertion
    );
  }
  function updateGroundSearch(s, e) {
    const m = e.mission,
      g = groundSearch(e);
    if (
      !g ||
      m.fieldStartedAt == null ||
      m.returnRequested ||
      m.objective ||
      m.objectiveFailed ||
      (m.contract.task === "rescue" && m.taskLinked)
    )
      return;
    g.securedIds ||= [];
    g.leadQueue ||= [];
    const dt = Math.max(0, Math.min(2, e.time - g.lastTick));
    g.lastTick = e.time;
    if (g.ackPending && g.lead) {
      g.ackPending = false;
      const ev = log(e, "agency-lead-acknowledged", {
        messageId: g.lead.messageId,
        targetId: g.lead.id,
        point: copy(g.lead.point),
      });
      say(
        s,
        e,
        "decision",
        "보병조 수신. 전달된 마지막 식별 위치로 이동한다. 현장에서 재확인 후 확보한다.",
        ev,
      );
    }
    if (e.time - g.lastAssessment >= 5) {
      g.lastAssessment = e.time;
      const intel = Object.values(m.knowledge.objectiveContacts || {}).filter(
        (c) =>
          c.objectiveCode &&
          c.confidence >= 0.85 &&
          e.time - c.observedAt <= 90 &&
          (m.contract.task === "rescue"
            ? c.objectiveCode === "RESCUE-PERSON" &&
              c.classification === "unarmed-person"
            : c.classification === "armed-person"),
      );
      for (const c of intel) {
        if (g.securedIds.includes(c.id)) continue;
        const old = g.relayed[c.id];
        if (old && old.observedAt >= c.observedAt) continue;
        if (
          old &&
          G.distance(old, c) < 20 &&
          old.condition === c.medicalCondition &&
          e.time - old.at < 45
        )
          continue;
        const source = e.radio.findLast(
          (r) =>
            r.id === c.sourceMessageId &&
            r.status === "delivered" &&
            r.route === "up" &&
            r.payload?.contact?.id === c.id &&
            r.payload.contact.observedAt === c.observedAt,
        );
        if (!source) continue;
        const lead = {
          id: c.id,
          point: { x: c.x, y: c.y },
          kind: m.contract.task === "rescue" ? "protected" : "target",
          objectiveCode: c.objectiveCode,
          observedAt: c.observedAt,
          sourceMessageId: source.id,
          sourceObserverId: c.observerId,
          condition: c.medicalCondition || "normal",
        };
        const ev = log(e, "agency-lead-relayed", {
          targetId: c.id,
          point: copy(lead.point),
          sourceMessageId: source.id,
          observedAt: c.observedAt,
        });
        I().radio(
          s,
          e,
          e.squads[0],
          "agency",
          e.commandAuthority?.id || "HQ",
          "AGENCY",
          "tasking",
          "보병조, " +
            (lead.kind === "protected" ? "구조 대상" : "계약 표적") +
            " 식별 보고 전달. 마지막 좌표 " +
            Math.round(c.x) +
            ", " +
            Math.round(c.y) +
            ". 해당 구역 접근·재확인·확보하라.",
          ev,
          { agencyLead: lead },
        );
        g.relayed[c.id] = {
          x: c.x,
          y: c.y,
          observedAt: c.observedAt,
          at: e.time,
          condition: c.medicalCondition,
        };
      }
    }
    const point = searchPoint(e),
      patrol = e.world.actors.filter(
        (a) =>
          a.side === "ally" &&
          a.armed &&
          !a.waitingForDeployment &&
          a.health?.alive &&
          a.health.conscious &&
          !a.health.aid &&
          B().moveFactor(a) > 0 &&
          !a.path?.length &&
          !a.combatActive &&
          !B().underFire(e, a) &&
          G.distance(a, point) < 18 &&
          G.clear(a, point),
      );
    if (g.lead) {
      g.phase = "investigating";
      if (patrol.length) g.lead.dwell = (g.lead.dwell || 0) + dt;
      const secured =
        targeted(m) &&
        g.lead.dwell >= 10 &&
        patrol.some((a) => {
          const report = a.agencyReports?.[g.lead.id];
          return (
            report &&
            ["dead", "down"].includes(report.condition) &&
            G.distance(a, report) < 18 &&
            !(a.agencyVisibleHostiles || []).length
          );
        });
      if (secured) {
        const id = g.lead.id;
        if (!g.securedIds.includes(id)) g.securedIds.push(id);
        const ev = log(e, "agency-target-secured", {
          targetId: id,
          point: copy(g.lead.point),
          actorIds: patrol.map((a) => a.id),
        });
        say(
          s,
          e,
          "objective",
          "보병조 목표 현장 재확인. 주변 접근로 경계·위협 확인 후 해당 지점 확보 완료.",
          ev,
        );
        g.lead = g.leadQueue.shift() || null;
        g.phase = g.lead ? "investigating" : "searching";
      }
      if (g.lead)
        if (
          g.lead.dwell >= 25 &&
          !(
            g.localRecognized[g.lead.id] &&
            e.time - g.localRecognized[g.lead.id] < 12
          )
        ) {
          const ev = log(e, "agency-lead-not-found", {
            targetId: g.lead.id,
            point: copy(g.lead.point),
            observedAt: g.lead.observedAt,
          });
          say(
            s,
            e,
            "decision",
            "전달 좌표에서 목표를 재확인하지 못했다. 이탈 가능성을 보고하고 인접 구역 수색을 재개한다.",
            ev,
          );
          g.lead = g.leadQueue.shift() || null;
          g.phase = g.lead ? "investigating" : "searching";
        }
    } else {
      g.phase = "searching";
      const area = g.areas.find((a) => a.checkedAt == null);
      if (area && patrol.length) area.dwell += dt;
      if (area?.dwell >= 15) {
        area.checkedAt = e.time;
        log(e, "agency-search-area-checked", {
          areaId: area.id,
          label: area.label,
          point: copy(area.point),
          actorIds: patrol.map((a) => a.id),
        });
      }
      if (g.areas.every((a) => a.checkedAt != null)) {
        const ev = log(e, "agency-search-pass-completed", { pass: g.pass });
        say(
          s,
          e,
          "decision",
          "보병조 전 구역 1차 확인. 목표 미식별 구간을 재수색한다. 정찰·저격조의 새 식별 보고를 기다린다.",
          ev,
        );
        g.pass++;
        for (const a of g.areas) {
          a.checkedAt = null;
          a.dwell = 0;
        }
      }
    }
    const area = g.areas.find((a) => a.checkedAt == null),
      progress = {
        phase: g.phase,
        pass: g.pass,
        checked: g.areas.filter((a) => a.checkedAt != null).length,
        required: g.areas.length,
        point: copy(searchPoint(e)),
        area: g.lead ? "식별 보고 지점 확인" : area?.label || "재수색",
        targetId: g.lead?.id || null,
        secured: g.securedIds.length,
      };
    const key = [
      progress.phase,
      progress.pass,
      progress.checked,
      progress.targetId,
      Math.round(progress.point.x / 10),
      Math.round(progress.point.y / 10),
    ].join(":");
    if (g.lastReportKey !== key) {
      g.lastReportKey = key;
      const ev = log(e, "agency-search-progress", progress);
      say(
        s,
        e,
        "decision",
        g.lead
          ? "전달된 식별 위치로 보병조가 접근한다."
          : progress.area + "부터 구역별 수색한다. 목표 위치는 아직 모른다.",
        ev,
        { groundSearch: progress },
      );
    }
  }
  function agencyObservations(s, e, u, enemies) {
    if (!u.armed) return;
    const m = e.mission,
      g = groundSearch(e);
    u.agencyReports ||= {};
    m.agencyReports ||= {};
    const candidates = new Map(enemies.map((a) => [a.id, a]));
    if (
      e.time % 3 === Number(u.id.split("-").at(-1)) % 3 ||
      u.id === "agency-rescuer"
    )
      for (const a of e.world.actors)
        if (
          ((u.agencyReports[a.id] &&
            (!a.health.alive || !a.health.conscious)) ||
            a.missionTargetCode ||
            (m.contract.task === "rescue" && a.id === "agency-protected")) &&
          G.distance(u, a) < 120 &&
          G.visible(u, a, e) &&
          B().visualAcquire(e, u, a, 120)
        )
          candidates.set(a.id, a);
    for (const a of candidates.values()) {
      const track = u.detectionTracks?.find((t) => t.id === a.id),
        identified = track?.confidence >= 0.9 && G.distance(u, a) < 120;
      const code = identified
        ? a.missionTargetCode ||
          (m.contract.task === "rescue" && a.id === "agency-protected"
            ? "RESCUE-PERSON"
            : null)
        : null;
      if (code && g) g.localRecognized[a.id] = e.time;
      const condition = !a.health.alive
        ? "dead"
        : !a.health.conscious
          ? "down"
          : "normal";
      const old = u.agencyReports[a.id];
      if (
        old &&
        condition === old.condition &&
        code === old.code &&
        e.time - old.at < 30 &&
        G.distance(old, a) < 15
      )
        continue;
      if (
        old?.condition === "dead" &&
        condition === "dead" &&
        old.code === code
      )
        continue;
      const seen = {
        id: a.id,
        x: a.x,
        y: a.y,
        observedAt: e.time,
        confidence: identified ? 0.95 : 0.85,
        classification: a.armed ? "armed-person" : "unarmed-person",
        observerId: u.id,
        source: u.hqMemberId ? "infantry" : "agency",
        callsign: u.hqMemberId ? u.callsign : "보병조",
        uncertainty: identified ? 2 : 6,
        pose: B().snapshot(a, e.time).pose,
        heading: a.heading || 0,
        medicalCondition: condition,
        faction: a.faction || "unknown",
        objectiveCode: code || undefined,
      };
      const ev = log(e, "agency-contact-observed", {
        actorId: u.id,
        targetId: a.id,
        observation: copy(seen),
      });
      const shared = m.agencyReports[a.id];
      const voiced =
        (!old || old.condition !== condition || old.code !== code) &&
        (!shared ||
          shared.condition !== condition ||
          shared.code !== code ||
          e.time - shared.at >= 30);
      say(
        s,
        e,
        voiced ? "observation" : "position",
        condition === "dead"
          ? "보병조 현장 사망 확인. 해당 위협 해제."
          : code
            ? "보병조 목표 신원 식별. 좌표와 확보 상황을 전파한다."
            : "보병조 무장 위협 식별. 엄폐·분산 후 교전한다.",
        ev,
        { contact: seen },
        u,
      );
      m.agencyReports[a.id] = { at: e.time, condition, code };
      u.agencyReports[a.id] = { x: a.x, y: a.y, at: e.time, condition, code };
    }
  }
  function updateSecurityControl(s, e) {
    const m = e.mission,
      g = m.securityControl;
    if (!g || !securityOnly(m) || e.time - g.lastAssessment < 5) return;
    const f = D().frame(s);
    const anchors = new Map();
    const ready = e.squads.filter((q) => {
      const cmd = f.commands.findLast(
        (c) =>
          c.callsign === q.callsign &&
          ["cover", "recon", "observe"].includes(c.kind),
      );
      const pair = f.friends.filter(
        (x) =>
          x.callsign === q.callsign &&
          x.age < 25 &&
          x.health?.alive &&
          x.health.conscious &&
          !x.home &&
          !x.boardedBy &&
          !x.waitingForDeployment,
      );
      const stopped = pair.filter((x) =>
        ["observing", "covering", "holding", "ready", "position-hold"].includes(
          x.state,
        ),
      );
      if (
        cmd?.status !== "completed" ||
        pair.length !== 2 ||
        stopped.length !== 2 ||
        !pair.every((f) => f.mobility)
      )
        return false;
      stopped.sort(
        (a, b) =>
          G.distance(b, m.contract.insertion) -
          G.distance(a, m.contract.insertion),
      );
      anchors.set(q.callsign, stopped[0]);
      return true;
    });
    const returning = !!m.returnRequested;
    const functional = e.squads.filter(
      (q) =>
        f.friends.filter(
          (x) =>
            x.callsign === q.callsign &&
            x.age < 25 &&
            x.health?.alive &&
            x.health.conscious &&
            x.mobility &&
            !x.home &&
            !x.boardedBy &&
            !x.waitingForDeployment,
        ).length === 2,
    ).length;
    const authorized = returning || m.fieldStartedAt != null;
    if (authorized && !returning) g.everAuthorized = true;
    g.lastAssessment = e.time;
    g.returning = returning;
    g.readyTeams = ready.map((q) => q.callsign);
    const reason = returning
      ? "기관 보병 엄호 철수·집결"
      : authorized
        ? "보병조 자체 관측·구역 수색·접근로 경계"
        : "기관 보병 현장 투입 대기";
    if (g.authorized !== authorized || g.reason !== reason) {
      const ev = log(
        e,
        authorized ? "agency-security-advance" : "agency-security-hold",
        { readyTeams: g.readyTeams, returning },
      );
      say(
        s,
        e,
        "decision",
        reason + ". 미확인 표적에는 선제 사격하지 않는다.",
        ev,
      );
    }
    g.authorized = authorized;
    g.reason = reason;
    if (!authorized) return;
    for (let i = 0; i < 4; i++) {
      const id = "agency-infantry-" + i;
      let anchor = m.extractionPoint || m.contract.insertion;
      if (!returning && m.contract.task !== "recon" && !targeted(m)) {
        const q = ready.length ? ready[i % ready.length] : null,
          sniper = q ? anchors.get(q.callsign) : m.contract.insertion;
        const roof = G.roofs().find((r) => r.id === sniper.roofId);
        anchor = roof?.access || sniper;
        const distance = G.distance(anchor, m.contract.insertion);
        if (distance > 20) {
          const fraction = Math.max(0, (distance - 20) / distance);
          anchor = {
            x:
              m.contract.insertion.x +
              (anchor.x - m.contract.insertion.x) * fraction,
            y:
              m.contract.insertion.y +
              (anchor.y - m.contract.insertion.y) * fraction,
          };
        }
        // The rear pair protects the route between insertion and the reported position.
        if (i >= 2)
          anchor = {
            x:
              m.contract.insertion.x +
              (anchor.x - m.contract.insertion.x) * 0.65,
            y:
              m.contract.insertion.y +
              (anchor.y - m.contract.insertion.y) * 0.65,
          };
      }
      if (!returning && targeted(m)) anchor = searchPoint(e);
      const recon = reconPlan(e);
      if (!returning && recon)
        anchor = recon.areas.find((a) => a.checkedAt == null)?.point || anchor;
      const distance = Math.max(1, G.distance(anchor, m.contract.insertion));
      const dx = (anchor.x - m.contract.insertion.x) / distance || 1,
        dy = (anchor.y - m.contract.insertion.y) / distance;
      g.heading = Math.atan2(dy, dx);
      const angle =
        Math.atan2(dy, dx) + [Math.PI / 2, -Math.PI / 2, Math.PI, 0][i];
      g.goals[id] = G.project({
        x: Math.max(
          10,
          Math.min(
            G.MAP.width - 10,
            anchor.x + Math.cos(angle) * (i < 2 ? 16 : 24),
          ),
        ),
        y: Math.max(
          10,
          Math.min(
            G.MAP.height - 10,
            anchor.y + Math.sin(angle) * (i < 2 ? 16 : 24),
          ),
        ),
      });
    }
  }
  function updateCasualtySupport(s, e) {
    const m = e.mission;
    if (m.fieldStartedAt == null) return;
    const g = (m.casualtySupport ||= {
      version: 1,
      lastAssessment: -100,
      assignments: {},
    });
    if (e.time - g.lastAssessment < 5) return;
    g.lastAssessment = e.time;
    const frame = D().frame(s),
      patients = frame.friends.filter(
        (f) =>
          f.age < 25 &&
          f.health?.alive &&
          !f.home &&
          !f.boardedBy &&
          !f.waitingForDeployment &&
          (f.underFire || f.health.wounds.some((w) => !w.treated)),
      );
    patients.sort(
      (x, y) =>
        100 * (Number(!y.health.conscious) - Number(!x.health.conscious)) +
        y.health.wounds
          .filter((w) => !w.treated)
          .reduce((n, w) => n + w.severity, 0) -
        x.health.wounds
          .filter((w) => !w.treated)
          .reduce((n, w) => n + w.severity, 0),
    );
    const patient = patients[0],
      oldKey = Object.entries(g.assignments)
        .map(([id, t]) => id + ":" + t.role + ":" + t.targetId)
        .sort()
        .join("|");
    const next = {};
    if (patient) {
      const guards = (m.knowledge.actors || []).filter(
        (a) =>
          a.id.startsWith("agency-infantry-") &&
          e.time - a.observedAt < 20 &&
          a.health?.alive &&
          a.health.conscious &&
          !a.health.wounds.some((w) => !w.treated),
      );
      guards.sort((a, b) => G.distance(a, patient) - G.distance(b, patient));
      const treating = [...frame.friends, ...(m.knowledge.actors || [])].some(
        (f) => f.health?.aid?.targetId === patient.id,
      );
      const previousMedic = Object.entries(g.assignments).find(
        ([id, t]) => t.role === "aid" && t.targetId === patient.id,
      )?.[0];
      const medic =
        !treating && patient.health.wounds.some((w) => !w.treated)
          ? guards.find(
              (a) =>
                a.id === previousMedic && a.health.kit > 0 && !a.health.aid,
            ) || guards.find((a) => a.health.kit > 0 && !a.health.aid)
          : null;
      const cover = guards.find((a) => a.id !== medic?.id && !a.health.aid);
      for (const [person, role] of [
        [medic, "aid"],
        [cover, "cover"],
      ])
        if (person)
          next[person.id] = {
            targetId: patient.id,
            callsign: patient.callsign,
            role,
            point: {
              x: patient.x,
              y: patient.y,
              ...(patient.roofId ? { roofId: patient.roofId } : {}),
            },
            observedAt: patient.observedAt,
            expiresAt: e.time + 30,
          };
    }
    const newKey = Object.entries(next)
      .map(([id, t]) => id + ":" + t.role + ":" + t.targetId)
      .sort()
      .join("|");
    g.assignments = next;
    if (newKey && newKey !== oldKey) {
      const ev = log(e, "agency-friendly-support-assigned", {
        targetId: patient.id,
        observedAt: patient.observedAt,
        position: { x: patient.x, y: patient.y },
        assignments: copy(next),
      });
      say(
        s,
        e,
        "medical",
        patient.callsign +
          " 아군 피격·부상 보고 확인. 기관 보병이 접근로를 경계하며 " +
          (Object.values(next).some((t) => t.role === "aid")
            ? "실제 처치 위치로 접근한다."
            : "엄호 위치로 이동한다."),
        ev,
      );
    }
  }
  function respondToCasualty(s, e, u, enemies) {
    const assignment = e.mission.casualtySupport?.assignments[u.id];
    if (!assignment || assignment.expiresAt < e.time) return false;
    const patient = blue(e, assignment.targetId);
    if (!patient) return false;
    const visible =
      (u.roofId || null) === (patient.roofId || null) &&
      G.distance(u, patient) < 70 &&
      G.clear(u, patient);
    if (visible && (!patient.health.alive || patient.home || patient.boardedBy))
      return false;
    if (assignment.role === "aid") {
      if (u.health.kit <= 0 || B().moveFactor(u) <= 0) return false;
      if (visible && !patient.health.wounds.some((w) => !w.treated))
        return false;
      if (visible && G.distance(u, patient) < 4) {
        const other = [...e.world.units, ...e.world.actors].some(
          (a) =>
            a.id !== u.id &&
            a.health?.aid?.targetId === patient.id &&
            G.distance(a, patient) < 15,
        );
        if (other) {
          u.path = [];
          u.state = "covering";
          return true;
        }
        B().bandage(s, e, u, patient);
        if (u.health.aid) {
          const ev = log(e, "agency-friendly-aid-started", {
            actorId: u.id,
            targetId: patient.id,
            position: { x: u.x, y: u.y },
          });
          say(
            s,
            e,
            "medical",
            u.name +
              ". " +
              patient.name +
              "에게 실제 합류, 의료품을 사용해 응급처치를 시작한다.",
            ev,
          );
        }
      } else {
        const point = visible ? patient : assignment.point;
        const goal = G.project({
          x: point.x,
          y: point.y,
          ...(point.roofId ? { roofId: point.roofId } : {}),
        });
        moveGround(u, goal, 0.9 * B().moveFactor(u), e);
        u.state = "aid-approach";
        u.prone = false;
        u.stance = "standing";
      }
      return true;
    }
    const threat = enemies.find((a) => e.time - (a.lastShotAt ?? -100) < 6);
    if (threat) {
      u.prone = false;
      B().chooseStance(e, u, threat);
      u.state = "covering";
      B().fire(s, e, u, {
        id: threat.id,
        x: threat.x,
        y: threat.y,
        lastSeen: e.time,
      });
      return true;
    }
    const p = assignment.point,
      goal = G.project({
        x: p.x - 8,
        y: p.y + 5,
        ...(p.roofId ? { roofId: p.roofId } : {}),
      });
    moveGround(u, goal, 0.8 * B().moveFactor(u), e);
    u.state = "friendly-cover";
    return true;
  }
  function taskPerson(e, id, role, p, armed) {
    const base = copy(
      e.world.actors.find((a) => a.side === "civilian") || e.world.actors[0],
    );
    Object.assign(base, {
      id,
      name: role,
      callsign: role === "연락관" ? "VIP" : "지원조",
      role: armed ? "infantry" : "civilian",
      faction: armed ? "allied" : "civilian",
      roleLabel: role,
      x: p.x,
      y: p.y,
      route: [copy(p)],
      waypoint: 0,
      speed: 0.8,
      side: "ally",
      kind: armed ? "training-target" : "unarmed-target",
      armed,
      health: B().health(),
      weapon: B().weapon(armed ? "HK416" : "G19", 2),
      sidearm: B().weapon("G19", 1),
      skill: 62,
      medicalSkill: role === "기관 구출요원",
      waitingForDeployment: true,
      path: [],
      goal: null,
      taskRole: role,
      carriedBy: null,
      carrying: null,
      boardedBy: null,
      home: false,
      escaped: false,
      prone: false,
      stance: "standing",
      suppression: 0,
      lastThreatAt: -100,
      memory: [],
      detectionTracks: [],
      state: "waiting",
    });
    delete base.roofId;
    delete base.roofTransit;
    delete base.overwatchPath;
    if (p.roofId) base.roofId = p.roofId;
    delete base.suppressionAt;
    delete base.lastShotAt;
    base.health.kit = role === "기관 구출요원" ? 2 : 1;
    return base;
  }
  function escortExits(e) {
    const points = [
      [0.9, 0.97],
      [0.75, 0.97],
      [0.97, 0.97],
    ].map(([x, y]) => G.project({ x: G.MAP.width * x, y: G.MAP.height * y }));
    const offset =
      [...e.mission.contract.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) %
      points.length;
    return [...points.slice(offset), ...points.slice(0, offset)];
  }
  function setupTargets(e) {
    const m = e.mission,
      count = m.contract.targetCount || 1;
    const reds = e.world.actors.filter((a) => a.side === "red");
    m.targetIds = [];
    m.targetProgress = { identified: [], confirmed: [], escaped: [] };
    m.knowledge.targetProgress = {
      identified: 0,
      confirmed: 0,
      required: count,
    };
    m.targetExit = G.project({ x: G.MAP.width - 24, y: G.MAP.height * 0.55 });
    for (let i = 0; i < count; i++) {
      const areas = searchAreas(e),
        seed = [...m.contract.id].reduce((n, c) => n + c.charCodeAt(0), 0);
      const a = reds[i],
        point = G.project({
          x: areas[(seed + i * 2) % areas.length].point.x + i * 12,
          y: areas[(seed + i * 2) % areas.length].point.y,
        });
      a.missionTargetCode =
        m.contract.targetLabel + (count > 1 ? "-" + (i + 1) : "");
      a.name = a.missionTargetCode;
      a.armed = true;
      a.specialty = m.contract.key === "counter-sniper" ? "sniper" : "rifleman";
      a.weapon = B().weapon(a.specialty === "sniper" ? "SVD" : "AKM", 3);
      a.deployment.destination = point;
      a.deployment.releaseAt = 120 + i * 90;
      a.route = [point, G.project({ x: point.x + 30, y: point.y })];
      a.waypoint = 0;
      if (m.contract.task === "interdict") a.escapeAfter = 2400 + i * 120;
      m.targetIds.push(a.id);
    }
    // There is no agency escort to follow on an autonomous target contract.
    m.agencyControl = null;
  }
  function targetOutcome(s, e) {
    const m = e.mission,
      p = m.targetProgress,
      before = JSON.stringify(p);
    for (const id of m.targetIds) {
      const target = e.world.actors.find((a) => a.id === id);
      const observations = e.squads
        .flatMap((q) => q.contacts)
        .concat(
          Object.values({
            ...e.knowledge.contacts,
            ...(m.knowledge.objectiveContacts || {}),
          }).map((c) => ({
            ...c,
            lastSeen: c.observedAt,
          })),
        )
        .filter(
          (c) =>
            c.id === id &&
            c.objectiveCode &&
            c.confidence >= 0.85 &&
            e.time - c.lastSeen < 15,
        );
      if (observations.length && !p.identified.includes(id)) {
        p.identified.push(id);
        const ev = log(e, "mission-target-identified", {
          actorId: id,
          code: target.missionTargetCode,
        });
        say(
          s,
          e,
          "objective",
          target.missionTargetCode +
            " 계약 표적 신원 식별 확인. 현장 관측수의 사격 판단에 따른다.",
          ev,
        );
      }
      const confirmed = observations.some((c) =>
        m.contract.task === "interdict"
          ? ["dead", "down"].includes(c.medicalCondition)
          : c.medicalCondition === "dead",
      );
      if (
        confirmed &&
        (!target.health.alive ||
          (m.contract.task === "interdict" && !target.health.conscious)) &&
        !p.confirmed.includes(id)
      ) {
        p.confirmed.push(id);
        log(e, "mission-target-confirmed", {
          actorId: id,
          code: target.missionTargetCode,
          condition: !target.health.alive ? "dead" : "down",
        });
      }
      if (
        target.escaped &&
        !p.confirmed.includes(id) &&
        !p.escaped.includes(id)
      )
        p.escaped.push(id);
    }
    if (before !== JSON.stringify(p)) {
      const ev = log(e, "target-progress-report", {
        identified: p.identified.slice(),
        confirmed: p.confirmed.slice(),
        escaped: p.escaped.slice(),
      });
      say(
        s,
        e,
        "objective",
        "계약 표적 신원 확인 " +
          p.identified.length +
          "/" +
          m.targetIds.length +
          " · 저지·사살 확인 " +
          p.confirmed.length +
          "/" +
          m.targetIds.length,
        ev,
        {
          targetProgress: {
            identified: p.identified.length,
            confirmed: p.confirmed.length,
            required: m.targetIds.length,
          },
        },
      );
    }
    return {
      complete:
        p.confirmed.length === m.targetIds.length &&
        m.targetIds.every((id) => m.groundSearch?.securedIds?.includes(id)),
      failed: p.escaped.length > 0,
    };
  }
  function setupTask(e) {
    G.activate(e.mapId || "command-range");
    const m = e.mission,
      t = m.contract.task;
    const city = G.MAP.urban || G.MAP.width < 500,
      at = (legacy, local) => G.project(city ? local : legacy);
    if (t === "recon" || targeted(m)) return;
    if (t === "rescue") {
      const a = taskPerson(
          e,
          "agency-rescuer",
          "기관 구출요원",
          at({ x: 270, y: 535 }, m.contract.insertion),
          true,
        ),
        h = taskPerson(
          e,
          "agency-protected",
          "억류 의료인",
          searchAreas(e)[
            [...m.contract.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 6
          ].point,
          false,
        );
      h.health.kit = 0;
      h.waitingForDeployment = false;
      h.state = "held";
      m.taskGoal = copy(m.contract.extraction);
      e.world.actors.push(a, h);
    } else {
      const a = taskPerson(
          e,
          "agency-guide",
          "기관 경호요원",
          at({ x: 350, y: 650 }, m.contract.insertion),
          true,
        ),
        v = taskPerson(
          e,
          "agency-protected",
          t === "vip" ? "연락관" : "구호대원",
          at(
            { x: 330, y: 650 },
            { x: m.contract.insertion.x + 5, y: m.contract.insertion.y },
          ),
          false,
        );
      m.escortExits = escortExits(e);
      m.taskGoal = city
        ? copy(m.escortExits[0])
        : at(
            { x: 1080, y: 650 },
            { x: G.MAP.width - 25, y: G.MAP.height - 25 },
          );
      e.world.actors.push(a, v);
    }
  }
  function stepToward(p, goal, speed) {
    const d = G.distance(p, goal);
    if (d < 0.01) return true;
    const a = Math.min(speed, d);
    p.heading = Math.atan2(goal.y - p.y, goal.x - p.x);
    p.x += ((goal.x - p.x) * a) / d;
    p.y += ((goal.y - p.y) * a) / d;
    return a === d;
  }
  function moveGround(u, goal, speed, e) {
    if (u.hqMemberId) {
      if (goal.roofId)
        goal =
          G.roofs().find((r) => r.id === goal.roofId)?.access ||
          G.project({ x: goal.x, y: goal.y });
      if (u.path?.some((p) => p.roofTransition === "up")) {
        u.path = [];
        delete u.agencyBoundPath;
        delete u.roofTransit;
      }
    }

    if (
      u.health?.alive &&
      u.health.conscious &&
      !u.health.aid &&
      B().moveFactor(u) > 0
    ) {
      u.prone = false;
      u.stance = "standing";
    }
    if (
      (u.agencyCoverGoal || u.agencyFireGoal) &&
      u.taskMoveGoal &&
      G.distance(u.taskMoveGoal, goal) > 1
    ) {
      u.path = [];
      delete u.agencyBoundPath;
    }
    if (
      u.taskMoveGoal &&
      (G.distance(u.taskMoveGoal, goal) > Math.max(30, G.MAP.grid * 3) ||
        (u.taskMoveGoal.roofId || null) !== (goal.roofId || null))
    ) {
      u.path = [];
      delete u.agencyBoundPath;
    }
    u.taskMoveGoal = {
      x: goal.x,
      y: goal.y,
      ...(goal.roofId ? { roofId: goal.roofId } : {}),
    };
    const tactical =
      u.side === "ally" &&
      u.armed &&
      e &&
      G.MAP.urban &&
      !u.agencyCoverGoal &&
      !u.agencyFireGoal &&
      G.distance(u, goal) > 30;
    const exposed = tactical && G.coverDistance(u) > G.MAP.width / 60,
      buddy =
        exposed &&
        e.world.actors.some(
          (a) =>
            a.id !== u.id &&
            a.side === "ally" &&
            a.armed &&
            a.health.alive &&
            a.health.conscious &&
            G.distance(a, u) < 80,
        );
    if (
      buddy &&
      B().performance(u).teamwork >= 50 &&
      (Number(u.id.split("-").at(-1)) || 0) % 2 !== Math.floor(e.time / 5) % 2
    ) {
      if (u.path?.length) u.agencyBoundPath = u.path;
      u.path = [];
      u.stance = "kneeling";
      u.prone = false;
      u.state = "crossing-overwatch";
      return false;
    }
    if (u.agencyBoundPath) {
      if (tactical) u.path = u.agencyBoundPath;
      delete u.agencyBoundPath;
    }
    if (!u.path?.length)
      u.path =
        u.side === "ally" && u.armed && !u.agencyCoverGoal && !u.agencyFireGoal
          ? G.tacticalPath(u, goal)
          : G.path(u, goal);
    if (!u.path.length) return G.distance(u, goal) < 2;
    const next = u.path[0];
    if (next.roofTransition) {
      if (!e) return false;
      const roof = G.roofs().find(
        (r) => r.id === (next.roofId || next.roofFrom),
      );
      if (!roof) {
        u.path = [];
        return false;
      }
      u.roofTransit ??= { dueAt: e.time + Math.max(12, roof.height * 2) };
      u.state = "climbing";
      if (e.time < u.roofTransit.dueAt) return false;
      Object.assign(u, { x: next.x, y: next.y });
      if (next.roofId) u.roofId = next.roofId;
      else delete u.roofId;
      delete u.roofTransit;
      u.path.shift();
      return false;
    }
    const done = stepToward(u, next, speed);
    if (done) u.path.shift();
    return !u.path.length && G.distance(u, goal) < 2;
  }
  function beginTravel(e, t, target, arrival) {
    if (target.roofId && t.type !== "drone")
      target =
        G.roofs().find((r) => r.id === target.roofId)?.access ||
        G.project({ x: target.x, y: target.y });
    t.target = copy(target);
    t.arrival = arrival;
    t.path =
      t.type === "helicopter" || t.type === "drone"
        ? [copy(target)]
        : G.path(t, target);
    if (!t.path.length && G.distance(t, target) > 2 && t.type === "vehicle")
      t.path = G.path(t, target, 5);
    t.state =
      t.type === "helicopter" || t.type === "drone" ? "takeoff" : "driving";
    log(e, "transport-departed", {
      transportId: t.id,
      vehicleType: t.type,
      from: { x: t.x, y: t.y },
      to: target,
      trip: t.trip,
    });
  }
  function travel(e, t) {
    if (t.state === "air-hold") {
      if (safeLanding(e, t)) t.state = "landing";
      return;
    }
    if (t.state === "ground-hold") {
      if (safeLanding(e, t)) t.state = "driving";
      return;
    }
    if (t.state === "takeoff") {
      t.altitude = Math.min(t.type === "drone" ? 110 : 80, t.altitude + 10);
      if (t.altitude >= (t.type === "drone" ? 110 : 80)) t.state = "flying";
      return;
    }
    if (["flying", "driving"].includes(t.state)) {
      if (
        t.state === "driving" &&
        t.trip !== "insertion" &&
        G.distance(t, t.target) < 200 &&
        !safeLanding(e, t)
      ) {
        t.state = "ground-hold";
        return;
      }
      if (!t.path.length && G.distance(t, t.target) > 2) {
        t.state = "route-blocked";
        log(e, "transport-route-blocked", {
          transportId: t.id,
          position: { x: t.x, y: t.y },
          target: t.target,
        });
        return;
      }
      if (!t.path.length) {
        t.state = t.altitude > 0 ? "landing" : t.arrival;
        return;
      }
      const p = t.path[0];
      if (
        stepToward(
          t,
          p,
          t.type === "helicopter" ? 40 : t.type === "drone" ? 22 : 10,
        )
      )
        t.path.shift();
      if (!t.path.length)
        t.state =
          G.distance(t, t.target) > 2
            ? "route-blocked"
            : t.altitude > 0
              ? "landing"
              : t.arrival;
      return;
    }
    if (t.state === "landing") {
      if (
        t.type === "helicopter" &&
        ["support-landed", "pickup-landed", "insert-landed"].includes(
          t.arrival,
        ) &&
        !safeLanding(e, t)
      ) {
        t.state = "air-hold";
        t.altitude = Math.max(60, t.altitude);
        return;
      }
      t.altitude = Math.max(0, t.altitude - 10);
      if (!t.altitude) t.state = t.arrival;
    }
  }
  function safeLanding(e, t) {
    return !e.world.actors.some(
      (a) =>
        a.side === "red" &&
        a.health.conscious &&
        a.health.alive &&
        G.distance(t, a) < (G.MAP.width < 500 ? 35 : 180) &&
        G.clear(
          {
            ...t,
            altitude: t.type === "vehicle" ? 0 : Math.max(40, t.altitude),
          },
          a,
        ),
    );
  }
  function board(s, e, t, ids) {
    const m = e.mission,
      pending = ids
        .map((id) => blue(e, id))
        .filter(
          (u) => !m.home.includes(u.id) && !u.boardedBy && u.health.alive,
        );
    if (!pending.length) return true;
    if (t.manifest.length >= t.capacity) return false;
    if (
      t.boarding &&
      (!pending.some((u) => u.id === t.boarding.id) ||
        m.transports.some((v) => v.crew?.patientId === t.boarding.id))
    )
      t.boarding = null;
    const u =
      pending.find(
        (u) =>
          u.id === t.boarding?.id &&
          !m.transports.some((v) => v.crew?.patientId === u.id),
      ) ||
      pending
        .filter((u) => !m.transports.some((v) => v.crew?.patientId === u.id))
        .sort((a, b) => G.distance(a, t) - G.distance(b, t))[0];
    if (!u) {
      t.boarding = null;
      return false;
    }
    if (G.distance(u, t) > (t.trip === "insertion" ? 120 : 50)) return false;
    if (B().moveFactor(u) > 0 && !u.health.aid) {
      const door = G.project({ x: t.x, y: t.y });
      if (G.distance(u, t) > 10 || u.roofId || u.roofTransit) {
        if (!u.path.length || !u.goal || G.distance(u.goal, door) > 0.1) {
          u.path = G.path(u, door);
          u.goal = door;
        }
        I().moveUnit(e, u, 0.8);
        return false;
      }
    }
    if (u.carriedBy && t.crew?.patientId === u.id) return false;
    if (G.distance(u, t) > 20) return false;
    if (!t.boarding) t.boarding = { id: u.id, until: e.time + 4 };
    if (t.boarding.id !== u.id) return false;
    if (e.time < t.boarding.until) return false;
    if (u.carriedBy) {
      const carrier = actor(e, u.carriedBy);
      if (carrier) carrier.carrying = null;
      u.carriedBy = null;
    }
    t.manifest.push(u.id);
    delete u.roofId;
    delete u.roofTransit;
    u.boardedBy = t.id;
    u.path = [];
    u.goal = null;
    u.state = "aboard";
    t.boarding = null;
    const ev = log(e, "transport-boarded", {
      transportId: t.id,
      memberId: u.id,
    });
    say(
      s,
      e,
      "transport",
      u.name + " 탑승 확인. " + t.manifest.length + "/" + t.capacity + "명.",
      ev,
    );
    return pending.length === 1;
  }
  function attachPassengers(e, t) {
    for (const id of t.manifest) {
      const u = blue(e, id);
      if (!u) continue;
      u.x = t.x;
      u.y = t.y;
      delete u.roofId;
      delete u.roofTransit;
      delete u.overwatchPath;
      u.path = [];
      u.goal = null;
      u.altitude = t.altitude;
      u.boardedBy = t.id;
      u.state = "aboard";
    }
  }
  function homeUnload(s, e, t) {
    const m = e.mission;
    if (t.id === "primary" && t.trip === "extraction") {
      m.lastRecoveryCompletedAt = e.time;
      t.dispatchAt = Math.max(t.dispatchAt, e.time + 30);
    }
    if (
      t.id === "primary" &&
      t.trip === "extraction" &&
      !t.manifest.length &&
      m.returnRequested
    ) {
      m.failedRecoveries = (m.failedRecoveries || 0) + 1;
      log(e, "empty-recovery-returned", {
        transportId: t.id,
        attempt: m.failedRecoveries,
      });
      if (m.abortRequested && m.failedRecoveries >= 2)
        m.recoveryExhausted = true;
    }
    for (const [i, id] of t.manifest.entries()) {
      const u = blue(e, id);
      Object.assign(
        u,
        G.project({
          x: G.MAP.base.x + (i % 3) * 3,
          y: G.MAP.base.y - Math.floor(i / 3) * 3,
        }),
      );
      u.altitude = 0;
      u.boardedBy = null;
      u.carriedBy = null;
      u.carrying = null;
      u.extracted = true;
      u.home = true;
      u.state = "returned";
      if (!m.home.includes(id)) m.home.push(id);
    }
    if (t.manifest.length) {
      const ev = log(e, "transport-home", {
        transportId: t.id,
        memberIds: t.manifest.slice(),
        friends: e.squads
          .flatMap((q) => I().friendSnapshots(e, q))
          .filter((f) => t.manifest.includes(f.id)),
      });
      const homeReport = say(
        s,
        e,
        "transport",
        "본부 도착·하차 확인. 탑승 인원의 실제 복귀를 기록한다.",
        ev,
        {
          friends: e.squads
            .flatMap((q) => I().friendSnapshots(e, q))
            .filter((f) => t.manifest.includes(f.id)),
        },
      );
      I().applyKnowledge(e, homeReport);
    }
    t.manifest = [];
    t.crew = null;
    t.loadingSince = null;
    t.state = "home";
    t.trip = "extraction";
    t.altitude = 0;
  }
  function beforeTick(s, e) {
    const m = e.mission;
    if (!m || m.settled) return;
    if (!m.postpaid) {
      if (m.escrow)
        P.finance(s, m.escrow, "mission-deposit-released", { missionId: m.id });
      m.escrow = 0;
      m.postpaid = true;
    }
    if (!m.securityControl) ensureSecurity(s, e);
    if (!m.agencyCommand)
      (
        root.OverwatchAgency ||
        (typeof require === "function" ? require("./agency.js") : null)
      ).initialize(s, e);
    if (!targeted(m))
      m.agencyControl ??= {
        version: 1,
        authorized: false,
        phase: "holding",
        reason: "기존 현장 유지·엄호 보고 재확인",
        waypoint: null,
        lastAssessment: -100,
        everAuthorized: false,
        readyTeams: [],
        history: [],
        legacy: true,
      };
    if (m.returnRequested && m.recoveryVersion !== 2) {
      const primary = m.transports[0];
      m.recoveryVersion = 2;
      if (
        m.contract.transport !== "foot" &&
        !primary.manifest.length &&
        !primary.crew?.patientId
      ) {
        const point = pickupPoint(s);
        m.extractionPoint = copy(point);
        primary.crew = null;
        primary.loadingSince = null;
        if (primary.state !== "home") {
          primary.trip = "extraction";
          beginTravel(e, primary, point, "pickup-landed");
        }
        const ev = log(e, "recovery-replanned", { pickup: point });
        say(
          s,
          e,
          "transport",
          "기존 대기 회수를 재검토했다. 마지막 수신 위치에서 생존자·부상자·미확인 인원을 직접 확인한다.",
          ev,
        );
      }
    }
    for (const t of m.transports) {
      if (
        t.type === "vehicle" &&
        (t.target?.roofId ||
          t.path.some((p) => p.roofId || p.roofTransition) ||
          G.blocked(t))
      ) {
        const oldPosition = { x: t.x, y: t.y },
          roof = G.roofs().find((r) => r.id === t.target?.roofId);
        const destination =
          roof?.access || G.project({ x: t.target.x, y: t.target.y });
        const ground = G.project({ x: t.x, y: t.y });
        t.x = ground.x;
        t.y = ground.y;
        delete t.roofId;
        beginTravel(e, t, destination, t.arrival);
        log(e, "transport-ground-route-recovered", {
          transportId: t.id,
          previousPosition: oldPosition,
          target: destination,
        });
      }
      travel(e, t);
      if (
        t.id === "primary" &&
        m.returnRequested &&
        m.abortRequested &&
        ["ground-hold", "air-hold", "pickup-hold", "route-blocked"].includes(
          t.state,
        )
      ) {
        t.holdSince ??= e.time;
        if (e.time - t.holdSince >= 90) {
          const route =
            t.type === "vehicle"
              ? G.path(t, G.MAP.base).length
                ? G.path(t, G.MAP.base)
                : G.path(t, G.MAP.base, 5)
              : [G.MAP.base];
          const ev = log(e, "unsafe-recovery-aborted", {
            transportId: t.id,
            state: t.state,
          });
          say(
            s,
            e,
            "transport",
            "접근 위험·경로를 재확인했으나 현재 제공 전력으로 회수가 불가능하다. 승무원 복귀 후 미회수 상태를 보고한다.",
            ev,
          );
          if (route.length) beginTravel(e, t, G.MAP.base, "home-unload");
          else m.recoveryExhausted = true;
          t.holdSince = null;
        }
      } else t.holdSince = null;
      if (t.state === "route-blocked" && t.lastReportState !== t.state) {
        t.lastReportState = t.state;
        const ev = log(e, "transport-route-blocked", { transportId: t.id });
        say(
          s,
          e,
          "transport",
          "현재 위치에서 회수 지점까지 이동 경로를 확보하지 못했다. 회수 위치를 재평가해야 하며 도착으로 처리하지 않는다.",
          ev,
        );
      }

      if (
        ["air-hold", "ground-hold"].includes(t.state) &&
        t.lastReportState !== t.state
      ) {
        t.lastReportState = t.state;
        const ev = log(e, "landing-held", { transportId: t.id });
        say(
          s,
          e,
          "transport",
          "지원 승무원이 접근 지점에서 무장 위협을 관측했다. 안전 확보 전 착륙·접근을 보류한다.",
          ev,
        );
      }
      attachPassengers(e, t);
      if (t.state === "home-unload") homeUnload(s, e, t);
      if (t.id === "primary") {
        if (t.state === "boarding" && board(s, e, t, m.memberIds)) {
          beginTravel(e, t, m.contract.insertion, "insert-landed");
          m.phase = "inserting";
        } else if (t.state === "insert-landed") {
          if (!safeLanding(e, t)) {
            t.state = "insert-hold";
            const ev = log(e, "landing-held", { transportId: t.id });
            say(
              s,
              e,
              "transport",
              "투입 지점에 무장 위협 관측. 안전 확보 전 하차하지 않는다.",
              ev,
            );
            continue;
          }
          t.state = "unloading";
          t.unloadAt = e.time + 2;
        } else if (t.state === "insert-hold") {
          if (safeLanding(e, t)) t.state = "insert-landed";
        } else if (t.state === "unloading") {
          if (t.manifest.length && e.time >= t.unloadAt) {
            const id = t.manifest.shift(),
              u = blue(e, id),
              i = m.memberIds.indexOf(id);
            u.boardedBy = null;
            u.waitingForDeployment = false;
            u.deployedAt = e.time;
            u.altitude = 0;
            Object.assign(
              u,
              G.project({
                x: t.x + 3 + (i % 3) * 3,
                y: t.y - Math.floor(i / 3) * 3,
              }),
            );
            u.state = "holding";
            u.path = [];
            u.goal = null;
            t.unloadAt = e.time + 2;
            log(e, "transport-disembarked", {
              memberId: id,
              transportId: t.id,
            });
          }
          if (!t.manifest.length) {
            m.phase = "field";
            m.fieldStartedAt ??= e.time;
            const ev = log(e, "insertion-complete", { transportId: t.id });
            say(
              s,
              e,
              "transport",
              "전원 하차 완료. 관측수 지휘로 임무 수행한다.",
              ev,
            );
            beginTravel(e, t, G.MAP.base, "home-unload");
          }
        }
        if (
          t.state === "home" &&
          m.returnRequested &&
          !m.recoveryExhausted &&
          m.memberIds.some((id) => !m.home.includes(id)) &&
          e.time >= t.dispatchAt
        ) {
          t.trip = "extraction";
          beginTravel(e, t, m.extractionPoint, "pickup-landed");
          m.phase = "extracting";
        } else if (t.state === "pickup-landed") {
          if (!safeLanding(e, t)) {
            t.state = "pickup-hold";
            const ev = log(e, "landing-held", { transportId: t.id });
            say(
              s,
              e,
              "transport",
              "회수 지점에 위협 관측. 안전 확보 전 탑승을 진행하지 않는다.",
              ev,
            );
          } else t.state = "loading";
        } else if (t.state === "pickup-hold") {
          if (safeLanding(e, t)) t.state = "pickup-landed";
        } else if (t.state === "loading") {
          t.loadingSince ??= e.time;
          if (t.crew) {
            medicalCrew(s, e, t);
            if (t.state !== "loading") continue;
          }
          const done = board(s, e, t, m.memberIds);
          if (
            !t.crew &&
            e.time - t.loadingSince >= 15 &&
            (!done || !t.manifest.length)
          ) {
            t.crew = {
              id: t.id + "-recovery",
              name: "기관 수송 회수요원",
              x: t.x,
              y: t.y,
              state: "search",
              targetId: null,
              patientId: null,
              path: [],
              dueAt: null,
            };
            const priorNotice = m.log.findLast(
              (ev) =>
                ev.type === "transport-recovery-started" &&
                ev.transportId === t.id,
            );
            const ev = log(e, "transport-recovery-started", {
              transportId: t.id,
            });
            if (!priorNotice || e.time - priorNotice.time >= 180)
              say(
                s,
                e,
                "transport",
                "탑승 대기 인원이 접근하지 못했다. 기존 수송 승무원이 마지막 보고 지점에서 직접 확인·회수한다. 추가 지원 인원이나 헬기를 생성하지 않는다.",
                ev,
              );
          }
          if (done && t.manifest.length && !t.crew) {
            t.trip = "extraction";
            beginTravel(e, t, G.MAP.base, "home-unload");
            m.phase = "returning";
          }
        }
      } else supportTick(s, e, t);
    }
    if (m.contract.transport === "foot") {
      if (
        m.phase === "infiltration" &&
        e.world.units
          .filter((u) => u.health.alive)
          .every((u) => G.distance(u, m.contract.insertion) < 55)
      ) {
        m.phase = "field";
        m.fieldStartedAt ??= e.time;
      }
      if (m.returnRequested)
        for (const u of e.world.units)
          if (u.health.alive && !u.home && G.distance(u, G.MAP.base) < 35) {
            u.home = true;
            u.extracted = true;
            if (!m.home.includes(u.id)) m.home.push(u.id);
          }
    }
  }
  function allowTeams(e) {
    return (
      !e.mission ||
      ["field", "infiltration", "extracting", "withdrawing"].includes(
        e.mission.phase,
      )
    );
  }
  function pickupPoint(s) {
    const e = s.commandExercise;
    G.activate(e.mapId || "command-range");
    const f = Object.values(e.knowledge.friends).find(
      (f) => !e.mission.home.includes(f.id) && !f.boardedBy && f.health?.alive,
    );
    const p = f || e.mission.extractionPoint;
    return (
      G.roofs().find((r) => r.id === p.roofId)?.access ||
      G.project({ x: p.x, y: p.y })
    );
  }
  function requestReturn(
    s,
    { abort = false, pickup = null, authority = null } = {},
  ) {
    const e = s.commandExercise,
      m = e?.mission;
    ok(m && e.status === "running", "진행 중인 실전 작전이 없습니다.");
    if (!pickup && m.contract.transport !== "foot") {
      const known = Object.values(e.knowledge.friends).filter(
        (f) => !m.home.includes(f.id) && !f.boardedBy,
      );
      if (
        known.some(
          (f) => f.health?.wounds?.length || e.time - f.observedAt > 45,
        )
      )
        pickup = pickupPoint(s);
    }
    if (pickup) {
      ok(
        point(pickup) && !pickup.roofId && !G.blocked(pickup),
        "회수 지점은 지상 이동 가능한 좌표여야 합니다.",
      );
      ok(
        m.contract.transport !== "foot",
        "도보 계약의 복귀 지점은 본부입니다.",
      );
      m.extractionPoint = copy(pickup);
    }
    m.recoveryVersion = 2;
    m.returnRequested = true;
    m.abortRequested = !!m.abortRequested || abort;
    m.phase = m.contract.transport === "foot" ? "withdrawing" : "extracting";
    const t = m.transports[0];
    t.dispatchAt = Math.max(t.dispatchAt, e.time + 30);
    if (
      pickup &&
      !t.manifest.length &&
      !t.crew?.patientId &&
      !t.crew?.targetId &&
      t.state !== "home" &&
      t.state !== "boarding" &&
      G.distance(t.target || t, pickup) > 1
    ) {
      t.crew = null;
      t.loadingSince = null;
      t.trip = "extraction";
      beginTravel(e, t, pickup, "pickup-landed");
    }

    if (
      ["takeoff", "flying", "air-hold", "landing", "driving"].includes(
        t.state,
      ) &&
      t.manifest.length &&
      m.memberIds.every((id) => t.manifest.includes(id) || m.home.includes(id))
    ) {
      beginTravel(e, t, G.MAP.base, "home-unload");
      m.phase = "returning";
    }
    if (t.state === "boarding") {
      for (const id of t.manifest) {
        const u = blue(e, id);
        u.boardedBy = null;
        u.home = true;
        u.extracted = true;
        if (!m.home.includes(id)) m.home.push(id);
      }
      t.manifest = [];
      for (const u of e.world.units)
        if (G.distance(u, G.MAP.base) < 50 && !m.home.includes(u.id)) {
          u.home = true;
          u.extracted = true;
          m.home.push(u.id);
        }
      t.state = "home";
    }
    for (const q of e.squads) {
      const field = [q.observerId, q.sniperId]
        .map((id) => blue(e, id))
        .filter((u) => u.capable && !u.home && !u.boardedBy);
      if (!field.length) continue;
      if (!field.some((u) => u.id === q.leaderId)) q.leaderId = field[0].id;
      D().issue(s, q.callsign, "withdraw", null, null, authority);
    }
    const ev = log(
      e,
      abort ? "mission-abort-requested" : "mission-return-requested",
      { pickup: m.extractionPoint },
    );
    say(
      s,
      e,
      "transport",
      (abort ? "작전 중단·철수" : "임무 철수") +
        " 요청 접수. 실제 집결·탑승·본부 도착 뒤 정산한다.",
      ev,
    );
  }
  function requestSupport(s, type, target = null) {
    const e = s.commandExercise,
      m = e?.mission;
    ok(
      m && e.status === "running",
      "실전 작전 중에만 지원을 요청할 수 있습니다.",
    );
    ok(
      ["drone", "medical", "supply"].includes(type),
      "계약에서 지원하는 요청만 가능합니다.",
    );
    ok(
      m.supports[type] < m.contract.support[type],
      "계약에 없거나 이미 사용한 지원입니다.",
    );
    ok(allowTeams(e), "현장 투입을 마친 뒤 지원을 요청하세요.");
    let p = target;
    if (type === "medical") {
      const known = Object.values(e.knowledge.friends).find(
        (f) => !m.home.includes(f.id) && f.health?.wounds.length,
      );
      if (!known) {
        const lost = Object.values(e.knowledge.friends).find(
          (f) => !m.home.includes(f.id) && e.time - f.observedAt > 45,
        );
        ok(lost, "보고된 부상자나 45초 이상 통신 두절 인원이 없습니다.");
        p = p || { x: lost.x, y: lost.y };
      } else
        p = p ||
          G.roofs().find((r) => r.id === known.roofId)?.access || {
            x: known.x,
            y: known.y,
          };
    }
    p =
      p ||
      (type === "drone"
        ? G.project(e.squads[0]?.sector || G.MAP.sector || m.contract.interest)
        : copy(m.extractionPoint));
    ok(point(p) && !G.blocked(p), "지원 지점이 잘못되었습니다.");
    m.supports[type]++;
    const t = transport(
      type + "-" + m.supports[type],
      type === "supply" ? "vehicle" : type === "drone" ? "drone" : "helicopter",
      G.MAP.base.x,
      G.MAP.base.y,
      type === "medical" ? 3 : 0,
    );
    t.trip = type;
    t.dispatchAt =
      e.time + (type === "medical" ? 80 : type === "supply" ? 60 : 20);
    t.state = "dispatch";
    t.supportTarget = copy(p);
    t.patients = [];
    t.crew = null;
    m.transports.push(t);
    const ev = log(e, "support-requested", {
      support: type,
      transportId: t.id,
      target: p,
      dispatchAt: t.dispatchAt,
    });
    say(
      s,
      e,
      "support",
      { medical: "의료 회수", drone: "정찰 드론", supply: "재보급 차량" }[
        type
      ] +
        " 요청 승인. 계약 제공 횟수 " +
        m.supports[type] +
        "/" +
        m.contract.support[type] +
        ", 추가 비용 0원. 출발 준비 후 이동한다.",
      ev,
    );
  }
  function retaskDrone(s, target) {
    const e = s.commandExercise,
      m = e?.mission;
    ok(m && e.status === "running", "실전 UAV가 필요합니다.");
    const t = m.transports.find(
      (t) => t.trip === "drone" && t.state !== "home",
    );
    ok(t, "운용 중인 UAV가 없습니다.");
    ok(!t.until || e.time < t.until - 10, "잔여 체공 시간이 부족합니다.");
    target =
      target ||
      G.project(e.squads[0]?.sector || G.MAP.sector || m.contract.interest);
    ok(
      target && point(target) && !G.blocked(target),
      "지도에서 관측할 구역을 선택하세요.",
    );
    t.supportTarget = copy(target);
    if (t.state !== "dispatch") beginTravel(e, t, target, "on-station");
    const ev = log(e, "drone-retasked", {
      transportId: t.id,
      target: copy(target),
      remaining: t.until ? Math.max(0, t.until - e.time) : null,
    });
    say(
      s,
      e,
      "support",
      "UAV 관측 구역 변경. 기존 기체를 재배치하며 새 출동 횟수나 체공 시간을 추가하지 않는다.",
      ev,
    );
  }
  function supportTick(s, e, t) {
    const m = e.mission;
    if (t.state === "dispatch" && e.time >= t.dispatchAt) {
      beginTravel(
        e,
        t,
        t.supportTarget,
        t.trip === "drone" ? "on-station" : "support-landed",
      );
    }
    if (t.trip === "drone") {
      if (t.state === "home-unload") {
        homeUnload(s, e, t);
        return;
      }
      if (t.state === "landing" && t.arrival === "on-station") {
        if (
          t.type === "helicopter" &&
          ["support-landed", "pickup-landed", "insert-landed"].includes(
            t.arrival,
          ) &&
          !safeLanding(e, t)
        ) {
          t.state = "air-hold";
          t.altitude = Math.max(60, t.altitude);
          return;
        }
        t.altitude = 110;
        t.state = "on-station";
      }
      if (t.state === "on-station") {
        t.altitude = 110;
        t.until ??= e.time + 120;
        if (e.time % 8 === 0) {
          t.observations ??= [];
          for (const a of e.world.actors.filter(
            (a) =>
              (a.side === "red" ||
                (m.contract.task === "rescue" &&
                  a.id === "agency-protected")) &&
              G.distance(t, a) < 260 &&
              G.clear(t, a),
          )) {
            const medicalCondition = !a.health.alive
                ? "dead"
                : !a.health.conscious
                  ? "down"
                  : "normal",
              old = t.observations.find((o) => o.id === a.id),
              seen = {
                id: a.id,
                x: Math.round(a.x / 10) * 10,
                y: Math.round(a.y / 10) * 10,
                observedAt: e.time,
                confidence: G.distance(t, a) < 150 ? 0.95 : 0.85,
                classification: a.armed ? "armed-person" : "unarmed-person",
                objectiveCode:
                  G.distance(t, a) < 150
                    ? a.missionTargetCode ||
                      (a.id === "agency-protected"
                        ? "RESCUE-PERSON"
                        : undefined)
                    : undefined,
                observerId: t.id,
                callsign: "UAV",
                uncertainty: 10,
                pose: !a.health.alive
                  ? "dead"
                  : !a.health.conscious
                    ? "down"
                    : B().snapshot(a, e.time).pose,
                medicalCondition,
                heading: a.heading,
              };
            const ev = log(e, "drone-observation", {
              transportId: t.id,
              actorId: a.id,
              observation: copy(seen),
              observedAt: e.time,
            });
            if (
              !old ||
              medicalCondition !== old.condition ||
              seen.objectiveCode !== old.code ||
              (medicalCondition !== "dead" &&
                (e.time - old.lastReportAt >= 45 || G.distance(old, seen) > 20))
            ) {
              say(
                s,
                e,
                "observation",
                medicalCondition === "dead"
                  ? "UAV 관측 표적 사망 확인. 해당 위치의 반복 보고를 종료한다."
                  : medicalCondition === "down"
                    ? "UAV 관측 인원 쓰러짐. 사망 미확인."
                    : seen.objectiveCode
                      ? "UAV 영상으로 계약 목표 신원 식별. 보병조에 확인 좌표를 전파한다."
                      : "UAV 영상으로 인원 관측. 추가 신원 식별이 필요하다.",
                ev,
                { contact: seen },
              );
              if (old) old.lastReportAt = e.time;
            } else {
              say(s, e, "position", "UAV 영상 수신 갱신.", ev, {
                contact: seen,
              });
            }
            if (old) {
              old.x = seen.x;
              old.y = seen.y;
              old.condition = medicalCondition;
              old.code = seen.objectiveCode;
              old.observedAt = e.time;
            } else
              t.observations.push({
                id: a.id,
                x: seen.x,
                y: seen.y,
                condition: medicalCondition,
                code: seen.objectiveCode,
                lastReportAt: e.time,
                observedAt: e.time,
              });
          }
        }
        if (e.time >= t.until) beginTravel(e, t, G.MAP.base, "home-unload");
      }
      return;
    }
    if (t.state === "support-landed") {
      if (!safeLanding(e, t)) {
        t.state = "support-hold";
        const ev = log(e, "landing-held", { transportId: t.id });
        say(
          s,
          e,
          "support",
          "지원 지점에 위협 관측. 안전 확보 전 접근을 보류한다.",
          ev,
        );
        return;
      }
      if (t.trip === "supply") {
        let delivered = 0;
        for (const u of e.world.units.filter(
          (u) => u.health.alive && !u.boardedBy && G.distance(t, u) < 60,
        )) {
          const model = u.role === "sniper" ? "AXMC" : "HK416",
            w = u.weapon.model === model ? u.weapon : u.sidearm,
            capacity = B().WEAPONS[model].capacity;
          w.magazines.push(capacity, capacity);
          w.initial += capacity * 2;
          u.health.kit = Math.min(2, u.health.kit + 1);
          delivered++;
        }
        if (!delivered) return;
        const ev = log(e, "supply-delivered", {
          transportId: t.id,
          people: delivered,
        });
        say(
          s,
          e,
          "support",
          "재보급 차량 현장 도착·전달 완료. 실제 근접 인원 " +
            delivered +
            "명에게 예비 탄창 2개와 의료품을 지급했다.",
          ev,
        );
        beginTravel(e, t, G.MAP.base, "home-unload");
      } else {
        t.state = "medical-work";
        t.crew = {
          id: t.id + "-medic",
          name: "기관 의무요원",
          x: t.x,
          y: t.y,
          state: "search",
          targetId: null,
          patientId: null,
          path: [],
          dueAt: null,
        };
      }
    }
    if (t.state === "support-hold") {
      if (safeLanding(e, t)) t.state = "support-landed";
    }
    if (t.state === "medical-work") medicalCrew(s, e, t);
  }
  function crewMove(e, c, goal, speed) {
    const signature = goal.x + ":" + goal.y + ":" + (goal.roofId || "ground"),
      p = c.recoveryProgress;
    if (
      !p ||
      p.goal !== signature ||
      G.distance(c, p) > 0.5 ||
      c.roofTransit?.dueAt >= e.time
    )
      c.recoveryProgress = { x: c.x, y: c.y, at: e.time, goal: signature };
    const done = moveGround(c, goal, speed, e);
    if (!done && !c.path?.length && !c.roofTransit && G.distance(c, goal) > 2) {
      c.path = G.path(c, goal, 5);
      if (c.path.length) moveGround(c, goal, speed, e);
    }
    if (e.time - c.recoveryProgress.at > 120) c.recoveryBlocked = true;
    return (
      done ||
      (G.distance(c, goal) < 2 && (c.roofId || null) === (goal.roofId || null))
    );
  }
  function medicalCrew(s, e, t) {
    const m = e.mission,
      c = t.crew;
    if (c.patientId) {
      const u = blue(e, c.patientId);
      if (
        !u ||
        u.home ||
        u.boardedBy ||
        (u.carriedBy && u.carriedBy !== c.id) ||
        t.manifest.length >= t.capacity
      ) {
        if (u?.carriedBy === c.id) u.carriedBy = null;
        c.patientId = null;
        c.targetId = null;
        c.dueAt = null;
        c.state = "search";
        return;
      }
      crewMove(e, c, G.project({ x: t.x, y: t.y }), 0.8);
      if (c.recoveryBlocked) {
        u.carriedBy = null;
        c.patientId = null;
        c.targetId = null;
        c.state = "search";
        c.blockedIds = [...(c.blockedIds || []), u.id];
        delete c.recoveryBlocked;
        delete c.recoveryProgress;
        log(e, "recovery-carry-route-blocked", {
          transportId: t.id,
          memberId: u.id,
        });
        return;
      }
      u.x = c.x;
      u.y = c.y;
      if (c.roofId) u.roofId = c.roofId;
      else delete u.roofId;
      u.carriedBy = c.id;
      u.state = "carried";
      if (G.distance(c, t) < 10 && !c.roofId && !c.roofTransit) {
        u.carriedBy = null;
        delete u.roofId;
        delete u.roofTransit;
        u.boardedBy = t.id;
        t.manifest.push(u.id);
        c.patientId = null;
        c.targetId = null;
        c.state = "search";
        log(e, "medical-boarded", { transportId: t.id, memberId: u.id });
      }
      return;
    }
    if (c.targetId) {
      const u = blue(e, c.targetId);
      if (
        !u ||
        u.home ||
        u.boardedBy ||
        (u.carriedBy && u.carriedBy !== c.id)
      ) {
        c.dueAt = null;
        c.targetId = null;
        return;
      }
      if (G.distance(c, u) > 1.8 || (c.roofId || null) !== (u.roofId || null)) {
        crewMove(e, c, u, 1);
        if (c.recoveryBlocked) {
          c.blockedIds = [...(c.blockedIds || []), u.id];
          c.targetId = null;
          c.path = [];
          delete c.recoveryBlocked;
          delete c.recoveryProgress;
          log(e, "recovery-patient-route-blocked", {
            transportId: t.id,
            memberId: u.id,
          });
          return;
        }
        c.state = "approaching";
        return;
      }
      if (!c.dueAt) {
        c.dueAt =
          e.time + (u.health.alive ? (t.id === "primary" ? 45 : 25) : 8);
        c.state = u.health.alive ? "treating" : "recovering";
        c.heading = Math.atan2(u.y - c.y, u.x - c.x);
        log(
          e,
          u.health.alive ? "agency-aid-started" : "body-recovery-started",
          { actorId: c.id, targetId: u.id, dueAt: c.dueAt },
        );
      }
      if (e.time < c.dueAt) return;
      if (u.health.alive) for (const w of u.health.wounds) w.treated = true;
      c.dueAt = null;
      c.patientId = u.id;
      c.state = "carrying";
      u.carriedBy = c.id;
      u.path = [];
      const ev = log(
        e,
        u.health.alive ? "agency-aid-completed" : "body-recovery-completed",
        { actorId: c.id, targetId: u.id },
      );
      say(
        s,
        e,
        "medical",
        u.name +
          (u.health.alive
            ? " 현장 확인·처치 후 실제 의료 회수 중."
            : " 현장 사망 확인·유해 회수 중. 소생·치료 완료로 처리하지 않는다."),
        ev,
        {
          friends: e.squads
            .flatMap((q) => I().friendSnapshots(e, q))
            .filter((f) => f.id === u.id),
        },
      );
      return;
    }
    if (t.manifest.length >= t.capacity) {
      beginTravel(e, t, G.MAP.base, "home-unload");
      return;
    }
    const found = e.world.units
      .filter(
        (u) =>
          !m.home.includes(u.id) &&
          !u.boardedBy &&
          !u.carriedBy &&
          !(c.blockedIds || []).includes(u.id) &&
          G.distance(c, u) < 150 &&
          (G.clear(c, u) ||
            (u.roofId &&
              e.knowledge.friends[u.id]?.health?.wounds?.length &&
              e.time - e.knowledge.friends[u.id].observedAt < 180)) &&
          (u.health.wounds.length || !u.health.alive),
      )
      .sort(
        (a, b) =>
          b.health.wounds
            .filter((w) => !w.treated)
            .reduce((n, w) => n + w.severity, 0) -
            a.health.wounds
              .filter((w) => !w.treated)
              .reduce((n, w) => n + w.severity, 0) ||
          G.distance(c, a) - G.distance(c, b),
      )[0];
    if (found) {
      c.targetId = found.id;
      c.path = [];
      return;
    }
    if (
      t.id === "primary" &&
      m.memberIds.every((id) => m.home.includes(id) || blue(e, id).boardedBy)
    ) {
      beginTravel(e, t, G.MAP.base, "home-unload");
      return;
    }
    if (t.id === "primary") {
      // Search received last-known positions even when buildings hide casualties.
      // Retain the same crew and search progress while some passengers are already aboard.
      if (!c.searchPoints || c.recoverySearchVersion !== 2) {
        c.recoverySearchVersion = 2;
        const reported = m.memberIds
          .filter((id) => !m.home.includes(id) && !t.manifest.includes(id))
          .map((id) => e.knowledge.friends[id])
          .filter(Boolean);
        const positions = reported.map((r) => {
          const roof = r.roofId && G.roofs().find((b) => b.id === r.roofId);
          return roof
            ? { x: r.x, y: r.y, roofId: roof.id }
            : G.project({ x: r.x, y: r.y });
        });
        const around = [
          [35, 0],
          [0, 35],
          [-35, 0],
          [0, -35],
        ].map(([dx, dy]) => G.project({ x: t.x + dx, y: t.y + dy }));
        c.searchPoints = [...positions, ...around].filter(
          (p, i, all) =>
            !all
              .slice(0, i)
              .some(
                (old) =>
                  G.distance(old, p) < 2 &&
                  (old.roofId || null) === (p.roofId || null),
              ),
        );
        c.searchIndex = 0;
      }
      if (c.searchIndex < c.searchPoints.length) {
        const target = c.searchPoints[c.searchIndex];
        c.state = "searching";
        const arrived =
          G.distance(c, target) < 2 &&
          (c.roofId || null) === (target.roofId || null);
        if (arrived) {
          c.searchIndex++;
          c.path = [];
          delete c.recoveryProgress;
          return;
        }
        if (crewMove(e, c, target, 1)) {
          c.searchIndex++;
          c.path = [];
          delete c.recoveryProgress;
        } else if (c.recoveryBlocked) {
          log(e, "recovery-search-route-blocked", {
            transportId: t.id,
            point: copy(target),
          });
          c.searchIndex++;
          c.path = [];
          delete c.recoveryProgress;
          delete c.recoveryBlocked;
        }
        return;
      }
      const ev = log(e, "recovery-search-completed", {
        transportId: t.id,
        checked: c.searchIndex,
        passengers: t.manifest.length,
      });
      say(
        s,
        e,
        "transport",
        "마지막 보고 위치와 주변 접근로 수색을 마쳤다. 확인한 탑승자와 복귀하며 미확인 인원은 사망으로 단정하지 않는다.",
        ev,
      );
      beginTravel(e, t, G.MAP.base, "home-unload");
      return;
    }
    if (t.manifest.length) beginTravel(e, t, G.MAP.base, "home-unload");
    else {
      c.waitSince ??= e.time;
      if (e.time - c.waitSince > 30) {
        const ev = log(e, "medical-no-contact", { transportId: t.id });
        say(
          s,
          e,
          "medical",
          "마지막 보고 지점에서 회수 대상을 확인하지 못했다. 확인된 부상자 없이 치료·탑승 기록을 만들지 않는다.",
          ev,
        );
        beginTravel(e, t, G.MAP.base, "home-unload");
      }
    }
  }
  function updateAgencyControl(s, e) {
    const m = e.mission,
      g = m?.agencyControl;
    if (
      !g ||
      securityOnly(m) ||
      m.returnRequested ||
      e.time - (g.lastAssessment ?? -100) < 5
    )
      return;
    const reports = m.knowledge.actors || [],
      leaderId =
        m.taskLeaderId ||
        (m.contract.task === "rescue" ? "agency-rescuer" : "agency-guide");
    const anchor =
      reports.find((a) => a.id === leaderId && e.time - a.observedAt < 30) ||
      m.contract.insertion;
    const known = Object.values(e.knowledge.contacts).filter(
      (c) =>
        e.time - c.observedAt < 30 &&
        c.classification === "armed-person" &&
        !["dead", "down"].includes(c.medicalCondition),
    );
    if (
      ["escort", "vip"].includes(m.contract.task) &&
      e.time - (m.lastExitReviewAt ?? -1000) > 60
    ) {
      m.lastExitReviewAt = e.time;
      m.escortExits ||= [copy(m.taskGoal), ...escortExits(e)];
      const assess = (goal) => {
        const route = G.path(anchor, goal);
        return {
          goal,
          route,
          risk: known.filter((t) =>
            route.some((p) => G.distance(p, t) < 100 && G.clear(p, t)),
          ).length,
        };
      };
      const current = assess(m.taskGoal),
        best = m.escortExits
          .map(assess)
          .filter((x) => x.route.length)
          .sort((a, b) => a.risk - b.risk)[0];
      if (best && best.risk < current.risk) {
        const old = copy(m.taskGoal);
        m.taskGoal = copy(best.goal);
        const ev = log(e, "escort-exit-changed", {
          from: old,
          to: copy(best.goal),
          reportedThreatIds: known.map((c) => c.id),
        });
        say(
          s,
          e,
          "decision",
          "보고된 위협을 피해 대체 호송로로 이동한다. 보병조가 현장 경계·교전을 담당한다.",
          ev,
        );
      }
    }
    const objective =
      m.contract.task === "rescue" && !m.taskLinked
        ? searchPoint(e)
        : m.taskGoal;
    const route = G.path(anchor, objective);
    let waypoint = objective,
      last = anchor,
      length = 0;
    for (const p of route) {
      const distance = G.distance(last, p);
      if (length + distance >= 120) {
        const t = (120 - length) / Math.max(0.001, distance);
        waypoint = {
          x: last.x + (p.x - last.x) * t,
          y: last.y + (p.y - last.y) * t,
        };
        break;
      }
      length += distance;
      last = p;
    }
    const authorized =
      m.fieldStartedAt != null &&
      (route.length > 0 || G.distance(anchor, objective) < 3);
    const reason = authorized
      ? m.contract.task === "rescue" && !m.taskLinked
        ? "보병조 자체 구역 수색 · 식별 보고 수신 시 목표 지점 재확인"
        : "보병조 자체 관측·교전·호송 진출"
      : m.fieldStartedAt == null
        ? "보병조 현장 투입 대기"
        : "보병 이동 경로 재검토";
    if (g.authorized !== authorized || g.reason !== reason) {
      const ev = log(
        e,
        authorized ? "agency-advance-authorized" : "agency-advance-held",
        {
          waypoint: authorized ? copy(waypoint) : null,
          reason,
          independent: true,
        },
      );
      say(
        s,
        e,
        "decision",
        reason +
          ". 대형 유지. 식별 상황을 전파하고 위협 확인 시 엄폐 후 교전한다.",
        ev,
      );
      g.history ||= [];
      g.history.push({ at: e.time, eventId: ev.id, authorized, reason });
      g.history = g.history.slice(-100);
    }
    Object.assign(g, {
      authorized,
      reason,
      phase: authorized ? "advancing" : "holding",
      waypoint: authorized ? copy(waypoint) : null,
      lastAssessment: e.time,
      readyTeams: [],
      scanCommandId: null,
      everAuthorized: g.everAuthorized || authorized,
    });
  }
  function agencyCover(s, e, u, enemies) {
    if (
      !u.armed ||
      B().moveFactor(u) <= 0 ||
      u.agencyFireGoal ||
      e.time < (u.agencyCoverPauseUntil || 0)
    )
      return false;
    const incoming = B().underFire(e, u),
      shot = e.battle.shots.findLast(
        (x) =>
          x.side === "red" && e.time - x.time < 8 && G.distance(x.to, u) < 12,
      );
    if (
      incoming &&
      u.agencyCoverGoal &&
      G.distance(u, u.agencyCoverGoal) < 1 &&
      e.time - (u.agencyCoverStartedAt ?? -100) > 15
    ) {
      u.lastAgencyCover = { ...u.agencyCoverGoal };
      delete u.agencyCoverGoal;
    }
    if (incoming && !u.agencyCoverGoal) {
      // Unknown gunfire supplies a coarse incoming direction, never an enemy contact.
      const threat =
        enemies[0] ||
        (shot
          ? {
              x: Math.round(shot.from.x / 80) * 80,
              y: Math.round(shot.from.y / 80) * 80,
            }
          : null);
      if (threat) {
        const points = [];
        const cover = B().coverPoint(e, u, threat);
        if (cover) points.push(cover);
        for (const b of G.MAP.buildings)
          for (const x of [b[0] - 1.2, b[2] + 1.2])
            for (const y of [b[1] - 1.2, b[3] + 1.2]) points.push({ x, y });
        const direction = Math.atan2(u.y - threat.y, u.x - threat.x);
        for (const radius of [8, 14, 22])
          for (const angle of [0, Math.PI / 3, -Math.PI / 3])
            points.push({
              x: u.x + Math.cos(direction + angle) * radius,
              y: u.y + Math.sin(direction + angle) * radius,
            });
        const candidates = points
          .filter(
            (p) =>
              G.distance(u, p) < 40 &&
              G.distance(u, p) > 3 &&
              (!u.lastAgencyCover || G.distance(u.lastAgencyCover, p) > 4) &&
              !e.world.actors.some(
                (v) =>
                  v.id !== u.id &&
                  v.side === "ally" &&
                  v.agencyCoverGoal &&
                  G.distance(v.agencyCoverGoal, p) < 4,
              ) &&
              !G.blocked(p) &&
              G.path(u, p).length,
          )
          .map((p) => ({
            p,
            score:
              (!G.clear({ ...p, prone: true, stance: "prone" }, threat)
                ? 60 + B().performance(u).judgment * 0.7
                : 0) -
              G.distance(u, p) * (1.4 - B().performance(u).judgment * 0.008),
          }))
          .sort((a, b) => b.score - a.score);
        if (candidates.length) {
          u.agencyCoverGoal = copy(candidates[0].p);
          u.agencyCoverUntil = e.time + 60;
          u.agencyCoverStartedAt = e.time;
          delete u.coverBestDistance;
          u.coverProgressAt = e.time;
          log(e, "agency-cover-selected", {
            actorId: u.id,
            position: u.agencyCoverGoal,
            sourceEventId: shot?.id || null,
          });
        }
      }
    }
    if (!u.agencyCoverGoal) {
      if (incoming) {
        u.prone = true;
        u.stance = "prone";
      }
      return false;
    }
    if (G.distance(u, u.agencyCoverGoal) > 1) {
      const slot = Number(u.id.split("-").at(-1)) || 0,
        buddyMoving = e.world.actors.some(
          (a) =>
            a.id !== u.id &&
            a.side === "ally" &&
            a.armed &&
            a.health.alive &&
            a.health.conscious &&
            a.agencyCoverGoal &&
            a.path?.length &&
            G.distance(a, u) < 60,
        );
      if (
        slot % 2 === 1 &&
        buddyMoving &&
        e.time - u.agencyCoverStartedAt < 4 &&
        enemies.length
      ) {
        u.path = [];
        u.stance = "kneeling";
        u.prone = false;
        u.state = "covering";
        const target = enemies[0];
        u.heading = Math.atan2(target.y - u.y, target.x - u.x);
        B().fire(s, e, u, {
          id: target.id,
          x: target.x,
          y: target.y,
          lastSeen: e.time,
          condition: B().snapshot(target).pose,
        });
        return true;
      }
      const remaining = G.distance(u, u.agencyCoverGoal);
      if (
        u.coverBestDistance === undefined ||
        remaining < u.coverBestDistance - 1
      ) {
        u.coverBestDistance = remaining;
        u.coverProgressAt = e.time;
      }
      if (e.time - (u.coverProgressAt ?? e.time) > 10) {
        u.lastAgencyCover = { ...u.agencyCoverGoal };
        delete u.agencyCoverGoal;
        u.path = [];
        delete u.coverBestDistance;
        return false;
      }
      moveGround(u, u.agencyCoverGoal, 0.9 * B().moveFactor(u), e);
      u.prone = false;
      u.stance = "standing";
      u.state = "cover-move";
      return true;
    }
    u.path = [];
    u.prone = true;
    u.stance = "prone";
    u.state = "covering";
    if (incoming) u.agencyCoverUntil = e.time + 12;
    if (enemies.length && !u.health.wounds.some((w) => !w.treated)) {
      const target = enemies.find((a) => G.clear(u, a));
      if (target) {
        u.heading = Math.atan2(target.y - u.y, target.x - u.x);
        B().fire(s, e, u, {
          id: target.id,
          x: target.x,
          y: target.y,
          lastSeen: e.time,
          condition: B().snapshot(target).pose,
        });
        if (["friendly-in-lane", "line-of-sight"].includes(u.fireBlockReason)) {
          delete u.agencyCoverGoal;
          clearAgencyFireLane(e, u, target);
        }
      }
    }
    if (
      e.mission.agencyDirective?.mode === "withdraw" &&
      e.time - (u.agencyCoverStartedAt ?? e.time) >= 4
    ) {
      delete u.agencyCoverGoal;
      u.agencyCoverPauseUntil = e.time + 6;
      return false;
    }
    if (e.time >= u.agencyCoverUntil) {
      delete u.agencyCoverGoal;
      u.path = [];
      return false;
    }
    return !u.health.wounds.some((w) => !w.treated);
  }
  function clearAgencyFireLane(e, u, target) {
    if (u.agencyFireGoal || e.time - (u.lastAgencyFireMoveAt ?? -100) < 10)
      return;
    const axis = Math.atan2(target.y - u.y, target.x - u.x),
      points = [];
    for (const radius of [6, 10, 16])
      for (const offset of [
        Math.PI / 2,
        -Math.PI / 2,
        Math.PI * 0.75,
        -Math.PI * 0.75,
      ]) {
        const p = {
          x: u.x + Math.cos(axis + offset) * radius,
          y: u.y + Math.sin(axis + offset) * radius,
        };
        if (
          G.blocked(p) ||
          !G.clear(u, p) ||
          !G.clear({ ...p, stance: "standing" }, target) ||
          !G.path(u, p).length
        )
          continue;
        if (
          e.world.actors.some(
            (a) =>
              a.id !== u.id &&
              a.side === "ally" &&
              a.health.alive &&
              (G.distance(a, p) < 3 ||
                (a.agencyFireGoal && G.distance(a.agencyFireGoal, p) < 3)),
          )
        )
          continue;
        if (
          B().friendlyInLane(
            e,
            { ...u, ...p, stance: "standing", prone: false },
            target,
          )
        )
          continue;
        points.push({ p, score: radius });
      }
    const choice = points.sort((a, b) => a.score - b.score)[0];
    if (!choice) return;
    u.agencyFireGoal = choice.p;
    u.agencyFireUntil = e.time + 25;
    u.lastAgencyFireMoveAt = e.time;
    log(e, "agency-fire-lane-reposition", {
      actorId: u.id,
      targetId: target.id,
      point: copy(choice.p),
    });
  }
  function commandAgency(s, mode, { source = "headquarters" } = {}) {
    const e = s.commandExercise,
      m = e?.mission;
    ok(
      m && e.status === "running" && !m.returnRequested,
      "진행 중인 기관 지원 작전이 필요합니다.",
    );
    ok(
      ["auto", "hold", "advance", "withdraw"].includes(mode),
      "기관 보병 명령이 잘못되었습니다.",
    );
    ok(
      ["headquarters", "controller", "agency"].includes(source),
      "기관 보병 지휘 출처가 잘못되었습니다.",
    );
    const anchors = Object.fromEntries(
      (m.knowledge.actors || [])
        .filter((a) => a.armed)
        .map((a) => [a.id, { x: a.x, y: a.y }]),
    );
    const ev = log(e, "hq-agency-order", { mode });
    I().radio(
      s,
      e,
      e.squads[0],
      "agency",
      source === "agency" ? "AGENCY" : "HQ",
      "AGENCY",
      "tasking",
      {
        auto: "기관 보병, 현장 판단에 따라 구역 수색·엄호를 재개하라.",
        hold: "기관 보병, 현 구역 분산 엄폐·사주 경계. 위협 식별 시 대응 사격하라.",
        advance: "기관 보병, 확인 중인 구역으로 분대 엄호 아래 진출하라.",
        withdraw: "기관 보병, 상호 엄호하며 회수 지점으로 철수하라.",
      }[mode],
      ev,
      { agencyDirective: { mode, anchors, source } },
    );
  }
  function agencyManualMove(e, u) {
    const d = e.mission.agencyDirective;
    if (
      u.hqMemberId ||
      u.agencySniperRole ||
      (e.mission.agencyAutonomous && d?.source !== "agency") ||
      !u.armed ||
      !d ||
      d.mode === "auto" ||
      e.mission.returnRequested
    )
      return false;
    const m = e.mission,
      slot = Number(u.id.split("-").at(-1)) || 0;
    if (u.agencyDirectiveId !== d.messageId) {
      u.agencyDirectiveId = d.messageId;
      u.agencyHoldAnchor = copy(d.anchors[u.id] || { x: u.x, y: u.y });
    }
    let goal =
      d.mode === "withdraw"
        ? m.extractionPoint || m.contract.insertion
        : d.mode === "hold"
          ? u.agencyHoldAnchor
          : m.groundSearch
            ? searchPoint(e)
            : m.contract.task === "recon"
              ? m.reconPlan?.areas.find((a) => a.checkedAt == null)?.point ||
                m.contract.insertion
              : m.agencyControl?.waypoint || m.taskGoal;
    goal = G.project({
      x: goal.x + Math.cos((slot * Math.PI) / 2) * 3,
      y: goal.y + Math.sin((slot * Math.PI) / 2) * 3,
    });
    moveGround(u, goal, 0.85 * B().moveFactor(u), e);
    u.state =
      d.mode === "withdraw"
        ? "withdrawing"
        : u.path.length
          ? "securing"
          : "all-round-guard";
    if (!u.path.length) {
      u.heading = (slot * Math.PI) / 2;
      u.stance = "kneeling";
      u.prone = false;
    }
    return true;
  }
  function actorTaskTick(s, e, u) {
    if (u.protectedBoarded || u.home) return;
    if (u.waitingForDeployment) {
      if (e.mission.fieldStartedAt == null) return;
      u.waitingForDeployment = false;
      u.state = "holding";
    }
    const m = e.mission;
    if (u.home || u.hqBoarded) return;
    if (
      !["field", "extracting", "withdrawing", "returning"].includes(m.phase) ||
      !u.health.alive ||
      !u.health.conscious ||
      u.health.aid
    )
      return;
    if (u.hqMemberId && u.roofId && B().moveFactor(u) > 0) {
      const roof = G.roofs().find((r) => r.id === u.roofId);
      if (roof) {
        moveGround(u, roof.access, 0.9, e);
        u.state = "descending-to-ground";
        return;
      }
    }
    const sightRange = u.agencySniperRole ? 1100 : u.hqMemberId ? 350 : 200;
    u.visionRange = sightRange * Ordnance().factor(u);
    u.identificationRange = u.visionRange * 0.65;
    u.visionHalfAngle = Math.PI * 0.42 * Ordnance().factor(u);
    const enemies = e.world.actors.filter(
      (a) =>
        a.side === "red" &&
        a.armed &&
        a.health.alive &&
        a.health.conscious &&
        G.distance(u, a) < sightRange &&
        G.visible(u, a, e) &&
        B().visualAcquire(e, u, a, sightRange),
    );
    if (
      B().underFire(e, u) &&
      e.time -
        (u.hqMemberId
          ? (m.supportAlertTimes?.[u.hqTeam || "ALPHA"] ?? -100)
          : (m.lastSupportAlertAt ?? -100)) >=
        20
    ) {
      const incoming = e.battle.shots.findLast(
          (shot) =>
            shot.side === "red" &&
            e.time - shot.time < 8 &&
            G.distance(shot.to, u) < 12,
        ),
        direction = incoming ? B().soundBearing(incoming, u) : {},
        seen = enemies[0],
        ev = log(e, "agency-under-fire", {
          actorId: u.id,
          attackerId: seen?.id || null,
        });
      if (u.hqMemberId) {
        m.supportAlertTimes ||= {};
        m.supportAlertTimes[u.hqTeam || "ALPHA"] = e.time;
      } else m.lastSupportAlertAt = e.time;
      say(
        s,
        e,
        "combat",
        u.hqMemberId
          ? "본부 보병 피격. 저격팀 긴급 엄호 요청."
          : "기관 인력이 피격 중이다. 저격조 긴급 엄호 요청.",
        ev,
        {
          supportAlert: {
            eventId: ev.id,
            actorId: u.id,
            position: { x: u.x, y: u.y },
            observedAt: e.time,
            ...direction,
            contact: seen
              ? {
                  id: seen.id,
                  x: seen.x,
                  y: seen.y,
                  lastSeen: e.time,
                  classification: "armed-person",
                  confidence: 0.9,
                  condition: B().snapshot(seen).pose,
                  reportedAt: e.time,
                }
              : null,
          },
        },
        u,
      );
    }
    if (u.hqMemberId)
      for (const a of enemies) {
        u.memory ||= [];
        let known = u.memory.find((v) => v.id === a.id);
        if (!known) {
          known = { id: a.id, firstSeen: e.time };
          u.memory.push(known);
        }
        Object.assign(known, {
          x: a.x,
          y: a.y,
          lastSeen: e.time,
          confidence: 0.9,
          condition: B().snapshot(a).pose,
        });
      }
    u.agencyVisibleHostiles = enemies.map((a) => a.id);
    agencyObservations(s, e, u, enemies);
    if (Ordnance().ai(s, e, u, enemies)) return;
    if (agencyCover(s, e, u, enemies)) return;
    if (u.health.wounds.some((w) => !w.treated)) {
      if (!B().underFire(e, u)) {
        const medic =
          u.armed && u.health.kit > 0
            ? u
            : e.world.actors.find(
                (a) =>
                  a.side === "ally" &&
                  a.armed &&
                  a.health.alive &&
                  a.health.conscious &&
                  !a.health.aid &&
                  a.health.kit > 0 &&
                  G.distance(a, u) < 4 &&
                  (a.roofId || null) === (u.roofId || null),
              );
        if (medic) B().bandage(s, e, medic, u);
      }
      if (u.health.aid || B().moveFactor(u) <= 0 || !B().underFire(e, u))
        return;
    }
    if (respondToCasualty(s, e, u, enemies)) return;
    if (u.agencyFireGoal) {
      moveGround(u, u.agencyFireGoal, 0.9 * B().moveFactor(u), e);
      u.state = "fire-lane-move";
      u.stance = "standing";
      u.prone = false;
      if (G.distance(u, u.agencyFireGoal) < 1 || e.time >= u.agencyFireUntil) {
        delete u.agencyFireGoal;
        u.path = [];
        u.goal = null;
      }
      return;
    }
    if (
      u.hqMemberId &&
      (m.returnRequested ||
        ["withdraw", "hold"].includes(
          (
            m.hqInfantry?.teamDirectives?.[u.hqTeam || "ALPHA"] ||
            m.hqInfantry?.directive
          )?.mode,
        ))
    ) {
      if (
        !enemies.length ||
        Math.floor(e.time / 6) % 2 ===
          ["leader", "rifleman", "gunner", "medic"].indexOf(u.assignmentRole) %
            2
      ) {
        Infantry().actor(s, e, u, enemies);
        return;
      }
    }
    const doctrine = u.hqMemberId ? null : m.agencyDirective?.mode;
    if (
      ["advance", "withdraw"].includes(doctrine) &&
      u.armed &&
      (!enemies.length ||
        Math.floor(e.time / 6) % 2 ===
          (Number(u.id.split("-").at(-1)) || 0) % 2)
    ) {
      if (agencyManualMove(e, u)) return;
    }
    if (
      u.armed &&
      enemies.length &&
      (u.weapon.loaded > 0 ||
        u.weapon.magazines.length ||
        u.weapon.reloadUntil !== null ||
        (enemies.some((v) => G.distance(u, v) < 65) &&
          (u.sidearm.loaded > 0 || u.sidearm.magazines.length)))
    ) {
      const v = enemies.sort((a, b) => G.distance(u, a) - G.distance(u, b))[0];
      u.memory = u.memory || [];
      let seen = u.memory.find((vv) => vv.id === v.id);
      if (!seen) {
        seen = { id: v.id, firstSeen: e.time };
        u.memory.push(seen);
      }
      Object.assign(seen, {
        x: v.x,
        y: v.y,
        lastSeen: e.time,
        condition: B().snapshot(v).pose,
      });
      B().chooseStance(e, u, seen);
      u.state = "covering";
      u.heading = Math.atan2(seen.y - u.y, seen.x - u.x);
      B().fire(s, e, u, seen);
      if (["friendly-in-lane", "line-of-sight"].includes(u.fireBlockReason))
        clearAgencyFireLane(e, u, seen);
      return;
    }
    if (u.agencySniperRole) {
      (
        root.OverwatchAgency ||
        (typeof require === "function" ? require("./agency.js") : null)
      ).actor(s, e, u, enemies);
      return;
    }
    if (u.hqMemberId) {
      const last = (u.memory || []).find(
        (v) =>
          e.time - v.lastSeen < 8 &&
          v.confidence >= 0.8 &&
          !["dead", "down"].includes(u.agencyReports?.[v.id]?.condition),
      );
      if (
        u.assignmentRole === "gunner" &&
        last &&
        G.clear(u, last) &&
        !m.returnRequested
      ) {
        u.path = [];
        u.motionActive = false;
        u.state = "suppressing";
        u.prone = false;
        u.stance = "kneeling";
        B().fire(s, e, u, last, { suppress: true });
        return;
      }
      Infantry().actor(s, e, u, enemies);
      return;
    }
    if (agencyManualMove(e, u)) return;
    if (
      !securityOnly(m) &&
      m.agencyControl &&
      (!m.agencyControl.authorized ||
        e.time - m.agencyControl.lastAssessment > 25 ||
        m.returnRequested)
    ) {
      u.path = [];
      u.state = "staging";
      if (u.armed) {
        u.prone = false;
        u.stance = "kneeling";
      }
      return;
    }
    if (u.taskDuty === "security" && securityOnly(m)) {
      const g = m.securityControl;
      if (!g?.authorized || e.time - g.lastAssessment > 15) {
        u.path = [];
        u.state = "staging";
        u.prone = false;
        u.stance = "kneeling";
        return;
      }
      const goal = g.goals[u.id];
      if (goal) moveGround(u, goal, 0.8 * B().moveFactor(u), e);
      u.state = g.returning
        ? "withdrawing"
        : u.path.length
          ? "securing"
          : "all-round-guard";
      if (!u.path.length && !g.returning) {
        const slot = Number(u.id.split("-").at(-1)) || 0;
        u.heading = (g.heading || 0) + (slot * Math.PI) / 2;
        u.prone = false;
        u.stance = "kneeling";
      }
      return;
    }
    const protectedUnit = e.world.actors.find(
        (a) => a.id === "agency-protected",
      ),
      guide = e.world.actors.find(
        (a) =>
          a.id ===
          (m.taskLeaderId ||
            (m.contract.task === "rescue" ? "agency-rescuer" : "agency-guide")),
      );
    if (u.id === "agency-protected") {
      if (u.carriedBy || (m.contract.task === "rescue" && !m.taskLinked))
        return;
      if (!guide?.health.alive || !guide.health.conscious) {
        u.path = [];
        u.state = "protected-hold";
        u.prone = false;
        u.stance = "kneeling";
        return;
      }
      const threat = enemies[0];
      if (
        threat ||
        B().underFire(e, guide) ||
        B().underFire(e, u) ||
        guide.state === "covering" ||
        guide.health.aid
      ) {
        u.path = [];
        u.state = "protected-hold";
        u.prone = false;
        u.stance = "kneeling";
        if (threat) {
          const cover = B().coverPoint(e, u, threat);
          if (cover && G.distance(cover, guide) < 18)
            moveGround(u, cover, 0.7 * B().moveFactor(u), e);
        }
        return;
      }
      const goal = m.agencyControl?.waypoint || m.taskGoal,
        distance = Math.max(1, G.distance(guide, goal));
      const behind = G.project({
        x: guide.x - ((goal.x - guide.x) / distance) * 7,
        y: guide.y - ((goal.y - guide.y) / distance) * 7,
      });
      if (G.distance(u, behind) > 3)
        moveGround(u, behind, 0.7 * B().moveFactor(u), e);
      else {
        u.path = [];
        u.state = "protected-hold";
        u.stance = "standing";
        u.prone = false;
      }
      return;
    }
    if (u.taskDuty === "security") {
      const anchor = guide?.health.alive ? guide : protectedUnit;
      if (anchor) {
        const i = Number(u.id.split("-").at(-1)) || 0;
        moveGround(
          u,
          G.project({
            x:
              anchor.x +
              Math.cos(
                (anchor.heading || 0) +
                  [Math.PI / 2, -Math.PI / 2, Math.PI, 0][i % 4],
              ) *
                12,
            y:
              anchor.y +
              Math.sin(
                (anchor.heading || 0) +
                  [Math.PI / 2, -Math.PI / 2, Math.PI, 0][i % 4],
              ) *
                12,
          }),
          0.75,
          e,
        );
      }
      u.state = u.path.length ? "securing" : "all-round-guard";
      if (!u.path.length) {
        const slot = Number(u.id.split("-").at(-1)) || 0;
        u.heading = (anchor?.heading || 0) + (slot * Math.PI) / 2;
        u.stance = "kneeling";
        u.prone = false;
      }
      return;
    }
    if (m.contract.task === "rescue") {
      if (u.id === (m.taskLeaderId || "agency-rescuer")) {
        if (!m.taskLinked) {
          const search = groundSearch(e);
          const recognized =
            search?.localRecognized[protectedUnit.id] &&
            e.time - search.localRecognized[protectedUnit.id] < 12;
          if (
            recognized &&
            G.distance(u, protectedUnit) < 10 &&
            G.clear(u, protectedUnit)
          ) {
            m.taskLinked = true;
            const ev = log(e, "protected-linked", {
              actorId: u.id,
              targetId: protectedUnit.id,
            });
            say(
              s,
              e,
              "objective",
              "기관 구출조가 억류 의료인과 실제 합류했다. 집결지까지 이동·엄호가 필요하다.",
              ev,
            );
          } else
            moveGround(u, m.agencyControl?.waypoint || searchPoint(e), 0.9, e);
        } else if (protectedUnit.health.alive) {
          if (
            protectedUnit.health.wounds.some((w) => !w.treated) &&
            G.distance(u, protectedUnit) < 12
          ) {
            B().bandage(s, e, u, protectedUnit);
            return;
          }
          if (u.carrying === protectedUnit.id) {
            moveGround(u, m.agencyControl?.waypoint || m.taskGoal, 0.6, e);
            protectedUnit.x = u.x;
            protectedUnit.y = u.y + 0.5;
          } else if (G.distance(u, protectedUnit) < 18)
            moveGround(u, m.agencyControl?.waypoint || m.taskGoal, 0.7, e);
          else moveGround(u, protectedUnit, 0.85, e);
        }
        u.state = "escorting";
      } else if (m.taskLinked && !u.carriedBy)
        moveGround(u, m.agencyControl?.waypoint || m.taskGoal, 0.65, e);
    } else {
      if (u.id === (m.taskLeaderId || "agency-guide")) {
        if (protectedUnit.health.alive)
          moveGround(
            u,
            G.distance(u, protectedUnit) > 18
              ? protectedUnit
              : m.agencyControl?.waypoint || m.taskGoal,
            0.85,
            e,
          );
      } else if (guide?.health.alive)
        moveGround(u, m.agencyControl?.waypoint || m.taskGoal, 0.75, e);
      u.state = "escorting";
    }
  }
  function protectedRecovery(s, e) {
    const m = e.mission,
      u = e.world.actors.find((a) => a.id === "agency-protected");
    if (
      !u ||
      !u.health.alive ||
      !["rescue", "escort", "vip"].includes(m.contract.task)
    )
      return;
    let t = m.protectedTransport;
    if (!t) {
      if (
        G.distance(u, m.taskGoal) > 20 ||
        (m.contract.task === "rescue" && !m.taskLinked)
      )
        return;
      if (
        !e.world.actors.some(
          (a) =>
            a.armed &&
            a.side === "ally" &&
            a.health.alive &&
            a.health.conscious &&
            G.distance(a, u) < 30,
        )
      )
        return;
      t = m.protectedTransport = {
        id: "protected-transport",
        kind: "vehicle",
        name: "기관 구출·호송 차량",
        x: G.MAP.base.x,
        y: G.MAP.base.y,
        state: "pickup",
        path: G.path(G.MAP.base, G.project(m.taskGoal)),
        manifest: [],
        capacity: 6,
        startedAt: e.time,
      };
      say(
        s,
        e,
        "transport",
        "구출·호송 대상이 회수 지점에 도착했다. 제공 수송 차량이 실제 합류·탑승 후 본부까지 이송한다.",
        log(e, "protected-recovery-dispatched"),
      );
    }
    const travel = (goal) => {
      if (!t.path.length) t.path = G.path(t, goal);
      const p = t.path[0];
      if (!p) return G.distance(t, goal) < 4;
      const d = G.distance(t, p),
        n = Math.min(6, d);
      if (d) {
        t.x += ((p.x - t.x) * n) / d;
        t.y += ((p.y - t.y) * n) / d;
      }
      if (d <= 6) t.path.shift();
      return G.distance(t, goal) < 4;
    };
    if (t.state === "pickup" && travel(G.project(m.taskGoal))) {
      t.state = "boarding";
      t.boardAt = e.time + 6;
    }
    if (
      t.state === "boarding" &&
      e.time >= t.boardAt &&
      G.distance(u, t) < 22
    ) {
      const near = e.world.actors
        .filter(
          (a) =>
            a.side === "ally" &&
            !a.hqMemberId &&
            a.health.alive &&
            !a.home &&
            G.distance(a, t) < 22 &&
            (a.id === "agency-protected" || a.armed),
        )
        .slice(0, 6);
      if (!near.includes(u)) near.unshift(u);
      t.manifest = near.slice(0, 6).map((a) => a.id);
      for (const a of near.slice(0, 6)) {
        a.boardedBy = t.id;
        a.protectedBoarded = true;
        a.path = [];
      }
      t.state = "returning";
      t.path = [];
      say(
        s,
        e,
        "transport",
        "구출·호송 대상과 동행 인원 " +
          t.manifest.length +
          "명 실제 탑승 확인. 본부로 이송한다.",
        log(e, "protected-boarded", { memberIds: t.manifest.slice() }),
      );
    }
    if (t.state === "returning" && travel(G.MAP.base)) {
      t.state = "home";
      for (const id of t.manifest) {
        const a = e.world.actors.find((a) => a.id === id);
        a.home = true;
        a.state = "returned";
        a.boardedBy = null;
      }
      m.protectedHome = true;
      say(
        s,
        e,
        "objective",
        "구출·호송 대상 본부 도착 확인. 대상 실제 귀환을 기록한다.",
        log(e, "protected-home"),
      );
    }
    for (const id of t.manifest) {
      const a = e.world.actors.find((a) => a.id === id);
      a.x = t.x;
      a.y = t.y;
    }
  }
  function harvest(e) {
    const m = e.mission;
    for (const ev of e.events) {
      const nr = Number(ev.id.split("-").at(-1));
      if (nr <= m.lastSequence) continue;
      if (
        [
          "shot-fired",
          "ballistic-injury",
          "aid-completed",
          "casualty-carried",
        ].includes(ev.type) &&
        (m.memberIds.includes(ev.actorId) ||
          e.world.actors.some((a) => a.id === ev.actorId && a.side === "ally"))
      )
        m.log.push(copy(ev));
      const st = m.stats[ev.actorId || ev.leaderId];
      if (ev.type === "shot-fired" && m.stats[ev.actorId]) {
        const x = m.stats[ev.actorId];
        x.shots++;
        x.shotsByModel[ev.model] = (x.shotsByModel[ev.model] || 0) + 1;
      }
      if (ev.type === "contact-observed") {
        const q = e.squads.find((q) => q.callsign === ev.callsign);
        if (q && m.stats[q.leaderId]) m.stats[q.leaderId].observations++;
      }
      if (ev.type === "order-received" && st) st.commands++;
      if (ev.type === "aid-completed" && st) st.aid++;
      if (ev.type === "casualty-carried" && st) st.carried++;
    }
    m.lastSequence = e.sequence;
  }
  function tick(s, e) {
    const m = e.mission;
    harvest(e);
    updateRecon(s, e);
    updateGroundSearch(s, e);
    updateSecurityControl(s, e);
    updateAgencyControl(s, e);
    (
      root.OverwatchAgency ||
      (typeof require === "function" ? require("./agency.js") : null)
    ).tick(s, e);
    Infantry().controller(s, e);
    const infantryRecovered = Infantry().recovery(s, e);
    updateCasualtySupport(s, e);
    if (m.contract.task !== "recon" && !targeted(m) && !m.returnRequested) {
      m.taskLeaderId ||=
        m.contract.task === "rescue" ? "agency-rescuer" : "agency-guide";
      const old = e.world.actors.find((a) => a.id === m.taskLeaderId);
      if (
        old &&
        (!old.health.alive ||
          !old.health.conscious ||
          (!old.health.aid &&
            B().moveFactor(old) === 0 &&
            old.health.wounds.some((w) => !w.treated)))
      ) {
        const successor = e.world.actors
          .filter(
            (a) =>
              a.side === "ally" &&
              a.armed &&
              !a.agencySniperRole &&
              !a.waitingForDeployment &&
              a.health.alive &&
              a.health.conscious &&
              B().moveFactor(a) > 0,
          )
          .sort((a, b) => G.distance(a, old) - G.distance(b, old))[0];
        if (successor) {
          m.taskLeaderId = successor.id;
          successor.taskDuty = "leader";
          successor.path = [];
          const ev = log(e, "agency-leader-replaced", {
            actorId: successor.id,
            previousId: old.id,
          });
          say(
            s,
            e,
            "decision",
            "기관 현장 조장 행동 불능. 인접 보병이 구출·호송 지휘를 인계하고 저격조 관측 보고에 따라 임무를 계속한다.",
            ev,
          );
        } else if (!m.agencyLeaderUnavailable) {
          m.agencyLeaderUnavailable = true;
          const ev = log(e, "agency-team-incapacitated", { actorId: old.id });
          say(
            s,
            e,
            "objective",
            "기관 구출·호송 보병 전원 행동 불능. 본부에 보고하며, 기관 손실만으로 본부 부대 철수를 결정하지 않는다.",
            ev,
          );
        }
      }
    }
    e.battle.noises = e.battle.noises.filter((n) => e.time - n.time < 20);
    if (
      m.recoveryExhausted &&
      m.abortRequested &&
      m.memberIds.some((id) => !m.home.includes(id))
    ) {
      declareMissing(s);
      return;
    }
    const groundReports = (m.knowledge.actors || []).filter((a) =>
      a.id.startsWith("agency-infantry-"),
    );
    if (
      m.fieldStartedAt != null &&
      groundReports.length === 4 &&
      groundReports.every(
        (a) =>
          e.time - a.observedAt < 30 &&
          (!a.health.alive || !a.health.conscious),
      )
    )
      m.agencySearchUnavailable = true;
    const protectedUnit = e.world.actors.find(
      (a) => a.id === "agency-protected",
    );
    protectedRecovery(s, e);
    const targetResult = targeted(m) ? targetOutcome(s, e) : null;
    const complete = targetResult
      ? targetResult.complete
      : m.contract.task === "recon"
        ? !!reconPlan(e)?.areas.every((a) => a.checkedAt != null)
        : !!protectedUnit?.health.alive && !!m.protectedHome;
    const failed = targetResult
      ? targetResult.failed
      : protectedUnit &&
        !protectedUnit.health.alive &&
        (m.contract.task !== "rescue" ||
          m.taskLinked ||
          m.knowledge.objectiveContacts?.[protectedUnit.id]
            ?.medicalCondition === "dead");
    if ((complete && !m.objective) || (failed && !m.objectiveFailed)) {
      m.objective = !!complete;
      m.objectiveFailed = !!failed;
      e.battle.objective.done = !!complete && !failed;
      const ev = log(e, failed ? "protected-lost" : "mission-objective", {
        task: m.contract.task,
      });
      say(
        s,
        e,
        "objective",
        failed
          ? targeted(m)
            ? "지정 표적 탈출 확인. 계약 목표 달성 불가, 철수한다."
            : "보호 대상 생체 신호 소실. 계약 목표 달성 불가, 철수 판단 바란다."
          : "현장 목표 실제 달성. 철수·수송·본부 도착은 별도로 진행해야 한다.",
        ev,
        { missionObjective: failed ? "failed" : "complete" },
      );
    }
    if (e.time - m.lastTrack >= 2) {
      m.lastTrack = e.time;
      m.knowledge.phase = m.phase;
      const primary = m.transports[0];
      m.knowledge.waitReason =
        primary.state === "route-blocked"
          ? "수송 이동 경로를 확보하지 못했습니다. 회수 지점을 다시 지정하세요."
          : ["air-hold", "ground-hold", "pickup-hold", "insert-hold"].includes(
                primary.state,
              )
            ? "수송 승무원이 접근 구역 위협을 확인해 안전 확보를 기다립니다."
            : primary.crew?.state === "searching"
              ? "회수요원이 마지막 보고 위치·주변 접근로를 수색 중입니다. " +
                (primary.crew.searchIndex + 1) +
                "/" +
                primary.crew.searchPoints.length +
                "구역"
              : primary.crew?.targetId
                ? "수송 회수요원이 실제 부상자에게 접근·회수 중입니다."
                : primary.state === "loading"
                  ? "차량 도착 · 실제 인원 확인과 탑승을 기다립니다."
                  : null;
      m.knowledge.transports = m.transports
        .filter((t) => t.type !== "foot")
        .map((t) => ({
          id: t.id,
          type: t.type,
          x: t.x,
          y: t.y,
          altitude: t.altitude,
          heading: t.heading,
          state: t.state,
          trip: t.trip,
          manifest: t.manifest.slice(),
          rotorActive:
            t.type === "helicopter" && !["home", "dispatch"].includes(t.state),
          reportedAt: e.time,
          remainingDistance: t.path.reduce(
            (v, p, i) => v + G.distance(i ? t.path[i - 1] : t, p),
            0,
          ),
          observedAt: e.time,
        }));
      m.knowledge.crew = m.transports
        .filter((t) => t.crew && ["medical-work", "loading"].includes(t.state))
        .map((t) => ({
          id: t.crew.id,
          name: t.crew.name,
          role: "medic",
          x: t.crew.x,
          y: t.crew.y,
          pose: t.crew.state === "treating" ? "aid" : "standing",
          state: t.crew.state,
          roofId: t.crew.roofId || null,
          elevation: G.elevation(t.crew),
          heading: t.crew.heading || 0,
          targetId: t.crew.targetId,
          patientId: t.crew.patientId,
          reportedAt: e.time,
          observedAt: e.time,
        }));
      m.knowledge.actors = e.world.actors
        .filter(
          (a) =>
            a.side === "ally" &&
            !a.waitingForDeployment &&
            (a.id !== "agency-protected" ||
              m.contract.task !== "rescue" ||
              m.taskLinked),
        )
        .map((a) => ({
          id: a.id,
          name: a.name,
          role: a.health.aid
            ? "medic"
            : a.agencySniperRole || (a.armed ? "infantry" : "civilian"),
          roleLabel:
            a.hqMemberId || a.agencySniperRole
              ? a.roleLabel
              : a.armed
                ? a.id === "agency-rescuer"
                  ? "기관 구출 보병"
                  : a.id === "agency-guide"
                    ? "기관 경호 보병"
                    : "기관 보병"
                : a.name,
          faction: a.armed ? "allied" : "civilian",
          armed: a.armed,
          x: a.x,
          y: a.y,
          heading: a.heading,
          ...B().snapshot(a, e.time),
          state: a.health.aid ? "treating" : a.state,
          reportedAt: e.time,
          observedAt: e.time,
        }));
    }
    if (
      m.returnRequested &&
      (!m.hqInfantry || infantryRecovered) &&
      (m.contract.transport === "foot" ||
        m.memberIds.every((id) => m.home.includes(id)) ||
        (m.lastRecoveryCompletedAt != null &&
          m.transports[0].state === "home")) &&
      m.memberIds.every(
        (id) =>
          m.home.includes(id) ||
          (!blue(e, id).health.alive &&
            e.knowledge.friends[id]?.health?.alive === false),
      )
    ) {
      const living = e.world.units.filter((u) => u.health.alive);
      m.finalizing = true;
      if (living.length && living.every((u) => m.home.includes(u.id)))
        e.battle.phase = "returned";
      D().end(
        s,
        living.length || e.world.actors.some((u) => u.hqMemberId && u.home)
          ? "returned"
          : "casualties",
      );
    }
  }
  function applyPayload(e, r) {
    Infantry().apply(e, r);
    if (r.route === "agency" && r.payload?.agencyDirective) {
      e.mission.agencyDirective = {
        ...copy(r.payload.agencyDirective),
        messageId: r.id,
        receivedAt: e.time,
      };
      log(e, "agency-order-received", {
        mode: r.payload.agencyDirective.mode,
        messageId: r.id,
      });
    }
    if (r.route === "agency" && r.payload?.agencyLead) {
      const g = groundSearch(e);
      if (g) {
        g.leadQueue ||= [];
        g.securedIds ||= [];
        const incoming = {
          ...copy(r.payload.agencyLead),
          messageId: r.id,
          receivedAt: e.time,
          dwell: 0,
        };
        if (!g.securedIds.includes(incoming.id)) {
          if (!g.lead || g.lead.id === incoming.id) {
            if (
              g.lead &&
              G.distance(g.lead.point, incoming.point) < 5 &&
              g.lead.condition === incoming.condition
            )
              incoming.dwell = g.lead.dwell || 0;
            g.lead = incoming;
          } else {
            g.leadQueue = g.leadQueue.filter((x) => x.id !== incoming.id);
            g.leadQueue.push(incoming);
          }
        }
        g.phase = "investigating";
        g.ackPending = true;
        log(e, "agency-lead-received", {
          messageId: r.id,
          sourceMessageId: incoming.sourceMessageId,
          targetId: incoming.id,
          point: copy(incoming.point),
        });
      }
    }
    if (
      r.route === "up" &&
      r.payload?.contact?.objectiveCode &&
      r.payload.contact.confidence >= 0.85
    ) {
      const c = r.payload.contact;
      e.mission.knowledge.objectiveContacts ||= {};
      e.mission.knowledge.objectiveContacts[c.id] = {
        ...copy(c),
        receivedAt: e.time,
        sourceMessageId: r.id,
      };
    }
    if (r.payload?.groundSearch)
      e.mission.knowledge.groundSearch = copy(r.payload.groundSearch);
    if (r.payload?.reconProgress)
      e.mission.knowledge.reconProgress = copy(r.payload.reconProgress);
    if (r.payload?.targetProgress)
      e.mission.knowledge.targetProgress = copy(r.payload.targetProgress);
    if (r.payload?.supportAlert)
      e.mission.knowledge.supportAlert = {
        ...copy(r.payload.supportAlert),
        receivedAt: e.time,
      };
    if (r.payload?.missionObjective) {
      e.mission.knowledge.objective = r.payload.missionObjective;
      e.battle.knowledge.objective = r.payload.missionObjective === "complete";
    }
  }
  function declareMissing(s) {
    const e = s.commandExercise,
      m = e?.mission;
    ok(m && e.status === "running", "진행 중인 실전 작전이 없습니다.");
    ok(e.time >= 60, "초기 상황 보고를 기다린 뒤 판단하세요.");
    ok(m.returnRequested, "먼저 철수·회수 요청을 진행하세요.");
    m.missing = m.memberIds.filter((id) => !m.home.includes(id));
    ok(m.missing.length, "미회수 인원이 없습니다.");
    m.declaringMissing = true;
    m.finalizing = true;
    D().end(s, "unrecovered");
  }
  function returnedForce(e) {
    const own = [
      ...e.world.units.map((u) => ({
        alive: u.health.alive,
        home: e.mission.home.includes(u.id),
      })),
      ...Infantry()
        .units(e)
        .map((u) => ({ alive: u.health.alive, home: !!u.home })),
    ];
    return (
      own.every((u) => !u.alive || u.home) && own.some((u) => u.alive && u.home)
    );
  }
  // Correct only the retained, physically verifiable infantry-only result.
  // Successful reports are ineligible, making payment and trust repair idempotent.
  function repairInfantryResult(s) {
    const e = s.commandExercise,
      m = e?.mission;
    if (
      !m?.settled ||
      e.status !== "ended" ||
      m.memberIds.length ||
      !m.hqInfantry ||
      m.abortRequested ||
      m.objectiveFailed ||
      !m.objective ||
      m.missing.length ||
      !returnedForce(e)
    )
      return false;
    const r = s.operations.reports.find((r) => r.id === m.id);
    if (
      !r ||
      r.success ||
      r.returnComplete ||
      !r.objective ||
      r.reward ||
      r.bonus
    )
      return false;
    r.returnComplete = true;
    r.success = true;
    r.reward = m.contract.reward;
    r.bonus =
      Infantry()
        .units(e)
        .every((u) => u.home) && e.time <= m.contract.bonusWindow
        ? m.contract.bonus
        : 0;
    P.finance(s, r.reward + r.bonus, "mission-result-correction", {
      missionId: m.id,
    });
    const client = s.operations.clients[m.contract.issuer];
    client.trust = Math.min(100, client.trust + 14);
    r.clientTrust = client.trust;
    r.resultCorrected = true;
    return true;
  }
  function settle(s, e) {
    const m = e.mission;
    if (!m) return;
    const existing = s.operations.reports.find((r) => r.id === m.id);
    if (existing) {
      m.settled = true;
      m.reportId = existing.id;
      s.activeMission = null;
      return existing;
    }
    ok(
      m.finalizing && e.status === "ended",
      "실제 복귀 또는 미회수 통제 절차가 필요합니다.",
    );
    harvest(e);
    const report = {
      id: m.id,
      infantryDeployment: copy(m.hqInfantry?.teamDeployment || []),
      recon: m.reconPlan ? copy(m.reconPlan) : null,
      targets: targeted(m) ? copy(m.targetProgress) : null,
      agencySecurity: e.world.actors
        .filter((a) => a.id.startsWith("agency-infantry-"))
        .map((a) => ({
          id: a.id,
          name: a.name,
          alive: a.health.alive,
          conscious: a.health.conscious,
          wounds: copy(a.health.wounds),
          shots: a.weapon.spent,
          position: { x: a.x, y: a.y },
          state: a.state,
        })),
      contractId: m.contract.id,
      title: m.contract.title,
      issuer: m.contract.issuer,
      task: m.contract.task,
      startedAt: m.startedAt,
      endedAt: s.clock.elapsedSeconds,
      fieldSeconds: e.time,
      objective: m.objective && !m.objectiveFailed,
      returnComplete: returnedForce(e),
      missing: m.memberIds.filter((id) => !m.home.includes(id)),
      roster: [],
      radio: e.radio
        .filter((r) => r.hqVisibleAt !== null)
        .map((r) => ({
          from: copy(r.from),
          to: copy(r.to),
          time: r.createdAt,
          deliveredAt: r.deliveredAt,
          kind: r.kind,
          body: r.body,
          eventId: r.eventId,
        })),
      events: copy(
        [
          ...new Map(
            [
              ...m.log,
              ...e.events.filter(
                (ev) =>
                  m.memberIds.includes(ev.actorId) ||
                  m.memberIds.includes(ev.leaderId) ||
                  ev.callsign ||
                  ev.type === "hq-order",
              ),
            ].map((ev) => [ev.id, ev]),
          ).values(),
        ].sort((a, b) => a.time - b.time),
      ),
      supports: copy(m.supports),
      consumed: 0,
      escrow: m.escrow,
      postpaid: !!m.postpaid,
      refund: 0,
      reward: 0,
      bonus: 0,
      settled: true,
    };
    let totalCost = 0;
    const billable = {};
    let medicalBill = 0;
    for (const u of e.world.units) {
      const home = m.home.includes(u.id),
        known = e.knowledge.friends[u.id];
      const confirmedDead =
        !u.health.alive && (home || known?.health?.alive === false);
      const disposition = confirmedDead
        ? "deceased"
        : home
          ? "returned"
          : "missing";
      const st = m.stats[u.id];
      for (const [model, n] of Object.entries(st.shotsByModel)) {
        const cal = B().WEAPONS[model].calibre;
        billable[cal] = (billable[cal] || 0) + n;
      }
      if (!home) {
        for (const w of [u.weapon, u.sidearm]) {
          const cal = B().WEAPONS[w.model].calibre;
          billable[cal] =
            (billable[cal] || 0) +
            w.loaded +
            w.magazines.reduce((a, b) => a + b, 0);
        }
      }
      medicalBill += home ? Math.min(1, u.medicalUses || 0) : 1;
      report.roster.push({
        id: u.id,
        name: u.name,
        role: u.role,
        disposition,
        stats: copy(st),
        injuries:
          home || confirmedDead
            ? copy(u.health.wounds)
            : copy(known?.health?.wounds || []),
        weapon: copy(u.weapon),
        sidearm: copy(u.sidearm),
        bloodMl: home ? u.health.bloodMl : null,
      });
    }
    for (const [cal, qty] of Object.entries(billable))
      totalCost += Math.min(qty, m.budget.ammo[cal] || 0) * (PRICES[cal] || 0);
    totalCost += Math.min(medicalBill, m.budget.medical) * 30000;
    if (m.hqInfantry) {
      totalCost += 120000;
      for (const u of Infantry().units(e)) {
        for (const w of [u.weapon, u.sidearm])
          totalCost +=
            (u.home ? w.spent : w.initial) *
            (PRICES[B().WEAPONS[w.model].calibre] || 0);
        totalCost += (u.medicalUses || 0) * 30000;
      }
    }
    report.protectedHome = !!m.protectedHome;
    report.consumed = m.postpaid ? totalCost : Math.min(m.escrow, totalCost);
    report.refund = m.postpaid ? 0 : m.escrow - report.consumed;
    const anyLoss =
      report.roster.some((u) => u.disposition !== "returned") ||
      Infantry()
        .units(e)
        .some((u) => !u.home);
    const success =
      report.objective &&
      report.returnComplete &&
      !m.missing.length &&
      !m.abortRequested;
    Infantry().settle(s, e, report);
    report.success = success;
    report.reward = success ? m.contract.reward : 0;
    report.bonus =
      success && !anyLoss && e.time <= m.contract.bonusWindow
        ? m.contract.bonus
        : 0;
    s.activeMission = null;
    for (const row of report.roster) {
      const model = blue(e, row.id),
        p = member(s, row.id);
      const summary = {
        eventId: m.id,
        time: s.clock.elapsedSeconds,
        type: "mission",
        missionId: m.id,
        message:
          report.title +
          " · " +
          (success ? "계약 목표 달성" : "계약 목표 미달성") +
          " · " +
          (row.disposition === "returned"
            ? "실제 복귀"
            : row.disposition === "deceased"
              ? "전사 확인"
              : "미회수·실종"),
        shots: row.stats.shots,
        observations: row.stats.observations,
      };
      p.history.push(summary);
      p.serviceRecord = p.serviceRecord || {
        missions: 0,
        successes: 0,
        failures: 0,
        shots: 0,
        observations: 0,
        aid: 0,
      };
      p.serviceRecord.missions++;
      p.serviceRecord[success ? "successes" : "failures"]++;
      p.serviceRecord.shots += row.stats.shots;
      p.serviceRecord.observations += row.stats.observations;
      p.serviceRecord.aid += row.stats.aid;
      p.experience +=
        Math.floor(
          (m.fieldStartedAt === null ? 0 : e.time - m.fieldStartedAt) / 60,
        ) +
        row.stats.observations * 2 +
        row.stats.aid * 15 +
        (success ? 50 : 0);
      p.proficiency.primary = Math.min(
        100,
        p.proficiency.primary +
          (m.fieldStartedAt === null ? 0 : success ? 2 : 1),
      );
      if (row.disposition === "returned" && m.fieldStartedAt !== null) {
        const primary = p.specialty === "sniper" ? "shooting" : "observation",
          evidence =
            p.specialty === "sniper"
              ? Math.min(row.stats.shots, 30) * 0.012
              : Math.min(row.stats.observations, 20) * 0.025;
        P.learn(
          p,
          primary,
          Math.min(0.8, evidence * (1 - p.skills[primary] / 125)),
          { time: s.clock.elapsedSeconds, source: "field", eventId: m.id },
        );
        if (success)
          P.learn(p, "judgment", 0.2, {
            time: s.clock.elapsedSeconds,
            source: "field",
            eventId: m.id,
          });
        if (model.health.alive && (row.stats.shots || row.stats.observations))
          P.learn(p, "composure", 0.15, {
            time: s.clock.elapsedSeconds,
            source: "field",
            eventId: m.id,
          });
      }
      p.fatigue = Math.min(
        100,
        p.fatigue +
          (e.time / P.HOUR) * 6 +
          row.stats.aid * 2 +
          (model.fieldFatigue || 0),
      );
      p.stress = Math.min(
        100,
        p.stress +
          row.stats.shots * 0.15 +
          (anyLoss ? 15 : (e.time / P.HOUR) * 1.5) +
          (model.fieldStress || 0),
      );
      if (row.disposition === "missing") {
        P.markMissing(s, p.id);
        continue;
      }
      for (const w of model.health.wounds) {
        const source = m.id + ":" + w.sourceEventId;
        P.casualty(s, {
          id: source,
          missionId: m.id,
          memberId: p.id,
          kind: "injury",
          part: w.part,
          severity: w.severity,
          injuryType: w.type,
        });
        const saved = p.injuries.find((x) => x.sourceEventId === source);
        if (saved) {
          saved.treated = w.treated;
          saved.fieldTreatedAt = w.treated ? s.clock.elapsedSeconds : null;
        }
      }
      if (row.disposition === "deceased")
        P.casualty(s, {
          id: m.id + ":fatal:" + p.id,
          missionId: m.id,
          memberId: p.id,
          kind: "death",
        });
    }
    if (report.refund)
      P.finance(s, report.refund, "mission-escrow-refund", {
        missionId: m.id,
        consumed: report.consumed,
      });
    if (report.reward + report.bonus)
      P.finance(s, report.reward + report.bonus, "mission-payment", {
        missionId: m.id,
        reward: report.reward,
        bonus: report.bonus,
      });
    if (m.postpaid) {
      const due = (s.operations.payable || 0) + report.consumed,
        paid = Math.min(s.headquarters.funds, due);
      if (paid) P.finance(s, -paid, "mission-actual-cost", { missionId: m.id });
      s.operations.payable = due - paid;
      report.paid = paid;
      report.outstanding = s.operations.payable;
    }
    const client = s.operations.clients[m.contract.issuer];
    client.trust = Math.max(
      0,
      Math.min(
        100,
        client.trust + (success ? 8 : -6) - (m.objectiveFailed ? 10 : 0),
      ),
    );
    client.completed++;
    report.clientTrust = client.trust;
    const c = s.contracts.find((c) => c.id === m.contract.id);
    c.status = "settled";
    s.operations.reports.push(report);
    m.settled = true;
    m.reportId = m.id;
    s.operations.inspection = {
      missionId: m.id,
      dueAt: s.clock.elapsedSeconds + 2 * P.HOUR,
      completed: false,
    };
    P.expireContracts(s);
    event(
      s,
      "mission-settled",
      report.title +
        " 정산. " +
        (success ? "성공" : "실패/철수") +
        " · 실지출 " +
        report.consumed.toLocaleString("ko-KR") +
        "원 · 예치금 환급 " +
        report.refund.toLocaleString("ko-KR") +
        "원 · 보수/보너스 " +
        (report.reward + report.bonus).toLocaleString("ko-KR") +
        "원.",
      { missionId: m.id },
    );
    return report;
  }
  function inspection(s) {
    ok(!s.activeMission, "작전이 진행 중입니다.");
    const x = s.operations.inspection;
    ok(x && !x.completed, "진행할 귀환 후 점검이 없습니다.");
    const dt = Math.max(1, x.dueAt - s.clock.elapsedSeconds);
    P.elapse(s, dt);
    x.completed = true;
    event(
      s,
      "mission-inspection",
      "귀환 장비 확인·의료 인계·보고 점검 완료. 미회복 부상자는 별도 진료가 필요하다.",
      { missionId: x.missionId },
    );
  }
  function project(s, e, f) {
    const m = e.mission,
      r = s.operations.reports.find((r) => r.id === m.reportId);
    return {
      ...f,
      battle: { ...f.battle, result: null },
      mission: {
        id: m.id,
        agencyAutonomous: !!m.agencyAutonomous,
        hqInfantry: m.hqInfantry
          ? {
              callsign: "본부 보병",
              teamDirectives: copy(m.hqInfantry.teamDirectives || {}),
              directive: copy(m.hqInfantry.directive),
              transport: copy(m.hqInfantry.transport),
              lastThrowFailure: m.hqInfantry.lastThrowFailure || null,
            }
          : null,
        agencyDirective: m.agencyDirective?.mode || "auto",
        agencyDirectiveSource: m.agencyDirective?.source || null,
        agencyControl: m.agencyControl
          ? {
              phase: m.agencyControl.phase,
              reason: m.agencyControl.reason,
              readyTeams: copy(m.agencyControl.readyTeams),
              waypoint: copy(m.agencyControl.waypoint),
            }
          : null,
        title: m.contract.title,
        issuer: m.contract.issuer,
        task: m.contract.task,
        agencyInfantry: m.contract.agencyInfantry || 4,
        securityControl: m.securityControl
          ? {
              authorized: m.securityControl.authorized,
              reason: m.securityControl.reason,
              readyTeams: copy(m.securityControl.readyTeams),
            }
          : null,
        reconProgress: m.knowledge.reconProgress
          ? copy(m.knowledge.reconProgress)
          : null,
        groundSearch: m.knowledge.groundSearch
          ? copy(m.knowledge.groundSearch)
          : null,
        targetLabel: m.contract.targetLabel || null,
        targetProgress: m.knowledge.targetProgress
          ? copy(m.knowledge.targetProgress)
          : null,
        phase: e.status === "ended" ? "settled" : m.knowledge.phase,
        objective: m.knowledge.objective,
        transport: m.contract.transport,
        support: copy(m.contract.support),
        usedSupport: copy(m.supports),
        extractionPoint: copy(m.extractionPoint),
        escrow: m.escrow,
        returnRequested: m.returnRequested,
        waitReason: m.knowledge.waitReason || null,
        diagnosis: (m.knowledge.transports || []).map((t) => ({
          id: t.id,
          state: t.state,
          passengers: t.manifest.length,
          remainingDistance: t.remainingDistance || 0,
          reportedAt: t.reportedAt,
        })),
        report: r ? { ...copy(r), radio: undefined, events: undefined } : null,
      },
      transports: [
        ...(m.protectedTransport && m.protectedTransport.state !== "home"
          ? [
              {
                ...copy(m.protectedTransport),
                type: "vehicle",
                passengers: m.protectedTransport.manifest.length,
              },
            ]
          : []),
        ...(m.hqInfantry &&
        !["waiting", "home", "failed"].includes(m.hqInfantry.transport.state)
          ? [
              {
                ...copy(m.hqInfantry.transport),
                type: "vehicle",
                passengers: m.hqInfantry.transport.manifest.length,
                reportedAt: e.time,
                heading: 0,
                remainingDistance: 0,
              },
            ]
          : []),
        ...copy(
          m.knowledge.transports.filter(
            (t) =>
              !["home", "unused"].includes(t.state) &&
              !["home", "unused"].includes(
                m.transports.find((actual) => actual.id === t.id)?.state,
              ) &&
              !m.log.some(
                (ev) =>
                  ev.type === "transport-home" &&
                  ev.transportId === t.id &&
                  ev.time >= t.reportedAt,
              ),
          ),
        ),
      ],
      contacts: f.contacts.filter(
        (c) => !m.knowledge.actors.some((a) => a.id === c.id),
      ),
      supportActors: [
        ...copy(m.knowledge.actors)
          .filter((a) => !a.home)
          .map((a) =>
            a.armed && a.role !== "medic"
              ? {
                  ...a,
                  role: a.agencySniperRole || "infantry",
                  roleLabel:
                    a.roleLabel ||
                    (a.id === "agency-rescuer"
                      ? "기관 구출 보병"
                      : a.id === "agency-guide"
                        ? "기관 경호 보병"
                        : "기관 보병"),
                }
              : a,
          ),
        ...copy(m.knowledge.crew),
      ],
    };
  }
  function agencyId(e, id) {
    return (
      !!e.mission &&
      (id === "AGENCY" ||
        e.world.actors.some((a) => a.id === id && a.side === "ally"))
    );
  }
  function validate(s) {
    ok(
      s.operations?.payable == null ||
        (Number.isSafeInteger(s.operations.payable) &&
          s.operations.payable >= 0),
      "미지급 작전 비용이 잘못되었습니다.",
    );
    const n = (v, a = 0, b = Number.MAX_SAFE_INTEGER) =>
      typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
    ok(
      s.operations &&
        Number.isSafeInteger(s.operations.sequence) &&
        Array.isArray(s.operations.reports) &&
        s.operations.clients &&
        Array.isArray(s.contracts) &&
        s.contracts.length <= 30,
      "실전 계약 저장이 잘못되었습니다.",
    );
    const ids = new Set();
    for (const c of s.contracts) {
      if (c.teamCallsigns !== undefined)
        ok(
          Array.isArray(c.teamCallsigns) &&
            c.teamCallsigns.length <= 3 &&
            new Set(c.teamCallsigns).size === c.teamCallsigns.length &&
            c.teamCallsigns.every((call) =>
              ["ALPHA", "BRAVO", "CHARLIE"].includes(call),
            ),
          "계약 투입 저격조 저장이 잘못되었습니다.",
        );
      ok(
        typeof c.id === "string" &&
          !ids.has(c.id) &&
          TEMPLATES.some((t) => t.key === c.key) &&
          ["offered", "accepted", "active", "settled", "expired"].includes(
            c.status,
          ) &&
          n(c.reward) &&
          n(c.bonus) &&
          n(c.offeredAt, 0, s.clock.elapsedSeconds) &&
          n(c.expiresAt, c.offeredAt) &&
          ["foot", "vehicle", "helicopter"].includes(c.transport) &&
          G.maps[c.mapId || "command-range"] &&
          point(c.insertion) &&
          point(c.extraction) &&
          c.support &&
          ["drone", "medical", "supply"].every(
            (k) => Number.isInteger(c.support[k]) && n(c.support[k], 0, 2),
          ),
        "계약 조건이 잘못되었습니다.",
      );
      ids.add(c.id);
    }
    ok(
      s.contracts.filter((c) => c.status === "accepted").length <= 1 &&
        s.contracts.filter((c) => c.status === "active").length <= 1,
      "동시 계약/작전 수가 잘못되었습니다.",
    );
    for (const x of Object.values(s.operations.clients))
      ok(
        n(x.trust, 0, 100) && Number.isInteger(x.completed),
        "의뢰 기관 관계가 잘못되었습니다.",
      );
    const reportIds = new Set();
    for (const r of s.operations.reports) {
      ok(
        typeof r.id === "string" &&
          !reportIds.has(r.id) &&
          r.settled === true &&
          Array.isArray(r.roster) &&
          Array.isArray(r.radio) &&
          Array.isArray(r.events) &&
          n(r.consumed, 0, r.postpaid ? Number.MAX_SAFE_INTEGER : r.escrow) &&
          n(r.refund, 0, r.escrow) &&
          typeof r.success === "boolean" &&
          n(r.escrow) &&
          (r.postpaid
            ? r.escrow === 0 && r.refund === 0 && n(r.paid) && n(r.outstanding)
            : r.refund + r.consumed === r.escrow) &&
          n(r.reward) &&
          n(r.bonus),
        "실전 결과/정산 보관이 잘못되었습니다.",
      );
      reportIds.add(r.id);
    }
    const e = s.commandExercise,
      m = e?.mission;
    if (!m) {
      ok(s.activeMission === null, "전장 없는 실전 작전 포인터입니다.");
      return s;
    }
    ok(
      m.version === 1 &&
        m.contract &&
        typeof m.id === "string" &&
        Array.isArray(m.memberIds) &&
        (m.memberIds.length >= 2 ||
          (m.memberIds.length === 0 && !!m.hqInfantry)) &&
        m.memberIds.length <= 6 &&
        new Set(m.memberIds).size === m.memberIds.length &&
        m.memberIds.every((id) => e.world.units.some((u) => u.id === id)) &&
        Array.isArray(m.home) &&
        Array.isArray(m.missing) &&
        m.home.every((id) => m.memberIds.includes(id)) &&
        m.missing.every((id) => m.memberIds.includes(id)) &&
        m.knowledge &&
        Array.isArray(m.knowledge.transports) &&
        Array.isArray(m.knowledge.actors) &&
        Array.isArray(m.knowledge.crew) &&
        point(m.extractionPoint) &&
        Array.isArray(m.transports) &&
        m.transports.length <= 6 &&
        Array.isArray(m.log) &&
        m.stats &&
        [
          "boarding",
          "inserting",
          "infiltration",
          "field",
          "extracting",
          "returning",
          "withdrawing",
        ].includes(m.phase) &&
        [
          "objective",
          "objectiveFailed",
          "returnRequested",
          "finalizing",
          "settled",
        ].every((k) => typeof m[k] === "boolean") &&
        m.budget &&
        (m.postpaid ? m.escrow === 0 : m.escrow === m.budget.total) &&
        n(m.escrow),
      "실전 전장 연결이 잘못되었습니다.",
    );
    for (const c of Object.values(m.knowledge.objectiveContacts || {}))
      ok(
        point(c) &&
          c.objectiveCode &&
          n(c.observedAt, 0, e.time) &&
          c.confidence >= 0.85 &&
          e.radio.some(
            (r) =>
              r.id === c.sourceMessageId &&
              r.route === "up" &&
              r.status === "delivered" &&
              r.payload?.contact?.id === c.id &&
              r.payload.contact.objectiveCode === c.objectiveCode &&
              r.payload.contact.x === c.x &&
              r.payload.contact.y === c.y &&
              r.payload.contact.observedAt === c.observedAt,
          ),
        "식별 목표의 수신 근거가 잘못되었습니다.",
      );
    if (m.agencyDirective)
      ok(
        ["auto", "hold", "advance", "withdraw"].includes(
          m.agencyDirective.mode,
        ) &&
          (m.agencyDirective.source == null ||
            ["headquarters", "controller", "agency"].includes(
              m.agencyDirective.source,
            )) &&
          n(m.agencyDirective.receivedAt, 0, e.time) &&
          Object.values(m.agencyDirective.anchors || {}).every(point) &&
          e.radio.some(
            (r) =>
              r.id === m.agencyDirective.messageId &&
              r.route === "agency" &&
              r.status === "delivered" &&
              r.payload?.agencyDirective?.mode === m.agencyDirective.mode &&
              r.payload.agencyDirective.source === m.agencyDirective.source,
          ),
        "기관 보병 지시의 수신 기록이 잘못되었습니다.",
      );
    if (m.groundSearch) {
      const g = m.groundSearch;
      ok(
        g.version === 1 &&
          Array.isArray(g.areas) &&
          g.areas.length === 6 &&
          new Set(g.areas.map((a) => a.id)).size === 6 &&
          g.areas.every(
            (a) =>
              point(a.point) &&
              n(a.dwell, 0, 17) &&
              (a.checkedAt === null || n(a.checkedAt, 0, e.time)),
          ) &&
          Number.isInteger(g.pass) &&
          g.pass > 0 &&
          n(g.lastTick, 0, e.time),
        "보병 수색 구역 저장이 잘못되었습니다.",
      );
      for (const lead of [g.lead, ...(g.leadQueue || [])].filter(Boolean))
        ok(
          point(lead.point) &&
            ["protected", "target"].includes(lead.kind) &&
            n(lead.observedAt, 0, e.time) &&
            e.radio.some(
              (r) =>
                r.id === lead.messageId &&
                r.route === "agency" &&
                r.status === "delivered" &&
                r.payload?.agencyLead?.id === lead.id &&
                r.payload.agencyLead.sourceMessageId === lead.sourceMessageId,
            ),
          "보병에게 수신되지 않은 목표 정보입니다.",
        );
    }
    if (m.reconPlan)
      ok(
        m.contract.task === "recon" &&
          m.reconPlan.version === 1 &&
          Array.isArray(m.reconPlan.areas) &&
          m.reconPlan.areas.length === 6 &&
          n(m.reconPlan.lastTick, 0, e.time) &&
          m.reconPlan.areas.every(
            (a, i) =>
              a.id === i &&
              typeof a.label === "string" &&
              point(a.point) &&
              n(a.dwell, 0, 22) &&
              (a.checkedAt === null || n(a.checkedAt, 0, e.time)),
          ),
        "정찰 구역 진행 정보가 잘못되었습니다.",
      );
    if (targeted(m)) {
      ok(
        Array.isArray(m.targetIds) &&
          m.targetIds.length === (m.contract.targetCount || 1) &&
          new Set(m.targetIds).size === m.targetIds.length &&
          m.targetIds.every((id) =>
            e.world.actors.some(
              (a) =>
                a.id === id &&
                a.side === "red" &&
                a.armed &&
                typeof a.missionTargetCode === "string",
            ),
          ) &&
          m.targetProgress &&
          ["identified", "confirmed", "escaped"].every(
            (k) =>
              Array.isArray(m.targetProgress[k]) &&
              m.targetProgress[k].every((id) => m.targetIds.includes(id)),
          ) &&
          point(m.targetExit),
        "지정 표적 상태가 잘못되었습니다.",
      );
    }
    if (m.casualtySupport) {
      const g = m.casualtySupport;
      ok(
        g.version === 1 &&
          n(g.lastAssessment, -100, e.time) &&
          g.assignments &&
          typeof g.assignments === "object" &&
          Object.entries(g.assignments).every(
            ([id, t]) =>
              e.world.actors.some((a) => a.id === id && a.side === "ally") &&
              m.memberIds.includes(t.targetId) &&
              ["aid", "cover"].includes(t.role) &&
              point(t.point) &&
              n(t.observedAt, 0, e.time) &&
              n(t.expiresAt, 0, e.time + 60),
          ),
        "아군 부상 지원 상태가 잘못되었습니다.",
      );
    }
    if (m.securityControl) {
      const g = m.securityControl;
      ok(
        g.version === 1 &&
          typeof g.authorized === "boolean" &&
          typeof g.returning === "boolean" &&
          n(g.lastAssessment, -100, e.time) &&
          typeof g.reason === "string" &&
          Array.isArray(g.readyTeams) &&
          g.readyTeams.every((call) =>
            e.squads.some((q) => q.callsign === call),
          ) &&
          g.goals &&
          typeof g.goals === "object" &&
          Object.entries(g.goals).every(
            ([id, p]) =>
              e.world.actors.some(
                (a) =>
                  a.id === id && a.side === "ally" && a.taskDuty === "security",
              ) && point(p),
          ),
        "기관 보병 경계 통제 상태가 잘못되었습니다.",
      );
    }
    if (m.agencyControl) {
      const g = m.agencyControl;
      ok(
        g.version === 1 &&
          typeof g.authorized === "boolean" &&
          typeof g.everAuthorized === "boolean" &&
          typeof g.reason === "string" &&
          ["staging", "holding", "advancing"].includes(g.phase) &&
          n(g.lastAssessment, -100, e.time) &&
          (g.waypoint === null || point(g.waypoint)) &&
          Array.isArray(g.readyTeams) &&
          g.readyTeams.every((call) =>
            e.squads.some((q) => q.callsign === call),
          ) &&
          Array.isArray(g.history) &&
          g.history.length <= 100 &&
          g.history.every(
            (row) =>
              n(row.at, 0, e.time) &&
              typeof row.authorized === "boolean" &&
              typeof row.eventId === "string",
          ),
        "기관 보병 진출 통제 저장이 잘못되었습니다.",
      );
    }
    if (m.protectedTransport) {
      const t = m.protectedTransport;
      ok(
        ["pickup", "boarding", "returning", "home"].includes(t.state) &&
          point(t) &&
          Array.isArray(t.path) &&
          t.path.every(point) &&
          Array.isArray(t.manifest) &&
          t.manifest.length <= 6 &&
          new Set(t.manifest).size === t.manifest.length &&
          t.manifest.every((id) =>
            e.world.actors.some(
              (a) => a.id === id && a.side === "ally" && !a.hqMemberId,
            ),
          ) &&
          (!["returning", "home"].includes(t.state) ||
            t.manifest.includes("agency-protected")) &&
          (t.state !== "home" || m.protectedHome === true),
        "구출·호송 대상 수송 기록이 잘못되었습니다.",
      );
    }
    if (m.taskLeaderId)
      ok(
        e.world.actors.some(
          (a) => a.id === m.taskLeaderId && a.side === "ally" && a.armed,
        ),
        "기관 현장 조장 연결이 잘못되었습니다.",
      );
    if (e.status === "running")
      ok(
        s.activeMission?.id === m.id &&
          s.activeMission.contractId === m.contract.id &&
          s.activeMission.memberIds.length === m.memberIds.length &&
          s.activeMission.memberIds.every((id) => m.memberIds.includes(id)) &&
          s.contracts.some(
            (c) => c.id === m.contract.id && c.status === "active",
          ) &&
          !m.settled,
        "진행 중 실전과 본부 포인터가 불일치합니다.",
      );
    if (m.settled)
      ok(!s.activeMission && reportIds.has(m.id), "정산 결과 연결이 없습니다.");
    const transportIds = new Set(),
      passengers = new Set();
    for (const t of m.transports) {
      ok(
        typeof t.id === "string" &&
          !transportIds.has(t.id) &&
          ["foot", "vehicle", "helicopter", "drone"].includes(t.type) &&
          point(t) &&
          n(t.altitude, 0, 120) &&
          n(t.heading, -100, 100) &&
          [
            "home",
            "boarding",
            "takeoff",
            "flying",
            "driving",
            "landing",
            "air-hold",
            "ground-hold",
            "insert-landed",
            "insert-hold",
            "unloading",
            "home-unload",
            "pickup-landed",
            "pickup-hold",
            "loading",
            "dispatch",
            "on-station",
            "support-landed",
            "support-hold",
            "medical-work",
            "unused",
            "route-blocked",
          ].includes(t.state) &&
          Number.isInteger(t.capacity) &&
          n(t.capacity, 0, 6) &&
          Array.isArray(t.path) &&
          t.path.length < 300 &&
          t.path.every(point) &&
          Array.isArray(t.manifest) &&
          t.manifest.length <= t.capacity &&
          new Set(t.manifest).size === t.manifest.length &&
          t.manifest.every((id) => m.memberIds.includes(id)) &&
          n(t.dispatchAt),
        "제공 수송/지원 상태가 잘못되었습니다.",
      );
      for (const id of t.manifest) {
        ok(
          !passengers.has(id) && blue(e, id).boardedBy === t.id,
          "대원이 두 수송수단에 중복 탑승했습니다.",
        );
        passengers.add(id);
      }
      transportIds.add(t.id);
    }
    for (const u of e.world.units)
      if (u.boardedBy)
        ok(
          transportIds.has(u.boardedBy) &&
            m.transports
              .find((t) => t.id === u.boardedBy)
              .manifest.includes(u.id),
          "탑승 개체와 수송 명부가 불일치합니다.",
        );
    return s;
  }
  const api = {
    TEMPLATES,
    regionsFor,
    selectRegion,
    PRICES,
    initialize,
    upgrade,
    updateOffers,
    refresh,
    accept,
    cancel,
    reserveFor,
    selectedSquads,
    setTeams,
    ready,
    launch,
    beforeTick,
    allowTeams,
    requestReturn,
    pickupPoint,
    requestSupport,
    retaskDrone,
    actorTaskTick,
    commandAgency,
    taskPerson,
    moveGround,
    updateAgencyControl,
    searchPoint,
    updateSecurityControl,
    tick,
    applyPayload,
    declareMissing,
    settle,
    inspection,
    project,
    agencyId,
    participant,
    validate,
  };
  root.OverwatchMissions = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
