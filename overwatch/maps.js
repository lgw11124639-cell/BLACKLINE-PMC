/* Reuses original illustrated districts and their published geometry, converted to metres. */
(function (root) {
  "use strict";
  const make = (id, name, buildings, interest, extra = {}) => ({
    id,
    name,
    width: 240,
    height: 160,
    grid: 2,
    clearance: 0.45,
    image: "images/maps/" + id + ".webp",
    base: { x: 24, y: 144 },
    sector: { x: interest[0] * 2.4, y: interest[1] * 2.4 },
    buildings: buildings.map((b) => [
      ...b.slice(0, 4).map((v) => v * 2.4),
      b[4],
    ]),
    heights: [],
    shadows: [],
    covers: [
      {
        id: id + "-wall",
        x: 108,
        y: 108,
        w: 7,
        h: 0.7,
        height: 1.1,
        type: "wall",
      },
      {
        id: id + "-barrier",
        x: 150,
        y: 81.6,
        w: 3,
        h: 0.7,
        height: 1.25,
        type: "barrier",
      },
      {
        id: id + "-vehicle",
        x: 187.2,
        y: 124.8,
        w: 4.7,
        h: 2,
        height: 1.5,
        type: "vehicle",
      },
    ],
    spawnPoints: [
      { x: 120, y: 48 },
      { x: 120, y: 79.2 },
      { x: 189.6, y: 81.6 },
      { x: 192, y: 108 },
    ],
    ...extra,
  });
  const modern = [];
  for (const [x1, x2] of [
    [2, 16],
    [24, 46],
    [54, 76],
    [84, 97],
  ])
    for (const [y1, y2] of [
      [2, 18],
      [26, 39],
      [48, 56],
    ])
      modern.push([x1, y1, x2, y2, 10]);
  const quarter = [];
  for (const [x1, x2] of [
    [3, 24],
    [36, 59],
    [73, 96],
  ])
    for (const [y1, y2] of [
      [2, 16],
      [25, 41],
      [51, 56],
    ]) {
      if (x1 === 36 && y1 === 25)
        quarter.push([36, 25, 43, 41, 6], [57, 25, 59, 41, 6]);
      else quarter.push([x1, y1, x2, y2, 6]);
    }
  const maps = [
    make("urban-modern", "신도심 업무지구", modern, [50, 33]),
    make("urban-quarter", "구도심 주거지", quarter, [50, 34]),
    make(
      "urban-port",
      "항만·물류 지구",
      [
        [8, 6, 25, 20, 6],
        [34, 7, 54, 20, 8],
        [62, 7, 73, 20, 6],
        [8, 42, 27, 53, 7],
        [36, 42, 58, 53, 7],
      ],
      [70, 34],
    ),
    make(
      "urban-market",
      "시장·광장 지구",
      [
        [3, 3, 15, 15, 6],
        [27, 3, 45, 15, 6],
        [55, 3, 73, 15, 6],
        [85, 3, 97, 15, 6],
        [3, 25, 15, 43, 6],
        [85, 25, 97, 43, 6],
        [27, 54, 45, 57, 6],
        [55, 54, 73, 57, 6],
      ],
      [50, 34],
    ),
  ];
  maps.push(
    make(
      "urban-embassy",
      "공관·언덕 지구",
      [
        [2, 2, 13, 10, 8],
        [22, 2, 43, 10, 10],
        [55, 2, 76, 10, 12],
        [88, 2, 98, 10, 8],
        [2, 19, 13, 34, 8],
        [23, 19, 43, 34, 14],
        [55, 19, 76, 34, 10],
        [88, 19, 98, 34, 8],
        [2, 44, 13, 54, 6],
        [23, 44, 43, 54, 8],
        [55, 44, 76, 54, 8],
        [88, 44, 98, 54, 6],
      ],
      [50, 27],
      { image: "images/maps/urban-embassy.svg" },
    ),
    make(
      "urban-rail",
      "철도·정비 지구",
      [
        [2, 2, 18, 12, 10],
        [28, 2, 48, 12, 8],
        [60, 2, 78, 12, 9],
        [88, 2, 98, 12, 6],
        [2, 28, 18, 39, 8],
        [28, 28, 48, 39, 10],
        [60, 28, 78, 39, 10],
        [88, 28, 98, 39, 8],
        [2, 49, 18, 55, 6],
        [28, 49, 48, 55, 6],
        [60, 49, 78, 55, 8],
        [88, 49, 98, 55, 6],
      ],
      [54, 32],
      { image: "images/maps/urban-rail.svg" },
    ),
    make(
      "urban-research",
      "통신·연구 단지",
      [
        [2, 2, 15, 12, 12],
        [26, 2, 45, 12, 14],
        [57, 2, 75, 12, 12],
        [87, 2, 98, 12, 10],
        [2, 24, 15, 37, 8],
        [26, 24, 45, 37, 16],
        [57, 24, 75, 37, 14],
        [87, 24, 98, 37, 10],
        [2, 48, 15, 55, 6],
        [26, 48, 45, 55, 8],
        [57, 48, 75, 55, 10],
        [87, 48, 98, 55, 6],
      ],
      [51, 30],
      { image: "images/maps/urban-research.svg" },
    ),
  );
  for (const m of maps)
    m.covers = m.covers.filter(
      (c) =>
        !m.buildings.some(
          (b) => c.x > b[0] && c.x < b[2] && c.y > b[1] && c.y < b[3],
        ),
    );
  // Separate operation districts preserve coordinates of all existing exercises/saves.
  for (const source of [...maps]) {
    const scale = 5,
      point = (p) => ({ x: p.x * scale, y: p.y * scale });
    maps.push({
      ...source,
      id: source.id + "-operation",
      name: source.name + " · 광역 작전구역",
      urban: true,
      districtScale: scale,
      originalMapId: source.id,
      width: source.width * scale,
      height: source.height * scale,
      grid: source.grid * scale,
      base: point(source.base),
      sector: point(source.sector),
      buildings: source.buildings.map((b) => [
        b[0] * scale,
        b[1] * scale,
        b[2] * scale,
        b[3] * scale,
        b[4],
      ]),
      covers: source.covers.map((c) => ({
        ...c,
        x: c.x * scale,
        y: c.y * scale,
      })),
      spawnPoints: source.spawnPoints.map(point),
      shadows: source.shadows.map((b) => b.map((v) => v * scale)),
      heights: source.heights.map((h) => ({
        ...h,
        ...point(h),
        r: h.r * scale,
      })),
    });
  }
  const api = { maps: Object.fromEntries(maps.map((v) => [v.id, v])) };
  root.OverwatchMaps = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
