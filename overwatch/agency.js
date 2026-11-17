/* The contracting agency owns its own sniper pair and infantry command net. */
(function (root) {
  "use strict";
  const dep = (n, f) =>
      root[n] || (typeof require === "function" ? require("./" + f) : null),
    B = () => dep("OverwatchBattle", "battle.js"),
    G = () => dep("OverwatchGeometry", "geometry.js"),
    M = () => dep("OverwatchMissions", "missions.js"),
    P = () => dep("OverwatchPersonnel", "personnel.js");
  function initialize(s, e) {
    const m = e.mission;
    if (m.agencyCommand) return;
    m.agencyAutonomous = true;
    m.agencyCommand = {
      version: 1,
      lastAssessment: -100,
      lastOrderAt: -100,
      post: null,
      avoided: [],
      area: {
        x1: 10,
        x2: G().MAP.width - 10,
        y1: 10,
        y2: G().MAP.height * 0.55,
      },
    };
    for (const [i, role] of ["observer", "sniper"].entries()) {
      const id = "agency-" + role;
      if (e.world.actors.some((a) => a.id === id)) continue;
      const u = M().taskPerson(
        e,
        id,
        P().newName(s, 8000 + i, [
          ...e.world.actors.filter((a) => typeof a.name === "string"),
          ...(s.infantry?.members || []),
        ]),
        G().project({
          x: m.contract.insertion.x + 8 + i * 4,
          y: m.contract.insertion.y + 12,
        }),
        true,
      );
      u.agencySniperRole = role;
      u.role = role;
      u.roleLabel = role === "sniper" ? "기관 저격수" : "기관 관측수";
      u.callsign = "기관 저격조";
      u.weapon = B().weapon(role === "sniper" ? "AXMC" : "HK416", 3);
      u.skill = 70;
      u.medicalSkill = false;
      e.world.actors.push(u);
    }
    if (m.forcePackage)
      m.forcePackage.agency = e.world.actors.filter(
        (a) => a.side === "ally" && a.armed && !a.hqMemberId,
      ).length;
  }
  function tick(s, e) {
    const m = e.mission,
      c = m.agencyCommand;
    if (
      !c ||
      !m.agencyAutonomous ||
      m.fieldStartedAt == null ||
      m.returnRequested ||
      e.time - c.lastAssessment < 10
    )
      return;
    c.lastAssessment = e.time;
    const reports = (m.knowledge.actors || []).filter(
        (a) => !a.hqMemberId && a.armed && e.time - a.observedAt < 25,
      ),
      hurt = reports.filter(
        (a) => a.health.alive && (a.underFire || !a.health.conscious),
      );
    const mode = hurt.length >= 2 ? "hold" : "auto",
      d = m.agencyDirective;
    if (
      !e.radio.some(
        (r) =>
          r.route === "agency" &&
          r.status === "queued" &&
          r.payload?.agencyDirective?.source === "agency",
      ) &&
      e.time - c.lastOrderAt >= 25 &&
      (d?.source !== "agency" || d.mode !== mode)
    ) {
      M().commandAgency(s, mode, { source: "agency" });
      c.lastOrderAt = e.time;
    }
  }
  function actor(s, e, u, enemies) {
    if (!u.agencySniperRole) return false;
    const m = e.mission,
      c = m.agencyCommand;
    if (!c) return true;
    if (m.returnRequested) {
      M().moveGround(
        u,
        m.extractionPoint || m.contract.insertion,
        0.9 * B().moveFactor(u),
        e,
      );
      u.prone = false;
      u.stance = "standing";
      return true;
    }
    if (
      c.post &&
      B().underFire(e, u) &&
      e.time - (c.lastDisplacedAt ?? -100) > 35
    ) {
      c.avoided = [...c.avoided, c.post.roofId].slice(-4);
      c.post = null;
      c.lastDisplacedAt = e.time;
    }
    if (!c.post) {
      const center = G().project({
          x: G().MAP.width * 0.55,
          y: G().MAP.height * 0.35,
        }),
        options = G()
          .roofs()
          .filter(
            (r) =>
              !c.avoided.includes(r.id) &&
              !e.squads.some((q) => q.tactical?.position?.roofId === r.id),
          )
          .map((r) => ({
            r,
            score:
              r.height * 3 -
              G().distance(u, r.point) * 0.08 +
              (G().clear(r.point, center) ? 100 : 0),
          }))
          .sort((a, b) => b.score - a.score);
      c.post = options[0] ? { ...options[0].r.point } : center;
    }
    const goal = {
      ...c.post,
      x: c.post.x + (u.agencySniperRole === "observer" ? 2 : 0),
    };
    if (
      G().distance(u, goal) > 2 ||
      (u.roofId || null) !== (goal.roofId || null)
    ) {
      M().moveGround(u, goal, 0.8 * B().moveFactor(u), e);
      u.prone = false;
      u.stance = "standing";
      u.state = "moving";
      u.observationAt = null;
    } else {
      u.path = [];
      u.state = u.agencySniperRole === "observer" ? "observing" : "covering";
      u.observationAt = u.agencySniperRole === "observer" ? e.time : null;
      u.heading = -Math.PI * 0.5 + Math.sin(e.time / 20) * 0.9;
      u.prone = u.agencySniperRole === "sniper";
      u.stance = u.prone ? "prone" : "kneeling";
    }
    return true;
  }
  root.OverwatchAgency = { initialize, tick, actor };
  if (typeof module !== "undefined" && module.exports)
    module.exports = root.OverwatchAgency;
})(typeof window === "undefined" ? globalThis : window);
