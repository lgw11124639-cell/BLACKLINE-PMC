/* Phase 3 command range: truth, local perception and HQ knowledge are separate.
   Explicit deterministic steps exercise AI/comms; this is not a combat mission. */
(function (root) {
  "use strict";
  const P =
      root.OverwatchPersonnel ||
      (typeof require === "function" ? require("./personnel.js") : null),
    G =
      root.OverwatchGeometry ||
      (typeof require === "function" ? require("./geometry.js") : null),
    copy = (x) => JSON.parse(JSON.stringify(x)),
    ok = (v, m) => {
      if (!v) throw Error(m);
    };
  const ORDERS = {
    move: "지역 이동",
    observe: "구역 관측",
    hold: "현 위치 유지",
    withdraw: "집결지 이동",
    roe: "교전 규칙 변경",
    report: "상황 보고",
  };
  const num = (n, a = 0, b = Number.MAX_SAFE_INTEGER) =>
      typeof n === "number" && Number.isFinite(n) && n >= a && n <= b,
    text = (x) => typeof x === "string" && x.length > 0 && x.length <= 1000,
    point = (p) => p && num(p.x, 10, 1190) && num(p.y, 10, 790);
  const unit = (e, id) => e.world.units.find((u) => u.id === id),
    leader = (e, q) => unit(e, q.leaderId),
    member = (s, id) =>
      s.members.find((m) => m.id === id) ||
      s.archive.members.find((m) => m.id === id),
    running = (s) => {
      ok(
        s.commandExercise?.status === "running",
        "진행 중인 지휘 훈련이 없습니다.",
      );
      return s.commandExercise;
    };
  function event(e, type, data = {}) {
    const a = {
      id: "range-event-" + ++e.sequence,
      time: e.time,
      type,
      ...copy(data),
    };
    e.events.push(a);
    if (e.events.length > 2000) e.events.shift();
    return a;
  }
  function endpoint(e, id) {
    if (id === "HQ")
      return {
        id,
        name: "BLACKLINE 본부",
        callsign: "HQ",
        role: "본부 지휘관",
      };
    const u = unit(e, id);
    return {
      id: u.id,
      name: u.name,
      callsign: u.callsign,
      role: u.role === "observer" ? "관측수·현장 조장" : "저격수",
    };
  }
  function linked(e, q) {
    const u = leader(e, q);
    return !!u?.capable && !G.MAP.shadows.some((b) => G.inside(u, b));
  }
  function latency(s, e, q) {
    const m = member(s, q.leaderId),
      v = P.effectiveSkills(m);
    return Math.max(
      2,
      Math.round(
        8 -
          v.judgment / 25 -
          (m.secondarySpecialties.includes("communications") ? 2 : 0),
      ),
    );
  }
  function radio(s, e, q, route, from, to, kind, body, cause, payload = null) {
    const r = {
      id: "radio-" + ++e.sequence,
      createdAt: e.time,
      sentAt: null,
      deliveredAt: null,
      hqVisibleAt: route === "down" ? e.time : null,
      from: endpoint(e, from),
      to: endpoint(e, to),
      callsign: q.callsign,
      route,
      kind,
      body,
      eventId: cause.id,
      payload: copy(payload),
      status: "queued",
      delay:
        route === "local"
          ? Math.max(
              1,
              Math.round(
                5 -
                  (P.effectiveSkills(member(s, q.leaderId)).teamwork +
                    P.relationship(s, q).cohesion) /
                    50,
              ),
            )
          : latency(s, e, q),
    };
    e.radio.push(r);
    return r;
  }
  function record(s, e, type, message) {
    s.records.push({
      id: e.id + "-" + type,
      type,
      time: s.clock.elapsedSeconds,
      message,
    });
    if (s.records.length > 500) s.records.shift();
  }
  function initialize(s) {
    ok(s.schemaVersion === 2, "2단계 원본에서만 전환할 수 있습니다.");
    s.schemaVersion = 3;
    s.commandSequence = 0;
    s.commandExercise = null;
    s.commandArchive = [];
    return s;
  }
  function begin(s) {
    ok(
      s.schemaVersion === 3 &&
        !s.activeMission &&
        s.commandExercise?.status !== "running",
      "현재 상태에서는 지휘 훈련을 시작할 수 없습니다.",
    );
    ok(s.squads.length > 0, "먼저 관측수·저격수 저격조를 편성하세요.");
    ok(
      !s.activities.some((a) => a.status === "running"),
      "진행 중인 본부 활동을 마치거나 중단하세요.",
    );
    for (const q of s.squads)
      for (const id of [q.observerId, q.sniperId])
        ok(
          P.readiness(s, member(s, id)) === null,
          "편성 대원의 회복·계약·활동 상태를 확인하세요.",
        );
    s.commandSequence = (s.commandSequence || 0) + 1;
    const e = {
      version: 1,
      id: "range-" + s.commandSequence + "-" + s.clock.elapsedSeconds,
      status: "running",
      startedAt: s.clock.elapsedSeconds,
      time: 0,
      sequence: 0,
      paused: false,
      pauseReason: null,
      world: { units: [], actors: [] },
      squads: [],
      commands: [],
      radio: [],
      events: [],
      knowledge: { friends: {}, contacts: {} },
    };
    s.commandExercise = e;
    s.squads.forEach((q, i) => {
      const ids = [q.observerId, q.sniperId];
      for (let j = 0; j < 2; j++) {
        const m = member(s, ids[j]);
        e.world.units.push({
          id: m.id,
          name: m.name,
          role: m.specialty,
          callsign: q.callsign,
          x: 80 + i * 45 + j * 16,
          y: 700 + i * 18,
          capable: true,
          state: "holding",
          heading: -Math.PI / 2,
          path: [],
          goal: null,
        });
      }
      const sq = {
        ...copy(q),
        leaderId: q.observerId,
        commandId: null,
        thinkAt: null,
        sector: { x: 500, y: 150 },
        roe: "hold",
        contacts: [],
        lastHeartbeat: -30,
        lastCriticalAt: -100,
      };
      e.squads.push(sq);
      const a = event(e, "range-started", {
        callsign: q.callsign,
        memberIds: ids,
      });
      radio(
        s,
        e,
        sq,
        "up",
        sq.leaderId,
        "HQ",
        "ready",
        q.callsign + " 관측수. 두 명 지휘 훈련 준비. 현재 위치 보고 전송.",
        a,
        { friends: friendSnapshots(e, sq) },
      );
    });
    // Independent moving training actors, never exposed to the range UI before observation/report delivery.
    e.world.actors = [
      {
        id: "range-a",
        x: 410,
        y: 140,
        speed: 0.65,
        waypoint: 0,
        route: [
          { x: 410, y: 140 },
          { x: 580, y: 170 },
        ],
        kind: "training-target",
      },
      {
        id: "range-b",
        x: 880,
        y: 190,
        speed: 0.8,
        waypoint: 0,
        route: [
          { x: 880, y: 190 },
          { x: 1090, y: 280 },
        ],
        kind: "training-target",
      },
      {
        id: "range-c",
        x: 760,
        y: 720,
        speed: 0.6,
        waypoint: 0,
        route: [
          { x: 760, y: 720 },
          { x: 1000, y: 730 },
        ],
        kind: "unarmed-target",
      },
    ];
    record(
      s,
      e,
      "command-exercise-started",
      "편성 저격조 지휘 훈련을 시작했습니다. 실제 계약 출격·실탄 교전이 아닙니다.",
    );
    return e;
  }
  function issue(s, callsign, kind, target = null, roe = null) {
    const e = running(s),
      q = e.squads.find((q) => q.callsign === callsign);
    ok(q && leader(e, q)?.capable, "명령을 받을 수 있는 저격조가 없습니다.");
    ok(Object.hasOwn(ORDERS, kind), "지원하지 않는 조 단위 명령입니다.");
    if (["move", "observe"].includes(kind))
      ok(
        point(target) && !G.blocked(target),
        "건물 내부나 훈련장 밖은 지정할 수 없습니다.",
      );
    if (kind === "roe")
      ok(
        ["hold", "selfDefense", "authorized"].includes(roe),
        "교전 규칙이 잘못되었습니다.",
      );
    ok(
      e.commands.length < 300 && e.radio.length < 3000,
      "훈련 기록 한도입니다. 종료 후 새 훈련을 시작하세요.",
    );
    const c = {
      id: "command-" + ++e.sequence,
      ordinal: e.sequence,
      callsign,
      kind,
      target: target ? copy(target) : null,
      roe,
      issuedAt: e.time,
      receivedAt: null,
      completedAt: null,
      status: "queued",
    };
    e.commands.push(c);
    const a = event(e, "hq-order", {
      commandId: c.id,
      callsign,
      kind,
      target: c.target,
      roe,
    });
    radio(
      s,
      e,
      q,
      "down",
      "HQ",
      q.leaderId,
      "order",
      callsign +
        ", 본부. " +
        ORDERS[kind] +
        (target
          ? " 좌표 " + Math.round(target.x) + ", " + Math.round(target.y)
          : "") +
        (roe
          ? " · " +
            {
              hold: "사격 금지",
              selfDefense: "자위 대응만 허가",
              authorized: "확인 표적 교전 허가",
            }[roe]
          : "") +
        ". 관측수가 세부 판단 후 지시하라.",
      a,
      { commandId: c.id },
    );
    return c;
  }
  function friendSnapshots(e, q) {
    return [q.observerId, q.sniperId].map((id) => {
      const u = unit(e, id);
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        callsign: q.callsign,
        x: u.x,
        y: u.y,
        state: u.state,
        capable: u.capable,
        observedAt: e.time,
        elevation: G.elevation(u),
      };
    });
  }
  function report(s, e, q, kind, body, cause, payload = {}) {
    return radio(s, e, q, "up", q.leaderId, "HQ", kind, body, cause, payload);
  }
  function receive(s, e, q, c) {
    if (c.status !== "queued") return;
    const old = e.commands.find((a) => a.id === q.commandId);
    if (old && old.ordinal > c.ordinal) {
      c.status = "superseded";
      return;
    }
    if (old && ["received", "thinking", "executing"].includes(old.status))
      old.status = "superseded";
    q.commandId = c.id;
    c.receivedAt = e.time;
    c.status = "thinking";
    const m = member(s, q.leaderId),
      v = P.effectiveSkills(m),
      bias = { cautious: 3, assertive: -1, seasoned: 0 }[m.personality];
    q.thinkAt =
      e.time +
      Math.max(
        2,
        Math.round(14 - v.judgment * 0.1 - m.career.years * 0.25 + bias),
      );
    const a = event(e, "order-received", {
      commandId: c.id,
      callsign: q.callsign,
      leaderId: q.leaderId,
      thinkAt: q.thinkAt,
    });
    report(
      s,
      e,
      q,
      "ack",
      q.callsign +
        " " +
        member(s, q.leaderId).name +
        ". " +
        ORDERS[c.kind] +
        " 수신. 지형·조원 상태 평가 후 세부 지시한다.",
      a,
      { commandId: c.id },
    );
  }
  function planPosition(e, q, target, role) {
    const other = e.world.units.filter(
      (u) => u.capable && u.callsign !== q.callsign,
    );
    const candidates = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4,
        r = role === "observer" ? 12 : 30,
        p = {
          x: target.x + Math.cos(angle) * r,
          y: target.y + Math.sin(angle) * r,
        };
      if (G.blocked(p) || other.some((u) => G.distance(p, u.goal || u) < 14))
        continue;
      const teammate = unit(e, role === "observer" ? q.sniperId : q.observerId);
      if (
        role === "sniper" &&
        teammate.goal &&
        G.distance(p, teammate.goal) < 14
      )
        continue;
      const u = unit(e, role === "observer" ? q.observerId : q.sniperId),
        route = G.path(u, p);
      if (route.length)
        candidates.push({
          p,
          route,
          score:
            G.elevation(p) * 2 -
            G.distance(p, target) * 0.25 +
            (G.clear(p, q.sector) ? 12 : 0),
        });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }
  function complete(s, e, q, c, body) {
    if (c.status === "completed") return;
    c.status = "completed";
    c.completedAt = e.time;
    const a = event(e, "order-completed", {
      commandId: c.id,
      callsign: q.callsign,
    });
    report(s, e, q, "complete", q.callsign + ". " + body, a, {
      friends: friendSnapshots(e, q),
      commandId: c.id,
    });
  }
  function decide(s, e, q, c) {
    q.thinkAt = null;
    c.status = "executing";
    const a = event(e, "observer-decision", {
      commandId: c.id,
      callsign: q.callsign,
      leaderId: q.leaderId,
      kind: c.kind,
    });
    if (c.kind === "roe") {
      q.roe = c.roe;
      complete(
        s,
        e,
        q,
        c,
        "교전 규칙 변경 확인. 훈련장에서는 실탄 사격하지 않는다.",
      );
      return;
    }
    if (c.kind === "report") {
      complete(s, e, q, c, "현재 조원 상태·마지막 관측 정보를 보고한다.");
      for (const seen of q.contacts.filter((x) => e.time - x.lastSeen < 60))
        sendContact(s, e, q, seen);
      return;
    }
    if (c.kind === "observe") q.sector = copy(c.target);
    if (["hold", "observe"].includes(c.kind)) {
      const own = leader(e, q);
      own.path = [];
      own.goal = null;
      own.state = c.kind === "observe" ? "observing" : "holding";
      const partnerId = q.leaderId === q.observerId ? q.sniperId : q.observerId;
      if (!unit(e, partnerId).capable) {
        complete(
          s,
          e,
          q,
          c,
          "임시 조장 위치 유지. 행동 불능 조원 상태 재평가.",
        );
        return;
      }
      radio(
        s,
        e,
        q,
        "local",
        q.leaderId,
        q.leaderId === q.observerId ? q.sniperId : q.observerId,
        "instruction",
        c.kind === "observe"
          ? "지정 구역 관측. 사수는 주변 경계, 식별 전 사격 금지."
          : "현 위치 유지. 이동 중단하고 사주 경계.",
        a,
        { commandId: c.id, action: c.kind },
      );
      return;
    }
    const target = c.kind === "withdraw" ? G.MAP.base : c.target;
    const plans = [];
    for (const id of [q.observerId, q.sniperId]) {
      const u = unit(e, id);
      if (!u.capable) continue;
      const p = planPosition(e, q, target, u.role);
      if (!p) {
        c.status = "failed";
        const fail = event(e, "route-unavailable", {
          commandId: c.id,
          memberId: id,
        });
        report(
          s,
          e,
          q,
          "request",
          "지정 구역까지 안전한 이동 경로를 확보하지 못했다. 지역 재지정 바란다.",
          fail,
          { commandId: c.id },
        );
        return;
      }
      u.goal = copy(p.p);
      plans.push({ id, path: p.route, goal: p.p });
    }
    for (const p of plans) {
      const u = unit(e, p.id);
      if (p.id === q.leaderId) {
        u.path = p.path;
        u.state = "moving";
      } else
        radio(
          s,
          e,
          q,
          "local",
          q.leaderId,
          p.id,
          "instruction",
          "조 단위 이동. 지형을 우회해 " +
            Math.round(p.goal.x) +
            ", " +
            Math.round(p.goal.y) +
            " 지점 확보. 조 간격 유지.",
          a,
          { commandId: c.id, path: p.path, goal: p.goal },
        );
    }
  }
  function sendContact(s, e, q, seen) {
    const uncertainty = Math.max(5, (1 - seen.confidence) * 50),
      round = (v) => Math.round(v / uncertainty) * uncertainty,
      known = {
        id: seen.id,
        x: round(seen.x),
        y: round(seen.y),
        observedAt: seen.lastSeen,
        confidence: seen.confidence,
        classification:
          seen.confidence >= 0.8 ? seen.classification : "unknown",
        observerId: q.leaderId,
        callsign: q.callsign,
        uncertainty,
      };
    const a = event(e, "contact-observed", {
      callsign: q.callsign,
      actorId: seen.id,
      observation: known,
    });
    report(
      s,
      e,
      q,
      "observation",
      q.callsign +
        ". " +
        (known.classification === "unknown"
          ? "미확인 인원"
          : known.classification === "unarmed-target"
            ? "비무장 훈련 인원"
            : "훈련 표적 인원") +
        " 관측. 좌표 약 " +
        Math.round(known.x) +
        ", " +
        Math.round(known.y) +
        ". 신뢰도 " +
        Math.round(known.confidence * 100) +
        "%.",
      a,
      { contact: known },
    );
    seen.reportedAt = e.time;
    seen.reportedConfidence = seen.confidence;
  }
  function applyKnowledge(e, r) {
    if (r.payload?.friends)
      for (const f of r.payload.friends) {
        const old = e.knowledge.friends[f.id];
        if (!old || old.observedAt <= f.observedAt)
          e.knowledge.friends[f.id] = { ...copy(f), receivedAt: e.time };
      }
    const f = r.payload?.contact;
    if (f) {
      const old = e.knowledge.contacts[f.id];
      if (!old || old.observedAt <= f.observedAt)
        e.knowledge.contacts[f.id] = { ...copy(f), receivedAt: e.time };
    }
  }
  function processRadio(s, e) {
    for (const r of e.radio) {
      const q = e.squads.find((q) => q.callsign === r.callsign);
      if (
        r.route === "local" &&
        r.deliveredAt !== null &&
        r.hqVisibleAt === null &&
        linked(e, q)
      )
        r.hqVisibleAt = e.time;
      if (r.status !== "queued") continue;
      const link =
        r.route === "local"
          ? unit(e, r.from.id)?.capable &&
            unit(e, r.to.id)?.capable &&
            G.distance(unit(e, r.from.id), unit(e, r.to.id)) <= 100
          : linked(e, q);
      if (!link) {
        r.sentAt = null;
        continue;
      }
      if (r.sentAt === null) r.sentAt = e.time;
      if (e.time - r.sentAt < r.delay) continue;
      r.deliveredAt = e.time;
      r.status = "delivered";
      if (r.route !== "local" || linked(e, q)) r.hqVisibleAt = e.time;
      if (r.route === "down") {
        r.deliveredTo = endpoint(e, q.leaderId);
        const c = e.commands.find((c) => c.id === r.payload?.commandId);
        receive(s, e, q, c);
      }
      if (r.route === "local" && r.payload?.path) {
        const c = e.commands.find((c) => c.id === r.payload.commandId);
        if (q.commandId === c?.id && c.status === "executing") {
          const u = unit(e, r.to.id);
          u.path = copy(r.payload.path);
          u.goal = copy(r.payload.goal);
          u.state = "moving";
        }
      }
      if (r.route === "local" && r.payload?.action) {
        const c = e.commands.find((c) => c.id === r.payload.commandId);
        if (q.commandId === c?.id && c.status === "executing") {
          const u = unit(e, r.to.id);
          u.path = [];
          u.goal = null;
          u.state = r.payload.action === "observe" ? "observing" : "holding";
          complete(
            s,
            e,
            q,
            c,
            c.kind === "observe"
              ? "지정 구역 관측·주변 경계 배치 완료."
              : "조 전체 현 위치 유지.",
          );
        }
      }
      if (r.route === "up") {
        applyKnowledge(e, r);
        if (r.kind === "urgent" && s.clock.emergencyPause) {
          e.paused = true;
          e.pauseReason = r.body;
        }
      }
    }
  }
  function clearOfUnits(e, u, a, b) {
    return e.world.units.every((v) => {
      if (v.id === u.id || !v.capable) return true;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        len = dx * dx + dy * dy,
        t = len
          ? Math.max(
              0,
              Math.min(1, ((v.x - a.x) * dx + (v.y - a.y) * dy) / len),
            )
          : 0;
      return G.distance(v, { x: a.x + dx * t, y: a.y + dy * t }) >= 8;
    });
  }
  function detour(e, u, next) {
    const obstacle = e.world.units.find(
      (v) => v.id !== u.id && v.capable && G.distance(v, next) < 8,
    );
    if (obstacle && u.path.length > 1) {
      u.path.shift();
      return true;
    }
    const options = [];
    const nearest = e.world.units
      .filter((v) => v.id !== u.id && v.capable)
      .sort((a, b) => G.distance(u, a) - G.distance(u, b))[0];
    if (!nearest) return false;
    for (const r of [18, 30, 50])
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI) / 12,
          p = {
            x: nearest.x + Math.cos(a) * r,
            y: nearest.y + Math.sin(a) * r,
          };
        if (
          !G.blocked(p) &&
          G.clear(u, p, true) &&
          G.clear(p, next, true) &&
          clearOfUnits(e, u, u, p) &&
          clearOfUnits(e, u, p, next)
        )
          options.push({ p, d: G.distance(u, p) + G.distance(p, next) });
      }
    options.sort((a, b) => a.d - b.d);
    if (!options.length) return false;
    u.path.unshift(options[0].p);
    return true;
  }
  function moveUnit(e, u, amount) {
    if (!u.capable || !u.path.length) return;
    let left = amount;
    while (left > 0 && u.path.length) {
      const next = u.path[0],
        d = G.distance(u, next);
      if (d < 0.01) {
        u.path.shift();
        continue;
      }
      const step = Math.min(left, d),
        p = {
          x: u.x + ((next.x - u.x) * step) / d,
          y: u.y + ((next.y - u.y) * step) / d,
        };
      if (
        e.world.units.some(
          (v) => v.id !== u.id && v.capable && G.distance(v, p) < 8,
        )
      ) {
        const found = detour(e, u, next);
        u.state = found ? "spacing" : "blocked";
        u.blockedAt = found ? null : (u.blockedAt ?? e.time);
        return;
      }
      if (!G.clear(u, p, true)) {
        u.path = [];
        u.state = "blocked";
        return;
      }
      u.blockedAt = null;
      u.x = p.x;
      u.y = p.y;
      u.heading = Math.atan2(next.y - u.y, next.x - u.x);
      left -= step;
      if (step === d) u.path.shift();
    }
    if (!u.path.length) u.state = "holding";
    else u.state = "moving";
  }
  function observe(s, e, q) {
    const u = leader(e, q);
    if (!u?.capable) return;
    const m = member(s, u.id),
      v = P.effectiveSkills(m),
      observerFactor = u.role === "observer" ? 1 : 0.65,
      radius =
        (140 +
          v.observation * 1.8 +
          G.elevation(u) * 4 +
          (m.secondarySpecialties.includes("reconnaissance") ? 35 : 0)) *
        observerFactor,
      heading = Math.atan2(q.sector.y - u.y, q.sector.x - u.x);
    u.heading = heading;
    for (const actor of e.world.actors) {
      const d = G.distance(u, actor),
        angle = Math.atan2(actor.y - u.y, actor.x - u.x),
        delta = Math.abs(
          Math.atan2(Math.sin(angle - heading), Math.cos(angle - heading)),
        );
      if (d > radius || delta > Math.PI * 0.42 || !G.clear(u, actor)) continue;
      let seen = q.contacts.find((c) => c.id === actor.id);
      if (!seen) {
        seen = {
          id: actor.id,
          confidence: 0.1,
          lastSeen: e.time,
          reportedAt: -100,
          reportedConfidence: 0,
        };
        q.contacts.push(seen);
      }
      seen.confidence = Math.min(
        0.98,
        (e.time - seen.lastSeen > 10 ? 0.1 : seen.confidence) +
          0.02 +
          v.observation / 2500,
      );
      seen.x = actor.x;
      seen.y = actor.y;
      seen.lastSeen = e.time;
      seen.classification = actor.kind;
      if (
        e.time - seen.reportedAt >= 20 ||
        (seen.reportedConfidence < 0.8 && seen.confidence >= 0.8)
      )
        sendContact(s, e, q, seen);
      if (d < 65 && seen.confidence >= 0.8 && e.time - q.lastCriticalAt > 60) {
        q.lastCriticalAt = e.time;
        const a = event(e, "close-contact", {
          callsign: q.callsign,
          actorId: actor.id,
          range: d,
        });
        report(
          s,
          e,
          q,
          "urgent",
          "근거리 인원 접근. 조 위치 노출 위험 평가·추가 지시 요청.",
          a,
        );
      }
    }
    return radius;
  }
  function tick(s, e) {
    e.time++;
    for (const actor of e.world.actors) {
      const p = actor.route[actor.waypoint];
      if (G.distance(actor, p) < 1) {
        actor.waypoint = (actor.waypoint + 1) % actor.route.length;
        continue;
      }
      const d = G.distance(actor, p),
        step = Math.min(d, actor.speed);
      actor.x += ((p.x - actor.x) * step) / d;
      actor.y += ((p.y - actor.y) * step) / d;
    }
    for (const q of e.squads) {
      if (!leader(e, q)?.capable) {
        const replacement = [q.observerId, q.sniperId]
          .map((id) => unit(e, id))
          .find((u) => u.capable);
        if (replacement) {
          const old = q.leaderId;
          q.leaderId = replacement.id;
          const a = event(e, "acting-leader", {
            callsign: q.callsign,
            previousId: old,
            leaderId: replacement.id,
          });
          report(
            s,
            e,
            q,
            "urgent",
            replacement.name +
              ". 관측수 행동 불능 판정으로 임시 조장 인계. 본부 명령을 직접 수신한다.",
            a,
            { friends: friendSnapshots(e, q) },
          );
        } else continue;
      }
      const c = e.commands.find((c) => c.id === q.commandId);
      if (c?.status === "thinking" && e.time >= q.thinkAt) decide(s, e, q, c);
      for (const id of [q.observerId, q.sniperId]) {
        const u = unit(e, id),
          other = unit(e, id === q.observerId ? q.sniperId : q.observerId);
        if (
          u.capable &&
          (!other.capable ||
            G.distance(u, other) < 70 ||
            G.distance(u, u.goal || u) > G.distance(other, other.goal || other))
        )
          moveUnit(e, u, 0.8 + P.effectiveSkills(member(s, id)).fitness / 150);
      }
      if (
        c?.status === "executing" &&
        ["move", "withdraw"].includes(c.kind) &&
        [q.observerId, q.sniperId]
          .map((id) => unit(e, id))
          .filter((u) => u.capable)
          .every(
            (u) => u.goal && G.distance(u, u.goal) < 1 && u.path.length === 0,
          )
      )
        complete(
          s,
          e,
          q,
          c,
          c.kind === "withdraw"
            ? "집결지 이동 완료. 훈련 종료 지시 대기."
            : "지정 지역 확보. 사수와 분리된 관측·엄호 위치 유지.",
        );
      if (
        c?.status === "executing" &&
        [q.observerId, q.sniperId]
          .map((id) => unit(e, id))
          .some(
            (u) =>
              u.capable &&
              u.state === "blocked" &&
              (!u.path.length || e.time - (u.blockedAt ?? e.time) >= 30),
          )
      ) {
        c.status = "failed";
        for (const id of [q.observerId, q.sniperId]) {
          const u = unit(e, id);
          u.path = [];
          if (u.capable) u.state = "holding";
        }
        const cause = event(e, "route-blocked", {
          callsign: q.callsign,
          commandId: c.id,
        });
        report(
          s,
          e,
          q,
          "request",
          "현장 이동 경로가 막혔다. 조 전체 엄폐·위치 유지. 이동 지역 재지정 바란다.",
          cause,
          { commandId: c.id },
        );
      }
      if (e.time % 2 === 0) observe(s, e, q);
      if (e.time - q.lastHeartbeat >= 15) {
        q.lastHeartbeat = e.time;
        const a = event(e, "position-report", { callsign: q.callsign });
        report(s, e, q, "position", q.callsign + ". 조 위치·상태 갱신.", a, {
          friends: friendSnapshots(e, q),
        });
      }
    }
    processRadio(s, e);
  }
  function step(s, seconds) {
    const e = running(s);
    ok(
      Number.isInteger(seconds) && seconds >= 1 && seconds <= 120,
      "훈련 시간은 1~120초씩 진행합니다.",
    );
    ok(!e.paused, "긴급 보고로 일시정지했습니다. 확인 후 계속하세요.");
    ok(e.radio.length < 3000, "통신 기록 한도입니다. 훈련을 종료하세요.");
    let advanced = 0;
    for (let i = 0; i < seconds; i++) {
      if (e.radio.length >= 3000) break;
      const ids = e.world.units.map((u) => u.id);
      if (
        ids.some(
          (id) =>
            !s.members.some((m) => m.id === id) ||
            member(s, id).contract.endsAt <= s.clock.elapsedSeconds + 1,
        )
      ) {
        end(s, "contract");
        break;
      }
      P.elapse(s, 1);
      tick(s, e);
      advanced++;
      if (e.paused) break;
    }
    return advanced;
  }
  function resume(s) {
    const e = running(s);
    ok(e.paused, "일시정지 상태가 아닙니다.");
    e.paused = false;
    e.pauseReason = null;
  }
  function end(s, reason = "hq") {
    const e = running(s);
    e.status = "ended";
    e.endedAt = s.clock.elapsedSeconds;
    e.endReason = reason;
    for (const c of e.commands)
      if (["queued", "thinking", "executing", "received"].includes(c.status))
        c.status = "cancelled";
    for (const r of e.radio) if (r.status === "queued") r.status = "cancelled";
    s.commandArchive = s.commandArchive || [];
    s.commandArchive.push({
      id: e.id,
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      endReason: reason,
      frame: frame(s),
    });
    record(
      s,
      e,
      "command-exercise-ended",
      "지휘 훈련 종료. " +
        Math.floor(e.time / 60) +
        "분 경과·명령 " +
        e.commands.length +
        "건·수신 보고 " +
        e.radio.filter((r) => r.route === "up" && r.status === "delivered")
          .length +
        "건. 실제 계약 보상·사격·부상은 발생하지 않았습니다.",
    );
    return e;
  }
  function incapacitate(s, { id, memberId, reason }) {
    const e = running(s);
    ok(
      text(id) && text(reason),
      "행동 불능 판정의 실제 사건 ID와 사유가 필요합니다.",
    );
    if (
      e.events.some(
        (a) =>
          a.type === "incapacitated" &&
          a.sourceEventId === id &&
          a.memberId === memberId,
      )
    )
      return false;
    const u = unit(e, memberId);
    ok(u?.capable, "훈련 중인 정상 대원이 아닙니다.");
    u.capable = false;
    u.path = [];
    u.goal = null;
    u.state = "incapacitated";
    event(e, "incapacitated", { sourceEventId: id, memberId, reason });
    return true;
  }
  function knownCommands(e) {
    const reports = new Map(),
      latestAck = new Map();
    for (const r of e.radio)
      if (
        r.route === "up" &&
        r.status === "delivered" &&
        r.payload?.commandId
      ) {
        const id = r.payload.commandId,
          v = reports.get(id) || {};
        v[r.kind] = r;
        reports.set(id, v);
      }
    for (const c of e.commands)
      if (reports.get(c.id)?.ack)
        latestAck.set(
          c.callsign,
          Math.max(latestAck.get(c.callsign) || 0, c.ordinal),
        );
    return e.commands.map((c) => {
      const r = reports.get(c.id) || {};
      let status = r.complete
        ? "completed"
        : r.request
          ? "failed"
          : r.ack
            ? "acknowledged"
            : "queued";
      if (
        !r.complete &&
        !r.request &&
        (latestAck.get(c.callsign) || 0) > c.ordinal
      )
        status = "superseded";
      if (e.status === "ended" && !r.complete && !r.request)
        status = "cancelled";
      return {
        id: c.id,
        callsign: c.callsign,
        kind: c.kind,
        target: copy(c.target),
        roe: c.roe,
        issuedAt: c.issuedAt,
        status,
        acknowledgedAt: r.ack?.deliveredAt ?? null,
        completedAt: r.complete?.deliveredAt ?? null,
      };
    });
  }
  function frame(s) {
    const e = s.commandExercise;
    if (!e) return null;
    const commands = knownCommands(e),
      knownEvents = new Set(
        e.radio.filter((r) => r.hqVisibleAt !== null).map((r) => r.eventId),
      ),
      acked = new Set(
        commands.filter((c) => c.acknowledgedAt !== null).map((c) => c.id),
      );
    const contacts = Object.values(e.knowledge.contacts).map((c) => {
      const age = e.time - c.observedAt,
        confidence = c.confidence * Math.exp(-age / 120);
      return {
        ...copy(c),
        age,
        confidence,
        current: age <= 12,
        expired: age > 180,
        classification: confidence >= 0.65 ? c.classification : "unknown",
      };
    });
    return {
      id: e.id,
      time: e.time,
      status: e.status,
      paused: e.paused,
      pauseReason: e.pauseReason,
      map: copy(G.MAP),
      friends: Object.values(e.knowledge.friends).map((f) => ({
        ...copy(f),
        age: e.time - f.observedAt,
        stale: e.time - f.observedAt > 30,
      })),
      contacts,
      commands,
      squads: e.squads.map((q) => ({
        callsign: q.callsign,
        roe:
          commands
            .filter(
              (c) =>
                c.callsign === q.callsign &&
                c.kind === "roe" &&
                c.status === "completed",
            )
            .at(-1)?.roe || "hold",
      })),
      radio: e.radio
        .filter((r) => r.hqVisibleAt !== null)
        .map((r) => ({
          id: r.id,
          from: copy(r.from),
          to: copy(
            r.route === "down" && acked.has(r.payload?.commandId)
              ? r.deliveredTo || r.to
              : r.to,
          ),
          channel: r.route === "local" ? "internal" : "hq",
          kind: r.kind,
          body: r.body,
          eventId: r.eventId,
          createdAt: r.createdAt,
          deliveredAt:
            r.route === "down" && !acked.has(r.payload?.commandId)
              ? null
              : r.deliveredAt,
          visibleAt: r.hqVisibleAt,
          status:
            r.route === "down" && !acked.has(r.payload?.commandId)
              ? e.status === "ended"
                ? "cancelled"
                : "queued"
              : r.status,
          delay:
            r.deliveredAt === null ||
            (r.route === "down" && !acked.has(r.payload?.commandId))
              ? null
              : r.deliveredAt - r.createdAt,
        })),
      events: e.events
        .filter((a) => knownEvents.has(a.id))
        .map((a) => ({ id: a.id, time: a.time, type: a.type })),
    };
  }
  function validate(e, s) {
    ok(
      e &&
        e.version === 1 &&
        text(e.id) &&
        ["running", "ended"].includes(e.status) &&
        num(e.startedAt, 0, s.clock.elapsedSeconds) &&
        Number.isInteger(e.time) &&
        e.time >= 0 &&
        typeof e.paused === "boolean" &&
        Number.isSafeInteger(e.sequence),
      "지휘 훈련 저장 형식이 잘못되었습니다.",
    );
    ok(
      e.startedAt + e.time <= s.clock.elapsedSeconds &&
        e.world &&
        Array.isArray(e.world.units) &&
        e.world.units.length >= 2 &&
        e.world.units.length <= 6 &&
        Array.isArray(e.world.actors) &&
        e.world.actors.length <= 12,
      "훈련 시간·개체 수가 잘못되었습니다.",
    );
    const ids = new Set();
    for (const u of e.world.units) {
      ok(
        text(u.id) &&
          !ids.has(u.id) &&
          member(s, u.id) &&
          point(u) &&
          !G.blocked(u) &&
          ["observer", "sniper"].includes(u.role) &&
          typeof u.capable === "boolean" &&
          text(u.name) &&
          text(u.callsign) &&
          Array.isArray(u.path) &&
          u.path.length < 300 &&
          u.path.every((p) => point(p) && !G.blocked(p)) &&
          (u.goal === null || point(u.goal)) &&
          num(u.heading, -100, 100) &&
          text(u.state),
        "훈련 대원·경로가 잘못되었습니다.",
      );
      ids.add(u.id);
      if (e.status === "running")
        ok(
          s.members.some((m) => m.id === u.id),
          "훈련 중 대원이 현직 명부에 없습니다.",
        );
    }
    for (const a of e.world.actors)
      ok(
        text(a.id) &&
          point(a) &&
          num(a.speed, 0, 3) &&
          Number.isInteger(a.waypoint) &&
          Array.isArray(a.route) &&
          a.route.length > 0 &&
          a.waypoint >= 0 &&
          a.waypoint < a.route.length &&
          a.route.every((p) => point(p) && !G.blocked(p)) &&
          ["training-target", "unarmed-target"].includes(a.kind),
        "훈련 표적 경로가 잘못되었습니다.",
      );
    ok(
      Array.isArray(e.squads) &&
        e.squads.length >= 1 &&
        e.squads.length <= 3 &&
        new Set(e.squads.map((q) => q.callsign)).size === e.squads.length,
      "훈련 저격조 구성이 잘못되었습니다.",
    );
    const assigned = new Set();
    for (const q of e.squads) {
      ok(
        ["ALPHA", "BRAVO", "CHARLIE"].includes(q.callsign) &&
          ids.has(q.observerId) &&
          ids.has(q.sniperId) &&
          q.observerId !== q.sniperId &&
          [q.observerId, q.sniperId].includes(q.leaderId) &&
          unit(e, q.observerId).role === "observer" &&
          unit(e, q.sniperId).role === "sniper" &&
          point(q.sector) &&
          Array.isArray(q.contacts) &&
          q.contacts.length <= 12 &&
          num(q.lastHeartbeat, -30, e.time) &&
          num(q.lastCriticalAt, -100, e.time) &&
          ["hold", "selfDefense", "authorized"].includes(q.roe),
        "관측수 지휘 상태가 잘못되었습니다.",
      );
      for (const id of [q.observerId, q.sniperId]) {
        ok(!assigned.has(id), "훈련 인원 중복 편성입니다.");
        assigned.add(id);
      }
      for (const c of q.contacts)
        ok(
          text(c.id) &&
            point(c) &&
            num(c.lastSeen, 0, e.time) &&
            num(c.confidence, 0, 1) &&
            num(c.reportedAt, -100, e.time),
          "조 내부 관측 정보가 잘못되었습니다.",
        );
    }
    ok(assigned.size === ids.size, "훈련 대원과 편제가 일치하지 않습니다.");
    ok(
      Array.isArray(e.commands) &&
        e.commands.length <= 300 &&
        Array.isArray(e.radio) &&
        e.radio.length <= 3100 &&
        Array.isArray(e.events) &&
        e.events.length <= 2000,
      "지휘 기록 한도가 잘못되었습니다.",
    );
    const cmdids = new Set();
    for (const c of e.commands) {
      ok(
        text(c.id) &&
          !cmdids.has(c.id) &&
          e.squads.some((q) => q.callsign === c.callsign) &&
          Object.hasOwn(ORDERS, c.kind) &&
          num(c.issuedAt, 0, e.time) &&
          Number.isSafeInteger(c.ordinal) &&
          [
            "queued",
            "received",
            "thinking",
            "executing",
            "completed",
            "superseded",
            "failed",
            "cancelled",
          ].includes(c.status) &&
          (!["move", "observe"].includes(c.kind) || point(c.target)) &&
          (c.kind !== "roe" ||
            ["hold", "selfDefense", "authorized"].includes(c.roe)),
        "명령 저장이 잘못되었습니다.",
      );
      cmdids.add(c.id);
    }
    for (const q of e.squads)
      ok(
        q.commandId === null || cmdids.has(q.commandId),
        "현재 명령 연결이 끊어졌습니다.",
      );
    const radioids = new Set();
    for (const r of e.radio) {
      ok(
        text(r.id) &&
          !radioids.has(r.id) &&
          text(r.body) &&
          text(r.eventId) &&
          e.squads.some((q) => q.callsign === r.callsign) &&
          ["up", "down", "local"].includes(r.route) &&
          ["queued", "delivered", "cancelled"].includes(r.status) &&
          num(r.createdAt, 0, e.time) &&
          num(r.delay, 1, 20) &&
          (r.sentAt === null || num(r.sentAt, r.createdAt, e.time)) &&
          (r.deliveredAt === null || num(r.deliveredAt, r.createdAt, e.time)) &&
          (r.hqVisibleAt === null || num(r.hqVisibleAt, r.createdAt, e.time)) &&
          r.from &&
          r.to &&
          text(r.from.id) &&
          text(r.to.id) &&
          text(r.from.name) &&
          text(r.to.name),
        "무전 저장이 잘못되었습니다.",
      );
      radioids.add(r.id);
      if (r.status === "delivered")
        ok(r.deliveredAt !== null, "전달된 무전의 시각이 없습니다.");
    }
    ok(
      e.knowledge && e.knowledge.friends && e.knowledge.contacts,
      "본부 수신 정보가 없습니다.",
    );
    for (const f of Object.values(e.knowledge.friends))
      ok(
        ids.has(f.id) &&
          point(f) &&
          num(f.observedAt, 0, e.time) &&
          num(f.receivedAt, f.observedAt, e.time) &&
          text(f.name) &&
          text(f.callsign) &&
          text(f.role) &&
          typeof f.capable === "boolean",
        "본부 아군 정보가 잘못되었습니다.",
      );
    for (const c of Object.values(e.knowledge.contacts))
      ok(
        text(c.id) &&
          point(c) &&
          num(c.observedAt, 0, e.time) &&
          num(c.receivedAt, c.observedAt, e.time) &&
          num(c.confidence, 0, 1) &&
          num(c.uncertainty, 0, 100) &&
          text(c.classification),
        "본부 관측 정보가 잘못되었습니다.",
      );
    for (const a of e.events)
      ok(
        text(a.id) && text(a.type) && num(a.time, 0, e.time),
        "훈련 사건 기록이 잘못되었습니다.",
      );
    ok(
      s.commandSequence === undefined ||
        (Number.isSafeInteger(s.commandSequence) && s.commandSequence > 0),
      "훈련 순번이 잘못되었습니다.",
    );
    if (e.status === "running")
      ok(
        e.startedAt + e.time === s.clock.elapsedSeconds,
        "훈련과 본부 시계가 일치하지 않습니다.",
      );
    const snapshotFriend = (f) =>
      f &&
      ids.has(f.id) &&
      point(f) &&
      num(f.observedAt, 0, e.time) &&
      text(f.name) &&
      ["observer", "sniper"].includes(f.role) &&
      text(f.callsign) &&
      text(f.state) &&
      typeof f.capable === "boolean";
    const snapshotContact = (c) =>
      c &&
      text(c.id) &&
      point(c) &&
      num(c.observedAt, 0, e.time) &&
      num(c.confidence, 0, 1) &&
      num(c.uncertainty, 0, 100) &&
      ["unknown", "training-target", "unarmed-target"].includes(
        c.classification,
      );
    for (const q of e.squads) {
      ok(
        q.thinkAt === null || num(q.thinkAt, 0, e.time + 60),
        "관측수 판단 시각이 잘못되었습니다.",
      );
      for (const id of [q.observerId, q.sniperId])
        ok(
          unit(e, id).callsign === q.callsign,
          "훈련 호출부호가 일치하지 않습니다.",
        );
      for (const c of q.contacts)
        ok(
          num(c.reportedConfidence, 0, 1) &&
            ["training-target", "unarmed-target"].includes(c.classification),
          "관측 신뢰도 정보가 잘못되었습니다.",
        );
    }
    for (const c of e.commands) {
      ok(
        (c.receivedAt === null || num(c.receivedAt, c.issuedAt, e.time)) &&
          (c.completedAt === null || num(c.completedAt, c.issuedAt, e.time)),
        "명령 수신·완료 시각이 잘못되었습니다.",
      );
      if (c.status === "completed")
        ok(c.completedAt !== null, "완료 명령의 시각이 없습니다.");
    }
    for (const r of e.radio) {
      ok(
        (r.from.id === "HQ" || ids.has(r.from.id)) &&
          (r.to.id === "HQ" || ids.has(r.to.id)) &&
          text(r.kind) &&
          text(r.from.role) &&
          text(r.from.callsign) &&
          text(r.to.role) &&
          text(r.to.callsign),
        "통신 발신·수신자가 잘못되었습니다.",
      );
      if (r.route === "down")
        ok(
          r.payload && cmdids.has(r.payload.commandId),
          "본부 명령 큐 연결이 잘못되었습니다.",
        );
      if (r.payload !== null) {
        ok(
          typeof r.payload === "object" && !Array.isArray(r.payload),
          "무전 자료가 잘못되었습니다.",
        );
        if (r.payload.commandId !== undefined)
          ok(
            cmdids.has(r.payload.commandId),
            "무전 명령 참조가 잘못되었습니다.",
          );
        if (r.payload.friends !== undefined)
          ok(
            Array.isArray(r.payload.friends) &&
              r.payload.friends.length <= 6 &&
              r.payload.friends.every(snapshotFriend),
            "아군 보고 자료가 잘못되었습니다.",
          );
        if (r.payload.contact !== undefined)
          ok(
            snapshotContact(r.payload.contact),
            "관측 보고 자료가 잘못되었습니다.",
          );
        if (r.payload.path !== undefined)
          ok(
            Array.isArray(r.payload.path) &&
              r.payload.path.length < 300 &&
              r.payload.path.every((p) => point(p) && !G.blocked(p)) &&
              point(r.payload.goal),
            "내부 이동 지시가 잘못되었습니다.",
          );
        if (r.payload.action !== undefined)
          ok(
            ["hold", "observe"].includes(r.payload.action),
            "내부 행동 지시가 잘못되었습니다.",
          );
      }
    }
    for (const f of Object.values(e.knowledge.friends))
      ok(
        snapshotFriend(f) &&
          e.radio.some(
            (r) =>
              r.route === "up" &&
              r.status === "delivered" &&
              r.payload?.friends?.some(
                (x) =>
                  x.id === f.id &&
                  x.observedAt === f.observedAt &&
                  x.x === f.x &&
                  x.y === f.y,
              ),
          ),
        "수신되지 않은 아군 정보가 본부에 있습니다.",
      );
    for (const c of Object.values(e.knowledge.contacts))
      ok(
        snapshotContact(c) &&
          e.radio.some(
            (r) =>
              r.route === "up" &&
              r.status === "delivered" &&
              r.payload?.contact?.id === c.id &&
              r.payload.contact.observedAt === c.observedAt &&
              r.payload.contact.x === c.x &&
              r.payload.contact.y === c.y,
          ),
        "수신되지 않은 관측 정보가 본부에 있습니다.",
      );
    return e;
  }
  function validateCampaign(s) {
    ok(
      Number.isSafeInteger(s.commandSequence) && s.commandSequence >= 0,
      "훈련 순번이 잘못되었습니다.",
    );
    ok(
      s.commandArchive === undefined || Array.isArray(s.commandArchive),
      "훈련 보관함 형식이 잘못되었습니다.",
    );
    const ids = new Set();
    for (const r of s.commandArchive || []) {
      ok(
        text(r.id) &&
          !ids.has(r.id) &&
          num(r.startedAt, 0, s.clock.elapsedSeconds) &&
          num(r.endedAt, r.startedAt, s.clock.elapsedSeconds) &&
          r.frame &&
          r.frame.id === r.id &&
          num(r.frame.time) &&
          r.frame.status === "ended" &&
          Array.isArray(r.frame.commands) &&
          Array.isArray(r.frame.radio) &&
          r.frame.radio.length <= 3100,
        "훈련 결과 보관본이 잘못되었습니다.",
      );
      ids.add(r.id);
      for (const m of r.frame.radio)
        ok(
          m &&
            text(m.id) &&
            text(m.body) &&
            m.from &&
            m.to &&
            text(m.from.name) &&
            text(m.to.name) &&
            text(m.eventId) &&
            num(m.createdAt, 0, r.frame.time),
          "보관 무전 기록이 잘못되었습니다.",
        );
    }
    return s;
  }
  const api = {
    ORDERS,
    initialize,
    begin,
    issue,
    step,
    resume,
    end,
    incapacitate,
    frame,
    validate,
    validateCampaign,
  };
  root.OverwatchCommand = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
