/* Personnel phase: deterministic HQ activities, prepaid contracts and real event bookkeeping. */
(function (root) {
  "use strict";
  const C = () =>
      root.OverwatchCore ||
      (typeof require === "function" ? require("./core.js") : null),
    copy = (x) => JSON.parse(JSON.stringify(x));
  const HOUR = 3600,
    DAY = 24 * HOUR,
    INITIAL_FUNDS = 100000000,
    TERMS = [30, 90],
    SKILLS = [
      "shooting",
      "observation",
      "composure",
      "fitness",
      "judgment",
      "teamwork",
    ],
    SECONDARIES = ["firstAid", "communications", "reconnaissance", "drone"];
  const TREATMENT = {
    1: { seconds: 6 * HOUR, cost: 100000 },
    2: { seconds: 3 * DAY, cost: 400000 },
    3: { seconds: 14 * DAY, cost: 1200000 },
  };
  const treatmentPlan = (m) => {
    const wounds = m.injuries.filter((w) => !w.healed);
    return wounds.length
      ? TREATMENT[Math.max(...wounds.map((w) => w.severity))]
      : null;
  };
  const LABELS = {
    shooting: "사격",
    observation: "관측",
    composure: "침착성",
    fitness: "체력",
    judgment: "판단력",
    teamwork: "팀워크",
    firstAid: "응급처치",
    communications: "통신",
    reconnaissance: "정찰",
    drone: "드론 운용",
  };
  const TYPES = [
    "hq-established",
    "campaign-imported",
    "startup-grant",
    "recruited",
    "contract-renewed",
    "contract-expired",
    "resigned",
    "retired",
    "casualty",
    "injury",
    "activity-started",
    "activity-completed",
    "activity-cancelled",
    "squad-assigned",
    "squad-cleared",
    "market-refreshed",
    "migration",
  ];
  const ok = (v, m) => {
      if (!v) throw Error(m);
    },
    num = (n, min = 0, max = Number.MAX_SAFE_INTEGER) =>
      typeof n === "number" && Number.isFinite(n) && n >= min && n <= max,
    integer = (n, min = 0, max = Number.MAX_SAFE_INTEGER) =>
      Number.isSafeInteger(n) && num(n, min, max),
    text = (v, max = 160) =>
      typeof v === "string" && v.trim().length > 0 && v.length <= max;
  const time = (s) => s.clock.elapsedSeconds,
    live = (s, id) => {
      const m = s.members.find((m) => m.id === id);
      ok(m, "현직 명부에 없는 대원입니다.");
      return m;
    },
    current = (s) => {
      ok(s.schemaVersion === 2, "2단계 저장으로 변환해야 합니다.");
      ok(!s.activeMission, "현장 작전 중에는 본부 활동을 시작할 수 없습니다.");
    };
  const next = (s, prefix) => {
    let id;
    const groups = [
      s.records || [],
      s.members || [],
      s.archive?.members || [],
      s.market?.candidates || [],
      s.activities || [],
      s.headquarters.ledger || [],
    ];
    do {
      id = prefix + "-" + ++s.personnel.sequence;
    } while (groups.some((items) => items.some((x) => x.id === id)));
    return id;
  };
  function emit(s, type, message, data = {}) {
    const e = { id: next(s, "event"), type, time: time(s), message, ...data };
    s.records.push(e);
    if (s.records.length > 500) s.records.splice(0, s.records.length - 500);
    return e;
  }
  function money(s, amount, kind, detail = {}) {
    ok(
      integer(Math.abs(amount)) && s.headquarters.funds + amount >= 0,
      "운영자금이 부족합니다.",
    );
    const entry = {
      id: next(s, "ledger"),
      time: time(s),
      amount,
      kind,
      ...detail,
    };
    s.headquarters.ledger.push(entry);
    s.headquarters.funds += amount;
    if (s.headquarters.ledger.length > 1000) {
      const removed = s.headquarters.ledger.splice(
        0,
        s.headquarters.ledger.length - 1000,
      );
      s.headquarters.openingBalance += removed.reduce(
        (n, e) => n + e.amount,
        0,
      );
    }
    return entry;
  }
  function date(s, seconds = time(s)) {
    return new Date(Date.parse(s.createdAt) + seconds * 1000).toISOString();
  }
  function age(s, m) {
    if (!m.birthDate) return m.age;
    const at = date(s, m.endedAt ?? time(s)).slice(0, 10);
    return (
      +at.slice(0, 4) -
      +m.birthDate.slice(0, 4) -
      (at.slice(5) < m.birthDate.slice(5) ? 1 : 0)
    );
  }
  function wound(w, index) {
    const part = [
      "head",
      "chest",
      "abdomen",
      "leftArm",
      "rightArm",
      "leftLeg",
      "rightLeg",
      "unknown",
    ].includes(w?.part)
      ? w.part
      : "unknown";
    return {
      ...(w && typeof w === "object" ? copy(w) : {}),
      id: text(w?.id) ? w.id : "legacy-wound-" + index,
      part,
      type: text(w?.type) ? w.type : "이전 부상 기록",
      severity: integer(w?.severity, 1, 3)
        ? w.severity
        : integer(w?.grade, 1, 3)
          ? w.grade
          : 2,
      healed: w?.healed === true,
      treated: w?.treated === true,
      sourceEventId: text(w?.sourceEventId) ? w.sourceEventId : null,
      legacy: !w?.sourceEventId,
    };
  }
  const injured = (m) => m.injuries.some((w) => !w.healed),
    available = (s, m) =>
      m.status === "standby" &&
      !injured(m) &&
      m.contract.endsAt > time(s) &&
      m.fatigue <= 70 &&
      m.stress <= 75;
  function readiness(s, m) {
    if (m.contract.endsAt <= time(s)) return "계약 만료";
    if (injured(m)) return "치료·복귀 평가 필요";
    if (m.status !== "standby") return "활동 진행 중";
    if (m.fatigue > 70) return "피로 회복 필요";
    if (m.stress > 75) return "스트레스 회복 필요";
    return null;
  }
  function effectiveSkills(m) {
    const factor = Math.max(0.4, 1 - m.fatigue * 0.003 - m.stress * 0.002);
    return Object.fromEntries(
      SKILLS.map((k) => [
        k,
        Math.max(
          0,
          Math.round(
            m.skills[k] * factor -
              (m.aftereffects || [])
                .filter((e) => e.skill === k)
                .reduce((n, e) => n + e.penalty, 0),
          ),
        ),
      ]),
    );
  }
  function paired(s, id) {
    return s.squads.find((q) => q.observerId === id || q.sniperId === id);
  }
  function memberDefaults(s, m) {
    const role = m.specialty,
      born = Number(s.createdAt.slice(0, 4)) - m.age;
    return {
      ...copy(m),
      birthDate: m.birthDate || born + "-01-01",
      career: m.career || {
        tier: "experienced",
        years: Math.max(0, m.age - 22),
        summary: "이전 OVERWATCH 명부에서 승계한 경력",
      },
      personality: ["cautious", "assertive", "seasoned"].includes(m.personality)
        ? m.personality
        : "cautious",
      dailySalary: integer(m.dailySalary, 1) ? m.dailySalary : 140000,
      contract:
        m.contract &&
        num(m.contract.startsAt) &&
        num(m.contract.endsAt) &&
        m.contract.endsAt > m.contract.startsAt
          ? copy(m.contract)
          : { startsAt: 0, endsAt: 30 * DAY, paidAmount: 0, migrated: true },
      proficiency: m.proficiency || {
        primary: Math.min(
          100,
          Math.round(
            (m.skills[role === "observer" ? "observation" : "shooting"] +
              m.skills.judgment) /
              2,
          ),
        ),
        secondary: Object.fromEntries(
          SECONDARIES.map((k) => [
            k,
            m.secondarySpecialties.includes(k) ? 50 : 0,
          ]),
        ),
      },
      injuries: m.injuries.map(wound),
      aftereffects: Array.isArray(m.aftereffects) ? copy(m.aftereffects) : [],
      activityId: null,
    };
  }
  function fillMarket(s) {
    const surnames = [
        "김",
        "이",
        "박",
        "최",
        "정",
        "강",
        "서",
        "윤",
        "한",
        "오",
        "임",
        "장",
      ],
      given = [
        "도윤",
        "지훈",
        "서준",
        "태성",
        "준혁",
        "현우",
        "수빈",
        "시우",
        "정훈",
        "하준",
        "도현",
        "지호",
        "민재",
        "진우",
        "우진",
        "서진",
        "성민",
        "시현",
      ];
    const used = new Set([...s.members, ...s.archive.members].map((m) => m.id));
    s.market.candidates = [];
    for (let i = 0; i < 12; i++) {
      let id;
      do {
        id = next(s, "candidate");
      } while (used.has(id));
      const n = s.personnel.sequence,
        tier = ["rookie", "experienced", "veteran", "specialist"][
          Math.floor(i / 3)
        ],
        base = { rookie: 56, experienced: 69, veteran: 79, specialist: 87 }[
          tier
        ],
        specialty = i % 2 ? "sniper" : "observer",
        secondarySpecialties =
          tier === "rookie"
            ? []
            : tier === "experienced"
              ? [SECONDARIES[n % 4]]
              : [SECONDARIES[n % 4], SECONDARIES[(n + 1) % 4]],
        years = { rookie: 1, experienced: 5, veteran: 10, specialist: 13 }[
          tier
        ],
        a = 22 + years + (n % 3),
        skills = Object.fromEntries(
          SKILLS.map((k, j) => [
            k,
            Math.min(
              97,
              base +
                ((n + j * 3) % 9) -
                4 +
                (k === (specialty === "sniper" ? "shooting" : "observation")
                  ? 5
                  : 0),
            ),
          ]),
        );
      s.market.candidates.push({
        id,
        name: surnames[n % 12] + given[Math.floor(n / 12) % given.length],
        age: a,
        birthDate: Number(date(s).slice(0, 4)) - a + "-01-01",
        specialty,
        secondarySpecialties,
        status: "candidate",
        skills,
        experience: years * 80,
        fatigue: 0,
        stress: 0,
        injuries: [],
        history: [],
        aftereffects: [],
        dailySalary: {
          rookie: 80000,
          experienced: 140000,
          veteran: 230000,
          specialist: 320000,
        }[tier],
        career: {
          tier,
          years,
          summary: {
            rookie: "기초 저격·관측 교육 수료",
            experienced: "보안·군 경력과 장기 관측 업무",
            veteran: "저격조 운용·현장 협업 경력",
            specialist: "정밀 관측·특수 장비 운용 전문 경력",
          }[tier],
        },
        personality: ["cautious", "assertive", "seasoned"][n % 3],
      });
    }
    s.market.refreshedAt = time(s);
    s.market.nextRefreshAt = time(s) + 12 * HOUR;
  }
  function initialize(s) {
    ok(
      s.schemaVersion === 1,
      "이미 변환된 본부에는 초기 자금을 다시 지급하지 않습니다.",
    );
    s.schemaVersion = 2;
    s.personnel = { sequence: 0 };
    s.headquarters.openingBalance = s.headquarters.funds;
    s.headquarters.ledger = [];
    s.archive = { members: [] };
    s.activities = [];
    s.relationships = [];
    s.market = { candidates: [], refreshedAt: 0, nextRefreshAt: 0 };
    s.ui.personnelTab = "roster";
    s.migration = { from: 1, at: date(s), originalSquads: copy(s.squads) };
    const members = s.members.map((m) => memberDefaults(s, m));
    s.members = [];
    for (const m of members) {
      if (["deceased", "resigned", "retired"].includes(m.status))
        s.archive.members.push({
          ...m,
          endedAt: 0,
          exitReason: "이전 명부 승계",
        });
      else {
        s.members.push(m);
        m.status = injured(m) ? "medical" : "standby";
      }
    }
    s.squads = s.squads.filter((q) =>
      [q.observerId, q.sniperId].every((id) =>
        s.members.some((m) => m.id === id && available(s, m)),
      ),
    );
    money(s, INITIAL_FUNDS, "startup-grant");
    emit(s, "startup-grant", "본부 초기 운영자금 1억원을 한 번 배정했습니다.");
    fillMarket(s);
    return s;
  }
  function hire(s, id, days) {
    current(s);
    ok(TERMS.includes(days), "계약 기간은 30일 또는 90일입니다.");
    ok(s.members.length < 10, "본부 정원은 10명입니다.");
    const candidate = s.market.candidates.find((m) => m.id === id);
    ok(candidate, "이미 계약했거나 현재 시장에 없는 후보입니다.");
    ok(
      !s.archive.members.some((m) => m.id === id),
      "전사·퇴사·은퇴 명부의 인원을 새 후보로 재사용할 수 없습니다.",
    );
    const cost = candidate.dailySalary * days;
    ok(s.headquarters.funds >= cost, "기간 급여를 선지급할 자금이 부족합니다.");
    const m = memberDefaults(s, candidate);
    m.age = age(s, m);
    m.status = "standby";
    m.contract = {
      startsAt: time(s),
      endsAt: time(s) + days * DAY,
      paidAmount: cost,
      migrated: false,
    };
    money(s, -cost, "contract-prepayment", { memberId: id, days });
    s.members.push(m);
    s.market.candidates = s.market.candidates.filter((c) => c.id !== id);
    const e = emit(
      s,
      "recruited",
      m.name +
        " · " +
        days +
        "일 계약, 기간 급여 " +
        cost.toLocaleString("ko-KR") +
        "원 선지급.",
      { memberId: id },
    );
    m.history.push({
      eventId: e.id,
      time: e.time,
      type: e.type,
      message: e.message,
    });
    return m;
  }
  function renew(s, id, days) {
    current(s);
    ok(TERMS.includes(days), "계약 기간은 30일 또는 90일입니다.");
    const m = live(s, id);
    ok(m.contract.endsAt > time(s), "이미 만료된 계약입니다.");
    ok(
      m.contract.endsAt + days * DAY - time(s) <= 365 * DAY,
      "선계약은 최대 1년까지 가능합니다.",
    );
    money(s, -m.dailySalary * days, "contract-renewal", { memberId: id, days });
    m.contract.endsAt += days * DAY;
    m.contract.paidAmount += m.dailySalary * days;
    const e = emit(
      s,
      "contract-renewed",
      m.name + " 계약 " + days + "일 연장. 기간 급여 선지급.",
      { memberId: id },
    );
    m.history.push({
      eventId: e.id,
      time: e.time,
      type: e.type,
      message: e.message,
    });
  }
  function assign(s, callsign, observerId, sniperId) {
    current(s);
    ok(C().CALLSIGNS.includes(callsign), "잘못된 호출부호입니다.");
    const o = live(s, observerId),
      n = live(s, sniperId);
    ok(
      o.specialty === "observer" && n.specialty === "sniper",
      "관측수 1명과 저격수 1명을 배정해야 합니다.",
    );
    for (const m of [o, n]) {
      ok(available(s, m), m.name + ": " + readiness(s, m));
      ok(
        !s.squads.some(
          (q) =>
            q.callsign !== callsign &&
            (q.observerId === m.id || q.sniperId === m.id),
        ),
        "다른 저격조에 이미 배정된 대원입니다.",
      );
    }
    s.squads = s.squads.filter((q) => q.callsign !== callsign);
    s.squads.push({ callsign, observerId, sniperId });
    emit(
      s,
      "squad-assigned",
      callsign + " · 관측수 " + o.name + " / 저격수 " + n.name + " 편성.",
      { callsign, memberIds: [o.id, n.id] },
    );
  }
  function clearSquad(s, callsign) {
    current(s);
    const q = s.squads.find((q) => q.callsign === callsign);
    ok(q, "편성되지 않은 저격조입니다.");
    ok(
      !s.activities.some(
        (a) => a.status === "running" && a.callsign === callsign,
      ),
      "공동 훈련을 마치거나 중단한 뒤 해제하세요.",
    );
    s.squads = s.squads.filter((q) => q.callsign !== callsign);
    emit(s, "squad-cleared", callsign + " 편성을 해제했습니다.", { callsign });
  }
  function start(
    s,
    { kind, memberIds, course = null, hours, callsign = null },
  ) {
    current(s);
    ok(
      ["training", "rest", "treatment", "rehab", "pair"].includes(kind),
      "지원하지 않는 본부 활동입니다.",
    );
    ok(
      Array.isArray(memberIds) &&
        new Set(memberIds).size === memberIds.length &&
        memberIds.length === (kind === "pair" ? 2 : 1),
      "활동 인원 구성이 잘못되었습니다.",
    );
    const members = memberIds.map((id) => live(s, id));
    for (const m of members) {
      ok(!m.activityId, "이미 진행 중인 활동이 있습니다.");
      ok(m.contract.endsAt > time(s), "계약이 만료된 인원입니다.");
      if (kind !== "pair")
        ok(!paired(s, m.id), "개인 활동 전 저격조 편성을 해제하세요.");
    }
    let duration,
      cost = 0;
    if (kind === "training") {
      ok([4, 8].includes(hours), "훈련은 4시간 또는 8시간입니다.");
      ok(
        [...SKILLS, ...SECONDARIES].includes(course),
        "훈련 과목이 잘못되었습니다.",
      );
      for (const m of members) {
        ok(
          !injured(m) && m.fatigue <= 75 && m.stress <= 80,
          "부상·피로·스트레스 회복 후 훈련하세요.",
        );
        ok(
          !SECONDARIES.includes(course) ||
            m.secondarySpecialties.includes(course) ||
            m.secondarySpecialties.length < 2,
          "부특기는 최대 2개입니다.",
        );
      }
      duration = hours * HOUR;
      cost = hours * 25000;
    }
    if (kind === "rest") {
      ok([2, 6, 12].includes(hours), "휴식은 2/6/12시간입니다.");
      ok(!injured(members[0]), "미회복 부상은 진료를 받으세요.");
      duration = hours * HOUR;
    }
    if (kind === "treatment") {
      const wounds = members[0].injuries.filter((w) => !w.healed);
      ok(wounds.length, "치료할 부상이 없습니다.");
      const plan = treatmentPlan(members[0]);
      duration = plan.seconds;
      cost = plan.cost;
    }
    if (kind === "rehab") {
      ok(
        !injured(members[0]) && members[0].aftereffects.length > 0,
        "급성 부상 치료를 마친 후 후유증 재활을 진행하세요.",
      );
      duration = 24 * HOUR;
      cost = 200000;
    }
    if (kind === "pair") {
      const q = s.squads.find((q) => q.callsign === callsign);
      ok(
        q && q.observerId === memberIds[0] && q.sniperId === memberIds[1],
        "현재 편성된 관측수·저격수 순서로 공동 훈련해야 합니다.",
      );
      ok(
        members.every((m) => available(s, m)),
        "두 대원이 모두 훈련 가능한 대기 상태여야 합니다.",
      );
      duration = 4 * HOUR;
      cost = 200000;
    }
    ok(
      members.every((m) => m.contract.endsAt >= time(s) + duration),
      "활동 완료 전 계약이 만료됩니다. 먼저 계약을 연장하세요.",
    );
    ok(s.headquarters.funds >= cost, "활동 비용이 부족합니다.");
    const id = next(s, "activity"),
      a = {
        id,
        kind,
        memberIds: memberIds.slice(),
        course,
        callsign,
        status: "running",
        startedAt: time(s),
        dueAt: time(s) + duration,
        workedSeconds: 0,
        cost,
      };
    if (cost) money(s, -cost, "activity-cost", { activityId: id });
    s.activities.push(a);
    if (s.activities.length > 200) {
      const old = s.activities.filter((a) => a.status !== "running");
      for (const x of old.slice(0, s.activities.length - 200))
        s.activities.splice(s.activities.indexOf(x), 1);
    }
    for (const m of members) {
      m.activityId = id;
      m.status =
        kind === "rest"
          ? "resting"
          : ["treatment", "rehab"].includes(kind)
            ? "treatment"
            : "training";
    }
    emit(
      s,
      "activity-started",
      members.map((m) => m.name).join("·") +
        " · " +
        (LABELS[course] ||
          {
            rest: "휴식",
            treatment: "협력 진료",
            rehab: "재활",
            pair: "공동 훈련",
          }[kind]) +
        " 착수.",
      { activityId: id, memberIds: a.memberIds },
    );
    return a;
  }
  function cancel(s, id, reason = "본부 지시로 중단") {
    current(s);
    const a = s.activities.find((a) => a.id === id);
    ok(a && a.status === "running", "진행 중인 활동이 아닙니다.");
    a.status = "cancelled";
    a.completedAt = time(s);
    a.cancelReason = reason;
    for (const memberId of a.memberIds) {
      const m = s.members.find((m) => m.id === memberId);
      if (m?.activityId === a.id) {
        m.activityId = null;
        m.status = injured(m) ? "medical" : "standby";
      }
    }
    emit(
      s,
      "activity-cancelled",
      reason + " · 착수 비용은 환급하지 않습니다.",
      { activityId: id, memberIds: a.memberIds },
    );
  }
  function relationship(s, q) {
    const ids = [q.observerId, q.sniperId].sort();
    return (
      s.relationships.find(
        (r) => r.memberIds[0] === ids[0] && r.memberIds[1] === ids[1],
      ) || { memberIds: ids, hours: 0, cohesion: 50 }
    );
  }
  function finish(s, a) {
    if (a.status !== "running") return;
    a.status = "completed";
    a.completedAt = time(s);
    const members = a.memberIds.map((id) => live(s, id));
    for (const m of members) {
      m.activityId = null;
      m.status = "standby";
      if (a.kind === "training") {
        if (SKILLS.includes(a.course))
          m.skills[a.course] = Math.min(
            100,
            m.skills[a.course] +
              Math.max(
                1,
                Math.round(
                  ((a.dueAt - a.startedAt) / HOUR) *
                    0.4 *
                    (1 - m.skills[a.course] / 140),
                ),
              ),
          );
        else {
          m.proficiency.secondary[a.course] = Math.min(
            100,
            m.proficiency.secondary[a.course] +
              ((a.dueAt - a.startedAt) / HOUR) * 6,
          );
          if (
            m.proficiency.secondary[a.course] >= 40 &&
            !m.secondarySpecialties.includes(a.course) &&
            m.secondarySpecialties.length < 2
          )
            m.secondarySpecialties.push(a.course);
        }
        m.proficiency.primary = Math.min(100, m.proficiency.primary + 1);
        m.experience += ((a.dueAt - a.startedAt) / HOUR) * 8;
      }
      if (a.kind === "treatment") {
        for (const w of m.injuries.filter((w) => !w.healed)) {
          w.healed = true;
          w.treated = true;
          w.healedAt = time(s);
          if (w.severity === 3 && w.part !== "unknown") {
            const skill = /Arm/.test(w.part)
              ? "shooting"
              : /Leg|chest|abdomen/.test(w.part)
                ? "fitness"
                : "judgment";
            if (!m.aftereffects.some((e) => e.injuryId === w.id))
              m.aftereffects.push({
                id: "aftereffect-" + w.id,
                injuryId: w.id,
                skill,
                penalty: 10,
              });
          }
        }
        m.stress = Math.max(0, m.stress - 10);
      }
      if (a.kind === "rehab") m.aftereffects = [];
      if (a.kind === "pair") {
        m.skills.teamwork = Math.min(100, m.skills.teamwork + 1);
        m.experience += 24;
      }
    }
    if (a.kind === "pair") {
      const q = { observerId: a.memberIds[0], sniperId: a.memberIds[1] },
        r = relationship(s, q);
      if (!s.relationships.includes(r)) s.relationships.push(r);
      r.hours += 4;
      r.cohesion = Math.min(100, r.cohesion + 5);
    }
    const e = emit(
      s,
      "activity-completed",
      members.map((m) => m.name).join("·") +
        " · " +
        (LABELS[a.course] ||
          {
            rest: "휴식",
            treatment: "협력 진료",
            rehab: "재활",
            pair: "공동 훈련",
          }[a.kind]) +
        " 완료.",
      { activityId: a.id, memberIds: a.memberIds },
    );
    for (const m of members)
      m.history.push({
        eventId: e.id,
        time: e.time,
        type: e.type,
        message: e.message,
        activityId: a.id,
        kind: a.kind,
      });
  }
  function exit(s, id, reason) {
    const m = live(s, id);
    if (m.activityId)
      cancel(s, m.activityId, m.name + " 복무 종료로 활동 중단");
    const q = paired(s, id);
    if (q) {
      s.squads = s.squads.filter((x) => x.callsign !== q.callsign);
      emit(
        s,
        "squad-cleared",
        m.name + " 복무 종료에 따라 " + q.callsign + " 편성을 해제했습니다.",
        { callsign: q.callsign },
      );
    }
    m.age = age(s, m);
    m.status =
      reason === "death"
        ? "deceased"
        : reason === "retirement"
          ? "retired"
          : "resigned";
    m.endedAt = time(s);
    m.exitReason = reason;
    s.members = s.members.filter((x) => x.id !== id);
    s.archive.members.push(m);
    const e = emit(
      s,
      reason === "expiry"
        ? "contract-expired"
        : reason === "death"
          ? "casualty"
          : reason === "retirement"
            ? "retired"
            : "resigned",
      m.name +
        " · " +
        {
          expiry: "계약 만료",
          death: "전사 · 영구 손실",
          retirement: "은퇴",
          release: "계약 조기 종료",
        }[reason] +
        " 기록.",
      { memberId: id },
    );
    m.history.push({
      eventId: e.id,
      time: e.time,
      type: e.type,
      message: e.message,
    });
    return m;
  }
  function release(s, id, reason = "release") {
    current(s);
    ok(
      ["release", "retirement"].includes(reason),
      "잘못된 복무 종료 사유입니다.",
    );
    const m = live(s, id);
    ok(
      reason !== "retirement" || age(s, m) >= 50 || m.aftereffects.length > 0,
      "은퇴는 50세 이상 또는 후유증이 있는 대원에게 적용합니다.",
    );
    return exit(s, id, reason);
  }
  function advance(s) {
    current(s);
    const active = s.activities.filter((a) => a.status === "running");
    ok(active.length, "진행 중인 본부 활동이 없습니다.");
    const target = Math.min(...active.map((a) => a.dueAt));
    ok(target > time(s), "활동 기한 상태를 확인하세요.");
    let cursor = time(s);
    while (cursor < target) {
      const expiry = Math.min(
          target,
          ...s.members
            .filter((m) => m.contract.endsAt > cursor)
            .map((m) => m.contract.endsAt),
        ),
        point = Math.min(target, expiry),
        delta = point - cursor;
      ok(delta > 0, "시간 진행 상태가 잘못되었습니다.");
      for (const a of s.activities.filter((a) => a.status === "running")) {
        const elapsed = Math.max(
          0,
          Math.min(point, a.dueAt) - Math.max(cursor, a.startedAt),
        );
        a.workedSeconds += elapsed;
        for (const id of a.memberIds) {
          const m = live(s, id),
            h = elapsed / HOUR;
          if (a.kind === "rest") {
            m.fatigue = Math.max(0, m.fatigue - h * 3);
            m.stress = Math.max(0, m.stress - h * 2);
          } else if (["training", "pair"].includes(a.kind)) {
            m.fatigue = Math.min(100, m.fatigue + h * 1.5);
            m.stress = Math.min(100, m.stress + h * 0.8);
          }
        }
      }
      s.clock.elapsedSeconds = point;
      for (const a of s.activities.filter(
        (a) => a.status === "running" && a.dueAt <= point,
      ))
        finish(s, a);
      for (const m of s.members.slice())
        if (m.contract.endsAt <= point) exit(s, m.id, "expiry");
        else m.age = age(s, m);
      cursor = point;
    }
    return target;
  }
  function refreshMarket(s) {
    current(s);
    ok(
      time(s) >= s.market.nextRefreshAt,
      "시장 갱신까지 본부 활동 시간이 더 필요합니다.",
    );
    money(s, -50000, "recruitment-search");
    fillMarket(s);
    emit(s, "market-refreshed", "모집 후보를 갱신했습니다. 검토 비용 5만원.");
  }
  function casualty(s, event) {
    current(s);
    ok(
      event &&
        text(event.id) &&
        text(event.missionId) &&
        text(event.memberId) &&
        ["injury", "death"].includes(event.kind),
      "실제 전장 사건 ID·작전·대원 정보가 필요합니다.",
    );
    if (
      s.records.some(
        (r) =>
          r.sourceEventId === event.id &&
          r.memberId === event.memberId &&
          r.type === (event.kind === "death" ? "casualty" : "injury"),
      ) ||
      s.archive.members.some(
        (m) => m.id === event.memberId && m.fatalEventId === event.id,
      ) ||
      [...s.members, ...s.archive.members].some(
        (m) =>
          m.id === event.memberId &&
          m.injuries.some((w) => w.sourceEventId === event.id) &&
          event.kind === "injury",
      )
    )
      return false;
    const m = live(s, event.memberId);
    if (event.kind === "death") {
      m.fatalEventId = event.id;
      const archived = exit(s, m.id, "death");
      s.records[s.records.length - 1].sourceEventId = event.id;
      Object.assign(archived.history.at(-1), {
        sourceEventId: event.id,
        missionId: event.missionId,
      });
      return true;
    }
    ok(
      integer(event.severity, 1, 3) && text(event.injuryType),
      "부상 정도와 실제 부상 유형이 필요합니다.",
    );
    if (m.activityId) cancel(s, m.activityId, "부상 기록 수신으로 활동 중단");
    const q = paired(s, m.id);
    if (q) s.squads = s.squads.filter((x) => x.callsign !== q.callsign);
    const w = wound(
      {
        id: "injury-" + event.id,
        part: event.part || "unknown",
        type: event.injuryType,
        severity: event.severity,
        sourceEventId: event.id,
      },
      m.injuries.length,
    );
    m.injuries.push(w);
    m.status = "medical";
    const e = emit(
      s,
      "injury",
      m.name + " · " + w.type + " 기록 수신. 진료·회복 평가가 필요합니다.",
      {
        memberId: m.id,
        sourceEventId: event.id,
        missionId: event.missionId,
        injuryId: w.id,
      },
    );
    m.history.push({
      eventId: e.id,
      time: e.time,
      type: e.type,
      message: e.message,
      sourceEventId: event.id,
    });
    return true;
  }
  function validateState(s) {
    ok(
      s && s.game === "BLACKLINE_OVERWATCH" && s.schemaVersion === 2,
      "2단계 저장 형식이 아닙니다.",
    );
    ok(
      text(s.campaignId) &&
        integer(s.revision) &&
        Number.isFinite(Date.parse(s.createdAt)) &&
        Number.isFinite(Date.parse(s.updatedAt)),
      "저장 식별 정보가 잘못되었습니다.",
    );
    ok(
      s.clock &&
        num(s.clock.elapsedSeconds, 0, 100 * 365 * DAY) &&
        s.clock.paused === true &&
        [1, 2, 4].includes(s.clock.speed) &&
        typeof s.clock.emergencyPause === "boolean",
      "본부 활동 시계가 잘못되었습니다.",
    );
    ok(
      s.headquarters &&
        text(s.headquarters.name, 60) &&
        integer(s.headquarters.funds) &&
        integer(Math.abs(s.headquarters.openingBalance)) &&
        Array.isArray(s.headquarters.ledger),
      "본부 장부가 잘못되었습니다.",
    );
    let balance = s.headquarters.openingBalance;
    const ledgerIds = new Set();
    for (const e of s.headquarters.ledger) {
      ok(
        text(e.id) &&
          !ledgerIds.has(e.id) &&
          integer(Math.abs(e.amount)) &&
          num(e.time, 0, time(s)),
        "중복 또는 잘못된 자금 기록입니다.",
      );
      ledgerIds.add(e.id);
      balance += e.amount;
    }
    ok(
      balance === s.headquarters.funds,
      "자금과 실제 장부가 일치하지 않습니다.",
    );
    ok(
      s.personnel && integer(s.personnel.sequence),
      "인사 순번이 잘못되었습니다.",
    );
    ok(
      Array.isArray(s.members) &&
        s.members.length <= 10 &&
        s.archive &&
        Array.isArray(s.archive.members) &&
        s.market &&
        Array.isArray(s.market.candidates) &&
        s.market.candidates.length <= 12,
      "인원/보관/후보 정원이 잘못되었습니다.",
    );
    ok(
      num(s.market.refreshedAt, 0, time(s)) &&
        num(s.market.nextRefreshAt, s.market.refreshedAt),
      "모집 시장 시간이 잘못되었습니다.",
    );
    const ids = new Set();
    for (const [group, people] of [
      ["live", s.members],
      ["archive", s.archive.members],
      ["candidate", s.market.candidates],
    ])
      for (const m of people) {
        ok(
          m && text(m.id) && !ids.has(m.id) && text(m.name, 60),
          "중복되거나 잘못된 인원입니다.",
        );
        ids.add(m.id);
        ok(
          ["observer", "sniper"].includes(m.specialty) &&
            integer(m.age, 18, 100),
          "주특기 또는 나이가 잘못되었습니다.",
        );
        ok(
          Array.isArray(m.secondarySpecialties) &&
            m.secondarySpecialties.length <= 2 &&
            new Set(m.secondarySpecialties).size ===
              m.secondarySpecialties.length &&
            m.secondarySpecialties.every((k) => SECONDARIES.includes(k)),
          "부특기는 최대 2개이며 중복할 수 없습니다.",
        );
        ok(
          m.skills &&
            SKILLS.every((k) => num(m.skills[k], 0, 100)) &&
            num(m.fatigue, 0, 100) &&
            num(m.stress, 0, 100) &&
            num(m.experience) &&
            Array.isArray(m.history) &&
            Array.isArray(m.injuries) &&
            Array.isArray(m.aftereffects),
          "대원 상태가 잘못되었습니다.",
        );
        ok(
          integer(m.dailySalary, 1) &&
            m.career &&
            ["rookie", "experienced", "veteran", "specialist"].includes(
              m.career.tier,
            ) &&
            integer(m.career.years, 0, 80) &&
            text(m.career.summary, 1000) &&
            ["cautious", "assertive", "seasoned"].includes(m.personality) &&
            text(m.birthDate) &&
            Number.isFinite(Date.parse(m.birthDate)),
          "경력·일급·생년월일이 잘못되었습니다.",
        );
        for (const w of m.injuries)
          ok(
            text(w.id) &&
              text(w.type) &&
              integer(w.severity, 1, 3) &&
              typeof w.healed === "boolean" &&
              typeof w.treated === "boolean",
            "부상 기록이 잘못되었습니다.",
          );
        for (const e of m.aftereffects)
          ok(
            text(e.id) &&
              text(e.injuryId) &&
              SKILLS.includes(e.skill) &&
              num(e.penalty, 0, 100),
            "후유증 기록이 잘못되었습니다.",
          );
        if (group === "candidate") {
          ok(m.status === "candidate", "후보 상태가 잘못되었습니다.");
          continue;
        }
        ok(
          m.contract &&
            num(m.contract.startsAt, 0, time(s)) &&
            num(m.contract.endsAt, m.contract.startsAt) &&
            integer(m.contract.paidAmount),
          "계약 정보가 잘못되었습니다.",
        );
        ok(
          m.proficiency &&
            num(m.proficiency.primary, 0, 100) &&
            m.proficiency.secondary &&
            SECONDARIES.every((k) => num(m.proficiency.secondary[k], 0, 100)),
          "숙련도 정보가 잘못되었습니다.",
        );
        ok(
          group === "archive"
            ? ["deceased", "resigned", "retired"].includes(m.status)
            : [
                "standby",
                "medical",
                "training",
                "resting",
                "treatment",
              ].includes(m.status),
          "현직/보관 인원 상태가 잘못되었습니다.",
        );
        if (group === "live")
          ok(
            m.contract.endsAt > time(s),
            "만료 인원이 현직 명부에 남아 있습니다.",
          );
      }
    ok(
      Array.isArray(s.activities) && s.activities.length <= 200,
      "활동 기록이 잘못되었습니다.",
    );
    const activityIds = new Set(),
      busy = new Set();
    for (const a of s.activities) {
      ok(
        text(a.id) &&
          !activityIds.has(a.id) &&
          ["training", "rest", "treatment", "rehab", "pair"].includes(a.kind) &&
          ["running", "completed", "cancelled"].includes(a.status) &&
          Array.isArray(a.memberIds) &&
          a.memberIds.length === (a.kind === "pair" ? 2 : 1) &&
          new Set(a.memberIds).size === a.memberIds.length &&
          num(a.startedAt, 0, time(s)) &&
          num(a.dueAt, a.startedAt) &&
          num(a.workedSeconds, 0, a.dueAt - a.startedAt) &&
          integer(a.cost),
        "활동 상태가 잘못되었습니다.",
      );
      activityIds.add(a.id);
      ok(
        a.dueAt > a.startedAt &&
          (a.kind !== "training" ||
            [...SKILLS, ...SECONDARIES].includes(a.course)),
        "활동 기간·훈련 과목이 잘못되었습니다.",
      );
      if (a.status === "running" && a.kind === "pair")
        ok(
          s.squads.some(
            (q) =>
              q.callsign === a.callsign &&
              q.observerId === a.memberIds[0] &&
              q.sniperId === a.memberIds[1],
          ),
          "공동 훈련과 실제 편성이 일치하지 않습니다.",
        );
      if (a.status === "running") {
        ok(
          a.dueAt > time(s) && a.workedSeconds === time(s) - a.startedAt,
          "활동 기한·진행 시간이 일치하지 않습니다.",
        );
        for (const id of a.memberIds) {
          const m = s.members.find((m) => m.id === id);
          ok(
            m &&
              m.activityId === a.id &&
              !busy.has(id) &&
              m.status ===
                (a.kind === "rest"
                  ? "resting"
                  : ["treatment", "rehab"].includes(a.kind)
                    ? "treatment"
                    : "training"),
            "대원 활동 중복 또는 상태 불일치입니다.",
          );
          busy.add(id);
        }
      }
    }
    for (const m of s.members)
      ok(
        m.activityId
          ? busy.has(m.id)
          : ["standby", "medical"].includes(m.status),
        "대원과 활동 연결이 잘못되었습니다.",
      );
    ok(
      Array.isArray(s.squads) && s.squads.length <= 3,
      "저격조는 최대 3개입니다.",
    );
    const names = new Set(),
      assigned = new Set();
    for (const q of s.squads) {
      ok(
        C().CALLSIGNS.includes(q.callsign) && !names.has(q.callsign),
        "호출부호가 중복되었습니다.",
      );
      names.add(q.callsign);
      for (const [key, role] of [
        ["observerId", "observer"],
        ["sniperId", "sniper"],
      ]) {
        const m = s.members.find((m) => m.id === q[key]);
        const pairJob =
          m?.activityId &&
          s.activities.find(
            (a) =>
              a.id === m.activityId &&
              a.kind === "pair" &&
              a.callsign === q.callsign &&
              a.status === "running",
          );
        ok(
          m &&
            m.specialty === role &&
            !assigned.has(m.id) &&
            !injured(m) &&
            (m.status === "standby" || pairJob),
          "저격조 인원·역할·상태가 잘못되었습니다.",
        );
        assigned.add(m.id);
      }
    }
    ok(assigned.size <= 6, "출격 편성은 최대 6명입니다.");
    ok(
      Array.isArray(s.relationships) &&
        s.relationships.every(
          (r) =>
            Array.isArray(r.memberIds) &&
            r.memberIds.length === 2 &&
            r.memberIds[0] !== r.memberIds[1] &&
            r.memberIds.every((id) => ids.has(id)) &&
            num(r.hours) &&
            num(r.cohesion, 0, 100),
        ),
      "2인 팀워크 정보가 잘못되었습니다.",
    );
    ok(
      s.activeMission === null &&
        Array.isArray(s.contracts) &&
        s.contracts.length === 0 &&
        s.inventory &&
        Array.isArray(s.inventory.items) &&
        s.inventory.items.length === 0,
      "전장·장비 엔진은 아직 연결하지 않았습니다.",
    );
    ok(
      Array.isArray(s.records) && s.records.length <= 500,
      "사건 기록이 잘못되었습니다.",
    );
    const eventIds = new Set();
    for (const e of s.records) {
      ok(
        text(e.id) &&
          !eventIds.has(e.id) &&
          TYPES.includes(e.type) &&
          num(e.time, 0, time(s)) &&
          text(e.message, 1000),
        "사건 ID·시간·내용이 잘못되었습니다.",
      );
      eventIds.add(e.id);
    }
    ok(
      s.settings &&
        typeof s.settings.reducedMotion === "boolean" &&
        s.ui &&
        [
          "headquarters",
          "personnel",
          "contracts",
          "equipment",
          "records",
          "storage",
        ].includes(s.ui.tab) &&
        ["roster", "market", "squads", "archive"].includes(s.ui.personnelTab),
      "본부 설정이 잘못되었습니다.",
    );
    return s;
  }
  const api = {
    HOUR,
    DAY,
    INITIAL_FUNDS,
    TERMS,
    treatmentPlan,
    SKILLS,
    SECONDARIES,
    LABELS,
    initialize,
    validateState,
    hire,
    renew,
    assign,
    clearSquad,
    start,
    cancel,
    advance,
    refreshMarket,
    release,
    casualty,
    readiness,
    effectiveSkills,
    relationship,
    age,
    date,
    injured,
  };
  root.OverwatchPersonnel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
