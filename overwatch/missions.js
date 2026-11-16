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
    I = () => D().internals;
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
        "순찰 증가 보고의 진위를 확인한다. 무장 인원 2개 접촉을 실제 관측·식별하고 복귀한다.",
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
        "도보로 출발해 능선 외곽에서 무장 접촉 2개를 식별한다. 별도 수송·의료 회수·공습 지원은 제공되지 않는다.",
    },
  ];
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
  function offers(s) {
    const seq = ++s.operations.sequence;
    for (const t of TEMPLATES) {
      const baseMapId = {
          "ridge-watch": "ridge-field",
          "aid-cover": "urban-quarter",
          "rescue-cover": "urban-port",
          "vip-cover": "urban-modern",
          "quiet-watch": "ridge-field",
        }[t.key],
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
        mapId,
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
    ok(s.contracts.length <= 10, "현재 제안을 처리한 뒤 다시 접수하세요.");
    offers(s);
  }
  function accept(s, id) {
    updateOffers(s);
    ok(
      !s.activeMission && !s.contracts.some((c) => c.status === "accepted"),
      "동시에 한 계약만 수락·출격할 수 있습니다.",
    );
    const c = s.contracts.find((c) => c.id === id);
    ok(c?.status === "offered", "유효한 제안이 아닙니다.");
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
  function reserveFor(s) {
    const ammo = {};
    let medical = 0;
    for (const q of s.squads)
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
    if (s.activities.some((a) => a.status === "running"))
      return "진행 중인 본부 활동을 마치거나 중단하세요.";
    const ids = s.squads.flatMap((q) => [q.observerId, q.sniperId]);
    if (ids.length < c.min || ids.length > 6)
      return "이 계약은 " + c.min + "~6명의 적정 저격조가 필요합니다.";
    for (const id of ids) {
      const m = member(s, id),
        why = P.readiness(s, m);
      if (why) return m.name + " · " + why;
      if (m.contract.endsAt - s.clock.elapsedSeconds < P.DAY)
        return m.name + " · 계약 잔여 24시간 이상이 필요합니다.";
    }
    if (s.headquarters.funds < reserveFor(s).total)
      return "출격 소모품 예치금이 부족합니다.";
    return null;
  }
  function log(e, type, data = {}) {
    const ev = I().event(e, type, data);
    e.mission.log.push(copy(ev));
    return ev;
  }
  function say(s, e, kind, body, ev, payload = {}) {
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
    const budget = reserveFor(s);
    const seed = [...(c.id + ":" + s.clock.elapsedSeconds)].reduce(
      (n, ch) => Math.imul(n ^ ch.charCodeAt(0), 16777619) >>> 0,
      2166136261,
    );
    const e = B().begin(s, {
        scenario: "recon",
        seed,
        live: true,
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
      escrow: budget.total,
      taskLinked: false,
    };
    e.mission = m;
    s.activeMission = {
      id: mid,
      contractId: id,
      memberIds: m.memberIds.slice(),
      startedAt: s.clock.elapsedSeconds,
    };
    P.finance(s, -budget.total, "mission-escrow", { missionId: mid });
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
    for (const q of e.squads) q.roe = "selfDefense";
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
        ". 예치금 " +
        budget.total.toLocaleString("ko-KR") +
        "원. 실제 사용·손실만 정산한다.",
      ev,
    );
    event(
      s,
      "mission-launched",
      c.title +
        " 실전 출격. 소모품 최대 사용액 " +
        budget.total.toLocaleString("ko-KR") +
        "원 예치.",
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
    if (m.contract.task !== "recon")
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
  function taskPerson(e, id, role, p, armed) {
    const base = copy(e.world.actors.find((a) => a.side === "civilian"));
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
      state: "waiting",
    });
    base.health.kit = role === "기관 구출요원" ? 2 : 1;
    return base;
  }
  function setupTask(e) {
    const m = e.mission,
      t = m.contract.task;
    const city = G.MAP.urban || G.MAP.width < 500,
      at = (legacy, local) => G.project(city ? local : legacy);
    if (t === "recon") return;
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
          at({ x: 620, y: 445 }, G.MAP.sector),
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
      m.taskGoal = at(
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
    if (
      u.taskMoveGoal &&
      (G.distance(u.taskMoveGoal, goal) > 5 ||
        (u.taskMoveGoal.roofId || null) !== (goal.roofId || null))
    )
      u.path = [];
    u.taskMoveGoal = {
      x: goal.x,
      y: goal.y,
      ...(goal.roofId ? { roofId: goal.roofId } : {}),
    };
    if (!u.path?.length) u.path = G.path(u, goal);
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
            const ev = log(e, "transport-recovery-started", {
              transportId: t.id,
            });
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
        ? G.project(e.squads[0].sector)
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
    target = target || G.project(e.squads[0].sector);
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
            (a) => a.side === "red" && G.distance(t, a) < 260 && G.clear(t, a),
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
                confidence: 0.85,
                classification: "armed-person",
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
                    : "UAV 영상으로 무장 인원 관측. 지상 관측수의 직접 식별과 사격선 확인이 필요하다.",
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
              old.observedAt = e.time;
            } else
              t.observations.push({
                id: a.id,
                x: seen.x,
                y: seen.y,
                condition: medicalCondition,
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
      moveGround(c, G.project({ x: t.x, y: t.y }), 0.8, e);
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
      if (u.home || u.boardedBy || (u.carriedBy && u.carriedBy !== c.id)) {
        c.dueAt = null;
        c.targetId = null;
        return;
      }
      if (G.distance(c, u) > 1.8 || (c.roofId || null) !== (u.roofId || null)) {
        moveGround(c, u, 1, e);
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
    if (t.manifest.length) beginTravel(e, t, G.MAP.base, "home-unload");
    else {
      if (t.id === "primary") {
        c.searchPoints ??= [
          [35, 0],
          [0, 35],
          [-35, 0],
          [0, -35],
        ].map(([dx, dy]) => G.project({ x: t.x + dx, y: t.y + dy }));
        c.searchIndex ??= 0;
        if (c.searchIndex < c.searchPoints.length) {
          const target = c.searchPoints[c.searchIndex];
          c.state = "searching";
          if (!c.path.length) {
            c.path = G.path(c, target);
            if (!c.path.length) c.path = G.path(c, target, 5);
          }
          if (G.distance(c, target) < 2 || !c.path.length) {
            c.searchIndex++;
            c.path = [];
          } else {
            if (stepToward(c, c.path[0], 1)) c.path.shift();
          }
          return;
        }
        const ev = log(e, "recovery-search-completed", {
          transportId: t.id,
          checked: c.searchIndex,
        });
        say(
          s,
          e,
          "transport",
          "마지막 보고 위치 주변 구역을 실제 수색했으나 미회수 대원을 찾지 못했다. 사망으로 단정하지 않고 확인한 탑승자와 함께 복귀한다.",
          ev,
        );
        beginTravel(e, t, G.MAP.base, "home-unload");
        return;
      }
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
    if (!g || m.contract.task === "recon" || m.returnRequested) return;
    const frame = D().frame(s),
      friends = frame.friends.filter(
        (f) =>
          f.age < 20 &&
          !f.home &&
          !f.boardedBy &&
          f.health?.alive &&
          f.health.conscious,
      );
    const anchors = (m.knowledge.actors || []).filter(
      (a) =>
        a.id ===
        (m.taskLeaderId ||
          (m.contract.task === "rescue" ? "agency-rescuer" : "agency-guide")),
    );
    const anchor = anchors[0] || m.contract.insertion;
    const objective =
      m.contract.task === "rescue" && !m.taskLinked
        ? m.contract.interest || G.MAP.sector || e.squads[0].sector
        : m.taskGoal;
    const route = G.path(anchor, objective);
    let length = 0,
      prev = anchor,
      target = objective;
    for (const p of route) {
      const d = G.distance(prev, p),
        step = Math.min(35, G.MAP.width * 0.1);
      if (length + d >= step) {
        const f = (step - length) / Math.max(0.001, d);
        target = {
          x: prev.x + (p.x - prev.x) * f,
          y: prev.y + (p.y - prev.y) * f,
        };
        break;
      }
      length += d;
      prev = p;
    }
    const ready = e.squads.filter((q) => {
      const cmd = frame.commands.findLast(
        (c) => c.callsign === q.callsign && ["cover", "recon"].includes(c.kind),
      );
      const pair = friends.filter(
        (f) =>
          f.callsign === q.callsign &&
          !["moving", "climbing", "aid"].includes(f.state) &&
          f.mobility,
      );
      return (
        cmd?.status === "completed" &&
        pair.length === 2 &&
        pair.every(
          (f) =>
            G.distance(f, q.tactical?.position || f) <
            (q.tactical?.position?.roofId ? 7 : 40),
        )
      );
    });
    const canWatch = (f, p) =>
      G.clear(f, p) && G.distance(f, p) < (f.visionRange || 1000);
    const facing = (f, p) =>
      Math.abs(
        Math.atan2(
          Math.sin(Math.atan2(p.y - f.y, p.x - f.x) - (f.heading || 0)),
          Math.cos(Math.atan2(p.y - f.y, p.x - f.x) - (f.heading || 0)),
        ),
      ) <
      (f.visionHalfAngle || 0.5) + 0.08;
    const watched = (p) =>
      ready.some((q) =>
        friends.some(
          (f) =>
            f.callsign === q.callsign &&
            f.role === "sniper" &&
            canWatch(f, p) &&
            facing(f, p),
        ),
      );
    const threats = frame.contacts.filter(
      (c) =>
        c.current &&
        c.classification === "armed-person" &&
        !["dead", "down"].includes(c.medicalCondition),
    );
    const pathDistance = (from, to) => {
      let last = from,
        total = 0;
      const route = G.path(from, to);
      if (!route.length && G.distance(from, to) > 1) return Infinity;
      for (const p of route) {
        total += G.distance(last, p);
        last = p;
      }
      return total;
    };
    const safe = (p) =>
      !threats.some(
        (t) =>
          (t.combatActive ||
            ["aiming", "firing"].includes(t.activity) ||
            G.distance(t, p) < 25) &&
          G.distance(t, p) < Math.min(100, G.MAP.width * 0.25) &&
          G.clear(t, p),
      );
    let approved = target;
    if (!safe(target) || !watched(target)) {
      const angle = Math.atan2(objective.y - anchor.y, objective.x - anchor.x);
      approved = [-0.8, 0.8, -1.4, 1.4]
        .map((n) =>
          G.project({
            x: Math.max(
              12,
              Math.min(G.MAP.width - 12, anchor.x + Math.cos(angle + n) * 18),
            ),
            y: Math.max(
              12,
              Math.min(G.MAP.height - 12, anchor.y + Math.sin(angle + n) * 18),
            ),
          }),
        )
        .find(
          (p) =>
            safe(p) &&
            watched(p) &&
            G.path(anchor, p).length &&
            pathDistance(p, objective) < pathDistance(anchor, objective) - 4,
        );
    }
    if (g.scanCommandId) {
      const scan = frame.commands.find((c) => c.id === g.scanCommandId);
      if (scan && ["queued", "acknowledged"].includes(scan.status)) {
        g.authorized = false;
        g.lastAssessment = e.time;
        return;
      }
      g.scanCommandId = null;
    }
    if (!watched(target)) {
      const team =
        ready.find(
          (q) =>
            q.assignment?.kind === "corridor-cover" &&
            friends.some(
              (f) =>
                f.callsign === q.callsign &&
                f.role === "sniper" &&
                canWatch(f, target),
            ),
        ) ||
        ready.find((q) =>
          friends.some(
            (f) =>
              f.callsign === q.callsign &&
              f.role === "sniper" &&
              canWatch(f, target),
          ),
        );
      if (team && e.commandAuthority && e.time - (g.lastScanAt ?? -100) > 20) {
        const command = D().issue(
          s,
          team.callsign,
          "cover",
          target,
          null,
          e.commandAuthority,
        );
        if (e.control)
          e.control.orders[team.callsign] = {
            id: command.id,
            kind: "cover",
            target: copy(target),
          };
        g.scanCommandId = command.id;
        g.lastScanAt = e.time;
        g.authorized = false;
        g.reason = "진지는 유지, 기관 진출 예정 구간으로 관측 전환 중";
        g.lastAssessment = e.time;
        return;
      }
    }
    if (
      !approved &&
      e.commandAuthority &&
      e.time - (g.lastRepositionAt ?? -100) > 60
    ) {
      const mover =
        ready.find((q) => q.assignment?.kind === "corridor-cover") ||
        ready.at(-1);
      if (mover) {
        const command = D().issue(
          s,
          mover.callsign,
          "cover",
          target,
          null,
          e.commandAuthority,
        );
        command.reposition = true;
        if (e.control)
          e.control.orders[mover.callsign] = {
            id: command.id,
            kind: "cover",
            target: copy(target),
          };
        g.scanCommandId = command.id;
        g.lastRepositionAt = e.time;
        g.authorized = false;
        g.reason =
          "진출로 사각: 보병 대기, 엄호조 한 조만 대체 외곽 진지로 전개";
        g.lastAssessment = e.time;
        return;
      }
    }
    const functional = e.squads.filter(
      (q) =>
        friends.filter((f) => f.callsign === q.callsign && f.mobility)
          .length === 2,
    ).length;
    const initialReady =
      g.everAuthorized || (functional > 0 && ready.length === functional);
    const authorized =
      initialReady &&
      ready.length > 0 &&
      !!approved &&
      safe(approved) &&
      watched(approved);
    const reason =
      !ready.length || !initialReady
        ? "저격조 외곽 진지 확보·관측 보고 대기"
        : !approved
          ? "진출로의 위협·엄호 사각 확인, 보병 정지"
          : "관측 보고와 엄호 시야를 확인한 구간만 진출 승인";
    if (g.authorized !== authorized || g.reason !== reason) {
      const ev = log(
        e,
        authorized ? "agency-advance-authorized" : "agency-advance-held",
        {
          readyTeams: ready.map((q) => q.callsign),
          waypoint: approved || null,
          reason,
        },
      );
      say(
        s,
        e,
        "decision",
        reason + ". 기관 보병·구출조는 통제된 구간을 이동한다.",
        ev,
      );
      g.history.push({ at: e.time, eventId: ev.id, authorized, reason });
      g.history = g.history.slice(-100);
    }
    Object.assign(g, {
      authorized,
      phase: authorized ? "advancing" : "holding",
      reason,
      waypoint: authorized ? copy(approved) : null,
      lastAssessment: e.time,
      readyTeams: ready.map((q) => q.callsign),
      everAuthorized: g.everAuthorized || authorized,
    });
  }
  function actorTaskTick(s, e, u) {
    if (u.waitingForDeployment) {
      if (e.mission.fieldStartedAt == null) return;
      u.waitingForDeployment = false;
      u.state = "holding";
    }
    const m = e.mission;
    if (
      !["field", "extracting", "withdrawing", "returning"].includes(m.phase) ||
      !u.health.alive ||
      !u.health.conscious ||
      u.health.aid
    )
      return;
    if (u.health.wounds.some((w) => !w.treated)) return;
    if (
      m.agencyControl &&
      (!m.agencyControl.authorized ||
        e.time - m.agencyControl.lastAssessment > 25 ||
        m.returnRequested) &&
      !B().underFire(e, u)
    ) {
      u.path = [];
      u.state = "staging";
      if (u.armed) {
        u.prone = false;
        u.stance = "kneeling";
      }
      return;
    }
    const enemies = e.world.actors.filter(
      (a) =>
        a.side === "red" &&
        a.health.alive &&
        a.health.conscious &&
        G.distance(u, a) < 200 &&
        G.clear(u, a) &&
        B().visualAcquire(e, u, a, 200),
    );
    if (u.armed && enemies.length) {
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
      u.prone = true;
      u.state = "covering";
      B().fire(s, e, u, seen);
      return;
    }
    if (
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
    const protectedUnit = e.world.actors.find(
        (a) => a.id === "agency-protected",
      ),
      guide = e.world.actors.find(
        (a) =>
          a.id ===
          (m.taskLeaderId ||
            (m.contract.task === "rescue" ? "agency-rescuer" : "agency-guide")),
      );
    if (u.taskDuty === "security") {
      const anchor = guide?.health.alive ? guide : protectedUnit;
      if (anchor) {
        const i = Number(u.id.split("-").at(-1)) || 0;
        moveGround(
          u,
          G.project({
            x: anchor.x + Math.cos(i * 2.1) * 6,
            y: anchor.y + Math.sin(i * 2.1) * 6,
          }),
          0.75,
          e,
        );
      }
      u.state = "securing";
      return;
    }
    if (m.contract.task === "rescue") {
      if (u.id === (m.taskLeaderId || "agency-rescuer")) {
        if (!m.taskLinked) {
          if (G.distance(u, protectedUnit) < 10) {
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
            moveGround(u, m.agencyControl?.waypoint || protectedUnit, 0.9, e);
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
  function harvest(e) {
    const m = e.mission;
    for (const ev of e.events) {
      const nr = Number(ev.id.split("-").at(-1));
      if (nr <= m.lastSequence) continue;
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
    if (m.contract.task !== "recon" && !m.returnRequested) {
      m.taskLeaderId ||=
        m.contract.task === "rescue" ? "agency-rescuer" : "agency-guide";
      const old = e.world.actors.find((a) => a.id === m.taskLeaderId);
      if (old && (!old.health.alive || !old.health.conscious)) {
        const successor = e.world.actors
          .filter(
            (a) =>
              a.side === "ally" &&
              a.armed &&
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
            "기관 구출·호송 보병 전원 행동 불능. 목표 수행 불가, 저격조 철수 필요.",
            ev,
            { missionObjective: "failed" },
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
    const protectedUnit = e.world.actors.find(
      (a) => a.id === "agency-protected",
    );
    const complete =
      m.contract.task === "recon"
        ? new Set(
            e.squads
              .flatMap((q) => q.contacts)
              .filter(
                (c) =>
                  c.classification === "armed-person" && c.confidence >= 0.8,
              )
              .map((c) => c.id),
          ).size >= 2
        : !!protectedUnit?.health.alive &&
          G.distance(protectedUnit, m.taskGoal) <
            (G.MAP.width < 500 ? 8 : 20) &&
          (m.contract.task !== "rescue" || m.taskLinked);
    const failed =
      (protectedUnit && !protectedUnit.health.alive) ||
      m.agencyLeaderUnavailable;
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
          ? "보호 대상 생체 신호 소실. 계약 목표 달성 불가, 철수 판단 바란다."
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
              m.taskLinked ||
              e.squads.some((q) =>
                q.contacts.some((c) => c.id === a.id && c.confidence >= 0.8),
              )),
        )
        .map((a) => ({
          id: a.id,
          name: a.name,
          role: a.armed ? "infantry" : "civilian",
          roleLabel: a.armed
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
          pose: B().snapshot(a).pose,
          state: a.state,
          health: B().snapshot(a).health,
          reportedAt: e.time,
          observedAt: e.time,
        }));
    }
    if (
      m.returnRequested &&
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
      D().end(s, living.length ? "returned" : "casualties");
    }
  }
  function applyPayload(e, r) {
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
      contractId: m.contract.id,
      title: m.contract.title,
      issuer: m.contract.issuer,
      task: m.contract.task,
      startedAt: m.startedAt,
      endedAt: s.clock.elapsedSeconds,
      fieldSeconds: e.time,
      objective: m.objective && !m.objectiveFailed,
      returnComplete:
        m.memberIds.every(
          (id) => m.home.includes(id) || !blue(e, id).health.alive,
        ) && e.world.units.some((u) => u.health.alive && m.home.includes(u.id)),
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
    report.consumed = Math.min(m.escrow, totalCost);
    report.refund = m.escrow - report.consumed;
    const anyLoss = report.roster.some((u) => u.disposition !== "returned");
    const success =
      report.objective &&
      report.returnComplete &&
      !m.missing.length &&
      !m.abortRequested;
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
      p.fatigue = Math.min(
        100,
        p.fatigue + (e.time / P.HOUR) * 6 + row.stats.aid * 2,
      );
      p.stress = Math.min(
        100,
        p.stress +
          row.stats.shots * 0.15 +
          (anyLoss ? 15 : (e.time / P.HOUR) * 1.5),
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
      transports: copy(
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
      supportActors: [
        ...copy(m.knowledge.actors).map((a) =>
          a.armed
            ? {
                ...a,
                role: "infantry",
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
          n(r.consumed, 0, r.escrow) &&
          n(r.refund, 0, r.escrow) &&
          typeof r.success === "boolean" &&
          n(r.escrow) &&
          r.refund + r.consumed === r.escrow &&
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
        m.memberIds.length >= 2 &&
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
        m.escrow === m.budget.total &&
        n(m.escrow),
      "실전 전장 연결이 잘못되었습니다.",
    );
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
    PRICES,
    initialize,
    updateOffers,
    refresh,
    accept,
    cancel,
    reserveFor,
    ready,
    launch,
    beforeTick,
    allowTeams,
    requestReturn,
    pickupPoint,
    requestSupport,
    retaskDrone,
    actorTaskTick,
    updateAgencyControl,
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
