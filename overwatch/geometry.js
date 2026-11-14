/* Standalone adaptation of field-simulation.js grid routing and height-aware LOS.
   No legacy engine, global actor state, timer or renderer is loaded. Units are metres. */
(function (root) {
  "use strict";
  const MAP = {
    id: "command-range",
    name: "능선 지휘 훈련장",
    width: 1200,
    height: 800,
    grid: 20,
    base: { x: 100, y: 700 },
    buildings: [
      [440, 260, 600, 410, 24],
      [820, 390, 960, 470, 18],
    ],
    heights: [
      { id: "WEST", name: "서측 능선", x: 220, y: 200, r: 170, height: 55 },
      { id: "NORTH", name: "북측 고지", x: 710, y: 140, r: 145, height: 65 },
      { id: "EAST", name: "동측 관측점", x: 1050, y: 620, r: 135, height: 45 },
    ],
    shadows: [[500, 440, 780, 680]],
  };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    inside = (p, b, pad = 0) =>
      p.x > b[0] - pad &&
      p.x < b[2] + pad &&
      p.y > b[1] - pad &&
      p.y < b[3] + pad;
  const blocked = (p) =>
    p.x < 10 ||
    p.y < 10 ||
    p.x > MAP.width - 10 ||
    p.y > MAP.height - 10 ||
    MAP.buildings.some((b) => inside(p, b, 6));
  function elevation(p) {
    return Math.max(
      0,
      ...MAP.heights.map(
        (h) => h.height * Math.max(0, 1 - distance(p, h) / h.r),
      ),
    );
  }
  function clear(a, b, ground = false) {
    const n = Math.max(2, Math.ceil(distance(a, b) / 5));
    for (let i = 0; i <= n; i++) {
      const t = i / n,
        p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (ground) {
        if (blocked(p)) return false;
      } else {
        const eye = elevation(a) + 1.7 + (elevation(b) - elevation(a)) * t;
        if (MAP.buildings.some((r) => inside(p, r) && eye < r[4])) return false;
        if (elevation(p) > eye + 1) return false;
      }
    }
    return true;
  }
  function path(a, b) {
    if (blocked(a) || blocked(b)) return [];
    if (clear(a, b, true)) return [{ x: b.x, y: b.y }];
    const g = MAP.grid,
      cols = MAP.width / g + 1,
      rows = MAP.height / g + 1;
    const cell = (p) => {
      let best = -1,
        d = Infinity;
      const x = Math.round(p.x / g),
        y = Math.round(p.y / g);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const q = { x: (x + dx) * g, y: (y + dy) * g };
          if (!blocked(q) && clear(p, q, true) && distance(p, q) < d) {
            d = distance(p, q);
            best = (y + dy) * cols + x + dx;
          }
        }
      return best;
    };
    const start = cell(a),
      goal = cell(b);
    if (start < 0 || goal < 0) return [];
    const seen = new Int32Array(cols * rows).fill(-1),
      queue = [start];
    seen[start] = start;
    let head = 0;
    while (head < queue.length && seen[goal] === -1) {
      const at = queue[head++],
        x = at % cols,
        y = Math.floor(at / cols);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const xx = x + dx,
          yy = y + dy,
          n = yy * cols + xx,
          q = { x: xx * g, y: yy * g };
        if (
          xx < 0 ||
          xx >= cols ||
          yy < 0 ||
          yy >= rows ||
          seen[n] !== -1 ||
          blocked(q) ||
          !clear({ x: x * g, y: y * g }, q, true)
        )
          continue;
        seen[n] = at;
        queue.push(n);
      }
    }
    if (seen[goal] === -1) return [];
    const out = [{ x: b.x, y: b.y }];
    let at = goal;
    while (at !== start) {
      out.push({ x: (at % cols) * g, y: Math.floor(at / cols) * g });
      at = seen[at];
    }
    out.push({ x: (start % cols) * g, y: Math.floor(start / cols) * g });
    return out.reverse();
  }
  const api = { MAP, distance, inside, blocked, elevation, clear, path };
  root.OverwatchGeometry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
