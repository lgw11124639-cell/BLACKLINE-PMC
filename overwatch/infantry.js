/* An independently contracted headquarters infantry squad; no agency personnel are converted. */
(function (root) {
  "use strict";
  const dep = (n, f) =>
      root[n] || (typeof require === "function" ? require("./" + f) : null),
    P = () => dep("OverwatchPersonnel", "personnel.js"),
    B = () => dep("OverwatchBattle", "battle.js"),
    G = () => dep("OverwatchGeometry", "geometry.js"),
    M = () => dep("OverwatchMissions", "missions.js"),
    D = () => dep("OverwatchCommand", "command.js"),
    O = () => dep("OverwatchOrdnance", "ordnance.js"),
    cp = (x) => JSON.parse(JSON.stringify(x)),
    ok = (v, m) => {
      if (!v) throw Error(m);
    },
    roles = {
      leader: "분대장",
      rifleman: "소총수",
      gunner: "지원화기병",
      medic: "의무병",
    },
    money = (n) => Math.round(n).toLocaleString("ko-KR") + "원",
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
  function initialize(s) {
    if (s.infantry) return s.infantry;
    const market = Object.keys(roles).map((role, i) => ({
      id: "hq-candidate-" + role,
      role,
      name: P().newName(s, 5000 + i),
      dailySalary:
        role === "leader" ? 150000 : role === "gunner" ? 130000 : 120000,
      skills: Object.fromEntries(
        P().SKILLS.map((k) => [
          k,
          60 +
            (k === "judgment" && role === "leader"
              ? 16
              : k === "shooting" && role === "gunner"
                ? 12
                : k === "teamwork" && role === "medic"
                  ? 15
                  : 0),
        ]),
      ),
    }));
    for (let i = 0; i < market.length; i++)
      market[i].name = P().newName(s, 5000 + i, market.slice(0, i));
    return (s.infantry = {
      version: 1,
      callsign: "본부 보병",
      members: [],
      market,
      deploy: true,
      autoTraining: true,
      lastAutoTraining: -86400,
      stock: { smoke: 8, frag: 16 },
      lastClock: s.clock.elapsedSeconds,
    });
  }
  function active(s) {
    return (
      s.commandExercise?.status === "running" &&
      !!s.commandExercise.mission?.hqInfantry
    );
  }
  function hire(s, id) {
    const h = initialize(s);
    ok(!active(s), "출격 중에는 보병 편제를 변경할 수 없습니다.");
    const c = h.market.find((c) => c.id === id);
    ok(
      c &&
        h.members.filter((m) => !["deceased", "missing"].includes(m.status))
          .length < 20 &&
        h.members.length < 100,
      "본부 보병 정원은 20명입니다.",
    );
    const cost = c.dailySalary * 30;
    ok(s.headquarters.funds >= cost, "보병 계약금이 부족합니다.");
    P().finance(s, -cost, "infantry-contract");
    const m = {
      ...cp(c),
      id:
        "hq-member-" +
        c.role +
        "-" +
        s.clock.elapsedSeconds +
        "-" +
        h.members.length,
      status: "standby",
      contract: { endsAt: s.clock.elapsedSeconds + 30 * 86400 },
      fatigue: 0,
      health: B().health(),
      experience: 0,
      training: null,
    };
    h.members.push(m);
    c.name = P().newName(s, 6000 + h.members.length, h.members);
    return m;
  }
  function train(s, managed = false) {
    const h = initialize(s),
      members = h.members
        .filter(
          (m) =>
            m.status === "standby" &&
            m.health.alive &&
            m.health.conscious &&
            m.contract.endsAt > s.clock.elapsedSeconds,
        )
        .sort((a, b) => a.experience - b.experience)
        .slice(0, 4);
    ok(!active(s) && members.length >= 2, "대기 중인 보병 2~4명이 필요합니다.");
    ok(s.headquarters.funds >= 100000, "보병 훈련비가 부족합니다.");
    P().finance(s, -100000, "infantry-training");
    for (const m of members) {
      m.status = "training";
      m.training = {
        startedAt: s.clock.elapsedSeconds,
        dueAt: s.clock.elapsedSeconds + 14400,
        managed,
      };
    }
  }
  function update(s) {
    const h = s.infantry;
    if (!h) return;
    const restingHours =
      Math.max(0, s.clock.elapsedSeconds - h.lastClock) / 3600;
    for (const m of h.members) {
      if (m.status === "standby")
        m.fatigue = Math.max(0, m.fatigue - restingHours * 5);
      if (
        m.status === "training" &&
        m.training.dueAt <= s.clock.elapsedSeconds
      ) {
        if (m.training.rest) {
          m.fatigue = Math.max(0, m.fatigue - 30);
        } else if (m.training.medical) {
          m.health = B().health();
          m.fatigue = 0;
        } else {
          for (const k of P().SKILLS)
            m.skills[k] = Math.min(
              100,
              m.skills[k] + (k === "teamwork" ? 2 : 1),
            );
          m.experience += 32;
        }
        if (!m.training.rest && !m.training.medical)
          m.fatigue = Math.min(100, m.fatigue + 8);
        m.status = "standby";
        m.training = null;
      }
      if (
        !["deployed", "deceased", "missing", "training"].includes(m.status) &&
        m.contract.endsAt <= s.clock.elapsedSeconds
      )
        m.status = "expired";
    }
    h.lastClock = s.clock.elapsedSeconds;
    if (!active(s)) {
      if (
        h.members.some((m) => m.status === "medical") &&
        s.headquarters.funds >=
          h.members.filter((m) => m.status === "medical").length * 200000
      )
        medical(s);
      if (
        h.autoTraining &&
        dep("OverwatchStaff", "command-staff.js").trainingEnabled(s) &&
        s.clock.elapsedSeconds - (h.lastAutoTraining ?? -86400) >= 86400 &&
        h.members.filter((m) => m.status === "standby").length >= 2 &&
        s.headquarters.funds >= 100000
      ) {
        train(s, true);
        h.lastAutoTraining = s.clock.elapsedSeconds;
      }
    }
  }
  function rest(s) {
    const h = initialize(s);
    ok(!active(s), "출격 중인 보병은 본부에서 쉴 수 없습니다.");
    const members = h.members.filter((m) => m.status === "standby");
    ok(members.length, "휴식 가능한 보병이 없습니다.");
    for (const m of members) {
      m.status = "training";
      m.training = {
        startedAt: s.clock.elapsedSeconds,
        dueAt: s.clock.elapsedSeconds + 14400,
        rest: true,
      };
    }
  }
  function restock(s) {
    const h = initialize(s);
    ok(!active(s), "출격 중에는 재편성할 수 없습니다.");
    ok(s.headquarters.funds >= 480000, "투척물 구매 자금이 부족합니다.");
    P().finance(s, -480000, "infantry-ordnance");
    h.stock.smoke += 8;
    h.stock.frag += 8;
  }
  function renew(s, id) {
    const m = initialize(s).members.find((m) => m.id === id);
    ok(
      m && m.health.alive && !["deployed", "missing"].includes(m.status),
      "계약 갱신이 불가능합니다.",
    );
    ok(s.headquarters.funds >= m.dailySalary * 30, "계약금이 부족합니다.");
    P().finance(s, -m.dailySalary * 30, "infantry-renewal");
    m.contract.endsAt =
      Math.max(s.clock.elapsedSeconds, m.contract.endsAt) + 30 * 86400;
    if (m.status === "expired") m.status = "standby";
  }
  const callsigns = ["ALPHA", "BRAVO", "CHARLIE"];
  const teamLabel = (call) => "본부 " + (callsigns.indexOf(call) + 1) + "팀";
  function eligible(s, m) {
    return (
      m &&
      m.status === "standby" &&
      m.health.alive &&
      m.health.conscious &&
      !m.health.wounds.some((w) => !w.treated) &&
      m.contract.endsAt > s.clock.elapsedSeconds
    );
  }
  function formTeams(s) {
    const h = initialize(s);
    ok(!active(s), "출격 중에는 편제를 변경할 수 없습니다.");
    const before = JSON.stringify(h.teams);
    h.teams ||= callsigns.map((callsign) => ({ callsign, memberIds: [] }));
    const used = new Set();
    for (const q of h.teams)
      q.memberIds = q.memberIds.filter((id) => {
        const m = h.members.find((m) => m.id === id);
        if (
          !m ||
          ["deceased", "missing", "expired"].includes(m.status) ||
          used.has(id)
        )
          return false;
        used.add(id);
        return true;
      });
    for (const q of h.teams)
      for (const role of Object.keys(roles)) {
        if (
          q.memberIds.some(
            (id) => h.members.find((m) => m.id === id)?.role === role,
          )
        )
          continue;
        const m = h.members
          .filter((m) => m.role === role && !used.has(m.id) && eligible(s, m))
          .sort(
            (a, b) =>
              b.skills.judgment +
              b.skills.teamwork -
              a.skills.judgment -
              a.skills.teamwork,
          )[0];
        if (m) {
          q.memberIds.push(m.id);
          used.add(m.id);
        }
      }
    return before !== JSON.stringify(h.teams);
  }
  function assignTeam(s, call, ids) {
    const h = initialize(s);
    ok(
      !active(s) && callsigns.includes(call),
      "출격 중에는 편제를 변경할 수 없습니다.",
    );
    ok(
      ids.length === 4 && new Set(ids).size === 4,
      "서로 다른 보병 4명을 배정하세요.",
    );
    const ms = ids.map((id) => h.members.find((m) => m.id === id));
    ok(
      ms.every((m) => eligible(s, m)) &&
        new Set(ms.map((m) => m.role)).size === 4,
      "훈련·진료 중인 인원을 제외하고 4개 보직을 하나씩 선택하세요.",
    );
    const teams =
      h.teams ||
      squads(s).map((q) => ({
        callsign: q.callsign,
        memberIds: q.members.map((m) => m.id),
      }));
    ok(
      !teams.some(
        (q) =>
          q.callsign !== call && q.memberIds.some((id) => ids.includes(id)),
      ),
      "다른 보병팀에 배정된 인원이 있습니다.",
    );
    h.teams = callsigns.map((c) => ({
      callsign: c,
      memberIds:
        c === call
          ? [...ids]
          : [...(teams.find((q) => q.callsign === c)?.memberIds || [])],
    }));
  }
  function formation(s) {
    const h = s.infantry;
    if (!h)
      return '<section class="panel"><h2>보병팀 편성</h2><p>보병 모집 시장을 먼저 개설하세요.</p><button data-infantry-init>보병 모집 시장 개설</button></section>';
    const teams =
      h.teams ||
      squads(s).map((q) => ({
        callsign: q.callsign,
        memberIds: q.members.map((m) => m.id),
      }));
    return (
      '<section class="panel"><h2>보병팀 편성 · 각 4명</h2><p>분대장·소총수·지원화기병·의무병을 배정합니다. 훈련·진료 중인 인원과 중복 배정은 제외합니다.</p><button data-infantry-form>인사관리관 자동 편성 적용</button><div class="member-grid">' +
      callsigns
        .map((call) => {
          const q = teams.find((q) => q.callsign === call);
          return (
            '<form class="panel" data-infantry-formation="' +
            call +
            '"><h3>' +
            teamLabel(call) +
            "</h3>" +
            Object.entries(roles)
              .map(
                ([role, label]) =>
                  "<label>" +
                  esc(label) +
                  '<select name="' +
                  role +
                  '"><option value="">대원 선택</option>' +
                  h.members
                    .filter(
                      (m) =>
                        m.role === role &&
                        eligible(s, m) &&
                        !teams.some(
                          (t) =>
                            t.callsign !== call && t.memberIds.includes(m.id),
                        ),
                    )
                    .map(
                      (m) =>
                        '<option value="' +
                        esc(m.id) +
                        '"' +
                        (q?.memberIds.includes(m.id) ? " selected" : "") +
                        ">" +
                        esc(m.name) +
                        " · 판단 " +
                        m.skills.judgment +
                        " · 사격 " +
                        m.skills.shooting +
                        "</option>",
                    )
                    .join("") +
                  "</select></label>",
              )
              .join("") +
            '<button type="submit"' +
            (active(s) ? " disabled" : "") +
            '>팀 편성 적용</button><button type="button" data-infantry-clear="' +
            call +
            '"' +
            (active(s) ? " disabled" : "") +
            ">편성 해제</button></form>"
          );
        })
        .join("") +
      "</div></section>"
    );
  }
  function squads(s) {
    if (s.infantry?.teams)
      return s.infantry.teams
        .map((q) => ({
          callsign: q.callsign,
          members: q.memberIds.map((id) =>
            s.infantry.members.find((m) => m.id === id),
          ),
        }))
        .filter(
          (q) =>
            q.members.length === 4 &&
            q.members.every(
              (m) =>
                m &&
                (eligible(s, m) ||
                  (m.status === "training" &&
                    m.training?.managed &&
                    m.health.alive &&
                    m.health.conscious &&
                    m.contract.endsAt > s.clock.elapsedSeconds)),
            ),
        );
    const pool = (s.infantry?.members || []).filter(
      (m) =>
        (m.status === "standby" ||
          (m.status === "training" && m.training?.managed)) &&
        m.health.alive &&
        m.health.conscious &&
        !m.health.wounds.some((w) => !w.treated) &&
        m.contract.endsAt > s.clock.elapsedSeconds,
    );
    const byRole = Object.fromEntries(
      Object.keys(roles).map((role) => [
        role,
        pool
          .filter((m) => m.role === role)
          .sort(
            (a, b) =>
              b.skills.judgment +
              b.skills.teamwork +
              b.skills.shooting -
              b.fatigue -
              (a.skills.judgment +
                a.skills.teamwork +
                a.skills.shooting -
                a.fatigue),
          ),
      ]),
    );
    return callsigns
      .map((callsign, i) => ({
        callsign,
        members: Object.keys(roles)
          .map((role) => byRole[role][i])
          .filter(Boolean),
      }))
      .filter((q) => q.members.length === 4);
  }
  function selected(s) {
    return squads(s).filter(
      (q) => !(s.infantry.disabledSquads || []).includes(q.callsign),
    );
  }
  function readiness(s) {
    const h = s.infantry;
    if (!h?.deploy || !h.members.length) return null;
    if (!selected(s).length)
      return "출격 가능한 보병 분대가 없습니다. 4개 보직의 훈련·진료·계약 상태와 분대 선택을 확인하세요.";
    return null;
  }
  function launch(s, e) {
    const h = s.infantry;
    if (!h?.deploy || !h.members.length) return;
    ok(!readiness(s), readiness(s));
    // Transport and ammunition are billed after physical return.
    const selectedSquads = selected(s),
      members = selectedSquads.flatMap((q) => q.members);
    const force = (e.mission.hqInfantry = {
      version: 1,
      memberIds: members.map((m) => m.id),
      directive: null,
      areas: [0, 1, 2, 3, 4, 5].map((i) => ({
        id: i,
        checked: false,
        point: G().project({
          x: G().MAP.width * (((i % 3) + 0.5) / 3),
          y: G().MAP.height * (i < 3 ? 0.7 : 0.3),
        }),
      })),
      returnAt: null,
      settled: false,
      transport: {
        id: "hq-infantry-transport",
        kind: "vehicle",
        name: "본부 보병 수송차량",
        x: G().MAP.base.x,
        y: G().MAP.base.y,
        state: "waiting",
        path: [],
        manifest: [],
      },
    });
    for (const [i, m] of members.entries()) {
      m.status = "deployed";
      m.training = null;
      const p = G().project({
          x: e.mission.contract.insertion.x + i * 3,
          y: e.mission.contract.insertion.y + 4,
        }),
        u = M().taskPerson(e, m.id, m.name, p, true);
      u.hqMemberId = m.id;
      u.roleLabel = "본부 " + roles[m.role];
      u.taskDuty = "headquarters-infantry";
      u.hqTeam = selectedSquads.find((q) =>
        q.members.some((m) => m.id === u.id),
      ).callsign;
      u.callsign = teamLabel(u.hqTeam);
      u.assignmentRole = m.role;
      u.health = cp(m.health);
      u.combatSkills = Object.fromEntries(
        Object.entries(m.skills).map(([k, v]) => [
          k,
          Math.max(0, v * (1 - m.fatigue * 0.003)),
        ]),
      );
      u.skill = m.skills.shooting;
      u.protection = { helmet: 100, plate: 100, profile: "assault" };
      u.weapon = B().weapon(m.role === "gunner" ? "M249" : "HK416", 3);
      u.medicalSkill = m.role === "medic";
      u.health.kit = m.role === "medic" ? 2 : 1;
      u.grenades = {
        smoke: Math.min(1, h.stock.smoke),
        frag: Math.min(2, h.stock.frag),
        spent: { smoke: 0, frag: 0 },
      };
      u.grenades.initial = { smoke: u.grenades.smoke, frag: u.grenades.frag };
      h.stock.smoke -= u.grenades.smoke;
      h.stock.frag -= u.grenades.frag;
      e.world.actors.push(u);
    }
    return force;
  }
  function command(
    s,
    mode,
    point = null,
    source = "headquarters",
    team = null,
  ) {
    const e = s.commandExercise;
    ok(
      e?.mission?.hqInfantry &&
        e.status === "running" &&
        !e.mission.returnRequested,
      "본부 보병이 투입된 작전이 필요합니다.",
    );
    ok(
      ["auto", "hold", "advance", "withdraw"].includes(mode) &&
        ["headquarters", "controller"].includes(source),
      "보병 지시가 잘못되었습니다.",
    );
    ok(
      !point ||
        (Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          point.x >= 10 &&
          point.x <= 1190 &&
          point.y >= 10 &&
          point.y <= 790),
      "보병 지시 좌표가 잘못되었습니다.",
    );
    ok(!team || callsigns.includes(team), "보병팀 선택이 잘못되었습니다.");
    const anchor =
      (e.mission.knowledge.actors || []).find(
        (a) => a.hqMemberId && (!team || a.hqTeam === team),
      ) || e.mission.contract.insertion;
    if (!point && mode === "advance")
      point =
        e.mission.hqInfantry.areas?.find((a) => !a.checked)?.point ||
        e.mission.knowledge.groundSearch?.point ||
        e.mission.contract.interest;
    const ev = D().internals.event(e, "hq-infantry-order", { mode, source });
    return D().internals.radio(
      s,
      e,
      e.squads[0],
      "agency",
      source === "controller" && e.commandAuthority?.id
        ? e.commandAuthority.id
        : "HQ",
      (units(e).find((u) => !team || u.hqTeam === team) || units(e)[0]).id,
      "tasking",
      (team ? teamLabel(team) : "본부 보병 전체") +
        ", " +
        {
          auto: "구역 수색 재개",
          hold: "분산 엄폐·사주 경계",
          advance: "지정 구역 진출",
          withdraw: "상호 엄호 철수",
        }[mode],
      ev,
      {
        infantryDirective: {
          team,
          mode,
          source,
          point: point
            ? { x: point.x, y: point.y }
            : { x: anchor.x, y: anchor.y },
        },
      },
    );
  }
  function orderThrow(s, kind, point = null) {
    const e = s.commandExercise;
    ok(
      e?.mission?.hqInfantry && e.status === "running",
      "출격한 본부 보병이 필요합니다.",
    );
    const reports = (e.mission.knowledge.actors || [])
      .filter(
        (a) =>
          a.hqMemberId &&
          a.health.alive &&
          a.health.conscious &&
          e.time - a.observedAt < 25 &&
          a.grenades?.[kind] > 0,
      )
      .sort((a, b) =>
        point
          ? G().distance(a, point) - G().distance(b, point)
          : (b.suppression || 0) - (a.suppression || 0),
      );
    const u = reports[0];
    ok(u, "투척 가능한 보병 보고가 없습니다.");
    ok(kind !== "frag" || point, "수류탄은 지도에서 관심 지점을 지정하세요.");
    const target =
      point ||
      G().project({
        x: u.x + Math.cos(u.heading || 0) * 12,
        y: u.y + Math.sin(u.heading || 0) * 12,
      });
    const ev = D().internals.event(e, "hq-infantry-grenade-order", {
      kind,
      actorId: u.id,
    });
    return D().internals.radio(
      s,
      e,
      e.squads[0],
      "agency",
      "HQ",
      "AGENCY",
      "tasking",
      "본부 보병 " +
        (kind === "smoke" ? "연막 엄호" : "확인된 위협 수류탄") +
        " 투척 지시",
      ev,
      {
        infantryThrow: {
          actorId: u.id,
          kind,
          point: { x: target.x, y: target.y },
        },
      },
    );
  }
  function apply(e, r) {
    if (r.route === "agency" && r.payload?.infantryThrow) {
      const p = r.payload.infantryThrow,
        u = units(e).find((u) => u.id === p.actorId);
      try {
        ok(u, "해당 보병이 없습니다.");
        O().throwGrenade(null, e, u, p.kind, p.point);
        e.mission.hqInfantry.lastThrowFailure = null;
      } catch (error) {
        e.mission.hqInfantry.lastThrowFailure = error.message;
        D().internals.event(e, "grenade-order-refused", {
          actorId: p.actorId,
          reason: error.message,
        });
      }
    }

    if (
      r.route === "agency" &&
      r.payload?.infantryDirective &&
      e.mission.hqInfantry
    ) {
      const f = e.mission.hqInfantry,
        team = r.payload.infantryDirective.team;
      const received = {
        ...cp(r.payload.infantryDirective),
        messageId: r.id,
        receivedAt: e.time,
      };
      f.teamDirectives ||= {};
      if (team) f.teamDirectives[team] = received;
      else {
        f.directive = received;
        for (const call of callsigns) f.teamDirectives[call] = cp(received);
      }
    }
  }
  function units(e) {
    return e.world.actors.filter((u) => u.hqMemberId);
  }
  function controller(s, e) {
    const f = e.mission.hqInfantry;
    if (!dep("OverwatchStaff", "command-staff.js").authority(s, e)) return;
    if (
      !f ||
      e.mission.returnRequested ||
      !s.commandStaff?.delegated ||
      !s.commandStaff.controllerId ||
      e.mission.fieldStartedAt == null ||
      e.time - (f.lastOrderAt ?? -100) < 25
    )
      return;
    f.teamDirectives ||= {};
    const lead = e.mission.knowledge.groundSearch?.lead,
      task = e.mission.contract.task;
    for (const [index, team] of callsigns.entries()) {
      const people = units(e).filter(
        (u) =>
          (u.hqTeam ||
            callsigns[
              Math.max(
                0,
                callsigns.findIndex((c) => u.callsign?.endsWith(c)),
              )
            ]) === team,
      );
      if (!people.length) continue;
      const d = f.teamDirectives[team] || f.directive;
      if (
        e.radio.some(
          (r) =>
            r.route === "agency" &&
            r.status === "queued" &&
            r.payload?.infantryDirective?.team === team,
        ) ||
        (d && d.source === "headquarters" && d.mode !== "auto")
      )
        continue;
      const reports = (e.mission.knowledge.actors || []).filter(
          (a) =>
            people.some((u) => u.id === a.id) && e.time - a.observedAt < 25,
        ),
        hurt = reports.filter((a) => a.underFire || !a.health.conscious),
        loss = reports.filter((a) => !a.health.alive || !a.health.conscious);
      let mode =
        loss.length >= 2 ? "withdraw" : hurt.length >= 2 ? "hold" : "advance";
      const ownArea = f.areas
        ?.filter((a) => a.id % 3 === index)
        .find((a) => !a.checked);
      let point = ownArea?.point || reports[0] || e.mission.contract.insertion;
      if (lead?.point && mode === "advance")
        point =
          index === 0
            ? lead.point
            : G().project({
                x: lead.point.x + (index === 1 ? 65 : -65),
                y: lead.point.y + 45,
              });
      if (mode === "hold") point = reports[0] || point;
      if (mode === "withdraw")
        point = e.mission.extractionPoint || e.mission.contract.insertion;
      const assignment =
        task === "recon"
          ? ["구역 수색·접촉 식별", "동측 구역 수색", "서측·철수로 수색"][index]
          : [
              "목표 접근·확보",
              "측면 엄호·접근로 확보",
              "후방 경계·철수로 확보",
            ][index];
      if (d?.mode === mode && G().distance(d.point, point) < 25) continue;
      const r = command(s, mode, point, "controller", team);
      r.payload.infantryDirective.assignment = assignment;
    }
    f.lastOrderAt = e.time;
  }

  function move(e, u, p, speed = 0.85) {
    M().moveGround(u, G().project(p), speed * B().moveFactor(u), e);
    if (u.path.length && u.health.conscious && !u.health.aid) {
      u.prone = false;
      u.stance = "standing";
      u.state = "moving";
    } else if (!u.path.length) {
      u.prone = false;
      u.stance = "kneeling";
      u.state = "all-round-guard";
      u.heading =
        ((u.assignmentRole === "leader"
          ? 0
          : u.assignmentRole === "rifleman"
            ? 1
            : u.assignmentRole === "gunner"
              ? 2
              : 3) *
          Math.PI) /
        2;
    }
  }
  function actor(s, e, u, enemies) {
    const f = e.mission.hqInfantry;
    if (!f || u.home || u.hqBoarded) return true;
    const team =
        u.hqTeam ||
        callsigns[
          Math.max(
            0,
            callsigns.findIndex((c) => u.callsign?.endsWith(c)),
          )
        ],
      d = f.teamDirectives?.[team] || f.directive;
    if (e.mission.returnRequested || d?.mode === "withdraw") {
      const p =
        f.pickup || e.mission.extractionPoint || e.mission.contract.insertion;
      move(e, u, p);
      return true;
    }
    if (!d) {
      u.path = [];
      u.state = "staging";
      u.prone = false;
      u.stance = "kneeling";
      return true;
    }
    if (u.assignmentRole === "medic" && !B().underFire(e, u)) {
      const patient = units(e).find(
        (a) =>
          a.id !== u.id &&
          a.health.alive &&
          a.health.wounds.some((w) => !w.treated),
      );
      if (patient && u.health.kit > 0) {
        if (G().distance(u, patient) < 4) B().bandage(s, e, u, patient);
        else move(e, u, patient);
        return true;
      }
    }
    const protectedUnit = e.world.actors.find(
      (a) => a.id === "agency-protected",
    );
    if (e.mission.taskLeaderId === u.id && protectedUnit?.health.alive) {
      if (e.mission.contract.task === "rescue" && !e.mission.taskLinked) {
        if (
          G().distance(u, protectedUnit) < 10 &&
          G().visible(u, protectedUnit, e)
        ) {
          e.mission.taskLinked = true;
          D().internals.event(e, "protected-linked", {
            actorId: u.id,
            targetId: protectedUnit.id,
          });
        } else {
          move(e, u, M().searchPoint(e));
          return true;
        }
      }
      if (B().moveFactor(protectedUnit) === 0) {
        if (G().distance(u, protectedUnit) > 4) {
          move(e, u, protectedUnit);
          return true;
        }
        if (
          protectedUnit.health.wounds.some((w) => !w.treated) &&
          u.health.kit > 0
        ) {
          B().bandage(s, e, u, protectedUnit);
          return true;
        }
        if (!u.carrying) B().carry(s, e, u, protectedUnit);
      }
      move(
        e,
        u,
        G().distance(u, protectedUnit) > 18
          ? protectedUnit
          : e.mission.taskGoal,
      );
      if (u.carrying === protectedUnit.id) {
        protectedUnit.x = u.x;
        protectedUnit.y = u.y;
      }
      return true;
    }
    if (d?.mode === "hold") {
      move(e, u, {
        x:
          d.point.x +
          (["rifleman", "medic"].includes(u.assignmentRole) ? 10 : -10),
        y:
          d.point.y +
          (["gunner", "medic"].includes(u.assignmentRole) ? 10 : -10),
      });
      return true;
    }
    const rescueLeader = units(e).find((a) => a.id === e.mission.taskLeaderId);
    if (e.mission.taskLinked && rescueLeader && rescueLeader.id !== u.id) {
      const slot = ["leader", "rifleman", "gunner", "medic"].indexOf(
        u.assignmentRole,
      );
      move(e, u, {
        x: rescueLeader.x + Math.cos((slot * Math.PI) / 2) * 12,
        y: rescueLeader.y + Math.sin((slot * Math.PI) / 2) * 12,
      });
      return true;
    }
    const area = f.areas?.find((a) => !a.checked);
    if (area && G().distance(u, area.point) < 25) area.checked = true;
    let point =
      d?.mode === "advance"
        ? d.point
        : area?.point || M().searchPoint(e) || e.mission.contract.interest;
    const index = ["leader", "rifleman", "gunner", "medic"].indexOf(
      u.assignmentRole,
    );
    move(e, u, {
      x: point.x + [-8, 10, -12, 8][index],
      y: point.y + [-8, -8, 12, 12][index],
    });
    return true;
  }
  function recovery(s, e) {
    const f = e.mission.hqInfantry;
    if (!f) return true;
    const t = f.transport,
      returning = units(e).filter(
        (u) =>
          e.mission.returnRequested ||
          (f.teamDirectives?.[u.hqTeam || "ALPHA"] || f.directive)?.mode ===
            "withdraw",
      );
    if (!returning.length) return false;
    const left = returning.filter(
      (u) => u.health.alive && !u.hqBoarded && !u.home,
    );
    if (t.state === "home" && left.length) {
      t.state = "waiting";
      t.path = [];
      t.manifest = [];
      f.returnAt = null;
      f.pickup = null;
    }
    f.returnAt ??= e.time;
    if (!f.pickup) {
      const reports = (e.mission.knowledge.actors || []).filter(
        (a) =>
          left.some((u) => u.id === a.id) &&
          a.health.alive &&
          e.time - a.observedAt < 60,
      );
      f.pickup = G().project(
        reports.find((a) => !a.health.conscious || !a.mobility) ||
          reports[0] ||
          e.mission.extractionPoint ||
          e.mission.contract.insertion,
      );
    }
    const goal = f.pickup;
    if (t.state === "waiting") {
      t.state = "pickup";
      t.path = G().path(t, goal);
    }
    const travel = (point) => {
      if (!t.path.length) t.path = G().path(t, point);
      const p = t.path[0];
      if (!p) return G().distance(t, point) < 3;
      const distance = G().distance(t, p),
        speed = Math.min(6, distance);
      if (distance) {
        t.x += ((p.x - t.x) * speed) / distance;
        t.y += ((p.y - t.y) * speed) / distance;
      }
      if (distance <= 6) t.path.shift();
      return G().distance(t, point) < 3;
    };
    if (t.state === "pickup" && travel(goal)) t.state = "boarding";
    if (t.state === "boarding") {
      for (const u of returning)
        if (u.health.alive && !u.hqBoarded && G().distance(u, t) < 14) {
          u.hqBoarded = true;
          u.path = [];
          t.manifest.push(u.id);
        }
      const left = returning.filter(
        (u) => u.health.alive && !u.hqBoarded && !u.home,
      );
      if (left.length && e.time - (f.lastPickupReview ?? f.returnAt) > 45) {
        const known = (e.mission.knowledge.actors || []).find(
          (a) => left.some((u) => u.id === a.id) && e.time - a.observedAt < 60,
        );
        if (known && G().distance(known, t) > 12) {
          f.pickup = G().project(known);
          t.state = "pickup";
          t.path = G().path(t, f.pickup);
        }
        f.lastPickupReview = e.time;
      }
      if (!left.length) {
        t.state = "returning";
        t.path = [];
      }
    }
    if (t.state === "returning" && travel(G().MAP.base)) {
      t.state = "home";
      for (const u of units(e).filter((u) => u.hqBoarded)) {
        u.home = true;
        u.state = "returned";
      }
    }
    for (const u of units(e).filter((u) => u.hqBoarded)) {
      u.x = t.x;
      u.y = t.y;
    }
    if (
      e.time - f.returnAt > 3600 &&
      t.state !== "home" &&
      !returning.some(
        (u) =>
          u.health.alive && !u.home && e.time - (u.lastThreatAt || -100) < 30,
      )
    ) {
      t.state = "failed";
      return true;
    }
    return (
      ["home", "failed"].includes(t.state) ||
      units(e).every((u) => !u.health.alive)
    );
  }
  function settle(s, e, report) {
    const f = e.mission.hqInfantry;
    if (!f || f.settled) return;
    f.settled = true;
    report.headquartersInfantry = [];
    for (const u of units(e)) {
      const m = s.infantry.members.find((m) => m.id === u.hqMemberId);
      m.health = cp(u.health);
      m.fatigue = Math.min(100, m.fatigue + (u.fieldFatigue || 0));
      m.status = !u.health.alive
        ? "deceased"
        : u.home
          ? u.health.wounds.some((w) => !w.treated)
            ? "medical"
            : "standby"
          : u.health.alive
            ? "missing"
            : "deceased";
      if (u.home) {
        for (const kind of ["smoke", "frag"])
          s.infantry.stock[kind] += u.grenades[kind];
        m.experience += 20 + Math.min(30, u.weapon.spent + u.sidearm.spent);
        m.skills.teamwork = Math.min(100, m.skills.teamwork + 1);
        if (u.weapon.spent + u.sidearm.spent)
          m.skills.shooting = Math.min(100, m.skills.shooting + 1);
      }
      report.headquartersInfantry.push({
        id: m.id,
        name: m.name,
        team: u.hqTeam || "ALPHA",
        role: m.role,
        status: m.status,
        health: cp(m.health),
        spent: u.weapon.spent + u.sidearm.spent,
        grenades: cp(u.grenades),
      });
    }
  }
  function medical(s) {
    const h = initialize(s);
    ok(!active(s), "출격 중에는 본부 진료를 배정할 수 없습니다.");
    const members = h.members.filter((m) => m.status === "medical");
    ok(members.length, "진료가 필요한 보병이 없습니다.");
    ok(s.headquarters.funds >= members.length * 200000, "진료비가 부족합니다.");
    P().finance(s, -members.length * 200000, "infantry-treatment");
    for (const m of members) {
      m.status = "training";
      m.training = {
        startedAt: s.clock.elapsedSeconds,
        dueAt: s.clock.elapsedSeconds + 86400,
        medical: true,
      };
    }
  }
  function validate(s) {
    const h = s.infantry;
    if (!h) return;
    const n = (v, a, b) => Number.isFinite(v) && v >= a && v <= b;
    ok(
      h.version === 1 &&
        Array.isArray(h.members) &&
        h.members.length <= 100 &&
        Array.isArray(h.market) &&
        h.market.length === 4 &&
        typeof h.deploy === "boolean" &&
        h.members.filter((m) => !["deceased", "missing"].includes(m.status))
          .length <= 20 &&
        (h.disabledSquads == null ||
          (Array.isArray(h.disabledSquads) &&
            h.disabledSquads.every((c) => callsigns.includes(c)) &&
            new Set(h.disabledSquads).size === h.disabledSquads.length)) &&
        ["smoke", "frag"].every(
          (k) => Number.isInteger(h.stock[k]) && n(h.stock[k], 0, 10000),
        ),
      "본부 보병 편제 저장이 잘못되었습니다.",
    );
    const ids = new Set();
    for (const m of h.members) {
      ok(
        !ids.has(m.id) &&
          typeof m.name === "string" &&
          roles[m.role] &&
          [
            "standby",
            "training",
            "medical",
            "deployed",
            "deceased",
            "missing",
            "expired",
          ].includes(m.status) &&
          m.health &&
          n(m.contract.endsAt, 0, 1e12) &&
          P().SKILLS.every((k) => n(m.skills[k], 0, 100)),
        "본부 보병 인원 정보가 잘못되었습니다.",
      );
      ok(
        typeof m.health.alive === "boolean" &&
          typeof m.health.conscious === "boolean" &&
          n(m.health.bloodMl, 0, 5000) &&
          Number.isInteger(m.health.kit) &&
          n(m.health.kit, 0, 2) &&
          Array.isArray(m.health.wounds) &&
          m.health.wounds.length <= 100 &&
          m.health.wounds.every(
            (w) =>
              typeof w.id === "string" &&
              [
                "head",
                "chest",
                "abdomen",
                "leftArm",
                "rightArm",
                "leftLeg",
                "rightLeg",
              ].includes(w.part) &&
              [1, 2, 3].includes(w.severity) &&
              typeof w.treated === "boolean",
          ) &&
          n(m.dailySalary, 1, 1e7) &&
          n(m.fatigue, 0, 100) &&
          n(m.experience, 0, 1e9),
        "보병 건강·급여·경험 상태가 잘못되었습니다.",
      );
      ids.add(m.id);
      if (m.training)
        ok(
          n(m.training.startedAt, 0, s.clock.elapsedSeconds) &&
            n(m.training.dueAt, m.training.startedAt, 1e12),
          "보병 훈련 시간이 잘못되었습니다.",
        );
    }
    if (h.teams) {
      const assigned = new Set();
      ok(
        Array.isArray(h.teams) &&
          h.teams.length === 3 &&
          new Set(h.teams.map((q) => q.callsign)).size === 3,
        "보병팀 편제가 잘못되었습니다.",
      );
      for (const q of h.teams) {
        ok(
          callsigns.includes(q.callsign) &&
            Array.isArray(q.memberIds) &&
            q.memberIds.length <= 4 &&
            q.memberIds.every((id) => ids.has(id) && !assigned.has(id)),
          "보병팀 중복·누락 배정이 있습니다.",
        );
        q.memberIds.forEach((id) => assigned.add(id));
        ok(
          new Set(
            q.memberIds.map((id) => h.members.find((m) => m.id === id).role),
          ).size === q.memberIds.length,
          "보병팀 보직이 중복되었습니다.",
        );
      }
    }
    const e = s.commandExercise,
      f = e?.mission?.hqInfantry;
    if (!f) return;
    ok(
      f.version === 1 &&
        [4, 8, 12].includes(f.memberIds.length) &&
        new Set(f.memberIds).size === f.memberIds.length &&
        f.memberIds.every(
          (id) =>
            ids.has(id) && e.world.actors.some((u) => u.hqMemberId === id),
        ),
      "보병 출격 명부가 잘못되었습니다.",
    );
    for (const d of Object.values(f.teamDirectives || {}))
      ok(
        ["auto", "hold", "advance", "withdraw"].includes(d.mode) &&
          e.radio.some(
            (r) =>
              r.id === d.messageId &&
              r.status === "delivered" &&
              r.payload?.infantryDirective,
          ),
        "보병팀 명령 수신 근거가 잘못되었습니다.",
      );
    if (f.directive)
      ok(
        ["auto", "hold", "advance", "withdraw"].includes(f.directive.mode) &&
          ["controller", "headquarters"].includes(f.directive.source) &&
          e.radio.some(
            (r) =>
              r.id === f.directive.messageId &&
              r.status === "delivered" &&
              r.route === "agency" &&
              r.payload?.infantryDirective?.mode === f.directive.mode &&
              r.payload.infantryDirective.source === f.directive.source,
          ),
        "보병 명령 수신 근거가 잘못되었습니다.",
      );
    ok(
      n(f.transport.x, 0, 1200) &&
        n(f.transport.y, 0, 800) &&
        [
          "waiting",
          "pickup",
          "boarding",
          "returning",
          "home",
          "failed",
        ].includes(f.transport.state) &&
        new Set(f.transport.manifest).size === f.transport.manifest.length &&
        f.transport.manifest.every((id) => f.memberIds.includes(id)),
      "본부 보병 수송 저장이 잘못되었습니다.",
    );
  }
  function render(s) {
    const h = s.infantry;
    if (!h)
      return '<section class="panel"><h2>본부 보병 · 별도 편제</h2><p>정원 20명 · 본부 1·2·3팀 각 4인 분대: 분대장·소총수·지원화기병·의무병. 저격조 정원과 별도로 채용합니다.</p><button data-infantry-init>보병 모집 시장 개설</button></section>';
    return (
      '<details class="panel" open><summary>본부 1팀·본부 2팀·본부 3팀 · ' +
      h.members.filter((m) => !["deceased", "missing"].includes(m.status))
        .length +
      '/20명</summary><p>기관 보병과 별도 고용·훈련·출격 · 주무장·방탄복·연막탄·수류탄 지급</p><label><input type="checkbox" data-infantry-deploy ' +
      (h.deploy ? "checked" : "") +
      ">편제된 본부 보병 동반 출격</label>" +
      callsigns
        .map(
          (call) =>
            '<label><input type="checkbox" data-infantry-squad="' +
            call +
            '"' +
            ((h.disabledSquads || []).includes(call) ? "" : " checked") +
            (active(s) ? " disabled" : "") +
            ">" +
            teamLabel(call) +
            (squads(s).some((q) => q.callsign === call)
              ? " · 4명 편성"
              : " · 가용 보직 대기") +
            "</label>",
        )
        .join("") +
      '<label><input type="checkbox" data-infantry-auto-training ' +
      (h.autoTraining ? "checked" : "") +
      ">교관 자동 분대 훈련 · 출격 시 자동 중단</label><p>보유 연막탄 " +
      h.stock.smoke +
      " · 수류탄 " +
      h.stock.frag +
      '</p><button data-infantry-stock>연막 8·수류탄 8 구매 · 480,000원</button> <button data-infantry-train>2~4인 분대 훈련 · 4시간 / 100,000원</button> <button data-infantry-rest>분대 휴식 · 4시간</button> <button data-infantry-advance>다음 보병 훈련·진료 완료까지 진행</button> <button data-infantry-medical>부상 보병 진료 · 24시간 / 1인 200,000원</button><div class="member-grid">' +
      h.members
        .filter((m) => !["deceased", "missing"].includes(m.status))
        .map(
          (m) =>
            '<article class="panel"><img class="infantry-portrait" src="images/overwatch/hq-infantry-move.webp" alt="본부 녹색 위장복 보병" loading="lazy"><h3>' +
            esc(m.name) +
            "</h3><p>" +
            esc(
              squads(s).find((q) => q.members.some((x) => x.id === m.id))
                ?.callsign ||
                (m.status === "deployed"
                  ? s.commandExercise?.world.actors.find((u) => u.id === m.id)
                      ?.callsign || "출격 중"
                  : "예비·활동 중"),
            ) +
            "</p><p>본부 " +
            esc(roles[m.role]) +
            " · " +
            esc(
              {
                standby: "대기",
                training: "훈련·진료 중",
                medical: "진료 필요",
                deployed: "출격 중",
                expired: "계약 만료",
              }[m.status] || m.status,
            ) +
            "</p><p>사격 " +
            m.skills.shooting +
            " · 판단 " +
            m.skills.judgment +
            " · 팀워크 " +
            m.skills.teamwork +
            "</p><p>경험 " +
            m.experience +
            " · 피로 " +
            Math.round(m.fatigue) +
            "%</p><p>일급 " +
            money(m.dailySalary) +
            '</p><button data-infantry-renew="' +
            esc(m.id) +
            '">30일 계약 연장</button></article>',
        )
        .join("") +
      '</div><button data-personnel-tab="infantry-market">보병 모집 시장 열기</button><p>인사관리관 위임 시 예산 안에서 빈 보직 채용·계약 갱신을 자동 처리합니다.</p></details>'
    );
  }
  function market(s) {
    const h = s.infantry;
    if (!h)
      return '<section class="panel"><h2>보병 모집 시장</h2><p>분대장·소총수·지원화기병·의무병을 별도로 모집합니다.</p><button data-infantry-init>보병 모집 시장 개설</button></section>';
    return (
      '<section class="panel"><h2>보병 모집 시장</h2><p>본부 보병 정원 20명 · 본부 1·2·3팀 3개 분대 · 30일 급여 선지급 · 인사관리관 예산 자동 채용 지원</p><div class="member-grid">' +
      h.market
        .map((c) => {
          const filled =
            h.members.filter((m) => !["deceased", "missing"].includes(m.status))
              .length >= 20;
          return (
            '<article class="panel"><img class="infantry-portrait" src="images/overwatch/hq-infantry-move.webp" alt="본부 녹색 위장복 보병 후보" loading="lazy"><h3>' +
            esc(c.name) +
            "</h3><p>" +
            esc(roles[c.role]) +
            "</p><p>사격 " +
            c.skills.shooting +
            " · 판단 " +
            c.skills.judgment +
            " · 팀워크 " +
            c.skills.teamwork +
            "</p><p>일급 " +
            money(c.dailySalary) +
            " · 30일 계약 " +
            money(c.dailySalary * 30) +
            '</p><button data-infantry-hire="' +
            esc(c.id) +
            '"' +
            (filled ? " disabled" : "") +
            ">" +
            (filled ? "보병 정원 20명" : "30일 계약") +
            "</button></article>"
          );
        })
        .join("") +
      "</div></section>"
    );
  }

  function sortie(s) {
    const h = s.infantry;
    return (
      '<fieldset class="sortie-teams"><legend>본부 보병 출격 선택 · 팀당 4명</legend>' +
      (h
        ? '<label><input type="checkbox" data-infantry-deploy' +
          (h.deploy ? " checked" : "") +
          ">본부 보병 투입</label>" +
          callsigns
            .map(
              (c) =>
                '<label><input type="checkbox" data-infantry-squad="' +
                c +
                '"' +
                ((h.disabledSquads || []).includes(c) ? "" : " checked") +
                ">" +
                teamLabel(c) +
                " · " +
                (squads(s).some((q) => q.callsign === c)
                  ? "4명 편성"
                  : "가용 편성 없음") +
                "</label>",
            )
            .join("")
        : "<p>편성된 보병이 없습니다. 저격팀만 출격할 수 있습니다.</p>") +
      "</fieldset>"
    );
  }
  function live(s) {
    const f = s.commandExercise?.mission?.hqInfantry;
    if (!f) return "";
    return (
      '<section class="panel"><h3>본부 1팀·본부 2팀·본부 3팀</h3><p data-infantry-doctrine>작전통제관 지휘 · 기관 보병과 별도 편제</p>' +
      '<label>명령 대상<select data-infantry-command-team><option value="">보병 전체</option>' +
      callsigns
        .map(
          (c) =>
            '<option value="' +
            c +
            '"' +
            (s.ui.infantryCommandTeam === c ? " selected" : "") +
            ">" +
            teamLabel(c) +
            "</option>",
        )
        .join("") +
      "</select></label>" +
      ["auto", "hold", "advance", "withdraw"]
        .map(
          (mode) =>
            '<button data-infantry-order="' +
            mode +
            '">' +
            {
              auto: "통제관 위임",
              hold: "분산 엄폐",
              advance: "구역 진출",
              withdraw: "보병 철수",
            }[mode] +
            "</button>",
        )
        .join("") +
      '<p>관심 지점 지정 후 투척 · 최대 32m · 아군 위험 시 보류</p><button data-infantry-throw="smoke">연막탄 투척</button><button data-infantry-throw="frag">수류탄 투척</button><p data-infantry-throw-status></p></section>'
    );
  }
  function bind(node, { commit, execute = commit }) {
    const on = (sel, fn) =>
      node
        .querySelectorAll(sel)
        .forEach((el) =>
          el.addEventListener("click", () => commit((s) => fn(s, el))),
        );
    on("[data-infantry-init]", initialize);
    node
      .querySelector("[data-infantry-command-team]")
      ?.addEventListener("change", (event) =>
        commit((s) => {
          s.ui.infantryCommandTeam = event.target.value;
        }),
      );
    on("[data-infantry-form]", formTeams);
    on("[data-infantry-clear]", (s, el) => {
      ok(!active(s), "출격 중에는 변경할 수 없습니다.");
      formTeams(s);
      const q = s.infantry.teams.find(
        (q) => q.callsign === el.dataset.infantryClear,
      );
      q.memberIds = [];
    });
    node.querySelectorAll("[data-infantry-formation]").forEach((form) =>
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        commit((s) =>
          assignTeam(
            s,
            form.dataset.infantryFormation,
            Object.keys(roles).map((r) => data.get(r)),
          ),
        );
      }),
    );
    node.querySelectorAll("[data-infantry-squad]").forEach((el) =>
      el.addEventListener("change", () =>
        commit((s) => {
          ok(!active(s), "출격 중에는 변경할 수 없습니다.");
          const h = initialize(s),
            call = el.dataset.infantrySquad;
          h.disabledSquads = (h.disabledSquads || []).filter((c) => c !== call);
          if (!el.checked) h.disabledSquads.push(call);
        }),
      ),
    );

    node
      .querySelector("[data-infantry-auto-training]")
      ?.addEventListener("change", (event) =>
        commit((s) => {
          initialize(s).autoTraining = event.target.checked;
        }),
      );
    on("[data-infantry-hire]", (s, e) => hire(s, e.dataset.infantryHire));
    on("[data-infantry-stock]", restock);
    on("[data-infantry-train]", (s) => train(s));
    on("[data-infantry-rest]", rest);
    on("[data-infantry-medical]", medical);
    on("[data-infantry-advance]", (s) => {
      ok(
        !s.commandExercise || s.commandExercise.status !== "running",
        "작전 종료 뒤 시간을 진행하세요.",
      );
      const due = Math.min(
        ...initialize(s)
          .members.filter((m) => m.training)
          .map((m) => m.training.dueAt),
      );
      ok(Number.isFinite(due), "진행 중인 보병 활동이 없습니다.");
      P().elapse(s, Math.max(1, due - s.clock.elapsedSeconds));
    });
    on("[data-infantry-renew]", (s, e) => renew(s, e.dataset.infantryRenew));
    node
      .querySelector("[data-infantry-deploy]")
      ?.addEventListener("change", (event) =>
        commit((s) => {
          ok(!active(s), "출격 중에는 변경할 수 없습니다.");
          initialize(s).deploy = event.target.checked;
        }),
      );
    node
      .querySelectorAll("[data-infantry-throw]")
      .forEach((el) =>
        el.addEventListener("click", () =>
          execute((s) =>
            orderThrow(
              s,
              el.dataset.infantryThrow,
              root.OverwatchFieldUI?.selectedPoint?.(),
            ),
          ),
        ),
      );
    node
      .querySelectorAll("[data-infantry-order]")
      .forEach((el) =>
        el.addEventListener("click", () =>
          execute((s) =>
            command(
              s,
              el.dataset.infantryOrder,
              el.dataset.infantryOrder === "advance"
                ? root.OverwatchFieldUI?.selectedPoint?.()
                : null,
              "headquarters",
              node.querySelector("[data-infantry-command-team]")?.value || null,
            ),
          ),
        ),
      );
  }
  root.OverwatchInfantry = {
    initialize,
    hire,
    train,
    rest,
    update,
    restock,
    renew,
    teamLabel,
    formTeams,
    assignTeam,
    formation,
    squads,
    readiness,
    launch,
    command,
    orderThrow,
    apply,
    controller,
    actor,
    recovery,
    settle,
    medical,
    validate,
    render,
    market,
    sortie,
    live,
    bind,
    units,
  };
  if (typeof module !== "undefined" && module.exports)
    module.exports = root.OverwatchInfantry;
})(typeof window === "undefined" ? globalThis : window);
