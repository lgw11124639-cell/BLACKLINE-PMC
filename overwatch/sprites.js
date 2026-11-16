/* Single-person asset files; no atlas cropping or hidden-state lookup. */
(function (root) {
  "use strict";
  const data = {
    "observer-down": {
      src: "images/overwatch/observer-down.webp",
      bounds: [66, 60, 1708, 845],
      size: [1774, 887],
    },
    "sniper-down": {
      src: "images/overwatch/sniper-down.webp",
      bounds: [31, 59, 1744, 851],
      size: [1774, 887],
    },
    "sniper-move": {
      src: "images/overwatch/sniper-move.webp",
      bounds: [115, 21, 1200, 1241],
      size: [1254, 1254],
    },
    "observer-move": {
      src: "images/overwatch/observer-move.webp",
      bounds: [249, 20, 1024, 1229],
      size: [1254, 1254],
    },
    "sniper-observe": {
      src: "images/overwatch/sniper-observe.webp",
      bounds: [13, 441, 1242, 797],
      size: [1254, 1254],
    },
    "observer-observe": {
      src: "images/overwatch/observer-observe.webp",
      bounds: [99, 85, 1185, 1174],
      size: [1254, 1254],
    },
    "sniper-standing": {
      src: "images/overwatch/sniper-standing.webp",
      bounds: [122, 49, 1202, 1219],
      size: [1254, 1254],
    },
    "observer-standing": {
      src: "images/overwatch/observer-standing.webp",
      bounds: [263, 34, 1120, 1223],
      size: [1254, 1254],
    },
    "sniper-kneeling": {
      src: "images/overwatch/sniper-kneeling.webp",
      bounds: [35, 183, 1219, 1087],
      size: [1254, 1254],
    },
    "observer-kneeling": {
      src: "images/overwatch/observer-kneeling.webp",
      bounds: [108, 117, 1186, 1154],
      size: [1254, 1254],
    },
    "observer-prone": {
      src: "images/overwatch/observer-prone.webp",
      bounds: [17, 422, 1235, 834],
      size: [1254, 1254],
    },
    "regular-move": {
      src: "images/overwatch/regular-move.webp",
      bounds: [231, 37, 1033, 1228],
      size: [1254, 1254],
    },
    "insurgent-move": {
      src: "images/overwatch/insurgent-move.webp",
      bounds: [296, 28, 956, 1232],
      size: [1254, 1254],
    },
    "allied-move": {
      src: "images/overwatch/allied-move.webp",
      bounds: [277, 44, 963, 1214],
      size: [1254, 1254],
    },
    "civilian-walk": {
      src: "images/overwatch/civilian-walk.webp",
      bounds: [320, 31, 917, 1228],
      size: [1254, 1254],
    },
    "regular-standing": {
      src: "images/overwatch/regular-standing.webp",
      bounds: [266, 57, 1126, 1205],
      size: [1254, 1254],
    },
    "regular-kneeling": {
      src: "images/overwatch/regular-kneeling.webp",
      bounds: [177, 188, 1149, 1109],
      size: [1254, 1254],
    },
    "regular-prone": {
      src: "images/overwatch/regular-prone.webp",
      bounds: [32, 292, 1500, 710],
      size: [1536, 1024],
    },
    "insurgent-standing": {
      src: "images/overwatch/insurgent-standing.webp",
      bounds: [306, 34, 1090, 1209],
      size: [1254, 1254],
    },
    "insurgent-kneeling": {
      src: "images/overwatch/insurgent-kneeling.webp",
      bounds: [169, 134, 1184, 1146],
      size: [1254, 1254],
    },
    "insurgent-prone": {
      src: "images/overwatch/insurgent-prone.webp",
      bounds: [30, 306, 1491, 746],
      size: [1536, 1024],
    },
    "allied-standing": {
      src: "images/overwatch/allied-standing.webp",
      bounds: [290, 55, 1101, 1208],
      size: [1254, 1254],
    },
    "allied-kneeling": {
      src: "images/overwatch/allied-kneeling.webp",
      bounds: [119, 122, 1138, 1141],
      size: [1254, 1254],
    },
    "allied-prone": {
      src: "images/overwatch/allied-prone.webp",
      bounds: [12, 429, 1235, 821],
      size: [1254, 1254],
    },
    "sniper-wounded": {
      src: "images/overwatch/sniper-wounded.webp",
      bounds: [87, 173, 1125, 1133],
      size: [1254, 1254],
    },
    "observer-wounded": {
      src: "images/overwatch/observer-wounded.webp",
      bounds: [197, 129, 1121, 1129],
      size: [1254, 1254],
    },
    "regular-wounded": {
      src: "images/overwatch/regular-wounded.webp",
      bounds: [210, 112, 1182, 1127],
      size: [1254, 1254],
    },
    "insurgent-wounded": {
      src: "images/overwatch/insurgent-wounded.webp",
      bounds: [163, 97, 1125, 1179],
      size: [1254, 1254],
    },
    "allied-wounded": {
      src: "images/overwatch/allied-wounded.webp",
      bounds: [160, 123, 1130, 1177],
      size: [1254, 1254],
    },
    "civilian-wounded": {
      src: "images/overwatch/civilian-wounded.webp",
      bounds: [220, 169, 1109, 1110],
      size: [1254, 1254],
    },
    "civilian-flee": {
      src: "images/overwatch/civilian-flee.webp",
      bounds: [198, 81, 1037, 1162],
      size: [1254, 1254],
    },
    "civilian-cower": {
      src: "images/overwatch/civilian-cower.webp",
      bounds: [225, 228, 990, 1064],
      size: [1254, 1254],
    },
    "enemy-sniper": {
      src: "images/overwatch/enemy-sniper.webp",
      bounds: [16, 453, 1238, 808],
      size: [1254, 1254],
    },
    "sniper-dead": {
      src: "images/overwatch/sniper-dead.webp",
      bounds: [67, 290, 1196, 1056],
      size: [1254, 1254],
    },
    "observer-dead": {
      src: "images/overwatch/observer-dead.webp",
      bounds: [59, 343, 1182, 1063],
      size: [1254, 1254],
    },
    "regular-dead": {
      src: "images/overwatch/regular-dead.webp",
      bounds: [59, 261, 1203, 1085],
      size: [1254, 1254],
    },
    "insurgent-dead": {
      src: "images/overwatch/insurgent-dead.webp",
      bounds: [59, 318, 1179, 1010],
      size: [1254, 1254],
    },
    "allied-dead": {
      src: "images/overwatch/allied-dead.webp",
      bounds: [53, 332, 1206, 1075],
      size: [1254, 1254],
    },
    "civilian-dead": {
      src: "images/overwatch/civilian-dead.webp",
      bounds: [24, 311, 1230, 1088],
      size: [1254, 1254],
    },
    "enemy-sniper-standing": {
      src: "images/overwatch/enemy-sniper-standing.webp",
      bounds: [282, 139, 1148, 1132],
      size: [1254, 1254],
    },
    "enemy-sniper-kneeling": {
      src: "images/overwatch/enemy-sniper-kneeling.webp",
      bounds: [140, 249, 1184, 1030],
      size: [1254, 1254],
    },
    "enemy-sniper-wounded": {
      src: "images/overwatch/enemy-sniper-wounded.webp",
      bounds: [51, 245, 1223, 1054],
      size: [1254, 1254],
    },
    "enemy-sniper-dead": {
      src: "images/overwatch/enemy-sniper-dead.webp",
      bounds: [52, 322, 1204, 966],
      size: [1254, 1254],
    },
    "medic-aid": {
      src: "images/overwatch/medic-aid.webp",
      bounds: [347, 252, 1027, 938],
      size: [1374, 1145],
    },
    "medic-move": {
      src: "images/overwatch/medic-move.webp",
      bounds: [196, 109, 817, 1444],
      size: [1024, 1536],
    },
  };

  function select(u, { moving = false, mode = "ready" } = {}) {
    if (u.role === "medic") {
      const key =
        u.pose === "aid" && u.state === "treating" ? "medic-aid" : "medic-move";
      return {
        key,
        art: data[key],
        fallback: false,
        widthM: key === "medic-aid" ? 1.25 : 0.84,
      };
    }
    const role =
      u.role === "sniper"
        ? "sniper"
        : u.role === "observer"
          ? "observer"
          : ["regular", "insurgent", "allied", "civilian"].includes(u.faction)
            ? u.faction
            : u.classification === "unarmed-person"
              ? "civilian"
              : u.classification === "friendly-person"
                ? "allied"
                : "regular";
    const down = ["down", "carried"].includes(u.pose),
      dead = u.health?.alive === false || u.pose === "dead" || u.medicalCondition === "dead";
    const wounded =
      (u.health?.wounds || []).some((w) => !w.treated) ||
      (!u.health &&
        (u.state === "wounded" || u.medicalCondition === "wounded"));
    let action = dead
      ? "dead"
      : down
        ? "down"
        : (wounded && !u.combatActive) ||
            (u.mobility === false &&
              u.health?.wounds?.length &&
              !u.combatActive)
          ? "wounded"
          : moving || u.activity === "moving"
            ? "move"
            : role === "civilian"
              ? u.state === "fleeing"
                ? "flee"
                : u.pose === "kneeling"
                  ? "cower"
                  : "walk"
              : u.activity === "observing" &&
                  role === "observer" &&
                  mode !== "fire"
                ? "observe"
                : mode === "fire" ||
                    ["aiming", "firing"].includes(u.activity) ||
                    u.pose === "prone"
                  ? ["standing", "kneeling", "prone"].includes(u.pose)
                    ? u.pose
                    : "standing"
                  : "move";
    if (
      role === "sniper" &&
      u.pose === "prone" &&
      mode !== "fire" &&
      u.activity !== "firing" &&
      !["wounded", "down", "dead"].includes(action)
    )
      action = "observe";
    if (role === "civilian" && action === "move") action = "walk";
    let key = role + "-" + action,
      art = data[key];
    if (!art && role === "sniper" && action === "prone") {
      art = data["sniper-observe"];
      key = "sniper-observe";
    }
    if (action === "down") {
      art = data[role + "-down"] || data[role + "-wounded"];
      key = role + "-down";
    }
    if (u.specialty === "sniper" && ["regular", "insurgent"].includes(role)) {
      const special =
        action === "prone"
          ? "enemy-sniper"
          : "enemy-sniper-" +
            (action === "down"
              ? "wounded"
              : action === "move"
                ? "standing"
                : action);
      if (data[special]) {
        art = data[special];
        key = special;
      }
    }
    const fallback = !art;
    if (!art) art = data[role + (role === "civilian" ? "-walk" : "-move")];
    // Normalize the longest cropped dimension, not image width: casualty art
    // is wider than walking art and must not enlarge the same person.
    const extentM = ["dead", "down", "prone"].includes(action) ||
      (action === "observe" && role === "sniper") ? 1.8 :
      action === "kneeling" || action === "wounded" ? 1.55 : 1.8;
    const [x1, y1, x2, y2] = art.bounds;
    const widthM = extentM * (x2 - x1) / Math.max(x2 - x1, y2 - y1);
    return { key, role, action, art, widthM, fallback };
  }
  const api = { data, select };
  root.OverwatchSprites = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
