/* Visual samples derived only from delivered simulation state. Never advances AI/ammo. */
(function (root) {
  "use strict";
  function sample(
    unit,
    {
      now,
      shotAt = -Infinity,
      moving = false,
      paused = false,
      elapsed = 0,
      simulationTime = 0,
    } = {},
  ) {
    const alive =
      unit.health?.alive !== false && unit.health?.conscious !== false;
    const disabled =
      !alive ||
      ["aid", "down", "dead", "carried", "carrying"].includes(unit.pose);
    const age = now - shotAt;
    const firing = !paused && !disabled && age >= 0 && age < 1100;
    const reloading =
      !paused &&
      !disabled &&
      unit.weapon?.reloadUntil != null &&
      unit.weapon.reloadUntil > simulationTime;
    const walking = !paused && !disabled && moving && unit.pose === "standing";
    return {
      mode: disabled
        ? unit.pose || "down"
        : reloading
          ? "reload"
          : firing
            ? "fire"
            : walking
              ? "walk"
              : "ready",
      flash: firing && age < 110,
      recoil: firing ? Math.max(0, 1 - age / 240) * 0.18 : 0,
      bolt:
        firing && unit.role === "sniper" && age >= 250 && age < 900
          ? Math.sin(((age - 250) / 650) * Math.PI) * 0.16
          : 0,
      leg: walking ? Math.sin(elapsed * 0.012) * 0.42 : 0,
      reload: reloading ? 0.5 + Math.sin(elapsed * 0.008) * 0.12 : 0,
      hand: reloading ? Math.sin(elapsed * 0.01) * 0.35 : 0,
    };
  }
  function facing(unit, from, to, moving = false) {
    if (moving && from && to && Math.hypot(to.x - from.x, to.y - from.y) > 0.1)
      return Math.atan2(to.y - from.y, to.x - from.x);
    return unit.heading || 0;
  }
  const api = { sample, facing };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OverwatchMotion = api;
})(typeof window === "undefined" ? globalThis : window);
