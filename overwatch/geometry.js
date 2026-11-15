/* Standalone adaptation of field-simulation.js grid routing and height-aware LOS.
   No legacy engine, global actor state, timer or renderer is loaded. Units are metres. */
(function (root) {
  "use strict";
  let MAP = {
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
  const RANGE = MAP,
    variants = (
      root.OverwatchMaps ||
      (typeof require === "function" ? require("./maps.js") : null)
    ).maps;
  const maps = {
    "command-range": RANGE,
    "ridge-field": {
      ...RANGE,
      id: "ridge-field",
      name: "서부 능선·물류 단지",
      clearance: 0.5,
      covers: [
        {
          id: "ridge-wall",
          x: 250,
          y: 550,
          w: 10,
          h: 1,
          height: 1.2,
          type: "wall",
        },
        {
          id: "ridge-truck",
          x: 700,
          y: 500,
          w: 4.8,
          h: 2,
          height: 1.5,
          type: "vehicle",
        },
        {
          id: "ridge-barrier",
          x: 920,
          y: 550,
          w: 3,
          h: 0.7,
          height: 1.25,
          type: "barrier",
        },
      ],
      image: "images/maps/overwatch-range.webp",
      buildings: [
        [428, 256, 633, 438, 24],
        [804, 374, 964, 452, 18],
      ],
    },
    ...variants,
  };
  function activate(id = "command-range") {
    if (!maps[id]) throw Error("알 수 없는 전장 지도입니다.");
    MAP = maps[id];
    return MAP;
  }
  function project(p) {
    if (!blocked(p)) return { x: p.x, y: p.y };
    for (let r = 1; r < 80; r++)
      for (let i = 0; i < 16; i++) {
        const q = {
          x: p.x + Math.cos((i * Math.PI) / 8) * r,
          y: p.y + Math.sin((i * Math.PI) / 8) * r,
        };
        if (!blocked(q)) return q;
      }
    return { ...MAP.base };
  }
  function coverBounds(c) {
    return [
      c.x - c.w / 2,
      c.y - c.h / 2,
      c.x + c.w / 2,
      c.y + c.h / 2,
      c.height,
    ];
  }
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
    MAP.buildings.some((b) => inside(p, b, MAP.clearance ?? 6)) ||
    (MAP.covers || []).some((c) => inside(p, coverBounds(c), 0.4));
  function elevation(p) {
    return Math.max(
      0,
      ...MAP.heights.map(
        (h) => h.height * Math.max(0, 1 - distance(p, h) / h.r),
      ),
    );
  }
  function clear(a, b, ground = false) {
    const n = Math.max(
      2,
      Math.ceil(distance(a, b) / ((MAP.covers || []).length ? 0.4 : 5)),
    );
    for (let i = 0; i <= n; i++) {
      const t = i / n,
        p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (ground) {
        if (blocked(p)) return false;
      } else {
        const eyeHeight = (p) =>
          Number.isFinite(p.eyeHeight)
            ? p.eyeHeight
            : (p.stance || p.pose || p.condition) === "prone" || p.prone
              ? 0.45
              : (p.stance || p.pose || p.condition) === "kneeling"
                ? 1.15
                : 1.7;
        const startEye = elevation(a) + (a.altitude || 0) + eyeHeight(a),
          endEye = elevation(b) + (b.altitude || 0) + eyeHeight(b);
        const eye = startEye + (endEye - startEye) * t;
        if (MAP.buildings.some((r) => inside(p, r) && eye < r[4])) return false;
        if (
          (MAP.covers || []).some(
            (c) => inside(p, coverBounds(c)) && eye < elevation(p) + c.height,
          )
        )
          return false;
        if (elevation(p) > eye + 1) return false;
      }
    }
    return true;
  }
  function path(a, b, resolution = MAP.grid) {
    if (blocked(a) || blocked(b)) return [];
    if (clear(a, b, true)) return [{ x: b.x, y: b.y }];
    const g = resolution,
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
    const result = out.reverse();
    if (resolution >= MAP.grid) return result;
    const compact = [];
    for (const p of result) {
      while (compact.length >= 2) {
        const a = compact.at(-2),
          b = compact.at(-1),
          dx = b.x - a.x,
          dy = b.y - a.y,
          ex = p.x - b.x,
          ey = p.y - b.y;
        if (Math.abs(dx * ey - dy * ex) > 1e-8 || dx * ex + dy * ey <= 0) break;
        compact.pop();
      }
      compact.push(p);
    }
    return compact;
  }
  const api = {
    get MAP() {
      return MAP;
    },
    maps,
    activate,
    project,
    coverBounds,
    distance,
    inside,
    blocked,
    elevation,
    clear,
    path,
  };
  root.OverwatchGeometry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
