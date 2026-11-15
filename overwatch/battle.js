/* Phase 4 field simulator. All damage/ammunition live in the saved exercise;
   campaign casualties, agency contracts and inventory settlement belong to phase 5/6. */
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
    copy = (x) => JSON.parse(JSON.stringify(x)),
    ok = (v, m) => {
      if (!v) throw Error(m);
    };
  const WEAPONS = {
    AXMC: {
      name: "Accuracy International AXMC",
      calibre: ".338 Lapua Magnum",
      capacity: 10,
      range: 1100,
      cycle: 8,
      reload: 6,
      dispersion: 0.00035,
      power: 3,
      suppressed: true,
    },
    HK416: {
      name: "HK416",
      calibre: "5.56×45mm",
      capacity: 30,
      range: 450,
      cycle: 3,
      reload: 4,
      dispersion: 0.0009,
      power: 2,
      suppressed: true,
    },
    AKM: {
      name: "AKM",
      calibre: "7.62×39mm",
      capacity: 30,
      range: 350,
      cycle: 4,
      reload: 5,
      dispersion: 0.0016,
      power: 2,
      suppressed: false,
    },
    SVD: {
      name: "SVD",
      calibre: "7.62×54mmR",
      capacity: 10,
      range: 750,
      cycle: 10,
      reload: 6,
      dispersion: 0.0008,
      power: 3,
      suppressed: false,
    },
    G19: {
      name: "Glock 19 Gen5",
      calibre: "9×19mm",
      capacity: 15,
      range: 65,
      cycle: 3,
      reload: 3,
      dispersion: 0.003,
      power: 1,
      suppressed: false,
    },
  };
  const parts = [
    "head",
    "chest",
    "abdomen",
    "leftArm",
    "rightArm",
    "leftLeg",
    "rightLeg",
  ];
  const I = () => D().internals,
    all = (e) => [...e.world.units, ...e.world.actors],
    rand = (e) => {
      let x = e.battle.rng | 0;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      e.battle.rng = x >>> 0;
      return e.battle.rng / 4294967296;
    },
    unit = (e, id) => all(e).find((u) => u.id === id),
    qOf = (e, id) =>
      e.squads.find((q) => [q.observerId, q.sniperId].includes(id));
  const friendsFor = (e, u) => {
    const q = qOf(e, u.id);
    return q ? I().friendSnapshots(e, q) : [];
  };
  function initialize(s) {
    ok(s.schemaVersion === 3, "3단계 저장에서 전환해야 합니다.");
    s.schemaVersion = 4;
    s.fieldPreferences = { view: "3d" };
    return s;
  }
  function health() {
    return {
      alive: true,
      conscious: true,
      bloodMl: 5000,
      wounds: [],
      aid: null,
      kit: 1,
    };
  }
  function weapon(model, magazines = 4) {
    const w = WEAPONS[model];
    return {
      model,
      loaded: w.capacity,
      magazines: Array(magazines).fill(w.capacity),
      spent: 0,
      initial: w.capacity * (magazines + 1),
      reloadUntil: null,
      aimSince: null,
      targetId: null,
      nextFireAt: 0,
      condition: 100,
    };
  }
  function healthy(u) {
    return u.health.alive && u.health.conscious;
  }
  function untreated(u) {
    return u.health.wounds.some((w) => !w.treated);
  }
  function moveFactor(u) {
    if (!u.health) return 1;
    if (!healthy(u) || untreated(u) || u.health.aid?.phase === "treating")
      return 0;
    const legs = u.health.wounds.filter((w) => /Leg/.test(w.part));
    if (legs.some((w) => w.severity === 3)) return 0;
    return Math.max(0.35, 1 - legs.length * 0.25) * (u.carrying ? 0.5 : 1);
  }
  function canCommand(u) {
    return !u.health || healthy(u);
  }
  function commandReady(u) {
    return (
      !u.health ||
      (!u.health.aid && !u.carriedBy && !u.carrying && !untreated(u))
    );
  }
  function snapshot(u) {
    return {
      health: {
        alive: u.health.alive,
        conscious: u.health.conscious,
        bloodMl: Math.round(u.health.bloodMl),
        wounds: copy(u.health.wounds),
        kit: u.health.kit,
        aid: u.health.aid
          ? {
              phase: u.health.aid.phase,
              targetId: u.health.aid.targetId,
              dueAt: u.health.aid.dueAt,
            }
          : null,
      },
      weapon: {
        ...copy(u.weapon),
        name: WEAPONS[u.weapon.model].name,
        capacity: WEAPONS[u.weapon.model].capacity,
      },
      heading: u.heading || 0,
      pose: !u.health.alive
        ? "dead"
        : u.carriedBy
          ? "carried"
          : !u.health.conscious
            ? "down"
            : u.health.aid?.phase === "treating"
              ? "aid"
              : u.carrying
                ? "carrying"
                : u.prone
                  ? "prone"
                  : "standing",
      carriedBy: u.carriedBy || null,
    };
  }
  function begin(s, { scenario = "recon", seed } = {}) {
    ok(s.schemaVersion === 4, "4단계 저장으로 전환해야 합니다.");
    ok(
      ["recon", "interdiction"].includes(scenario),
      "전장 연습 유형이 잘못되었습니다.",
    );
    const e = D().begin(s);
    const baseSeed =
      (seed ??
        (s.commandSequence * 2654435761) ^
          Math.floor(s.clock.elapsedSeconds)) >>> 0;
    e.battle = {
      version: 1,
      scenario,
      rng: baseSeed || 1,
      speed: 1,
      phase: "field",
      startedAt: e.time,
      shots: [],
      totalShots: 0,
      noises: [],
      packets: [],
      delivered: [],
      lastPacket: -2,
      knowledge: { effects: [], objective: false },
      objective: { done: false, reported: false, returnRequested: false },
      weather: {
        visibility: scenario === "recon" ? 1 : 0.82,
        wind: ((baseSeed % 13) - 6) / 4,
        timeOfDay: baseSeed % 2 ? "day" : "overcast",
      },
      result: null,
    };
    e.paused = true;
    e.pauseReason = "출동 준비 · 재생을 눌러 시작";
    s.clock.paused = true;
    s.clock.speed = 1;
    for (const u of e.world.units) {
      const m = s.members.find((m) => m.id === u.id);
      u.health = health();
      u.weapon = weapon(u.role === "sniper" ? "AXMC" : "HK416");
      u.sidearm = weapon("G19", 2);
      u.skill = P.effectiveSkills(m).shooting;
      u.medicalSkill = m.secondarySpecialties.includes("firstAid");
      u.prone = false;
      u.lastThreatAt = -100;
      u.lastNoiseAt = -100;
      u.carrying = null;
      u.carriedBy = null;
      u.extracted = false;
      u.lastMedicalReport = -100;
    }
    e.world.actors = [];
    const anchors = [
      { x: 470, y: 145 },
      { x: 740, y: 190 },
      { x: 1020, y: 300 },
      { x: 930, y: 570 },
    ];
    for (let i = 0; i < 4; i++) {
      const p = anchors[i],
        dx = (rand(e) - 0.5) * 24,
        model = i === 1 ? "SVD" : "AKM";
      e.world.actors.push({
        id: "opposition-" + i,
        x: p.x + dx,
        y: p.y,
        speed: 0.6 + i * 0.08,
        waypoint: 0,
        route: [
          { x: p.x + dx, y: p.y },
          { x: p.x + 60, y: p.y + 40 },
        ],
        kind: "training-target",
        armed: true,
        side: "red",
        health: health(),
        weapon: weapon(model, 2),
        sidearm: weapon("G19", 1),
        skill: 47 + i * 4,
        heading: Math.PI,
        state: "patrol",
        memory: [],
        path: [],
        goal: null,
        prone: false,
        lastThreatAt: -100,
        lastNoiseAt: -100,
        medicalSkill: i === 2,
        carrying: null,
        carriedBy: null,
        nextScan: 0,
      });
    }
    e.world.actors.push({
      id: "civilian-0",
      x: 370,
      y: 510,
      speed: 0.45,
      waypoint: 0,
      route: [
        { x: 370, y: 510 },
        { x: 380, y: 640 },
      ],
      kind: "unarmed-target",
      armed: false,
      side: "civilian",
      health: health(),
      weapon: weapon("G19", 0),
      sidearm: weapon("G19", 0),
      skill: 0,
      heading: 0,
      state: "walking",
      memory: [],
      path: [],
      goal: null,
      prone: false,
      lastThreatAt: -100,
      lastNoiseAt: -100,
      medicalSkill: false,
      carrying: null,
      carriedBy: null,
    });
    // Initial queued range-ready packet is stale: first actual field telemetry supplies loadout/health.
    const ev = I().event(e, "field-started", { scenario, seed: e.battle.rng });
    for (const q of e.squads)
      I().report(
        s,
        e,
        q,
        "ready",
        q.callsign +
          ". 전장 연습 시작. 지급 탄약·생체 정보 송신. 실전 계약·본부 재고 정산과 분리한다.",
        ev,
        { friends: I().friendSnapshots(e, q) },
      );
    return e;
  }
  function setPaused(s, paused) {
    const e = s.commandExercise;
    ok(e?.battle && e.status === "running", "진행 중인 모의 전장이 없습니다.");
    e.paused = !!paused;
    e.pauseReason = paused ? "본부 일시정지" : null;
    s.clock.paused = e.paused;
  }
  function speed(s, value) {
    ok([1, 2, 4].includes(value), "배속은 1·2·4배입니다.");
    ok(s.commandExercise?.battle, "전장 연습이 없습니다.");
    s.commandExercise.battle.speed = value;
    s.clock.speed = value;
  }
  function activeActor(u) {
    return u.health.alive && u.health.conscious;
  }
  function causeReport(s, e, u, kind, body, ev, payload = {}) {
    const q = qOf(e, u.id);
    if (q && I().leader(e, q)?.capable)
      I().report(s, e, q, kind, q.callsign + ". " + body, ev, payload);
  }
  function bandage(s, e, u, target) {
    if (
      u.health.aid ||
      u.health.kit <= 0 ||
      !healthy(u) ||
      !target.health.alive ||
      !untreated(target)
    )
      return;
    u.health.kit--;
    const duration = u.medicalSkill ? 25 : 45;
    u.health.aid = {
      phase: "treating",
      targetId: target.id,
      dueAt: e.time + duration,
      resumePath: copy(u.path || []),
      resumeGoal: copy(u.goal || null),
    };
    u.path = [];
    u.state = "first-aid";
    const ev = I().event(e, "aid-started", {
      actorId: u.id,
      targetId: target.id,
      dueAt: e.time + duration,
    });
    causeReport(
      s,
      e,
      u,
      "medical",
      (u.id === target.id ? "자가 응급처치" : "조원 응급처치") +
        " 시작. 의무품 1개 사용, 약 " +
        duration +
        "초 소요. 다른 조원은 경계 유지.",
      ev,
      { friends: friendsFor(e, u) },
    );
  }
  function beforeTick(s, e) {
    for (const u of all(e)) {
      const h = u.health;
      if (!h?.alive) continue;
      const loss = h.wounds
        .filter((w) => !w.treated)
        .reduce((n, w) => n + [0, 0.25, 1.5, 7][w.severity], 0);
      h.bloodMl = Math.max(0, h.bloodMl - loss);
      if (h.bloodMl < 2600) h.conscious = false;
      if (h.bloodMl < 1600) {
        h.alive = false;
        h.conscious = false;
        u.capable = false;
        u.path = [];
        u.state = "dead";
        I().event(e, "death", { actorId: u.id, cause: "blood-loss" });
      }
      if (h.aid) {
        const a = h.aid,
          t = unit(e, a.targetId);
        if (!healthy(u) || !t?.health.alive || G.distance(u, t) > 15) {
          h.aid = null;
          continue;
        }
        if (e.time >= a.dueAt) {
          for (const w of t.health.wounds) w.treated = true;
          h.aid = null;
          u.path = a.resumePath;
          if (healthy(t) && moveFactor(t) > 0) t.prone = false;
          u.goal = a.resumeGoal;
          if (!u.path.length && u.goal && moveFactor(u) > 0)
            u.path = G.path(u, u.goal);
          const ev = I().event(e, "aid-completed", {
            actorId: u.id,
            targetId: t.id,
          });
          causeReport(
            s,
            e,
            u,
            "medical",
            "지혈·응급처치 완료. 부상 이력은 유지하며 복귀 후 치료가 필요하다.",
            ev,
            { friends: friendsFor(e, u) },
          );
          if (u.id !== t.id && moveFactor(t) === 0) {
            u.carrying = t.id;
            t.carriedBy = u.id;
            u.path = G.path(u, G.MAP.base);
            u.goal = copy(G.MAP.base);
            u.state = "carrying";
          }
        }
      } else if (healthy(u) && untreated(u)) bandage(s, e, u, u);
      if (u.weapon.reloadUntil !== null && e.time >= u.weapon.reloadUntil) {
        u.weapon.loaded = u.weapon.magazines.shift();
        u.weapon.reloadUntil = null;
        I().event(e, "reload-completed", {
          actorId: u.id,
          model: u.weapon.model,
        });
      }
      if (u.side === "red" || u.side === "civilian") continue;
      if (
        healthy(u) &&
        !untreated(u) &&
        !h.aid &&
        u.path?.length &&
        !u.carrying
      )
        u.prone = false;
      u.capable = healthy(u);
      if (!u.capable) u.path = [];
      if (u.carrying) {
        const t = unit(e, u.carrying);
        if (t) {
          t.x = u.x;
          t.y = u.y + 0.5;
          t.state = "carried";
          if (G.distance(u, G.MAP.base) < 35) {
            t.extracted = true;
            u.extracted = true;
            u.carrying = null;
            t.carriedBy = null;
            u.path = [];
            u.goal = null;
            u.state = "holding";
          }
        }
      }
      // Nearby conscious buddies can render aid. No medical helicopter is invented.
      if (healthy(u) && !h.aid && !untreated(u) && !u.carrying) {
        const q = qOf(e, u.id),
          buddy = e.world.units.find(
            (v) =>
              v.id !== u.id &&
              qOf(e, v.id)?.callsign === q.callsign &&
              v.health.alive &&
              !v.carriedBy &&
              ((untreated(v) && h.kit > 0) ||
                (!untreated(v) && moveFactor(v) === 0)) &&
              G.distance(u, v) < 80 &&
              G.clear(u, v),
          );
        if (buddy) {
          if (G.distance(u, buddy) < 12) {
            if (untreated(buddy)) bandage(s, e, u, buddy);
            else {
              u.carrying = buddy.id;
              buddy.carriedBy = u.id;
              u.path = G.path(u, G.MAP.base);
              u.goal = copy(G.MAP.base);
              u.state = "carrying";
              const ev = I().event(e, "casualty-carried", {
                actorId: u.id,
                targetId: buddy.id,
              });
              causeReport(
                s,
                e,
                u,
                "medical",
                "보행 불가 조원 운반. 실제 집결지까지 이동한다.",
                ev,
              );
            }
          } else {
            u.path = G.path(u, { x: buddy.x + 10, y: buddy.y });
            u.state = "aid-approach";
          }
        }
      }
    }
  }
  function scanEnemy(e, u) {
    const visible = e.world.units.filter(
      (v) =>
        v.health.alive &&
        !v.extracted &&
        G.distance(u, v) <
          ((u.weapon.model === "SVD" ? 330 : 180) + G.elevation(u) * 3) *
            e.battle.weather.visibility &&
        G.clear(u, v) &&
        Math.abs(
          Math.atan2(
            Math.sin(Math.atan2(v.y - u.y, v.x - u.x) - u.heading),
            Math.cos(Math.atan2(v.y - u.y, v.x - u.x) - u.heading),
          ),
        ) <
          Math.PI * 0.65,
    );
    for (const v of visible) {
      let m = u.memory.find((m) => m.id === v.id);
      if (!m) {
        m = { id: v.id, firstSeen: e.time };
        u.memory.push(m);
      }
      Object.assign(m, {
        x: v.x,
        y: v.y,
        lastSeen: e.time,
        condition: snapshot(v).pose,
      });
    }
    return u.memory
      .filter(
        (m) =>
          e.time - m.lastSeen < 8 && !["down", "dead"].includes(m.condition),
      )
      .sort((a, b) => G.distance(u, a) - G.distance(u, b))[0];
  }
  function actorTick(s, e) {
    for (const u of e.world.actors) {
      if (!activeActor(u)) continue;
      if (u.health.aid) continue;
      if (untreated(u)) {
        bandage(s, e, u, u);
        continue;
      }
      if (u.side === "civilian") {
        const p = u.route[u.waypoint];
        if (G.distance(u, p) < 1)
          u.waypoint = (u.waypoint + 1) % u.route.length;
        else advanceActor(e, u, p, u.speed);
        continue;
      }
      const seen = scanEnemy(e, u);
      if (seen) {
        u.heading = Math.atan2(seen.y - u.y, seen.x - u.x);
        u.prone = e.time - u.lastThreatAt < 30;
        u.state = u.prone ? "covering" : "aiming";
        if (e.time - seen.firstSeen > 4) fire(s, e, u, seen);
      } else {
        const noise = e.battle.noises
          .slice()
          .reverse()
          .find(
            (n) =>
              n.actorId !== u.id &&
              e.time - n.time < 15 &&
              G.distance(u, n) < n.range,
          );
        if (noise && e.time - u.lastNoiseAt > 15) {
          u.lastNoiseAt = e.time;
          const p = {
            x: Math.max(20, Math.min(1180, Math.round(noise.x / 80) * 80)),
            y: Math.max(20, Math.min(780, Math.round(noise.y / 80) * 80)),
          };
          u.path = G.path(u, p);
          u.goal = p;
          u.state = "investigating";
        }
        if (u.path.length) {
          const p = u.path[0];
          if (G.distance(u, p) < 2) u.path.shift();
          else advanceActor(e, u, p, 0.9);
        } else {
          u.state = "patrol";
          const p = u.route[u.waypoint];
          if (G.distance(u, p) < 1)
            u.waypoint = (u.waypoint + 1) % u.route.length;
          else advanceActor(e, u, p, u.speed);
        }
      }
    }
  }
  function advanceActor(e, u, p, amount) {
    const d = G.distance(u, p);
    if (d < 0.01) return;
    const step = Math.min(d, amount * moveFactor(u)),
      next = {
        x: u.x + ((p.x - u.x) * step) / d,
        y: u.y + ((p.y - u.y) * step) / d,
      };
    if (G.clear(u, next, true)) {
      if (step > 0) u.prone = false;
      u.heading = Math.atan2(p.y - u.y, p.x - u.x);
      u.x = next.x;
      u.y = next.y;
    }
  }
  function reload(e, u) {
    const w = u.weapon;
    if (w.loaded === 0 && w.reloadUntil === null && w.magazines.length) {
      w.reloadUntil = e.time + WEAPONS[w.model].reload;
      w.aimSince = null;
      I().event(e, "reload-started", { actorId: u.id, until: w.reloadUntil });
    }
  }
  function fire(s, e, u, known) {
    if (
      u.weapon.loaded === 0 &&
      !u.weapon.magazines.length &&
      u.weapon.reloadUntil === null &&
      G.distance(u, known) < 65 &&
      u.sidearm.loaded > 0
    ) {
      const old = u.weapon;
      u.weapon = u.sidearm;
      u.sidearm = old;
      I().event(e, "weapon-switched", { actorId: u.id, model: u.weapon.model });
    }
    const w = u.weapon,
      stats = WEAPONS[w.model],
      target = unit(e, known.id);
    if (
      !target ||
      !healthy(u) ||
      untreated(u) ||
      u.health.aid ||
      w.reloadUntil !== null ||
      e.time < w.nextFireAt
    )
      return;
    const d = G.distance(u, known);
    if (d > stats.range || !G.clear(u, known)) return;
    if (!w.loaded) {
      reload(e, u);
      return;
    }
    if (w.targetId !== known.id) {
      w.targetId = known.id;
      w.aimSince = e.time;
      return;
    }
    const aimSeconds = u.role === "sniper" || w.model === "SVD" ? 7 : 3;
    if (e.time - w.aimSince < aimSeconds) return;
    // Fire at observed coordinates, never teleport aim to an unseen target's new position.
    const movement = u.path?.length || u.state === "moving" ? 1.8 : 1,
      armPenalty =
        1 + u.health.wounds.filter((x) => /Arm/.test(x.part)).length * 0.7,
      sigma = Math.max(
        0.035,
        stats.dispersion * d * (1.55 - u.skill / 100) * movement * armPenalty,
      ),
      a = rand(e),
      b = rand(e),
      spread = Math.sqrt(-2 * Math.log(Math.max(0.00001, a))),
      dx =
        Math.cos(b * Math.PI * 2) * spread * sigma +
        e.battle.weather.wind * d * 0.00013,
      dz = Math.sin(b * Math.PI * 2) * spread * sigma;
    // Physical allies and visible civilians in the shooting lane cause the team to hold fire.
    const lane = all(e).filter(
      (v) =>
        v.id !== u.id &&
        v.id !== target.id &&
        v.health.alive &&
        v.side !== "red" &&
        u.side !== "red",
    );
    if (
      lane.some(
        (v) =>
          pointSegment(v, u, known) < 1.2 &&
          G.distance(u, v) < d &&
          G.clear(u, v),
      )
    )
      return;
    w.loaded--;
    w.spent++;
    w.condition = Math.max(0, w.condition - 0.003);
    w.nextFireAt = e.time + stats.cycle + Math.floor(rand(e) * 3);
    w.aimSince = e.time;
    const impact = { x: known.x + dx, y: known.y },
      actualOffset = G.distance(target, known),
      vertical = (known.condition === "prone" ? 0.3 : 1.15) + dz;
    const hit =
      actualOffset < 0.6 &&
      Math.abs(dx) < (target.prone ? 0.25 : 0.45) &&
      vertical > 0 &&
      vertical < (target.prone ? 0.6 : 1.85) &&
      G.clear(u, target);
    const shot = {
      id: "shot-" + ++e.sequence,
      time: e.time,
      actorId: u.id,
      targetId: known.id,
      from: { x: u.x, y: u.y },
      to: impact,
      side: u.side || "blue",
      model: w.model,
      hit,
      part: null,
    };
    if (hit && target.health.alive) {
      const bodyHeight = target.prone ? vertical * 3 : vertical;
      const part =
        bodyHeight > 1.55
          ? "head"
          : bodyHeight > 0.95
            ? Math.abs(dx) > 0.27
              ? dx < 0
                ? "leftArm"
                : "rightArm"
              : "chest"
            : bodyHeight > 0.65
              ? "abdomen"
              : dx < 0
                ? "leftLeg"
                : "rightLeg";
      shot.part = part;
      injure(s, e, target, { eventId: shot.id, part, severity: stats.power });
    }
    e.battle.totalShots++;
    e.battle.shots.push(shot);
    if (e.battle.shots.length > 600) e.battle.shots.shift();
    e.battle.noises.push({
      time: e.time,
      actorId: u.id,
      x: u.x,
      y: u.y,
      range: stats.suppressed ? (u.role === "sniper" ? 350 : 180) : 850,
    });
    const ev = I().event(e, "shot-fired", {
      actorId: u.id,
      shotId: shot.id,
      model: w.model,
      from: shot.from,
      to: shot.to,
    });
    target.lastThreatAt = e.time;
    target.prone = true;
    if (u.side !== "red")
      causeReport(
        s,
        e,
        u,
        "combat",
        (u.role === "sniper" ? "사수" : "관측수") +
          " 사격. " +
          stats.name +
          " 장전 " +
          w.loaded +
          "발. 명중 결과 관측 대기.",
        ev,
      );
    return shot;
  }
  function pointSegment(p, a, b) {
    const x = b.x - a.x,
      y = b.y - a.y,
      t = Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * x + (p.y - a.y) * y) / Math.max(0.01, x * x + y * y),
        ),
      );
    return Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y);
  }
  function injure(s, e, u, { eventId, part, severity }) {
    ok(
      typeof eventId === "string" &&
        eventId.length > 0 &&
        parts.includes(part) &&
        [1, 2, 3].includes(severity),
      "부상 부위·정도가 잘못되었습니다.",
    );
    if (u.health.wounds.some((w) => w.sourceEventId === eventId)) return false;
    const w = {
      id: "wound-" + eventId,
      sourceEventId: eventId,
      time: e.time,
      part,
      severity,
      treated: false,
      type: "총상",
    };
    u.health.wounds.push(w);
    if (severity === 3 && ["head", "chest", "abdomen"].includes(part))
      u.health.conscious = false;
    if (severity === 3 && part === "head") {
      u.health.alive = false;
    }
    u.capable = healthy(u);
    u.path = [];
    u.state = u.health.alive ? "wounded" : "dead";
    u.lastThreatAt = e.time;
    const ev = I().event(e, "ballistic-injury", {
      actorId: u.id,
      wound: copy(w),
    });
    causeReport(
      s,
      e,
      u,
      "urgent",
      "부상 발생. " + part + " 총상. 이동 중단·처치 필요.",
      ev,
      { friends: friendsFor(e, u) },
    );
    return true;
  }
  function friendlyTick(s, e) {
    for (const q of e.squads) {
      const main = e.commands.find((c) => c.id === q.commandId),
        threat = q.contacts.find(
          (c) =>
            c.classification === "armed-person" &&
            c.confidence >= 0.82 &&
            e.time - c.lastSeen <= 3 &&
            G.distance(I().leader(e, q), c) < 350,
        );
      if (threat && main?.kind === "move" && main.status === "executing") {
        main.status = "failed";
        for (const id of [q.observerId, q.sniperId]) {
          const u = unit(e, id);
          if (!u.health.aid && !u.carrying) {
            u.path = [];
            u.prone = true;
            u.state = "covering";
          }
        }
        const ev = I().event(e, "contact-halt", {
          callsign: q.callsign,
          commandId: main.id,
          contactId: threat.id,
        });
        I().report(
          s,
          e,
          q,
          "request",
          q.callsign +
            ". 무장 인원 식별. 접근을 중단하고 사수 엄호·주변 경계로 전환. 다음 이동 지역 지시 바란다.",
          ev,
          { commandId: main.id },
        );
      }
      for (const id of [q.observerId, q.sniperId]) {
        const u = unit(e, id);
        if (!healthy(u) || untreated(u) || u.health.aid || u.carrying) continue;
        const target = q.contacts
          .filter(
            (c) =>
              c.confidence >= 0.82 &&
              e.time - c.lastSeen <= 5 &&
              ["armed-person"].includes(c.classification),
          )
          .filter((c) => {
            const t = unit(e, c.id);
            return t && !["down", "dead"].includes(c.condition);
          })
          .sort((a, b) => G.distance(u, a) - G.distance(u, b))[0];
        if (!target) continue;
        if (u.role === "sniper" && u.path.length) continue;
        const selfDefense = e.time - u.lastThreatAt < 25;
        if (q.roe === "hold" || (q.roe === "selfDefense" && !selfDefense))
          continue;
        if (u.role === "observer" && G.distance(u, target) > 220) continue;
        u.prone = true;
        fire(s, e, u, target);
      }
    }
  }
  function telemetry(s, e) {
    const b = e.battle;
    if (e.time - b.lastPacket >= 2) {
      b.lastPacket = e.time;
      for (const q of e.squads) {
        if (!I().linked(e, q)) continue;
        const effects = b.shots
          .filter(
            (shot) =>
              e.time - shot.time <= 2 &&
              (q.observerId === shot.actorId ||
                q.sniperId === shot.actorId ||
                q.contacts.some(
                  (c) =>
                    c.id === shot.actorId &&
                    e.time - c.lastSeen < 6 &&
                    c.confidence >= 0.8,
                )),
          )
          .map((shot) => ({
            eventId: shot.id,
            time: shot.time,
            kind: "shot",
            side: shot.side,
            from: copy(shot.from),
            to: copy(shot.to),
          }));
        b.packets.push({
          callsign: q.callsign,
          observedAt: e.time,
          dueAt: e.time + 2,
          friends: I().friendSnapshots(e, q),
          effects,
        });
      }
    }
    for (const p of b.packets.slice()) {
      const q = e.squads.find((q) => q.callsign === p.callsign);
      if (e.time < p.dueAt) continue;
      b.packets.splice(b.packets.indexOf(p), 1);
      if (!I().linked(e, q)) continue;
      I().applyKnowledge(e, { payload: { friends: p.friends } });
      b.delivered.push({ ...p, receivedAt: e.time });
      for (const f of p.effects)
        if (!b.knowledge.effects.some((x) => x.eventId === f.eventId))
          b.knowledge.effects.push({ ...f, receivedAt: e.time });
    }
    b.delivered = b.delivered.slice(-30);
    b.knowledge.effects = b.knowledge.effects.slice(-40);
    b.packets = b.packets.slice(-30);
  }
  function tick(s, e) {
    friendlyTick(s, e);
    telemetry(s, e);
    const b = e.battle;
    b.noises = b.noises.filter((n) => e.time - n.time < 20);
    const confirmed = e.squads
      .flatMap((q) => q.contacts)
      .filter(
        (c) => c.confidence >= 0.8 && c.classification === "armed-person",
      );
    const done =
      b.scenario === "recon"
        ? new Set(confirmed.map((c) => c.id)).size >= 2
        : e.world.actors
            .filter((a) => a.side === "red")
            .every(
              (a) =>
                (!a.health.conscious || !a.health.alive) &&
                e.squads.some((q) =>
                  q.contacts.some(
                    (c) =>
                      c.id === a.id &&
                      ["down", "dead"].includes(c.condition) &&
                      e.time - c.lastSeen < 20,
                  ),
                ),
            );
    if (done && !b.objective.done) {
      b.objective.done = true;
      const ev = I().event(e, "field-objective", { scenario: b.scenario });
      for (const q of e.squads)
        if (I().leader(e, q)?.capable) {
          I().report(
            s,
            e,
            q,
            "objective",
            q.callsign +
              ". " +
              (b.scenario === "recon"
                ? "서로 다른 무장 인원 2개 접촉 관측·식별 완료."
                : "관측된 위협 행동 중지 확인.") +
              " 집결지 복귀 지시 바란다.",
            ev,
            { objective: true },
          );
          break;
        }
    }
    if (
      b.objective.returnRequested &&
      e.world.units.some((u) => u.health.alive) &&
      e.world.units
        .filter((u) => u.health.alive)
        .every((u) => u.extracted || G.distance(u, G.MAP.base) < 40)
    ) {
      b.phase = "returned";
      D().end(s, "returned");
    }
    if (
      e.status === "running" &&
      e.time > 60 &&
      Object.values(e.knowledge.friends).length &&
      e.squads.every((q) => {
        const f = Object.values(e.knowledge.friends).filter(
          (f) => f.callsign === q.callsign,
        );
        return f.length && f.every((x) => e.time - x.observedAt > 45);
      })
    ) {
      e.paused = true;
      e.pauseReason = "전체 조 위치 갱신 중단 · 통신 상황 확인 필요";
    }
  }
  function afterTick(s, e) {
    if (e.battle) {
      s.clock.paused = e.status !== "running" || e.paused;
    }
  }
  function withdraw(s) {
    const e = s.commandExercise;
    ok(e?.battle && e.status === "running", "모의 전장이 진행 중이 아닙니다.");
    e.battle.objective.returnRequested = true;
    for (const q of e.squads)
      if (I().leader(e, q)?.capable) D().issue(s, q.callsign, "withdraw");
  }
  function project(s, f) {
    const e = s.commandExercise,
      b = e.battle;
    return {
      ...f,
      battle: {
        scenario: b.scenario,
        speed: b.speed,
        weather: copy(b.weather),
        objective: b.knowledge.objective,
        returnRequested: b.objective.returnRequested,
        effects: b.knowledge.effects
          .filter((v) => e.time - v.receivedAt <= 5)
          .map(copy),
        result: b.result ? copy(b.result) : null,
      },
    };
  }
  function applyPayload(e, r) {
    if (r.payload?.objective === true) e.battle.knowledge.objective = true;
  }
  function summarize(e) {
    const b = e.battle;
    if (!b) return;
    b.result = {
      id: e.id,
      reason: e.endReason,
      returned: b.phase === "returned",
      objective: b.objective.done,
      shots: b.totalShots,
      roster: e.world.units.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        health: copy(u.health),
        weapon: copy(u.weapon),
        x: u.x,
        y: u.y,
        extracted: u.extracted || G.distance(u, G.MAP.base) < 40,
      })),
      opposition: e.world.actors
        .filter((a) => a.side === "red")
        .map((a) => ({
          alive: a.health.alive,
          conscious: a.health.conscious,
          wounds: copy(a.health.wounds),
        })),
    };
    return (
      "모의 전장 종료 · 사격 " +
      b.totalShots +
      "회 · " +
      (b.phase === "returned"
        ? "생존 인원 집결지 복귀 완료"
        : "통제 종료 · 실제 복귀 미완료") +
      ". 연습 결과는 본부 대원의 영구 손실·재고·보수에 반영하지 않았습니다."
    );
  }
  function knownFriendEvidence(e, f) {
    return !!e.battle?.delivered.some((p) =>
      p.friends.some(
        (x) =>
          x.id === f.id &&
          x.observedAt === f.observedAt &&
          x.x === f.x &&
          x.y === f.y,
      ),
    );
  }
  function validate(e) {
    const b = e.battle;
    if (!b) return;
    const n = (v, a = 0, z = Number.MAX_SAFE_INTEGER) =>
      typeof v === "number" && Number.isFinite(v) && v >= a && v <= z;
    ok(
      b.version === 1 &&
        ["recon", "interdiction"].includes(b.scenario) &&
        Number.isInteger(b.rng) &&
        n(b.rng, 1, 4294967295) &&
        [1, 2, 4].includes(b.speed) &&
        ["field", "returned"].includes(b.phase),
      "전장 저장 형식이 잘못되었습니다.",
    );
    ok(
      b.weather &&
        n(b.weather.visibility, 0.1, 1) &&
        n(b.weather.wind, -10, 10) &&
        ["day", "overcast"].includes(b.weather.timeOfDay),
      "기상 저장이 잘못되었습니다.",
    );
    const checkHealth = (h) => {
      ok(
        h &&
          typeof h.alive === "boolean" &&
          typeof h.conscious === "boolean" &&
          n(h.bloodMl, 0, 5000) &&
          Number.isInteger(h.kit) &&
          n(h.kit, 0, 2) &&
          Array.isArray(h.wounds) &&
          h.wounds.length <= 100,
        "생리 상태가 잘못되었습니다.",
      );
      for (const w of h.wounds)
        ok(
          parts.includes(w.part) &&
            [1, 2, 3].includes(w.severity) &&
            typeof w.treated === "boolean" &&
            typeof w.sourceEventId === "string" &&
            n(w.time, 0, e.time),
          "부상 이력이 잘못되었습니다.",
        );
      if (h.aid)
        ok(
          ["treating"].includes(h.aid.phase) &&
            typeof h.aid.targetId === "string" &&
            n(h.aid.dueAt, 0, e.time + 60) &&
            (h.aid.resumePath === undefined || Array.isArray(h.aid.resumePath)),
          "응급처치 저장이 잘못되었습니다.",
        );
    };
    const checkWeapon = (w) => {
      ok(
        w &&
          WEAPONS[w.model] &&
          Number.isInteger(w.loaded) &&
          n(w.loaded, 0, WEAPONS[w.model].capacity) &&
          Array.isArray(w.magazines) &&
          w.magazines.length <= 10 &&
          w.magazines.every(
            (x) => Number.isInteger(x) && n(x, 1, WEAPONS[w.model].capacity),
          ) &&
          Number.isInteger(w.spent) &&
          n(w.spent) &&
          w.initial ===
            w.loaded + w.magazines.reduce((a, b) => a + b, 0) + w.spent &&
          n(w.condition, 0, 100) &&
          (w.reloadUntil === null || n(w.reloadUntil, 0, e.time + 10)) &&
          (w.aimSince === null || n(w.aimSince, 0, e.time)) &&
          n(w.nextFireAt, 0, e.time + 20),
        "무기·탄약 보존이 잘못되었습니다.",
      );
    };
    for (const u of all(e)) {
      checkHealth(u.health);
      checkWeapon(u.weapon);
      checkWeapon(u.sidearm);
      ok(
        n(u.skill, 0, 100) &&
          typeof u.medicalSkill === "boolean" &&
          typeof u.prone === "boolean",
        "전투 역량 정보가 잘못되었습니다.",
      );
      if (u.side === "red")
        ok(
          Array.isArray(u.memory) &&
            u.memory.length <= 6 &&
            u.memory.every(
              (m) =>
                typeof m.id === "string" &&
                n(m.x, 10, 1190) &&
                n(m.y, 10, 790) &&
                n(m.firstSeen, 0, e.time) &&
                n(m.lastSeen, m.firstSeen, e.time),
            ),
          "적 관측 기억이 잘못되었습니다.",
        );
    }
    ok(
      b.knowledge &&
        typeof b.knowledge.objective === "boolean" &&
        Array.isArray(b.knowledge.effects) &&
        b.knowledge.effects.length <= 40 &&
        b.objective &&
        typeof b.objective.done === "boolean" &&
        typeof b.objective.returnRequested === "boolean",
      "전장 목표·수신 정보가 잘못되었습니다.",
    );
    ok(
      Array.isArray(b.shots) &&
        b.shots.length <= 600 &&
        Array.isArray(b.noises) &&
        b.noises.length <= 100 &&
        Array.isArray(b.packets) &&
        b.packets.length <= 30 &&
        Array.isArray(b.delivered) &&
        b.delivered.length <= 30,
      "전장 사건 저장 한도가 잘못되었습니다.",
    );
    for (const p of [...b.packets, ...b.delivered])
      ok(
        e.squads.some((q) => q.callsign === p.callsign) &&
          n(p.observedAt, 0, e.time) &&
          n(p.dueAt, p.observedAt, e.time + 2) &&
          Array.isArray(p.friends) &&
          p.friends.length === 2 &&
          Array.isArray(p.effects),
        "텔레메트리 저장이 잘못되었습니다.",
      );
    for (const f of Object.values(e.knowledge.friends)) {
      if (f.health) checkHealth(f.health);
      if (f.weapon) checkWeapon(f.weapon);
    }
    for (const p of [...b.packets, ...b.delivered])
      for (const f of p.friends) {
        ok(
          e.world.units.some((u) => u.id === f.id) &&
            n(f.x, 10, 1190) &&
            n(f.y, 10, 790) &&
            n(f.observedAt, 0, e.time) &&
            typeof f.name === "string",
          "전장 수신 위치가 잘못되었습니다.",
        );
        checkHealth(f.health);
        checkWeapon(f.weapon);
      }
    ok(
      Number.isInteger(b.totalShots) &&
        b.totalShots ===
          all(e).reduce((n, u) => n + u.weapon.spent + u.sidearm.spent, 0),
      "총 사격 횟수와 탄약 장부가 일치하지 않습니다.",
    );
    for (const shot of b.shots)
      ok(
        typeof shot.id === "string" &&
          n(shot.time, 0, e.time) &&
          unit(e, shot.actorId) &&
          unit(e, shot.targetId) &&
          typeof shot.hit === "boolean" &&
          [shot.from, shot.to].every(
            (p) => p && n(p.x, -50, 1250) && n(p.y, -50, 850),
          ),
        "사격 사건이 잘못되었습니다.",
      );
    for (const effect of b.knowledge.effects)
      ok(
        typeof effect.eventId === "string" &&
          n(effect.time, 0, e.time) &&
          n(effect.receivedAt, effect.time, e.time) &&
          [effect.from, effect.to].every(
            (p) => p && n(p.x, -50, 1250) && n(p.y, -50, 850),
          ),
        "수신 사격 정보가 잘못되었습니다.",
      );
    if (b.result) {
      ok(
        b.result.id === e.id &&
          typeof b.result.returned === "boolean" &&
          typeof b.result.objective === "boolean" &&
          Array.isArray(b.result.roster) &&
          b.result.roster.length === e.world.units.length,
        "전장 결과가 잘못되었습니다.",
      );
      for (const u of b.result.roster) {
        ok(
          typeof u.name === "string" && typeof u.extracted === "boolean",
          "결과 명부가 잘못되었습니다.",
        );
        checkHealth(u.health);
        checkWeapon(u.weapon);
      }
    }
    return true;
  }
  const api = {
    WEAPONS,
    parts,
    initialize,
    begin,
    setPaused,
    speed,
    beforeTick,
    actorTick,
    tick,
    afterTick,
    moveFactor,
    commandReady,
    canCommand,
    snapshot,
    project,
    applyPayload,
    summarize,
    knownFriendEvidence,
    validate,
    withdraw,
    injure,
    health,
    weapon,
    fire,
  };
  root.OverwatchBattle = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
