/* Saved consumables, smoke visibility and projectile-based suppression. */
(function (root) {
  "use strict";
  const dep = (n, f) =>
      root[n] || (typeof require === "function" ? require("./" + f) : null),
    B = () => dep("OverwatchBattle", "battle.js"),
    G = () => dep("OverwatchGeometry", "geometry.js"),
    D = () => dep("OverwatchCommand", "command.js");
  const cp = (x) => JSON.parse(JSON.stringify(x)),
    ok = (v, m) => {
      if (!v) throw Error(m);
    },
    people = (e) => [...e.world.units, ...e.world.actors];
  function state(e) {
    return (e.battle.ordnance ??= {
      version: 1,
      projectiles: [],
      smokes: [],
      effects: [],
    });
  }
  function pressure(e, shot) {
    for (const u of people(e)) {
      if (
        !u.health.alive ||
        u.home ||
        u.boardedBy ||
        u.waitingForDeployment ||
        u.side === shot.side ||
        (["blue", "ally"].includes(u.side) &&
          ["blue", "ally"].includes(shot.side))
      )
        continue;
      const dx = shot.to.x - shot.from.x,
        dy = shot.to.y - shot.from.y,
        t = Math.max(
          0,
          Math.min(
            1,
            ((u.x - shot.from.x) * dx + (u.y - shot.from.y) * dy) /
              Math.max(1, dx * dx + dy * dy),
          ),
        ),
        p = { x: shot.from.x + t * dx, y: shot.from.y + t * dy };
      if (G().distance(u, p) > 9 || !G().clear(p, u)) continue;
      u.suppression = Math.min(
        100,
        (u.suppression || 0) + (shot.model === "M249" ? 22 : 15),
      );
      u.suppressionAt = e.time;
      u.lastThreatAt = e.time;
    }
  }
  function factor(u) {
    return Math.max(0.35, 1 - (u.suppression || 0) * 0.006);
  }
  function throwGrenade(s, e, u, kind, p) {
    ok(["smoke", "frag"].includes(kind), "투척물 종류가 잘못되었습니다.");
    ok(
      u.health.alive &&
        u.health.conscious &&
        !u.health.aid &&
        !u.home &&
        !u.waitingForDeployment,
      "투척 가능한 상태가 아닙니다.",
    );
    ok(u.grenades && u.grenades[kind] > 0, "보유 투척물이 없습니다.");
    ok(
      Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        p.x >= 10 &&
        p.x <= G().MAP.width - 10 &&
        p.y >= 10 &&
        p.y <= G().MAP.height - 10 &&
        G().distance(u, p) <= 32 &&
        !p.roofId &&
        G().clear(u, p),
      "투척 경로·거리를 확인하세요.",
    );
    if (kind === "frag") {
      const seen = (u.memory || []).some(
        (v) => e.time - v.lastSeen < 12 && G().distance(v, p) < 10,
      );
      ok(seen, "최근 식별된 위협 위치가 필요합니다.");
      ok(
        !people(e).some(
          (a) =>
            a.id !== u.id &&
            a.health.alive &&
            a.side !== "red" &&
            G().distance(a, p) < 18,
        ),
        "아군·민간인 위험으로 수류탄 투척을 보류합니다.",
      );
      ok(G().distance(u, p) >= 14, "폭발 안전거리를 확보하세요.");
    }
    u.grenades[kind]--;
    u.grenades.spent[kind]++;
    u.lastThrowAt = e.time;
    const ev = D().internals.event(e, "grenade-thrown", {
      actorId: u.id,
      kind,
      position: cp(p),
    });
    state(e).projectiles.push({
      id: ev.id,
      kind,
      actorId: u.id,
      from: { x: u.x, y: u.y },
      point: { x: p.x, y: p.y },
      thrownAt: e.time,
      dueAt: e.time + (kind === "smoke" ? 2 : 3),
    });
    if (s && u.hqMemberId)
      root.OverwatchInfantry?.report(
        s,
        e,
        u,
        "combat",
        kind === "smoke"
          ? "연막 전개. 이동·부상자 회수를 엄호한다."
          : "수류탄 투척. 아군 안전을 확인하고 위협을 제압한다.",
        ev,
        { ordnanceEvent: ev.id },
      );
    return ev.id;
  }
  function update(s, e) {
    for (const u of people(e)) {
      if (u.suppression) {
        const calm = e.time - (u.suppressionAt ?? -100) > 2;
        const covered = G().coverDistance(u) < 8;
        u.suppression = Math.max(
          0,
          u.suppression - (calm ? (covered ? 5 : 2) : 0.5),
        );
      }
    }
    const o = e.battle.ordnance;
    if (!o) return;
    for (const p of o.projectiles.filter((p) => p.dueAt <= e.time)) {
      const ev = D().internals.event(e, "grenade-detonated", {
        actorId: p.actorId,
        kind: p.kind,
        position: cp(p.point),
      });
      o.effects.push({
        eventId: ev.id,
        kind: p.kind,
        ...p.point,
        time: e.time,
        receivedAt: e.time,
      });
      if (p.kind === "smoke")
        o.smokes.push({
          id: p.id,
          ...p.point,
          radius: 20,
          startsAt: e.time,
          expiresAt: e.time + 45,
        });
      else
        for (const u of people(e)) {
          const distance = G().distance(u, p.point);
          if (
            !u.health.alive ||
            u.home ||
            u.boardedBy ||
            u.waitingForDeployment ||
            distance > 16 ||
            !G().clear({ ...p.point, eyeHeight: 0.6 }, u)
          )
            continue;
          u.suppression = Math.min(100, (u.suppression || 0) + 55);
          u.suppressionAt = e.time;
          u.lastThreatAt = e.time;
          if (distance < 10)
            B().injure(s, e, u, {
              eventId: p.id + "-" + u.id,
              part: distance < 4 ? "chest" : "leftLeg",
              severity: distance < 4 ? 3 : distance < 7 ? 2 : 1,
              fatal: distance < 2,
              type: "파편상",
            });
        }
    }
    o.projectiles = o.projectiles.filter((p) => p.dueAt > e.time);
    o.smokes = o.smokes.filter((p) => p.expiresAt > e.time);
    o.effects = o.effects.filter((p) => e.time - p.time < 5).slice(-24);
  }
  function ai(s, e, u, enemies) {
    if (!u.hqMemberId || !u.grenades || e.time - (u.lastThrowAt ?? -100) < 12)
      return false;
    try {
      if (
        u.grenades.smoke > 0 &&
        ((u.suppression || 0) > 20 ||
          (B().underFire(e, u) &&
            (e.mission.returnRequested ||
              u.health.wounds.some((w) => !w.treated) ||
              e.world.actors.some(
                (a) =>
                  a.hqMemberId &&
                  a.hqTeam === u.hqTeam &&
                  a.health.alive &&
                  (!a.health.conscious ||
                    a.health.wounds.some((w) => !w.treated)),
              )))) &&
        !state(e).smokes.some((p) => G().distance(p, u) < 35) &&
        !state(e).projectiles.some(
          (p) =>
            p.kind === "smoke" && G().distance(p.point || p.to || p, u) < 35,
        )
      ) {
        const seen = enemies[0],
          a = seen ? Math.atan2(seen.y - u.y, seen.x - u.x) : u.heading || 0;
        throwGrenade(
          s,
          e,
          u,
          "smoke",
          G().project({ x: u.x + Math.cos(a) * 12, y: u.y + Math.sin(a) * 12 }),
        );
        return true;
      }
      const target = enemies.find(
        (a) => G().distance(u, a) >= 16 && G().distance(u, a) <= 30,
      );
      if (target && u.grenades.frag > 0 && G().coverDistance(target) < 8) {
        throwGrenade(s, e, u, "frag", target);
        return true;
      }
    } catch {}
    return false;
  }
  function validate(e) {
    const num = (x, a, b) => Number.isFinite(x) && x >= a && x <= b,
      o = e.battle?.ordnance;
    for (const u of people(e)) {
      ok(
        u.suppression == null || num(u.suppression, 0, 100),
        "제압 수치가 잘못되었습니다.",
      );
      if (u.grenades)
        for (const k of ["smoke", "frag"])
          ok(
            Number.isInteger(u.grenades[k]) &&
              u.grenades[k] >= 0 &&
              Number.isInteger(u.grenades.spent[k]) &&
              u.grenades.spent[k] >= 0 &&
              u.grenades.initial[k] === u.grenades[k] + u.grenades.spent[k],
            "투척물 수량 보존이 잘못되었습니다.",
          );
    }
    if (!o) return;
    ok(
      o.version === 1 &&
        Array.isArray(o.projectiles) &&
        o.projectiles.length <= 32 &&
        Array.isArray(o.smokes) &&
        o.smokes.length <= 32 &&
        Array.isArray(o.effects) &&
        o.effects.length <= 24,
      "투척물 저장이 잘못되었습니다.",
    );
    const ids = new Set();
    for (const p of o.projectiles) {
      ok(
        !ids.has(p.id) &&
          ["smoke", "frag"].includes(p.kind) &&
          people(e).some((u) => u.id === p.actorId) &&
          num(p.point.x, 10, 1190) &&
          num(p.point.y, 10, 790) &&
          num(p.thrownAt, 0, e.time) &&
          num(p.dueAt, p.thrownAt, e.time + 3),
        "투척물 경로 저장이 잘못되었습니다.",
      );
      ids.add(p.id);
    }
    for (const f of o.effects)
      ok(
        ["smoke", "frag"].includes(f.kind) &&
          typeof f.eventId === "string" &&
          num(f.x, 10, 1190) &&
          num(f.y, 10, 790) &&
          num(f.time, 0, e.time) &&
          num(f.receivedAt, 0, e.time),
        "폭발·연막 표시 저장이 잘못되었습니다.",
      );
    for (const p of o.smokes)
      ok(
        num(p.x, 10, 1190) &&
          num(p.y, 10, 790) &&
          num(p.radius, 1, 30) &&
          num(p.startsAt, 0, e.time) &&
          num(p.expiresAt, p.startsAt, e.time + 45),
        "연막 저장이 잘못되었습니다.",
      );
  }
  root.OverwatchOrdnance = {
    state,
    pressure,
    factor,
    throwGrenade,
    update,
    ai,
    validate,
  };
  if (typeof module !== "undefined" && module.exports)
    module.exports = root.OverwatchOrdnance;
})(typeof window === "undefined" ? globalThis : window);
