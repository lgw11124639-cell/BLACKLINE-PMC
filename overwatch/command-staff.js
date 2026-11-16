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
    for (const duty of ["controller", "instructor"])
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
    if (c.marketVersion === 2) return;
    // Transfer only already assigned HQ personnel; preserve their identity and paid contract.
    for (const key of ["controller", "instructor"]) {
      const i = s.members.findIndex((m) => m.id === c[key + "Id"]);
      if (i >= 0) {
        const m = s.members.splice(i, 1)[0];
        m.duty = key;
        m.staffOnly = true;
        c.members.push(m);
      }
    }
    c.marketVersion = 2;
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
        (m.duty === "controller" ? "작전통제관" : "훈련 교관") +
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
      ["controller", "instructor"].some(
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
      ["controller", "instructor"].includes(key),
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
    e.control.orders[q.callsign] = {
      id: c.id,
      kind,
      target: target ? copy(target) : null,
    };
    return c;
  }
  function regions(e) {
    const g = G().MAP,
      center = e.mission?.contract.interest || g.sector || e.squads[0].sector;
    if (e.mission?.agencyControl && e.mission.contract.task !== "recon") {
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
          step = q.assignment?.kind === "flank-security" ? 80 : 60 + i * 65;
        const p = {
          x: start.x + ((focus.x - start.x) / distance) * step,
          y: start.y + ((focus.y - start.y) / distance) * step,
        };
        if (q.assignment?.kind === "flank-security") p.x -= 45;
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
              (i - (e.squads.length - 1) / 2) * Math.min(65, g.width * 0.14),
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
    if (crewPresent) c.pendingPickup = choices[0].p;
    else M().requestReturn(s, { pickup: choices[0].p, authority: a });
  }
  function missionProgress(s, e, a, c, frame) {
    const m = e.mission;
    if (
      !m?.agencyControl?.everAuthorized ||
      m.contract.task === "recon" ||
      m.returnRequested ||
      m.knowledge.objective !== "pending"
    )
      return false;
    const phase =
        m.contract.task === "rescue" && !m.taskLinked ? "approach" : "escort",
      actors = m.knowledge.actors || [],
      anchor = actors.find(
        (x) =>
          x.id ===
          (phase === "escort"
            ? "agency-protected"
            : m.taskLeaderId || "agency-rescuer"),
      );
    if (!anchor || e.time - anchor.observedAt > 30) return false;
    const goal =
      phase === "escort"
        ? m.taskGoal
        : m.contract.interest || G().MAP.sector || e.squads[0].sector;
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
      m.agencyControl.authorized = false;
      m.agencyControl.scanCommandId = command.id;
      w.replanAt = e.time;
    }
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
    if (e.mission)
      for (const [i, q] of e.squads.entries())
        if (!q.assignment) {
          const roles =
            e.squads.length === 1
              ? [["overwatch", "지역 관측·저격 엄호"]]
              : [
                  ["counter-sniper", "외곽 고정 관측·대저격"],
                  ["corridor-cover", "기관 보병 진출로·구출 엄호"],
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
      friends = frame.friends.filter((x) => !x.home && !x.boardedBy),
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
    if (missionProgress(s, e, a, c, frame)) return;
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
      if (!D().internals.leader(e, q)?.capable) continue;
      const staged = e.mission?.agencyControl && !reconTask;
      const alreadyRecon = e.commands.some(
        (x) =>
          x.callsign === q.callsign &&
          x.kind === "recon" &&
          x.status === "completed",
      );
      if (
        staged &&
        !alreadyRecon &&
        i > 0 &&
        !frame.commands.some(
          (x) =>
            x.callsign === e.squads[i - 1].callsign &&
            x.kind === "cover" &&
            x.status === "completed",
        )
      )
        continue;
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
          identified.length < 2 &&
          (c.coverage[q.callsign] || 0) < 6) ||
        (old.kind !== kind &&
          !["queued", "received", "thinking"].includes(command.status))
      ) {
        let target = sectors[i];
        if (kind === "recon" && command?.status === "completed") {
          const index = (c.coverage[q.callsign] || 0) + 1;
          c.coverage[q.callsign] = index;
          const contact = identified[i % Math.max(1, identified.length)];
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
    if (e.mission) M().updateAgencyControl(s, e);
    if (
      reconTask &&
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
        } else if (
          friends.some(
            (x) =>
              x.weapon &&
              x.weapon.loaded + x.weapon.magazines.reduce((n, a) => n + a, 0) <
                x.weapon.capacity,
          ) &&
          m.supports.supply < m.contract.support.supply &&
          !active("supply")
        ) {
          M().requestSupport(s, "supply");
          note(
            s,
            e,
            a,
            "controller-support",
            "수신 탄약 잔량이 부족한 조를 위해 보급을 요청한다.",
            { type: "supply" },
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
          c.market.length <= 6,
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
            ["controller", "instructor"].includes(m.duty) &&
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
    for (const key of ["controller", "instructor"]) {
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
    for (const k of ["controller", "instructor"])
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
    missionProgress,
    validate,
    release,
    delegate,
  };
  root.OverwatchStaff = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
