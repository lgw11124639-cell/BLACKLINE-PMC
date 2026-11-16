/* Fixed one-second simulation steps. Wall-clock gaps are discarded, never caught up. */
(function (root) {
  "use strict";
  function create({
    tick,
    checkpoint,
    baseRate = 1,
    maxWorkMs = Infinity,
    afterPump = () => {},
    onError = () => {},
    now = () => performance.now(),
  } = {}) {
    if (!Number.isFinite(baseRate) || baseRate <= 0 || baseRate > 4)
      throw Error("잘못된 기본 진행 속도");
    let running = false,
      last = 0,
      accumulator = 0,
      speed = 1,
      dirtySteps = 0;
    return {
      start(value = 1) {
        if (![1, 2, 4].includes(value)) throw Error("잘못된 배속");
        speed = value;
        running = true;
        last = now();
        accumulator = 0;
      },
      stop() {
        running = false;
        accumulator = 0;
      },
      setSpeed(value) {
        if (![1, 2, 4].includes(value)) throw Error("잘못된 배속");
        speed = value;
        last = now();
      },
      isRunning: () => running,
      pump(visible = true) {
        const t = now(),
          elapsed = Math.min(0.25, Math.max(0, (t - last) / 1000));
        last = t;
        if (!running || !visible) {
          accumulator = 0;
          return 0;
        }
        accumulator += elapsed * speed * baseRate;
        let steps = 0;
        try {
          const workStarted = now();
          while (accumulator >= 1 - 1e-9 && running) {
            if (steps && now() - workStarted >= maxWorkMs) break;
            accumulator = Math.max(0, accumulator - 1);
            const proceed = tick();
            steps++;
            dirtySteps++;
            if (dirtySteps >= 5 * baseRate || proceed === false) {
              checkpoint();
              dirtySteps = 0;
            }
            if (proceed === false) {
              running = false;
              accumulator = 0;
            }
          }
          if (steps) afterPump();
        } catch (error) {
          running = false;
          accumulator = 0;
          onError(error);
        }
        return steps;
      },
      flush() {
        checkpoint();
        dirtySteps = 0;
      },
      reset() {
        running = false;
        dirtySteps = 0;
        accumulator = 0;
      },
    };
  }
  const api = { create, GAME_RATE: 4 };
  root.OverwatchRealtime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
