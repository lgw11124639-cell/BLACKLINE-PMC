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
    if (!blocked(p))
      return { x: p.x, y: p.y, ...(p.roofId ? { roofId: p.roofId } : {}) };
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
  function roofBuilding(p) {
    if (!/^roof-\d+$/.test(p?.roofId || "")) return null;
    const b = MAP.buildings[Number(p.roofId.slice(5))];
    return b && inside(p, b, -0.6) ? b : null;
  }
  function roofs() {
    return MAP.urban || MAP.width < 500
      ? MAP.buildings
          .map((b, i) => ({
            id: "roof-" + i,
            height: b[4],
            point: { x: (b[0] + b[2]) / 2, y: b[3] - 2, roofId: "roof-" + i },
            access: project({ x: (b[0] + b[2]) / 2, y: b[3] + 2 }),
          }))
          .filter((r) => distance(r.access, r.point) < 12)
      : [];
  }
  const blocked = (p) =>
    p.x < 10 ||
    p.y < 10 ||
    p.x > MAP.width - 10 ||
    p.y > MAP.height - 10 ||
    (!roofBuilding(p) &&
      MAP.buildings.some((b) => inside(p, b, MAP.clearance ?? 6))) ||
    (MAP.covers || []).some((c) => inside(p, coverBounds(c), 0.4));
  function elevation(p) {
    const roof = roofBuilding(p);
    if (roof) return roof[4];
    return Math.max(
      0,
      ...MAP.heights.map(
        (h) => h.height * Math.max(0, 1 - distance(p, h) / h.r),
      ),
    );
  }
  function visible(a, b, e) {
    if (!clear(a, b)) return false;
    for (const smoke of e?.battle?.ordnance?.smokes || []) {
      if (smoke.startsAt > e.time || smoke.expiresAt <= e.time) continue;
      if (Math.min(elevation(a), elevation(b)) > 12) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        t = Math.max(
          0,
          Math.min(
            1,
            ((smoke.x - a.x) * dx + (smoke.y - a.y) * dy) /
              Math.max(0.001, dx * dx + dy * dy),
          ),
        );
      if (elevation(a) + 1.5 + (elevation(b) - elevation(a)) * t > 8) continue;
      if (
        Math.hypot(a.x + dx * t - smoke.x, a.y + dy * t - smoke.y) <
        smoke.radius
      )
        return false;
    }
    return true;
  }
  function clear(a, b, ground = false) {
    if (ground && roofBuilding(a) && a.roofId === b.roofId && roofBuilding(b))
      return true;
    if (ground) {
      const intersects = (box, pad) => {
        let lo = 0,
          hi = 1;
        for (const [start, delta, min, max] of [
          [a.x, b.x - a.x, box[0] - pad + 1e-7, box[2] + pad - 1e-7],
          [a.y, b.y - a.y, box[1] - pad + 1e-7, box[3] + pad - 1e-7],
        ]) {
          if (Math.abs(delta) < 1e-10) {
            if (start <= min || start >= max) return false;
          } else {
            const t1 = (min - start) / delta,
              t2 = (max - start) / delta;
            lo = Math.max(lo, Math.min(t1, t2));
            hi = Math.min(hi, Math.max(t1, t2));
            if (lo > hi) return false;
          }
        }
        return hi >= lo;
      };
      if (
        MAP.buildings.some((r) => intersects(r, MAP.clearance ?? 6)) ||
        (MAP.covers || []).some((c) => intersects(coverBounds(c), 0.4))
      )
        return false;
    }
    if (!ground && !MAP.heights.length) {
      const eye = (p) =>
        Number.isFinite(p.eyeHeight)
          ? p.eyeHeight
          : (p.stance || p.pose || p.condition) === "prone" || p.prone
            ? 0.45
            : (p.stance || p.pose || p.condition) === "kneeling"
              ? 1.15
              : 1.7;
      const z0 = elevation(a) + (a.altitude || 0) + eye(a),
        z1 = elevation(b) + (b.altitude || 0) + eye(b);
      const hits = (box, height, pad = 0) => {
        let lo = 0,
          hi = 1;
        for (const [start, delta, min, max] of [
          [a.x, b.x - a.x, box[0] - pad + 1e-7, box[2] + pad - 1e-7],
          [a.y, b.y - a.y, box[1] - pad + 1e-7, box[3] + pad - 1e-7],
        ]) {
          if (Math.abs(delta) < 1e-10) {
            if (start <= min || start >= max) return false;
          } else {
            const p = (min - start) / delta,
              q = (max - start) / delta;
            lo = Math.max(lo, Math.min(p, q));
            hi = Math.min(hi, Math.max(p, q));
            if (lo > hi) return false;
          }
        }
        return (
          Math.min(z0 + (z1 - z0) * lo, z0 + (z1 - z0) * hi) < height - 1e-7
        );
      };
      return (
        !MAP.buildings.some((r) => hits(r, r[4])) &&
        !(MAP.covers || []).some((c) => hits(coverBounds(c), c.height))
      );
    }
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
    if (a.roofId || b.roofId) {
      const ra = roofs().find((r) => r.id === a.roofId),
        rb = roofs().find((r) => r.id === b.roofId);
      if ((a.roofId && !ra) || (b.roofId && !rb)) return [];
      if (ra && rb && ra.id === rb.id)
        return [{ x: b.x, y: b.y, roofId: rb.id }];
      const start = ra ? ra.access : a,
        end = rb ? rb.access : b,
        ground = path(start, end, resolution);
      if (!ground.length && distance(start, end) > 1) return [];
      return [
        ...(ra
          ? [
              { ...ra.point },
              { ...ra.access, roofTransition: "down", roofFrom: ra.id },
            ]
          : []),
        ...ground,
        ...(rb
          ? [
              { ...rb.point, roofTransition: "up" },
              { x: b.x, y: b.y, roofId: rb.id },
            ]
          : []),
      ];
    }
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
  const tacticalCosts = new WeakMap();
  function coverDistance(p) {
    return Math.min(
      Infinity,
      ...MAP.buildings.map((b) =>
        Math.hypot(
          Math.max(b[0] - p.x, 0, p.x - b[2]),
          Math.max(b[1] - p.y, 0, p.y - b[3]),
        ),
      ),
    );
  }
  // Public geometry only. A* penalizes exposed ground and keeps infantry near
  // building edges, while retaining real obstacle checks on every segment.
  function tacticalPath(a, b) {
    if (!MAP.urban || a.roofId || b.roofId || distance(a, b) < 30)
      return path(a, b);
    if (blocked(a) || blocked(b)) return [];
    const g = MAP.grid,
      cols = Math.floor(MAP.width / g) + 1,
      rows = Math.floor(MAP.height / g) + 1,
      position = (id) => ({ x: (id % cols) * g, y: Math.floor(id / cols) * g });
    function cell(p) {
      let best = -1,
        d = Infinity;
      const x = Math.round(p.x / g),
        y = Math.round(p.y / g);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const q = { x: (x + dx) * g, y: (y + dy) * g };
          if (
            x + dx < 0 ||
            x + dx >= cols ||
            y + dy < 0 ||
            y + dy >= rows ||
            blocked(q) ||
            !clear(p, q, true)
          )
            continue;
          const v = distance(p, q);
          if (v < d) {
            d = v;
            best = (y + dy) * cols + x + dx;
          }
        }
      return best;
    }
    const start = cell(a),
      goal = cell(b);
    if (start < 0 || goal < 0) return path(a, b);
    let weights = tacticalCosts.get(MAP);
    if (!weights) {
      weights = new Map();
      tacticalCosts.set(MAP, weights);
    }
    const weight = (id) => {
      if (!weights.has(id)) {
        const d = coverDistance(position(id)),
          edge = MAP.width / 120;
        weights.set(id, d <= edge ? 1 : d <= edge * 2.5 ? 1.6 : 3.2);
      }
      return weights.get(id);
    };
    const costs = new Float64Array(cols * rows).fill(Infinity),
      parents = new Int32Array(cols * rows).fill(-1),
      heap = [];
    function push(item) {
      heap.push(item);
      let i = heap.length - 1;
      while (i) {
        const p = (i - 1) >> 1;
        if (heap[p].score <= item.score) break;
        heap[i] = heap[p];
        i = p;
      }
      heap[i] = item;
    }
    function pop() {
      const first = heap[0],
        last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let c = i * 2 + 1;
          if (c + 1 < heap.length && heap[c + 1].score < heap[c].score) c++;
          if (heap[c].score >= last.score) break;
          heap[i] = heap[c];
          i = c;
        }
        heap[i] = last;
      }
      return first;
    }
    costs[start] = 0;
    parents[start] = start;
    push({
      id: start,
      cost: 0,
      score: distance(position(start), position(goal)),
    });
    while (heap.length) {
      const item = pop(),
        id = item.id;
      if (item.cost !== costs[id]) continue;
      if (id === goal) break;
      const p = position(id),
        x = id % cols,
        y = Math.floor(id / cols);
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
          yy = y + dy;
        if (xx < 0 || xx >= cols || yy < 0 || yy >= rows) continue;
        const n = yy * cols + xx,
          q = position(n);
        if (blocked(q) || !clear(p, q, true)) continue;
        const cost =
          item.cost + (Math.hypot(dx, dy) * g * (weight(id) + weight(n))) / 2;
        if (cost >= costs[n]) continue;
        costs[n] = cost;
        parents[n] = id;
        push({ id: n, cost, score: cost + distance(q, position(goal)) });
      }
    }
    if (parents[goal] < 0) return path(a, b);
    const out = [{ x: b.x, y: b.y }];
    let id = goal;
    while (id !== start) {
      out.push(position(id));
      id = parents[id];
    }
    out.push(position(start));
    out.reverse();
    const compact = [];
    for (const p of out) {
      while (compact.length >= 2) {
        const x = compact.at(-2),
          y = compact.at(-1);
        if (
          Math.abs((y.x - x.x) * (p.y - y.y) - (y.y - x.y) * (p.x - y.x)) > 1e-7
        )
          break;
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
    roofs,
    roofBuilding,
    activate,
    project,
    coverBounds,
    distance,
    inside,
    blocked,
    elevation,
    clear,
    visible,
    path,
    tacticalPath,
    coverDistance,
  };
  root.OverwatchGeometry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
