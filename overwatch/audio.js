/* Local CC0 weapon-family recordings, driven exclusively by newly delivered shot events. */
(function (root) {
  "use strict";
  let context = null,
    master = null,
    enabled = false,
    loading = false,
    error = false,
    volume = 0.35,
    lastFrame = null,
    id = null,
    played = 0;
  const buffers = new Map(),
    seen = new Set(),
    voices = new Set(),
    profiles = {
      AXMC: "precision",
      HK416: "rifle-a",
      AKM: "ak",
      SVD: "precision",
      G19: "pistol",
    };
  try {
    const n = Number(
      localStorage.getItem("blackline_overwatch_volume") ?? 0.35,
    );
    if (Number.isFinite(n)) volume = Math.max(0, Math.min(1, n));
  } catch {}
  function controls() {
    for (const b of document.querySelectorAll("[data-overwatch-audio]")) {
      b.textContent = loading
        ? "소리 준비 중"
        : error
          ? "소리 재시도"
          : enabled
            ? "소리 켜짐"
            : "소리 켜기";
      b.setAttribute("aria-pressed", String(enabled));
      b.disabled = loading;
    }
    for (const n of document.querySelectorAll("[data-overwatch-volume]"))
      if (n !== document.activeElement) n.value = Math.round(volume * 100);
  }
  function stop() {
    for (const v of [...voices]) v.finish();
  }
  function remember(f) {
    for (const fx of f?.battle?.effects || []) seen.add(fx.eventId);
    while (seen.size > 200) seen.delete(seen.values().next().value);
  }
  async function toggle() {
    if (loading) return;
    if (enabled) {
      enabled = false;
      stop();
      await context?.suspend();
      controls();
      return;
    }
    try {
      loading = true;
      error = false;
      controls();
      if (!context) {
        const Native = root.AudioContext || root.webkitAudioContext;
        if (!Native) throw Error("no audio");
        context = new Native();
        master = context.createGain();
        master.gain.value = volume * 0.65;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -16;
        limiter.ratio.value = 8;
        master.connect(limiter);
        limiter.connect(context.destination);
      }
      await context.resume();
      if (context.state !== "running") throw Error("suspended");
      await Promise.all(
        [...new Set(Object.values(profiles))].map(async (name) => {
          if (buffers.has(name)) return;
          const r = await fetch("audio/" + name + ".m4a?v=2026111502");
          if (!r.ok) throw Error(name);
          buffers.set(
            name,
            await context.decodeAudioData(await r.arrayBuffer()),
          );
        }),
      );
      remember(lastFrame);
      enabled = true;
      loading = false;
      controls();
    } catch (e) {
      enabled = false;
      loading = false;
      error = true;
      stop();
      controls();
    }
  }
  function play(fx, f) {
    if (!context || context.state !== "running" || voices.size >= 12) return;
    const model =
        fx.model || f.friends.find((v) => v.id === fx.actorId)?.weapon?.model,
      buffer = buffers.get(profiles[model]);
    if (!buffer) return;
    const own = f.friends.filter((v) => !v.stale),
      listener = own.length
        ? {
            x: own.reduce((n, v) => n + v.x, 0) / own.length,
            y: own.reduce((n, v) => n + v.y, 0) / own.length,
          }
        : fx.from;
    const distance = Math.hypot(fx.from.x - listener.x, fx.from.y - listener.y),
      suppressed = root.OverwatchBattle.WEAPONS[model]?.suppressed === true;
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      gain = context.createGain(),
      pan = context.createStereoPanner
        ? context.createStereoPanner()
        : context.createGain(),
      echo = context.createDelay(0.4),
      wet = context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = suppressed
      ? 2600
      : Math.max(2400, 14000 - distance * 8);
    gain.gain.value = (suppressed ? 0.32 : 0.7) / (1 + distance / 260);
    if (pan.pan)
      pan.pan.value = Math.max(
        -0.8,
        Math.min(0.8, (fx.from.x - listener.x) / 300),
      );
    source.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(master);
    pan.connect(echo);
    echo.delayTime.value = 0.14;
    echo.connect(wet);
    wet.gain.value = suppressed ? 0.07 : 0.16;
    wet.connect(master);
    let done = false,
      timer = null;
    const voice = {
      finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          source.stop();
        } catch {}
        for (const node of [source, filter, gain, pan, echo, wet])
          node.disconnect();
        voices.delete(voice);
      },
    };
    voices.add(voice);
    source.onended = () => {
      timer = setTimeout(() => voice.finish(), 450);
    };
    source.start();
    played++;
  }
  function sync(f, { active = true } = {}) {
    lastFrame = f;
    controls();
    if (id !== f?.id) {
      stop();
      seen.clear();
      id = f?.id;
      remember(f);
      return;
    }
    if (
      !enabled ||
      !active ||
      f?.paused ||
      f?.status !== "running" ||
      document.hidden
    ) {
      remember(f);
      stop();
      return;
    }
    let count = 0;
    for (const fx of f.battle?.effects || []) {
      if (seen.has(fx.eventId)) continue;
      seen.add(fx.eventId);
      if (count++ < 8 && f.time - fx.receivedAt <= 2) play(fx, f);
    }
    while (seen.size > 200) seen.delete(seen.values().next().value);
  }
  function setVolume(value) {
    volume = Math.max(0, Math.min(1, Number(value) / 100));
    if (!Number.isFinite(volume)) volume = 0.35;
    if (master)
      master.gain.setTargetAtTime(volume * 0.65, context.currentTime, 0.05);
    try {
      localStorage.setItem("blackline_overwatch_volume", String(volume));
    } catch {}
    controls();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  root.addEventListener("pagehide", stop);
  root.OverwatchAudio = {
    sync,
    toggle,
    stop,
    setVolume,
    controls,
    get status() {
      return {
        enabled,
        loading,
        error,
        volume,
        samples: buffers.size,
        voices: voices.size,
        contexts: context ? 1 : 0,
        played,
      };
    },
  };
})(typeof window === "undefined" ? globalThis : window);
