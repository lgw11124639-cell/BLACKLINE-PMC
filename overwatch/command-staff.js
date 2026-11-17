/* HQ duty assignments and delegated operational control. Decisions consume only delivered intelligence. */
(function (root) {
  "use strict";
  const get = (name, file) =>
      root[name] ||
      (typeof require === "function" ? require("./" + file) : null),
    P = () => get("OverwatchPersonnel", "personnel.js"),
    D = () => get("OverwatchCommand", "command.js"),
    B = () => get("OverwatchBattle", "battle.js"),
    M = () => get("OverwatchMissions", "missions.js"),
    G = () => get("OverwatchGeometry", "geometry.js");
  const copy = (x) => JSON.parse(JSON.stringify(x)),
    ok = (v, m) => {
      if (!v) throw Error(m);
    };
  function initialize(s) {
    if (!s.commandStaff)
      s.commandStaff = {
        version: 1,
        controllerId: null,
        instructorId: null,
        personnelId: null,
        delegated: true,
        autoSupport: true,
        history: [],
      };
    const c = s.commandStaff;
    c.members ??= [];
    c.market ??= [];
    c.sequence ??= 0;
    if (!c.market.length) fillMarket(s);
    return c;
  }
  function fillMarket(s) {
    const c = s.commandStaff;
    c.market = [];
    c.nextMarketAt = s.clock.elapsedSeconds + 43200;
    for (const duty of ["controller", "instructor", "personnel"])
      for (let i = 0; i < 3; i++) {
        const serial = ++c.sequence;
        c.market.push({
          id: "staff-candidate-" + serial,
          name: P().newName(s, serial + 1000),
          duty,
          age: 35 + i * 6,
          years: 12 + i * 5,
          dailySalary: 160000 + i * 70000,
          skills: Object.fromEntries(
            P().SKILLS.map((k) => [k, 72 + i * 8 + (k === "judgment" ? 5 : 0)]),
          ),
        });
      }
  }
  function refreshMarket(s) {
    const c = initialize(s);
    ok(
      s.commandExercise?.status !== "running",
      "복귀 후 지원 인력 시장을 갱신하세요.",
    );
    ok(
      s.clock.elapsedSeconds >= (c.nextMarketAt || 0),
      "지원 인력 시장은 12시간마다 갱신할 수 있습니다.",
    );
    fillMarket(s);
    P().recordEvent(s, "market-refreshed", "지원 인력 모집 후보 갱신");
  }
  function upgrade(s) {
    const c = initialize(s);
    if (c.marketVersion === 3) return;
    if (
      c.marketVersion === 2 &&
      !c.market.some((m) => m.duty === "personnel")
    ) {
      const existing = c.market.slice();
      fillMarket(s);
      c.market = [
        ...existing,
        ...c.market.filter((m) => m.duty === "personnel"),
      ];
    }
    // Transfer only already assigned HQ personnel; preserve their identity and paid contract.
    for (const key of ["controller", "instructor", "personnel"]) {
      const i = s.members.findIndex((m) => m.id === c[key + "Id"]);
      if (i >= 0) {
        const m = s.members.splice(i, 1)[0];
        m.duty = key;
        m.staffOnly = true;
        c.members.push(m);
      }
    }
    c.marketVersion = 3;
    P().diversifyMarket(s);
  }
  function hire(s, id, days = 30) {
    const c = initialize(s),
      candidate = c.market.find((m) => m.id === id);
    ok(candidate, "지원 인력 후보를 찾을 수 없습니다.");
    ok(
      !s.commandExercise || s.commandExercise.status !== "running",
      "작전 복귀 후 지원 인력을 채용하세요.",
    );
    ok(
      c.members.filter(
        (m) =>
          m.duty === candidate.duty &&
          m.contract.endsAt > s.clock.elapsedSeconds,
      ).length < 2,
      "직책별 지원 인력은 최대 2명입니다.",
    );
    ok(days === 30, "지원 인력 계약은 30일 단위입니다.");
    ok(c.members.length < 100, "지원 인력 계약 기록 한도입니다.");
    const cost = candidate.dailySalary * days;
    P().finance(s, -cost, "staff-contract", {
      staffId: id,
      duty: candidate.duty,
      days,
    });
    const m = {
      ...copy(candidate),
      id: "staff-" + ++c.sequence,
      staffOnly: true,
      status: "standby",
      fatigue: 0,
      stress: 0,
      injuries: [],
      aftereffects: [],
      activityId: null,
      contract: {
        startsAt: s.clock.elapsedSeconds,
        endsAt: s.clock.elapsedSeconds + days * 86400,
      },
      history: [],
    };
    c.members.push(m);
    c.market = c.market.filter((m) => m.id !== id);
    P().recordEvent(
      s,
      "recruited",
      m.name +
        " · " +
        {
          controller: "작전통제관",
          instructor: "훈련 교관",
          personnel: "인사관리관",
        }[m.duty] +
        " 별도 계약",
      { staffId: m.id },
    );
    return m;
  }
  function renew(s, id) {
    const c = initialize(s),
      m = c.members.find((m) => m.id === id);
    ok(m, "지원 인력을 찾을 수 없습니다.");
    P().finance(s, -m.dailySalary * 30, "staff-renewal", {
      staffId: id,
      days: 30,
    });
    m.contract.endsAt =
      Math.max(s.clock.elapsedSeconds, m.contract.endsAt) + 30 * 86400;
  }
  function staff(s, key) {
    return (
      [...(s.commandStaff?.members || []), ...s.members].find(
        (m) => m.id === s.commandStaff?.[key + "Id"],
      ) || null
    );
  }
  function reserved(s, id) {
    return (
      !!id &&
      ["controller", "instructor", "personnel"].some(
        (k) => s.commandStaff?.[k + "Id"] === id,
      )
    );
  }
  function available(s, m) {
    return (
      !!m &&
      m.status === "standby" &&
      !m.activityId &&
      !m.injuries.some((w) => !w.healed) &&
      m.contract.endsAt > s.clock.elapsedSeconds &&
      m.fatigue <= 70 &&
      m.stress <= 75
    );
  }
  function assign(s, key, id) {
    ok(
      ["controller", "instructor", "personnel"].includes(key),
      "지원 직책이 잘못되었습니다.",
    );
    const c = initialize(s);
    ok(
      !s.commandExercise ||
        s.commandExercise.status !== "running" ||
        !c[key + "Id"],
      "진행 중인 지휘 담당자는 복귀 후 교대하세요.",
    );
    if (id) {
      const m = [...c.members, ...s.members].find((m) => m.id === id);
      ok(!m?.staffOnly || m.duty === key, "지원 인력의 전문 직책이 다릅니다.");
      ok(available(s, m), "건강하고 대기 중인 본부 대원이 필요합니다.");
      ok(
        !s.squads.some((q) => [q.observerId, q.sniperId].includes(id)),
        "현장 저격조와 본부 직책은 중복할 수 없습니다.",
      );
      ok(
        !reserved(s, id) || c[key + "Id"] === id,
        "다른 본부 직책에 배정된 인원입니다.",
      );
    }
    c[key + "Id"] = id || null;
    c.history.push({
      at: s.clock.elapsedSeconds,
      type: "assignment",
      duty: key,
      memberId: id || null,
    });
    c.history = c.history.slice(-100);
  }
  function ready(s, training = false) {
    if (!s.commandStaff?.delegated) return null;
    const m = staff(s, training ? "instructor" : "controller");
    return available(s, m)
      ? null
      : (training ? "훈련 교관" : "작전통제관") +
          "을 본부 지휘 편성에 배정하세요.";
  }
  function authority(s, e) {
    const training = !e.mission,
      m = staff(s, training ? "instructor" : "controller");
    if (!available(s, m)) return null;
    return {
      id: m.id,
      name: m.name,
      callsign: training ? "INSTRUCTOR" : "CONTROL",
      role: training ? "훈련 교관" : "작전통제관",
    };
  }
  function note(s, e, a, kind, body, data = {}) {
    const ev = D().internals.event(e, kind, { staffId: a.id, ...copy(data) });
    D().internals.radio(
      s,
      e,
      e.squads[0],
      "up",
      a.id,
      "HQ",
      "decision",
      a.role + " " + a.name + ". " + body,
      ev,
    );
  }
  function order(s, e, a, q, kind, target) {
    const c = D().issue(s, q.callsign, kind, target, null, a);
    if (
      e.control.watchSectors?.[q.callsign] &&
      ["cover", "recon"].includes(kind)
    )
      c.watchSector = copy(e.control.watchSectors[q.callsign]);
    e.control.orders[q.callsign] = {
      id: c.id,
      kind,
      target: target ? copy(target) : null,
    };
    return c;
  }
  function regions(e) {
    const g = G().MAP,
      center = e.mission?.knowledge.groundSearch?.point ||
        (e.mission?.contract.task === "recon" &&
        e.mission.knowledge.reconProgress?.currentId != null
          ? e.mission.reconPlan?.areas.find(
              (a) => a.id === e.mission.knowledge.reconProgress.currentId,
            )?.point
          : null) ||
        e.mission?.contract.interest ||
        g.sector ||
        e.squads[0]?.sector ||
        G().MAP.sector || { x: 500, y: 150 };
    if (e.control?.watchSectors)
      return e.squads.map((q) => {
        const band = e.control.watchSectors[q.callsign];
        return G().project({
          x: (band.x1 + band.x2) / 2,
          y: Math.max(20, Math.min(g.height - 20, center.y)),
        });
      });
    if (
      e.mission?.agencyControl &&
      !["recon", "eliminate", "interdict"].includes(e.mission.contract.task)
    ) {
      const start = e.mission.contract.insertion,
        d = Math.max(1, G().distance(start, center));
      return e.squads.map((q, i) => {
        if (q.assignment?.kind === "counter-sniper") return G().project(center);
        const focus =
          q.assignment?.kind === "corridor-cover" &&
          e.mission.contract.task !== "rescue"
            ? e.mission.taskGoal
            : center;
        const distance = Math.max(1, G().distance(start, focus)),
          step = Math.min(
            distance * 0.65,
            G().MAP.width *
              (q.assignment?.kind === "flank-security" ? 0.32 : 0.28),
          );
        const p = {
          x: start.x + ((focus.x - start.x) / distance) * step,
          y: start.y + ((focus.y - start.y) / distance) * step,
        };
        if (q.assignment?.kind === "flank-security")
          p.x += G().MAP.width * 0.15;
        return G().project({
          x: Math.max(12, Math.min(g.width - 12, p.x)),
          y: Math.max(12, Math.min(g.height - 12, p.y)),
        });
      });
    }
    return e.squads.map((q, i) =>
      G().project({
        x: Math.max(
          12,
          Math.min(
            g.width - 12,
            center.x +
              (i - (e.squads.length - 1) / 2) * Math.min(220, g.width * 0.22),
          ),
        ),
        y: Math.max(
          12,
          Math.min(
            g.height - 12,
            center.y + (i % 2 ? Math.min(35, g.height * 0.1) : 0),
          ),
        ),
      }),
    );
  }
  function extractionControl(s, e, a, c, frame) {
    const m = e.mission,
      transport = m.knowledge.transports.find((t) => t.id === "primary");
    if (!transport || transport.manifest?.length) return;
    const descent = Math.max(
      60,
      ...frame.friends
        .filter((f) => f.roofId && !f.home)
        .map((f) => (f.elevation || 0) * 2 + 30),
    );
    if (e.time - (c.lastPickupDecisionAt ?? -1000) < descent) return;
    const crewPresent = m.knowledge.crew.some((crew) =>
      crew.id.startsWith("primary"),
    );
    if (c.pendingPickup) {
      if (
        !crewPresent &&
        [
          "home",
          "air-hold",
          "pickup-hold",
          "ground-hold",
          "route-blocked",
          "loading",
        ].includes(transport.state)
      ) {
        const pickup = c.pendingPickup;
        c.pendingPickup = null;
        M().requestReturn(s, { pickup, authority: a });
      }
      return;
    }
    const failed = frame.commands.findLast(
      (command) =>
        command.kind === "withdraw" &&
        command.status === "failed" &&
        command.id !== c.handledWithdrawFailure,
    );
    if (
      !failed &&
      !["air-hold", "pickup-hold", "ground-hold", "route-blocked"].includes(
        transport.state,
      )
    )
      return;
    if (failed) c.handledWithdrawFailure = failed.id;
    c.rejectedPickups ??= [];
    c.pickupAttempts ??= 0;
    if (c.pickupAttempts >= 6) {
      if (!m.abortRequested) {
        note(
          s,
          e,
          a,
          "controller-recovery-failed",
          "대체 회수 지점 확보에 실패했다. 작전을 중단하고 실제 회수·수색 절차로 전환한다.",
        );
        M().requestReturn(s, { abort: true, authority: a });
      }
      return;
    }
    const old = m.extractionPoint,
      range = G().MAP.width < 500 ? 55 : 120;
    if (!c.rejectedPickups.some((p) => G().distance(p, old) < 1))
      c.rejectedPickups.push(copy(old));
    c.rejectedPickups = c.rejectedPickups.slice(-8);
    const knownThreats = frame.contacts.filter(
      (t) =>
        !t.expired &&
        t.classification === "armed-person" &&
        !["dead", "down"].includes(t.medicalCondition),
    );
    const friends = frame.friends.filter((f) => !f.home && !f.boardedBy);
    const choices = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, -1],
      [-1, -1],
    ]
      .map(([x, y]) =>
        G().project({
          x: Math.max(12, Math.min(G().MAP.width - 12, old.x + x * range)),
          y: Math.max(12, Math.min(G().MAP.height - 12, old.y + y * range)),
        }),
      )
      .concat(
        failed && friends.length
          ? [
              G().project({
                x: friends.reduce((n, f) => n + f.x, 0) / friends.length,
                y: friends.reduce((n, f) => n + f.y, 0) / friends.length,
              }),
            ]
          : [],
      )
      .filter(
        (p) =>
          G().distance(p, old) > range * 0.5 &&
          !c.rejectedPickups.some((q) => G().distance(p, q) < 15) &&
          friends.every((f) => G().distance(p, f) < 2 || G().path(f, p).length),
      )
      .map((p) => ({
        p,
        risk: knownThreats.reduce(
          (n, t) =>
            n +
            (G().distance(p, t) < (G().MAP.width < 500 ? 45 : 190) ? 100 : 0),
          0,
        ),
        walk: friends.reduce((n, f) => n + G().distance(f, p), 0),
      }))
      .sort((x, y) => x.risk - y.risk || x.walk - y.walk);
    if (!choices.length) return;
    c.pickupAttempts++;
    note(
      s,
      e,
      a,
      "controller-pickup-replanned",
      "수송 승무원의 접근 보류 보고 확인. 알려진 위협과 이동 경로를 검토해 대체 회수 지점으로 재집결한다.",
      {
        transportId: transport.id,
        reportedAt: transport.reportedAt,
        reason: failed ? "reported-withdrawal-route-failure" : transport.state,
        pickup: choices[0].p,
        attempt: c.pickupAttempts,
      },
    );
    c.lastPickupDecisionAt = e.time;
    if (crewPresent) c.pendingPickup = choices[0].p;
    else M().requestReturn(s, { pickup: choices[0].p, authority: a });
  }
  function missionProgress(s, e, a, c, frame) {
    const m = e.mission;
    if (m?.agencyLeaderUnavailable && !m.hqInfantry) return false;
    if (
      (!m?.agencyControl && !m?.groundSearch) ||
      m.fieldStartedAt == null ||
      m.contract.task === "recon" ||
      m.returnRequested ||
      m.knowledge.objective !== "pending"
    )
      return false;
    const phase =
        m.groundSearch && !m.taskLinked
          ? "search:" +
            m.groundSearch.pass +
            ":" +
            (m.groundSearch.lead?.id ||
              m.groundSearch.areas.find((a) => a.checkedAt == null)?.id ||
              "complete") +
            ":" +
            m.groundSearch.securedIds.length
          : !m.agencyControl?.everAuthorized
            ? "preparation"
            : m.contract.task === "rescue" && !m.taskLinked
              ? "approach"
              : "escort",
      actors = m.knowledge.actors || [],
      anchor = actors.find(
        (x) =>
          x.id ===
          (phase === "escort"
            ? "agency-protected"
            : m.taskLeaderId ||
              (["eliminate", "interdict"].includes(m.contract.task)
                ? "agency-infantry-0"
                : m.contract.task === "rescue"
                  ? "agency-rescuer"
                  : "agency-guide")),
      );
    if (!anchor || e.time - anchor.observedAt > 30) return false;
    const goal =
      phase === "escort"
        ? m.taskGoal
        : m.groundSearch
          ? M().searchPoint(e)
          : m.contract.interest ||
            G().MAP.sector ||
            e.squads[0]?.sector ||
            G().MAP.sector || { x: 500, y: 150 };
    let last = anchor,
      remaining = 0;
    const route = G().path(anchor, goal);
    for (const p of route) {
      remaining += G().distance(last, p);
      last = p;
    }
    if (!route.length && G().distance(anchor, goal) > 2)
      remaining = G().MAP.width * 3;
    let w = c.progressWatch;
    if (!w || w.phase !== phase)
      w = c.progressWatch = {
        phase,
        bestRemaining: remaining,
        lastUsefulAt: e.time,
        visited: [],
        replanAt: null,
      };
    let useful = remaining < w.bestRemaining - 5;
    if (useful) w.bestRemaining = remaining;
    for (const f of [
      ...frame.friends.filter((f) => f.age < 20 && !f.home && !f.boardedBy),
      ...actors.filter(
        (f) =>
          f.hqMemberId &&
          e.time - f.observedAt < 25 &&
          f.health.alive &&
          !f.home &&
          !f.boardedBy,
      ),
      anchor,
    ]) {
      const key =
        f.id +
        ":" +
        Math.floor(f.x / 20) +
        ":" +
        Math.floor(f.y / 20) +
        ":" +
        (f.roofId || "ground");
      if (!w.visited.includes(key)) {
        w.visited.push(key);
        useful = true;
      }
    }
    w.goalDistances ||= {};
    for (const f of frame.friends.filter(
      (f) => f.age < 20 && !f.home && !f.boardedBy,
    )) {
      const target = e.squads.find((q) => q.callsign === f.callsign)?.tactical
        ?.position;
      if (!target) continue;
      const key =
          f.id +
          ":" +
          Math.round(target.x / 10) +
          ":" +
          Math.round(target.y / 10) +
          ":" +
          (target.roofId || "ground"),
        distance = G().distance(f, target);
      const old = w.goalDistances[key];
      if (old !== undefined && distance < old - 5) useful = true;
      if (old === undefined || distance < old - 5)
        w.goalDistances[key] = distance;
    }
    w.visited = w.visited.slice(-256);
    if (useful) {
      w.lastUsefulAt = e.time;
      return false;
    }
    const stalled = e.time - w.lastUsefulAt;
    if (stalled >= 600 && w.replanAt !== null) {
      note(
        s,
        e,
        a,
        "controller-progress-abort",
        "기관 구출·호송 경로가 같은 구역에서 반복되고 재전개 후에도 목표 진전이 없다. 수행 불가로 판단해 조 전체 철수·회수를 지시한다.",
        { lastProgressAt: w.lastUsefulAt, remaining: w.bestRemaining },
      );
      M().requestReturn(s, { abort: true, authority: a });
      return true;
    }
    if (stalled >= 300 && w.replanAt === null) {
      const q =
        e.squads.find((q) => q.assignment?.kind === "corridor-cover") ||
        e.squads[0];
      if (!q) {
        const Infantry = get("OverwatchInfantry", "infantry.js"),
          force = m.hqInfantry;
        note(
          s,
          e,
          a,
          "controller-infantry-route-stalled",
          "투입된 저격팀이 없다. 본부 보병팀의 수색·엄호 구역을 재검토해 분대장에게 재지시한다.",
          { lastProgressAt: w.lastUsefulAt },
        );
        if (force)
          for (const call of ["ALPHA", "BRAVO", "CHARLIE"]) {
            const d = force.teamDirectives?.[call] || force.directive;
            if (
              d?.mode === "withdraw" ||
              (d?.source === "headquarters" && d.mode !== "auto")
            )
              continue;
            if (
              actors.some(
                (a) =>
                  a.hqMemberId &&
                  a.hqTeam === call &&
                  a.health.alive &&
                  a.health.conscious &&
                  e.time - a.observedAt < 25,
              )
            )
              Infantry.command(
                s,
                "advance",
                G().project({ x: goal.x, y: goal.y }),
                "controller",
                call,
              );
          }
        w.replanAt = e.time;
        return false;
      }
      note(
        s,
        e,
        a,
        "controller-route-stalled",
        "기관 이동이 같은 구역에서 반복된다. 보병을 정지시키고 엄호조 한 조의 관측 진지·진출로를 다시 검토한다.",
        { lastProgressAt: w.lastUsefulAt, remaining: w.bestRemaining },
      );
      const command = order(
        s,
        e,
        a,
        q,
        "cover",
        G().project({ x: anchor.x, y: anchor.y }),
      );
      command.reposition = true;
      const blocked = q.tactical?.position;
      if (blocked)
        q.avoidPositions = [
          ...(q.avoidPositions || []),
          { x: blocked.x, y: blocked.y, at: e.time },
        ].slice(-6);
      if (m.agencyControl) m.agencyControl.scanCommandId = command.id;
      w.replanAt = e.time;
    }
    return false;
  }
  function trainingEnabled(s) {
    return (
      s.commandStaff?.autoTraining !== false &&
      available(s, staff(s, "instructor"))
    );
  }
  function manageTraining(s, seconds = 0) {
    const c = s.commandStaff;
    if (
      !c ||
      !trainingEnabled(s) ||
      s.activeMission ||
      s.commandExercise?.status === "running" ||
      s.contracts.some((x) => x.status === "accepted") ||
      s.ui.tab === "command"
    )
      return false;
    const instructor = staff(s, "instructor");
    let changed = false;
    if (seconds > 0 && s.activities.some((a) => a.status === "running")) {
      P().elapse(s, seconds);
      changed = true;
    }
    if (!trainingEnabled(s)) return changed;
    const day = Math.floor(s.clock.elapsedSeconds / 86400);
    const plan = (c.trainingPlan ||= {
      day,
      spent: 0,
      reviewed: {},
      status: "대원 상태 검토",
      lastAt: s.clock.elapsedSeconds,
    });
    if (plan.day !== day) {
      plan.day = day;
      plan.spent = 0;
    }
    if (s.activities.some((a) => a.status === "running" && a.instructorId))
      return changed;
    const pool = s.members
      .filter(
        (m) =>
          !m.activityId &&
          m.contract.endsAt > s.clock.elapsedSeconds + 6 * 3600 &&
          !P().injured(m) &&
          ![c.controllerId, c.instructorId].includes(m.id),
      )
      .sort(
        (a, b) => (plan.reviewed[a.id] ?? -1) - (plan.reviewed[b.id] ?? -1),
      );
    if (!pool.length) {
      plan.status = "가용 대원 대기 · 부상자는 진료 필요";
      return changed;
    }
    const tired = pool
      .filter((m) => m.fatigue >= 25 || m.stress >= 30)
      .sort((a, b) => b.fatigue + b.stress - a.fatigue - a.stress)[0];
    let request;
    if (tired) request = { kind: "rest", memberIds: [tired.id], hours: 6 };
    else if (pool.length < 2) {
      plan.status = "훈련 가능한 대원 2명 이상 대기";
      return changed;
    } else {
      const count =
          plan.spent + 200000 <= 500000 && s.headquarters.funds >= 200000
            ? Math.min(4, pool.length)
            : 2,
        cohort = pool.slice(0, count),
        cost = 100000 * Math.ceil(count / 2),
        course = [...P().SKILLS].sort(
          (a, b) =>
            cohort.reduce(
              (n, m) =>
                n +
                (P()
                  .trainingPriorities(m)
                  .find((x) => x.skill === b)?.need || 0),
              0,
            ) -
            cohort.reduce(
              (n, m) =>
                n +
                (P()
                  .trainingPriorities(m)
                  .find((x) => x.skill === a)?.need || 0),
              0,
            ),
        )[0];
      if (plan.spent + cost <= 500000 && s.headquarters.funds >= cost)
        request = {
          kind: "training",
          memberIds: cohort.map((m) => m.id),
          course,
          hours: 4,
        };
      else request = { kind: "rest", memberIds: [pool[0].id], hours: 6 };
    }
    const pair = s.squads.find(
      (q) =>
        pool.some((m) => m.id === q.observerId) &&
        pool.some((m) => m.id === q.sniperId) &&
        P().relationship(s, q).cohesion < 75,
    );
    if (
      request.kind === "training" &&
      pair &&
      (plan.sessions || 0) % 3 === 2 &&
      plan.spent + 200000 <= 500000 &&
      s.headquarters.funds >= 200000
    )
      request = {
        kind: "pair",
        callsign: pair.callsign,
        memberIds: [pair.observerId, pair.sniperId],
      };
    const activity = P().start(s, { ...request, instructorId: instructor.id });
    if (["training", "pair"].includes(activity.kind))
      plan.sessions = (plan.sessions || 0) + 1;
    plan.spent += activity.cost;
    plan.lastAt = s.clock.elapsedSeconds;
    activity.memberIds.forEach(
      (id) => (plan.reviewed[id] = s.clock.elapsedSeconds),
    );
    plan.status =
      activity.memberIds
        .map((id) => s.members.find((m) => m.id === id).name)
        .join("·") +
      " · " +
      (activity.kind === "pair"
        ? "조 단위 협동 훈련"
        : activity.kind === "rest"
          ? "피로 회복·휴식"
          : P().LABELS[activity.course] + " 보완 훈련");
    return true;
  }
  function personnelEnabled(s) {
    return (
      available(s, staff(s, "personnel")) &&
      s.commandStaff?.autoPersonnel !== false
    );
  }
  function managePersonnel(s) {
    if (
      !personnelEnabled(s) ||
      s.activeMission ||
      s.commandExercise?.status === "running"
    )
      return false;
    let changed = false;
    const c = s.commandStaff;
    for (const m of s.members.filter(
      (m) =>
        P().injured(m) &&
        !m.activityId &&
        m.contract.endsAt > s.clock.elapsedSeconds,
    )) {
      const plan = P().treatmentPlan(m);
      if (s.headquarters.funds < plan.cost) {
        c.personnelStatus = "진료 예산 대기";
        continue;
      }
      const q = s.squads.find((q) => [q.observerId, q.sniperId].includes(m.id));
      if (q) {
        const busy = s.activities.some(
          (a) =>
            a.status === "running" &&
            a.memberIds.some((id) => [q.observerId, q.sniperId].includes(id)),
        );
        if (busy) continue;
        P().clearSquad(s, q.callsign);
      }
      P().start(s, { kind: "treatment", memberIds: [m.id] });
      changed = true;
    }
    // Keep operating cash and outstanding mission costs outside the recruitment budget.
    const I = get("OverwatchInfantry", "infantry.js"),
      h = I.initialize(s),
      reserve =
        Math.max(5000000, Math.ceil(s.headquarters.funds * 0.25)) +
        (s.operations?.payable || 0),
      canPay = (cost) => s.headquarters.funds - cost >= reserve;
    if (h.deploy) {
      for (const member of h.members.filter((m) => m.status === "expired")) {
        if (canPay(member.dailySalary * 30)) {
          I.renew(s, member.id);
          changed = true;
        }
      }
      // Fill a complete set of missing roles before buying the next squad.
      for (let team = 1; team <= 3; team++) {
        const missing = h.market.filter(
          (c) =>
            h.members.filter(
              (m) =>
                m.role === c.role &&
                !["deceased", "missing"].includes(m.status),
            ).length < team,
        );
        const cost = missing.reduce((n, c) => n + c.dailySalary * 30, 0);
        if (
          !canPay(cost) ||
          h.members.length + missing.length > 100 ||
          h.members.filter((m) => !["deceased", "missing"].includes(m.status))
            .length +
            missing.length >
            20
        )
          break;
        for (const c of missing) {
          I.hire(s, c.id);
          changed = true;
        }
      }
    }
    // Complete missing pairs within the remaining budget; busy personnel still count.
    for (let team = 1; team <= 3; team++) {
      const plans = [];
      for (const role of ["observer", "sniper"]) {
        const existing = s.members.filter(
          (m) =>
            m.specialty === role && m.contract?.endsAt > s.clock.elapsedSeconds,
        ).length;
        if (existing >= team) continue;
        const expired = s.members
          .filter(
            (m) =>
              m.specialty === role &&
              m.contract?.endsAt <= s.clock.elapsedSeconds,
          )
          .sort((a, b) => a.dailySalary - b.dailySalary)[0];
        const candidate = s.market.candidates
          .filter((m) => m.specialty === role)
          .sort(
            (a, b) =>
              (b.skills[role === "sniper" ? "shooting" : "observation"] +
                b.skills.judgment) /
                b.dailySalary -
              (a.skills[role === "sniper" ? "shooting" : "observation"] +
                a.skills.judgment) /
                a.dailySalary,
          )[0];
        if (expired || candidate)
          plans.push({ member: expired || candidate, renew: !!expired });
      }
      const needed = ["observer", "sniper"].filter(
        (role) =>
          s.members.filter(
            (m) =>
              m.specialty === role &&
              m.contract?.endsAt > s.clock.elapsedSeconds,
          ).length < team,
      ).length;
      if (
        plans.length !== needed ||
        !canPay(plans.reduce((n, p) => n + p.member.dailySalary * 30, 0)) ||
        s.members.length + plans.filter((p) => !p.renew).length >
          P().MAX_MEMBERS
      )
        break;
      for (const p of plans) {
        if (p.renew) P().renew(s, p.member.id, 30);
        else P().hire(s, p.member.id, 30);
        changed = true;
      }
    }
    changed = I.formTeams(s) || changed;
    const assigned = new Set(
      s.squads.flatMap((q) => [q.observerId, q.sniperId]),
    );
    const pool = s.members.filter(
      (m) => !assigned.has(m.id) && P().readiness(s, m) === null,
    );
    const observers = pool
      .filter((m) => m.specialty === "observer")
      .sort(
        (a, b) =>
          P().effectiveSkills(b).judgment - P().effectiveSkills(a).judgment,
      );
    const snipers = pool
      .filter((m) => m.specialty === "sniper")
      .sort(
        (a, b) =>
          P().effectiveSkills(b).shooting - P().effectiveSkills(a).shooting,
      );
    for (const call of ["ALPHA", "BRAVO", "CHARLIE"]) {
      if (
        s.squads.some((q) => q.callsign === call) ||
        !observers.length ||
        !snipers.length
      )
        continue;
      P().assign(s, call, observers.shift().id, snipers.shift().id);
      changed = true;
    }
    c.personnelStatus =
      "진료 자동 배정 · 가용 " +
      s.members.filter((m) => P().readiness(s, m) === null).length +
      "명 · " +
      s.squads.length +
      "개 조 편성 · 본부 보병 " +
      h.members.filter((m) => !["deceased", "missing"].includes(m.status))
        .length +
      "/20명 · 보병 " +
      I.squads(s).length +
      "/3개 분대 · 운영비 25%(최소 500만원)·미지급금 보존 채용";
    return changed;
  }
  function manageHeadquarters(s, seconds = 0) {
    let changed = managePersonnel(s);
    if (trainingEnabled(s)) changed = manageTraining(s, seconds) || changed;
    else if (
      personnelEnabled(s) &&
      seconds > 0 &&
      s.activities.some((a) => a.status === "running")
    ) {
      P().elapse(s, seconds);
      changed = true;
    }
    return managePersonnel(s) || changed;
  }
  function friendlyCover(s, e, a, c, frame) {
    if (
      !e.mission ||
      e.mission.returnRequested ||
      e.time - (c.lastFriendlyCoverAt ?? -100) < 15
    )
      return;
    const threatened = frame.friends.filter(
      (f) =>
        f.age < 25 &&
        f.health?.alive &&
        !f.home &&
        !f.boardedBy &&
        !f.waitingForDeployment &&
        (f.underFire || f.health.wounds.some((w) => !w.treated)),
    );
    threatened.sort(
      (x, y) =>
        Number(!y.health.conscious) -
        Number(!x.health.conscious) +
        y.health.wounds
          .filter((w) => !w.treated)
          .reduce((n, w) => n + w.severity, 0) -
        x.health.wounds
          .filter((w) => !w.treated)
          .reduce((n, w) => n + w.severity, 0),
    );
    const patient = threatened[0];
    if (!patient) return;
    const candidates = e.squads
      .filter(
        (q) =>
          q.callsign !== patient.callsign &&
          !q.displacement &&
          !(q.emergencyRepositionUntil > e.time),
      )
      .map((q) => ({
        q,
        sniper: frame.friends.find((f) => f.id === q.sniperId),
        pair: frame.friends.filter((f) => f.callsign === q.callsign),
      }))
      .filter(
        (x) =>
          x.pair.length === 2 &&
          x.pair.every(
            (f) =>
              f.age < 25 &&
              f.health?.alive &&
              f.health.conscious &&
              !f.home &&
              !f.boardedBy &&
              !f.waitingForDeployment &&
              !f.health.aid &&
              !f.health.wounds.some((w) => !w.treated),
          ),
      )
      .sort(
        (x, y) =>
          G().distance(x.sniper, patient) - G().distance(y.sniper, patient),
      );
    const choice = candidates[0];
    if (!choice) return;
    c.lastFriendlyCoverAt = e.time;
    const current = e.commands.find((x) => x.id === choice.q.commandId);
    if (
      choice.q.friendlySupportTarget === patient.id &&
      current?.kind === "cover" &&
      !["failed", "cancelled", "superseded"].includes(current.status)
    ) {
      choice.q.urgentSupportUntil = e.time + 30;
      return;
    }
    const contact = frame.contacts
      .filter(
        (x) =>
          x.current &&
          x.classification === "armed-person" &&
          x.confidence >= 0.82 &&
          !["down", "dead"].includes(x.medicalCondition) &&
          G().distance(x, patient) < 600,
      )
      .sort(
        (x, y) =>
          Number(!!y.combatActive) - Number(!!x.combatActive) ||
          G().distance(x, patient) - G().distance(y, patient),
      )[0];
    const center = e.mission.contract.interest || G().MAP.sector || patient,
      d = Math.max(1, G().distance(center, patient));
    const point =
      contact ||
      G().project({
        x: Math.max(
          10,
          Math.min(
            G().MAP.width - 10,
            patient.x + ((center.x - patient.x) / d) * 70,
          ),
        ),
        y: Math.max(
          10,
          Math.min(
            G().MAP.height - 10,
            patient.y + ((center.y - patient.y) / d) * 70,
          ),
        ),
      });
    const command = order(s, e, a, choice.q, "cover", G().project(point));
    command.protectPosition = {
      x: patient.x,
      y: patient.y,
      ...(patient.roofId ? { roofId: patient.roofId } : {}),
    };
    command.reposition =
      !G().clear(choice.sniper, patient) ||
      !G().clear(choice.sniper, point) ||
      G().distance(choice.sniper, point) >
        (choice.sniper.weapon?.range || 1100);
    if (contact)
      command.supportContact = {
        ...copy(contact),
        lastSeen: contact.observedAt,
      };
    choice.q.friendlySupportTarget = patient.id;
    choice.q.urgentSupportUntil = e.time + 45;
    note(
      s,
      e,
      a,
      "controller-friendly-cover",
      patient.callsign +
        " 아군 피격·부상 보고 수신. " +
        choice.q.callsign +
        " 엄호 전환. " +
        (contact
          ? "식별된 위협에 대한 사격선을 확보한다."
          : "발사원 미식별. 부상 조 주변 접근로를 관측하고 엄호 진지를 확보한다."),
      {
        callsign: choice.q.callsign,
        protectedId: patient.id,
        position: command.protectPosition,
        observedAt: patient.observedAt,
        contactId: contact?.id || null,
        reposition: command.reposition,
      },
    );
  }
  function assessCombatRisk(s, e, a, c, frame) {
    const m = e.mission;
    if (!m || m.returnRequested || m.fieldStartedAt == null) return false;
    const fresh = [
      ...frame.friends,
      ...(frame.supportActors || [])
        .filter((f) => f.hqMemberId)
        .map((f) => ({ ...f, age: e.time - f.observedAt })),
    ].filter(
      (f) =>
        f.age < 25 &&
        !f.home &&
        !f.boardedBy &&
        !f.waitingForDeployment &&
        f.health?.alive &&
        f.health.conscious,
    );
    const remaining = (w) =>
      w ? w.loaded + (w.magazines || []).reduce((n, v) => n + v, 0) : null;
    const empty = fresh.filter(
      (f) => remaining(f.weapon) === 0 && remaining(f.sidearm) === 0,
    );
    if (
      fresh.length >= 2 &&
      empty.length >= Math.max(2, Math.ceil(fresh.length / 2))
    ) {
      c.ammoRiskSince ??= e.time;
      let active = m.transports.some(
        (t) => t.trip === "supply" && t.state !== "home",
      );
      if (
        s.commandStaff.autoSupport &&
        m.supports.supply < m.contract.support.supply &&
        !active
      ) {
        try {
          M().requestSupport(s, "supply", { x: empty[0].x, y: empty[0].y });
          active = true;
          note(
            s,
            e,
            a,
            "controller-ammo-support",
            "수신 탄약 보고에서 교전 능력 부족 확인. 잔여 계약 재보급을 요청한다.",
            { memberIds: empty.map((f) => f.id) },
          );
        } catch (error) {
          c.lastSupportFailure = error.message;
        }
      }
      if (
        !active &&
        m.supports.supply >= m.contract.support.supply &&
        e.time - c.ammoRiskSince >= 45
      ) {
        note(
          s,
          e,
          a,
          "controller-ammo-withdraw",
          "복수 대원의 주·보조무장 탄약 고갈 보고 확인. 가용 재보급이 없어 엄호 철수를 지시한다.",
          { memberIds: empty.map((f) => f.id) },
        );
        M().requestReturn(s, { abort: true, authority: a });
        return true;
      }
    } else c.ammoRiskSince = null;
    // The agency commands its own force; only headquarters units affect our risk decisions.
    return false;
  }
  function tick(s, e) {
    if (!s.commandStaff?.delegated || !e.battle || e.status !== "running")
      return;
    const a = authority(s, e);
    if (!a) return;
    e.commandAuthority = a;
    e.commandAuthorities ??= [];
    if (!e.commandAuthorities.some((x) => x.id === a.id))
      e.commandAuthorities.push(copy(a));
    e.battle.observerAutonomy = true;
    if (!e.control)
      e.control = {
        version: 1,
        staffId: a.id,
        phase: "waiting",
        orders: {},
        coverage: {},
        lastAssess: -100,
        lastSupport: -100,
        decisions: [],
      };
    const c = e.control;
    if (e.mission && !c.watchSectors) {
      c.watchSectors = {};
      for (const [i, q] of e.squads.entries()) {
        const width = G().MAP.width / e.squads.length;
        c.watchSectors[q.callsign] = {
          x1: Math.max(10, i * width),
          x2: Math.min(G().MAP.width - 10, (i + 1) * width),
          y1: 10,
          y2: G().MAP.height - 10,
          label:
            e.squads.length === 1
              ? "전체 구역"
              : e.squads.length === 2
                ? ["서부", "동부"][i]
                : ["서부", "중앙", "동부"][i],
        };
      }
    }
    if (e.mission)
      for (const [i, q] of e.squads.entries())
        if (!q.assignment) {
          const roles = ["eliminate", "interdict"].includes(
            e.mission.contract.task,
          )
            ? [
                ["target-hunter", "지정 표적 식별·정밀 사격"],
                ["flank-security", "표적 접근로·퇴로 관측"],
                ["counter-sniper", "경계 병력 감시·대저격"],
              ]
            : e.squads.length === 1
              ? [["overwatch", "지역 관측·저격 엄호"]]
              : [
                  ["counter-sniper", "담당 구역 관측·대저격"],
                  ["corridor-cover", "본부 보병 진출로·구출 엄호"],
                  ["flank-security", "측후방·철수로 경계"],
                ];
          q.assignment = {
            kind: roles[i][0],
            label: roles[i][1],
            assignedAt: e.time,
          };
          note(
            s,
            e,
            a,
            "controller-team-assigned",
            q.callsign +
              " · " +
              q.assignment.label +
              " 임무를 부여한다. 관측수가 조 내부 이동·사격을 지휘한다.",
            { callsign: q.callsign, assignment: q.assignment.kind },
          );
        }
    if (c.staffId !== a.id) {
      const previousId = c.staffId;
      c.staffId = a.id;
      c.lastAssess = -100;
      note(
        s,
        e,
        a,
        "controller-handover",
        "지휘 직책 교대를 확인했다. 수신 정보와 기존 임무를 인계한다.",
        { previousId },
      );
    }
    c.coverage ??= {};
    const chief = staff(s, e.mission ? "controller" : "instructor"),
      assessInterval = Math.max(
        8,
        18 - Math.floor(P().effectiveSkills(chief).judgment / 10),
      );
    if (e.time - c.lastAssess < assessInterval) return;
    c.lastAssess = e.time;
    if (e.mission && !M().allowTeams(e)) return;
    if (e.mission?.phase === "infiltration") {
      c.phase = "infiltration";
      if (
        e.squads.some(
          (q) =>
            e.commands.findLast(
              (command) =>
                command.callsign === q.callsign && command.kind === "move",
            )?.status === "failed",
        )
      ) {
        note(
          s,
          e,
          a,
          "controller-infiltration-blocked",
          "보고된 도보 투입 경로를 확보하지 못했다. 위험한 진입을 중단하고 회수한다.",
        );
        M().requestReturn(s, { abort: true, authority: a });
      }
      return;
    }
    const frame = D().frame(s),
      known = frame.contacts.filter((x) => !x.expired),
      friends = [
        ...frame.friends,
        ...(frame.supportActors || [])
          .filter((f) => f.hqMemberId)
          .map((f) => ({ ...f, age: e.time - f.observedAt })),
      ].filter((x) => !x.home && !x.boardedBy),
      casualties = friends.filter(
        (x) =>
          x.health?.alive &&
          (!x.health.conscious ||
            x.health.wounds.some((w) => !w.treated && w.severity === 3)),
      );
    if (e.mission?.returnRequested) {
      c.phase = "extraction";
      extractionControl(s, e, a, c, frame);
      return;
    }
    const objective = e.mission
      ? e.mission.knowledge.objective
      : frame.battle.objective
        ? "complete"
        : "pending";
    // During insertion, delivered telemetry can still say "aboard" after physical
    // disembarkation. Wait for the field handover before treating those reports as losses.
    if (
      e.mission?.fieldStartedAt != null &&
      e.time - e.mission.fieldStartedAt < 90 &&
      frame.friends.some((f) => f.waitingForDeployment && f.boardedBy) &&
      objective === "pending"
    )
      return;
    if (
      objective === "complete" ||
      objective === "failed" ||
      (friends.filter((f) => f.health?.alive && f.health?.conscious).length <
        2 &&
        frame.friends.some((f) => f.home || f.boardedBy)) ||
      (frame.friends.length && frame.friends.every((f) => f.age > 90)) ||
      (friends.length &&
        friends.filter(
          (f) =>
            f.health &&
            (!f.health.alive ||
              !f.health.conscious ||
              f.health.wounds.some((w) => !w.treated && w.severity === 3)),
        ).length >= Math.ceil(friends.length / 2))
    ) {
      if (!(e.mission?.returnRequested || e.battle.objective.returnRequested)) {
        c.phase = "extraction";
        note(
          s,
          e,
          a,
          "controller-extraction",
          objective === "complete"
            ? "목표 달성 보고 확인. 조 전체 철수·제공 수송 절차를 지시한다."
            : objective === "failed"
              ? "목표 실패 보고 확인. 추가 손실을 피하고 철수한다."
              : frame.friends.every((f) => f.age > 90)
                ? "전체 조의 보고가 끊겼다. 사망을 추정하지 않고 마지막 수신 위치로 회수·수색을 지시한다."
                : "조원 행동 불능 보고 확인. 엄호를 유지하고 회수를 우선한다.",
          { objective, casualtyIds: casualties.map((x) => x.id) },
        );
        if (e.mission)
          M().requestReturn(s, {
            abort: objective !== "complete",
            authority: a,
          });
        else B().withdraw(s, a);
      }
      return;
    }
    if (e.mission?.returnRequested || e.battle.objective.returnRequested)
      return;
    for (const [i, q] of e.squads.entries()) {
      if (!q.urgentSupportUntil) continue;
      const command = e.commands.find((cmd) => cmd.id === q.commandId),
        id = command?.supportContact?.id,
        contact = id && known.find((x) => x.id === id);
      if (contact && ["dead", "down"].includes(contact.medicalCondition)) {
        q.urgentSupportUntil = null;
        q.friendlySupportTarget = null;
        order(
          s,
          e,
          a,
          q,
          e.mission?.contract.task === "recon" ? "recon" : "cover",
          regions(e)[i],
        );
        note(
          s,
          e,
          a,
          "controller-support-complete",
          "엄호 대상 위협 해제 보고 확인. 담당 수색·경계 구역 임무로 복귀한다.",
          { callsign: q.callsign, contactId: id },
        );
      }
    }
    if (assessCombatRisk(s, e, a, c, frame)) return;
    friendlyCover(s, e, a, c, frame);
    const reportedAlert = e.mission?.knowledge.supportAlert;
    const agencyThreat = known
      .filter(
        (x) =>
          x.source === "agency" &&
          x.age <= 20 &&
          x.confidence >= 0.7 &&
          x.classification === "armed-person" &&
          ["regular", "insurgent"].includes(x.faction) &&
          !["dead", "down"].includes(x.medicalCondition),
      )
      .map((contact) => ({
        contact,
        near: (frame.supportActors || [])
          .filter(
            (a) =>
              a.armed &&
              a.health?.alive &&
              (!e.mission.agencyAutonomous || a.hqMemberId),
          )
          .sort(
            (a, b) =>
              Number(!!b.underFire) - Number(!!a.underFire) ||
              G().distance(a, contact) - G().distance(b, contact),
          )[0],
      }))
      .filter(
        (x) =>
          x.near &&
          !(
            e.mission?.contract.task === "recon" &&
            e.squads.length === 1 &&
            !x.near.underFire
          ),
      )
      .sort(
        (a, b) =>
          Number(!!b.near.underFire) - Number(!!a.near.underFire) ||
          G().distance(a.near, a.contact) - G().distance(b.near, b.contact),
      )[0];
    const alert =
      reportedAlert && e.time - reportedAlert.receivedAt < 30
        ? reportedAlert
        : agencyThreat
          ? {
              eventId:
                "agency-contact:" +
                agencyThreat.contact.id +
                ":" +
                Math.floor(agencyThreat.contact.observedAt / 30),
              receivedAt: agencyThreat.contact.receivedAt,
              position: agencyThreat.near,
              contact: {
                ...copy(agencyThreat.contact),
                lastSeen: agencyThreat.contact.observedAt,
                condition: agencyThreat.contact.pose,
              },
              proactive: true,
            }
          : null;
    if (
      (!e.mission?.agencyAutonomous ||
        (frame.supportActors || []).some(
          (a) =>
            a.hqMemberId &&
            (a.id === alert?.actorId || a.id === alert?.position?.id),
        )) &&
      alert &&
      e.time - alert.receivedAt < 30 &&
      c.handledSupportAlert !== alert.eventId
    ) {
      const threatPoint = G().project(
        alert.contact ||
          (typeof alert.bearing === "number"
            ? {
                x: alert.position.x + Math.cos(alert.bearing) * 120,
                y: alert.position.y + Math.sin(alert.bearing) * 120,
              }
            : alert.position),
      );
      const candidates = e.squads
        .filter(
          (q) =>
            !(q.urgentSupportUntil > e.time) &&
            !q.displacement &&
            !(q.emergencyRepositionUntil > e.time),
        )
        .map((q) => ({
          q,
          sniper: frame.friends.find(
            (f) =>
              f.id === q.sniperId &&
              f.health?.alive &&
              f.health.conscious &&
              f.age < 30,
          ),
        }))
        .filter(
          (x) =>
            x.sniper &&
            frame.friends.filter(
              (f) =>
                f.callsign === x.q.callsign &&
                f.age < 30 &&
                f.health?.alive &&
                f.health.conscious &&
                !f.health.aid &&
                !f.health.wounds.some((w) => !w.treated && w.severity === 3),
            ).length === 2,
        )
        .map((x) => ({
          ...x,
          canShoot:
            G().clear(x.sniper, threatPoint) &&
            G().distance(x.sniper, threatPoint) <
              (x.sniper.weapon?.range || 1100),
        }))
        .sort(
          (x, y) =>
            Number(y.canShoot) - Number(x.canShoot) ||
            G().distance(x.sniper, threatPoint) -
              G().distance(y.sniper, threatPoint),
        );
      const choice = candidates[0];
      if (choice) {
        c.handledSupportAlert = alert.eventId;
        const target = threatPoint,
          canShoot = choice.canShoot,
          existing = e.commands.find((cmd) => cmd.id === choice.q.commandId),
          reuse =
            existing?.kind === "cover" &&
            existing.supportContact?.id === alert.contact?.id &&
            !["failed", "cancelled", "superseded"].includes(existing.status) &&
            G().distance(existing.target, target) < 25 &&
            (canShoot ||
              ["queued", "received", "thinking", "executing"].includes(
                existing.status,
              )),
          command = reuse
            ? existing
            : order(s, e, a, choice.q, "cover", target);
        if (!reuse) {
          command.reposition = !canShoot;
          if (alert.contact) command.supportContact = copy(alert.contact);
        }
        choice.q.urgentSupportUntil = e.time + 45;
        note(
          s,
          e,
          a,
          alert.proactive
            ? "controller-agency-contact-cover"
            : "controller-urgent-cover",
          alert.proactive
            ? "기관의 무장 위협 식별 보고 수신. 사격선과 사거리가 확보된 저격조를 우선 배정해 엄호한다."
            : !alert.contact
              ? "기관 피격 방향 보고 수신. 해당 방위를 관측하고 적을 실제 식별한 뒤 엄호한다."
              : canShoot
                ? "기관 피격 보고 수신. 저격조는 식별된 위협에 즉시 엄호 사격한다."
                : "기관 피격 보고 수신. 사각·사거리 문제를 확인해 저격조를 대체 엄호 진지로 이동시킨다.",
          {
            callsign: choice.q.callsign,
            reportEventId: alert.eventId,
            reposition: command.reposition,
          },
        );
      }
    }
    if (missionProgress(s, e, a, c, frame)) return;
    if (["eliminate", "interdict"].includes(e.mission?.contract.task)) {
      c.targetWatchAt ??= e.time;
      const targets = known.filter(
        (x) =>
          x.objectiveCode &&
          x.age <= 90 &&
          !e.mission.targetProgress.confirmed.includes(x.id) &&
          !["down", "dead"].includes(x.medicalCondition),
      );
      if (targets.some((t) => t.current)) c.targetWatchAt = e.time;
      c.phase = targets.length ? "target-engagement" : "target-search";
      for (const [i, q] of e.squads.entries()) {
        if (q.displacement || q.emergencyRepositionUntil > e.time) continue;
        const support = e.commands.find(
          (command) => command.id === q.commandId,
        );
        if (
          q.urgentSupportUntil &&
          (q.urgentSupportUntil > e.time ||
            ["queued", "received", "thinking", "executing"].includes(
              support?.status,
            ))
        )
          continue;
        q.urgentSupportUntil = null;
        const target = targets[i % Math.max(1, targets.length)],
          old = c.orders[q.callsign],
          cmd = old && e.commands.find((x) => x.id === old.id);
        const search = c.coverage[q.callsign] || 0,
          offsets = [
            [0, 0],
            [-100, -100],
            [100, -100],
            [0, -160],
            [140, 0],
            [-140, 0],
          ],
          offset = offsets[(search + i) % offsets.length],
          center = regions(e)[i];
        const kind = target ? "cover" : "recon",
          point =
            target ||
            G().project({
              x: Math.max(
                q.watchSector?.x1 ?? 10,
                Math.min(
                  q.watchSector?.x2 ?? G().MAP.width - 10,
                  center.x + offset[0],
                ),
              ),
              y: Math.max(
                10,
                Math.min(G().MAP.height - 10, center.y + offset[1]),
              ),
            });
        const searchAgain =
          !target &&
          cmd?.status === "completed" &&
          e.time - cmd.completedAt > (q.tactical?.position?.roofId ? 150 : 25);

        if (
          !cmd ||
          cmd.status === "failed" ||
          searchAgain ||
          (old.kind !== kind &&
            !["queued", "received", "thinking", "executing"].includes(
              cmd.status,
            )) ||
          (target &&
            cmd.status === "completed" &&
            G().distance(old.target, point) > 45)
        ) {
          if (searchAgain) c.coverage[q.callsign] = search + 1;
          const issued = order(s, e, a, q, kind, G().project(point));
          if (target && !G().clear(D().internals.leader(e, q), point))
            issued.reposition = true;
        }
      }
      return;
    }
    const reportedArea = e.mission?.knowledge.reconProgress?.currentId;
    if (reportedArea != null && e.control.reconAreaId !== reportedArea) {
      e.control.reconAreaId = reportedArea;
      c.orders = {};
      c.coverage = {};
    }
    const sectors = regions(e),
      reconTask = e.mission
        ? e.mission.contract.task === "recon"
        : e.battle.scenario === "recon",
      identified = known.filter(
        (x) =>
          x.classification === "armed-person" &&
          !["dead", "down"].includes(x.medicalCondition),
      ),
      reconDone =
        c.phase === "overwatch" ||
        (!reconTask &&
          e.squads.every((q) =>
            e.commands.some(
              (command) =>
                command.callsign === q.callsign &&
                command.kind === "recon" &&
                command.status === "completed",
            ),
          ));
    const nextPhase = reconTask || !reconDone ? "reconnaissance" : "overwatch";
    if (c.phase !== nextPhase) {
      c.phase = nextPhase;
      note(
        s,
        e,
        a,
        "controller-phase",
        nextPhase === "reconnaissance"
          ? "관측 구역을 조별로 분담한다. 은밀 정찰·식별을 우선하고 교전은 현장 관측수가 판단한다."
          : "수신된 접촉에 따라 아군 엄호 진지로 전개한다.",
        { contactIds: identified.map((x) => x.id) },
      );
    }
    for (const [i, q] of e.squads.entries()) {
      if (q.displacement || q.emergencyRepositionUntil > e.time) continue;
      if (q.urgentSupportUntil) {
        const support = e.commands.find(
          (command) => command.id === q.commandId,
        );
        if (
          q.urgentSupportUntil > e.time ||
          ["queued", "received", "thinking", "executing"].includes(
            support?.status,
          )
        )
          continue;
        q.urgentSupportUntil = null;
        order(s, e, a, q, "cover", sectors[i]);
        continue;
      }
      if (!D().internals.leader(e, q)?.capable) continue;
      const currentPost = e.commands.find(
        (command) => command.id === q.commandId,
      );
      if (
        q.tactical?.position?.roofId &&
        currentPost?.status === "completed" &&
        e.time - currentPost.completedAt < 120 &&
        !identified.some((x) => x.current && x.combatActive)
      )
        continue;
      const staged = e.mission?.agencyControl && !reconTask;
      const alreadyRecon = e.commands.some(
        (x) =>
          x.callsign === q.callsign &&
          x.kind === "recon" &&
          x.status === "completed",
      );
      const old = c.orders[q.callsign],
        command = old && e.commands.find((x) => x.id === old.id),
        kind =
          nextPhase === "overwatch" || (staged && alreadyRecon)
            ? "cover"
            : "recon";
      if (
        !command ||
        command.status === "failed" ||
        (command.status === "completed" &&
          kind === "recon" &&
          (reconTask || identified.length < 2) &&
          (c.coverage[q.callsign] || 0) < 6) ||
        (old.kind !== kind &&
          !["queued", "received", "thinking"].includes(command.status))
      ) {
        let target = sectors[i];
        if (kind === "recon" && command?.status === "completed") {
          const index = (c.coverage[q.callsign] || 0) + 1;
          c.coverage[q.callsign] = index;
          const contact = reconTask
            ? null
            : identified[i % Math.max(1, identified.length)];
          target = contact
            ? G().project({ x: contact.x, y: contact.y })
            : G().project({
                x: Math.max(
                  12,
                  Math.min(
                    G().MAP.width - 12,
                    target.x +
                      Math.cos((index * Math.PI) / 3) *
                        Math.min(70, G().MAP.width * 0.18),
                  ),
                ),
                y: Math.max(
                  12,
                  Math.min(
                    G().MAP.height - 12,
                    target.y +
                      Math.sin((index * Math.PI) / 3) *
                        Math.min(70, G().MAP.height * 0.18),
                  ),
                ),
              });
        }
        if (command?.status === "failed")
          target = G().project({
            x: Math.max(
              12,
              Math.min(G().MAP.width - 12, target.x + 20 * (i + 1)),
            ),
            y: Math.max(12, Math.min(G().MAP.height - 12, target.y + 20)),
          });
        const issued = order(s, e, a, q, kind, target);
        if (command?.reposition) issued.reposition = true;
      }
    }
    if (e.mission) {
      M().updateAgencyControl(s, e);
    }
    if (
      reconTask &&
      !e.mission &&
      e.squads.every(
        (q) =>
          (c.coverage[q.callsign] || 0) >= 6 &&
          e.commands.some(
            (command) =>
              command.id === c.orders[q.callsign]?.id &&
              command.status === "completed",
          ),
      )
    ) {
      c.phase = "extraction";
      note(
        s,
        e,
        a,
        "controller-search-exhausted",
        "분담 관측 구역 확인을 마쳤으나 목표 식별이 부족하다. 추가 투입 대신 회수·철수를 지시한다.",
      );
      if (e.mission) M().requestReturn(s, { abort: true, authority: a });
      else B().withdraw(s, a);
      return;
    }
    if (
      e.mission &&
      s.commandStaff.autoSupport &&
      e.time - c.lastSupport >= 20
    ) {
      c.lastSupport = e.time;
      const m = e.mission,
        active = (type) =>
          m.transports.some((t) => t.trip === type && t.state !== "home");
      try {
        if (
          casualties.length &&
          m.supports.medical < m.contract.support.medical &&
          !active("medical")
        ) {
          M().requestSupport(s, "medical", {
            x: casualties[0].x,
            y: casualties[0].y,
          });
          note(
            s,
            e,
            a,
            "controller-support",
            "보고된 중상자 위치로 의료 회수를 요청한다.",
            { type: "medical", memberId: casualties[0].id },
          );
        } else if (
          !known.some((x) => x.current) &&
          m.supports.drone < m.contract.support.drone &&
          !active("drone")
        ) {
          const target = sectors[0];
          M().requestSupport(s, "drone", target);
          note(
            s,
            e,
            a,
            "controller-support",
            "아직 확인되지 않은 담당 구역에 UAV를 우선 투입한다. 중복 출동은 보류한다.",
            { type: "drone", target },
          );
        }
      } catch (error) {
        c.lastSupportFailure = error.message;
      }
    }
  }
  function delegate(s, enabled) {
    initialize(s).delegated = !!enabled;
    if (!enabled && s.commandExercise)
      s.commandExercise.commandAuthority = null;
  }
  function validate(s) {
    const c = s.commandStaff;
    if (!c) return;
    ok(
      c.version === 1 &&
        typeof c.delegated === "boolean" &&
        typeof c.autoSupport === "boolean" &&
        Array.isArray(c.history) &&
        c.history.length <= 100,
      "본부 지휘 편성이 잘못되었습니다.",
    );
    if (c.members) {
      ok(
        Array.isArray(c.members) &&
          Array.isArray(c.market) &&
          c.members.length <= 100 &&
          c.market.length <= 9,
        "지원 인력 저장이 잘못되었습니다.",
      );
      const ids = new Set(
        [...s.members, ...s.archive.members].map((m) => m.id),
      );
      for (const m of [...c.members, ...c.market]) {
        ok(
          m &&
            typeof m.id === "string" &&
            !ids.has(m.id) &&
            typeof m.name === "string" &&
            ["controller", "instructor", "personnel"].includes(m.duty) &&
            Number.isFinite(m.dailySalary) &&
            m.dailySalary > 0 &&
            P().SKILLS.every(
              (k) =>
                Number.isFinite(m.skills?.[k]) &&
                m.skills[k] >= 0 &&
                m.skills[k] <= 100,
            ),
          "지원 인력 정보가 잘못되었습니다.",
        );
        ids.add(m.id);
        if (c.members.includes(m))
          ok(
            m.staffOnly &&
              m.contract &&
              Number.isFinite(m.contract.endsAt) &&
              Array.isArray(m.injuries),
            "지원 인력 계약이 잘못되었습니다.",
          );
      }
    }
    const e = s.commandExercise,
      control = e?.control;
    if (control) {
      ok(
        control.version === 1 &&
          [...s.members, ...s.archive.members, ...(c.members || [])].some(
            (m) => m.id === control.staffId,
          ) &&
          Number.isFinite(control.lastAssess) &&
          control.lastAssess <= e.time &&
          control.orders &&
          control.coverage,
        "작전통제 기록이 잘못되었습니다.",
      );
      for (const [callsign, order] of Object.entries(control.orders))
        ok(
          e.squads.some((q) => q.callsign === callsign) &&
            e.commands.some((c) => c.id === order.id),
          "통제관 명령 연결이 끊어졌습니다.",
        );
    }
    const assigned = [];
    for (const key of ["controller", "instructor", "personnel"]) {
      const id = c[key + "Id"];
      ok(
        id === null || typeof id === "string",
        "지휘 직책 연결이 잘못되었습니다.",
      );
      if (!id) continue;
      const m = [...s.members, ...(c.members || [])].find((x) => x.id === id);
      ok(
        m &&
          !assigned.includes(id) &&
          !s.squads.some((q) => [q.observerId, q.sniperId].includes(id)) &&
          !m.activityId,
        "지휘 직책과 현장/활동이 중복되었습니다.",
      );
      assigned.push(id);
    }
  }
  function release(s, id) {
    if (!s.commandStaff) return;
    for (const k of ["controller", "instructor", "personnel"])
      if (s.commandStaff[k + "Id"] === id) s.commandStaff[k + "Id"] = null;
  }
  const api = {
    initialize,
    upgrade,
    refreshMarket,
    hire,
    renew,
    assign,
    staff,
    reserved,
    available,
    ready,
    authority,
    tick,
    trainingEnabled,
    personnelEnabled,
    managePersonnel,
    manageHeadquarters,
    manageTraining,
    missionProgress,
    validate,
    release,
    delegate,
  };
  root.OverwatchStaff = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
