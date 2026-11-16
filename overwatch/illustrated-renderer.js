/* Illustrated battlefield. Input is delivered HQ frames only, never truth actors. */
(function (root) {
  "use strict";
  let active = null;
  function create(host, initial) {
    const desktop =
      root.innerWidth >= 1366 &&
      root.innerHeight >= 650 &&
      root.innerWidth > root.innerHeight;
    let frame = initial,
      disposed = false,
      raf = null,
      lastDraw = 0,
      until = 0,
      dirty = true,
      span = desktop ? initial.map.height : 60,
      follow = !desktop,
      target = { x: initial.map.width / 2, y: initial.map.height / 2 },
      pick = () => {},
      rangeIds = new Set(),
      focusId = null,
      selected = null,
      drag = null,
      frameAt = performance.now();
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d", { alpha: false });
    host.replaceChildren(canvas);
    canvas.setAttribute(
      "aria-label",
      "입체 지형 이미지와 실제 수신 대원의 실시간 전투지도",
    );
    canvas.setAttribute("role", "img");
    const positions = new Map(),
      shots = new Map(),
      images = [],
      handlers = [];
    let initialized = false;
    const load = (src) => {
      const im = new Image();
      im.onload = () => invalidate();
      im.src = src;
      images.push(im);
      return im;
    };
    const map = initial.map.image ? load(initial.map.image) : null;
    const spriteImages = new Map();
    // Decode full-quality source once, retain a bounded 512px rendering texture per pose.
    const artImage = (art) => {
      const src = art.src;
      if (!spriteImages.has(src)) {
        const entry = { texture: null, at: performance.now() },
          im = new Image();
        spriteImages.set(src, entry);
        im.onload = () => {
          if (disposed) return;
          const scale = Math.min(
              1,
              512 / Math.max(im.naturalWidth, im.naturalHeight),
            ),
            texture = document.createElement("canvas");
          texture.width = Math.round(im.naturalWidth * scale);
          texture.height = Math.round(im.naturalHeight * scale);
          texture
            .getContext("2d")
            .drawImage(im, 0, 0, texture.width, texture.height);
          entry.texture = texture;
          entry.scale = scale;
          im.onload = null;
          im.src = "";
          invalidate();
        };
        im.onerror = () => {
          entry.failed = true;
        };
        im.src = src;
        while (spriteImages.size > 16) {
          const old = [...spriteImages].sort((a, b) => a[1].at - b[1].at)[0];
          if (old[0] === src) break;
          old[1].texture = null;
          spriteImages.delete(old[0]);
        }
      }
      const entry = spriteImages.get(src);
      entry.at = performance.now();
      return entry;
    };
    artImage(root.OverwatchSprites.data["sniper-move"]);
    artImage(root.OverwatchSprites.data["observer-move"]);
    const listen = (n, fn, opts) => {
      canvas.addEventListener(n, fn, opts);
      handlers.push(() => canvas.removeEventListener(n, fn, opts));
    };
    function size() {
      const dpr = Math.min(devicePixelRatio || 1, 1.25);
      canvas.width = Math.max(1, Math.round(host.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(host.clientHeight * dpr));
      invalidate();
    }
    function view() {
      const w = host.clientWidth,
        h = host.clientHeight,
        scale = h / span,
        visibleW = w / scale;
      target.x = Math.max(
        Math.min(visibleW / 2, frame.map.width / 2),
        Math.min(frame.map.width - visibleW / 2, target.x),
      );
      target.y = Math.max(
        Math.min(span / 2, frame.map.height / 2),
        Math.min(frame.map.height - span / 2, target.y),
      );
      return {
        w,
        h,
        scale,
        left: target.x - visibleW / 2,
        top: target.y - span / 2,
      };
    }
    const screen = (p, v) => ({
      x: (p.x - v.left) * v.scale,
      y: (p.y - v.top) * v.scale,
    });
    function draw(now) {
      raf = null;
      if (disposed) return;
      if (now - lastDraw < 1000 / 15) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastDraw = now;
      if (!dirty && now > until) return;
      dirty = false;
      const paused =
          frame.paused ||
          frame.status !== "running" ||
          frame.battle?.reducedMotion,
        v = view(),
        dpr = canvas.width / Math.max(1, v.w);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#b6bd9a";
      ctx.fillRect(0, 0, v.w, v.h);
      const origin = screen({ x: 0, y: 0 }, v);
      if (map?.complete && map.naturalWidth)
        ctx.drawImage(
          map,
          origin.x,
          origin.y,
          frame.map.width * v.scale,
          frame.map.height * v.scale,
        );
      if (!map) {
        for (const h of frame.map.heights) {
          const p = screen(h, v);
          ctx.fillStyle = "#a9b38e";
          ctx.beginPath();
          ctx.arc(p.x, p.y, h.r * v.scale, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const b of frame.map.buildings) {
          const p = screen({ x: b[0], y: b[1] }, v);
          ctx.fillStyle = "#a2a693";
          ctx.fillRect(
            p.x,
            p.y,
            (b[2] - b[0]) * v.scale,
            (b[3] - b[1]) * v.scale,
          );
        }
      }
      for (const d of frame.battle?.decals || []) {
        const p = screen(d, v);
        ctx.fillStyle = d.kind === "impact" ? "#302b25b0" : "#7f2921aa";
        ctx.beginPath();
        ctx.ellipse(
          p.x,
          p.y,
          Math.max(0.6, (d.kind === "impact" ? 0.08 : 0.28) * v.scale),
          Math.max(0.4, (d.kind === "impact" ? 0.06 : 0.12) * v.scale),
          0.3,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      let rangeRow = 0;
      for (const rangeUnit of frame.friends.filter((u) => rangeIds.has(u.id))) {
        const color = [
          "#55ddff",
          "#ffd166",
          "#a4f28b",
          "#e6a6ff",
          "#ff91a4",
          "#a6cbff",
        ][rangeRow % 6];
        const p = screen(rangeUnit, v),
          r = (rangeUnit.weapon?.range || 0) * v.scale,
          vision = (rangeUnit.visionRange || 200) * v.scale,
          half = rangeUnit.visionHalfAngle || Math.PI * 0.42;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = "#93cdd810";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#f7e7a31c";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(
          p.x,
          p.y,
          vision,
          (rangeUnit.heading || 0) - half,
          (rangeUnit.heading || 0) + half,
        );
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.arc(
          p.x,
          p.y,
          (rangeUnit.identificationRange || 0) * v.scale,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
        ctx.font = "600 12px sans-serif";
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "#273626";
        ctx.shadowBlur = 4;
        ctx.fillText(
          (rangeUnit.name || rangeUnit.callsign) +
            " · 사거리 " +
            rangeUnit.weapon.range +
            "m · 탐지 " +
            Math.round(rangeUnit.visionRange || 0) +
            "m · 식별 " +
            Math.round(rangeUnit.identificationRange || 0) +
            "m",
          12,
          v.h - 14 - rangeRow * 19,
        );
        ctx.shadowBlur = 0;
        rangeRow++;
      }
      for (const cover of frame.map.covers || []) {
        const p = screen(cover, v);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = cover.type === "vehicle" ? "#465450" : "#b9b2a0";
        ctx.strokeStyle = "#252e2888";
        ctx.lineWidth = 1;
        ctx.fillRect(
          (-cover.w * v.scale) / 2,
          (-cover.h * v.scale) / 2,
          cover.w * v.scale,
          cover.h * v.scale,
        );
        ctx.strokeRect(
          (-cover.w * v.scale) / 2,
          (-cover.h * v.scale) / 2,
          cover.w * v.scale,
          cover.h * v.scale,
        );
        ctx.restore();
      }
      for (const t of frame.transports || []) {
        const m = positions.get(t.id);
        if (!m) continue;
        const blend = paused ? 1 : Math.min(1, (now - m.at) / m.duration),
          p = {
            x: m.from.x + (m.to.x - m.from.x) * blend,
            y: m.from.y + (m.to.y - m.from.y) * blend,
          };
        m.drawn = p;
        const q = screen(p, v),
          size =
            t.type === "drone"
              ? Math.max(7, 2.5 * v.scale)
              : Math.max(
                  (t.type === "helicopter" ? 14 : 5) * v.scale,
                  Math.min(
                    ((t.type === "helicopter"
                      ? desktop
                        ? 72
                        : 48
                      : desktop
                        ? 40
                        : 28) *
                      frame.map.height) /
                      span,
                    host.clientHeight * (t.type === "helicopter" ? 0.25 : 0.18),
                  ),
                );
        m.displaySize = size;
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.fillStyle = "#142b3440";
        ctx.beginPath();
        ctx.ellipse(4, 6, size * 0.5, size * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.translate(0, -Math.min(20, (t.altitude || 0) * 0.15));
        ctx.rotate(t.heading || 0);
        ctx.fillStyle = t.trip === "medical" ? "#e5e8d8" : "#52695a";
        ctx.strokeStyle = "#b5c8b6";
        ctx.lineWidth = 1;
        if (t.type === "vehicle") {
          ctx.fillRect(-size / 2, -size * 0.22, size, size * 0.44);
          ctx.fillStyle = "#273d3c";
          ctx.fillRect(size * 0.15, -size * 0.18, size * 0.2, size * 0.36);
        } else {
          ctx.beginPath();
          ctx.ellipse(
            size * 0.08,
            0,
            size * 0.3,
            size * 0.13,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.stroke();
          ctx.fillRect(-size * 0.52, -size * 0.025, size * 0.35, size * 0.05);
          ctx.fillRect(-size * 0.52, -size * 0.12, size * 0.04, size * 0.24);
          ctx.fillStyle = "#273d3c";
          ctx.beginPath();
          ctx.ellipse(
            size * 0.22,
            0,
            size * 0.12,
            size * 0.095,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.save();
          ctx.rotate(
            t.rotorActive
              ? frame.time * 7 + (paused ? 0 : (now - frameAt) * 0.007)
              : 0,
          );
          ctx.strokeStyle = "#cddbd6aa";
          ctx.beginPath();
          ctx.moveTo(-size * 0.48, 0);
          ctx.lineTo(size * 0.48, 0);
          ctx.moveTo(0, -size * 0.48);
          ctx.lineTo(0, size * 0.48);
          ctx.stroke();
          ctx.restore();
        }
        if (t.trip === "medical") {
          ctx.fillStyle = "#9b3f38";
          ctx.fillRect(-size * 0.06, -size * 0.08, size * 0.04, size * 0.16);
          ctx.fillRect(-size * 0.12, -size * 0.02, size * 0.16, size * 0.04);
        }
        ctx.restore();
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "#f6fff3";
        ctx.strokeStyle = "#203e31";
        ctx.lineWidth = 3;
        ctx.fillText(
          (t.type === "helicopter"
            ? "헬기"
            : t.type === "drone"
              ? "드론"
              : "차량") +
            " · " +
            (t.type === "drone"
              ? {
                  dispatch: "출발 준비",
                  takeoff: "이륙",
                  flying: "이동",
                  "on-station": "관측 중",
                  home: "복귀",
                }[t.state] || "이동"
              : t.manifest.length + "명"),
          q.x + 5,
          q.y - 12,
        );
      }
      // No marker for an enemy without an actual delivered observation.
      const labelBoxes = [];
      for (const u of [
        ...frame.contacts.filter((c) => !c.expired),
        ...frame.friends,
        ...(frame.supportActors || []),
      ]) {
        if (u.boardedBy || u.home || u.waitingForDeployment) continue;
        const m = positions.get(u.id);
        if (!m) continue;
        const t = paused
          ? 1
          : Math.min(1, Math.max(0, (now - m.at) / m.duration));
        const p = {
          x: m.from.x + (m.to.x - m.from.x) * t,
          y: m.from.y + (m.to.y - m.from.y) * t,
        };
        m.drawn = p;
        const q = screen(p, v);
        // The illustrated district is oblique: project actual roof elevation above its ground footprint.
        if (u.roofId) q.y -= (u.elevation || 0) * v.scale * 1.4;
        if (q.x < -70 || q.x > v.w + 70 || q.y < -80 || q.y > v.h + 80)
          continue;
        const friendly = u.role !== undefined,
          knownArmed = u.classification === "armed-person",
          uncertain =
            !friendly &&
            u.pose !== "dead" &&
            u.medicalCondition !== "dead" &&
            (u.classification === "unknown" || u.faction === "unknown");
        const motion = root.OverwatchMotion.sample(u, {
          now,
          shotAt: m.shotAt,
          paused,
          moving:
            t < 1 && Math.hypot(m.from.x - m.to.x, m.from.y - m.to.y) > 0.1,
          elapsed: now,
          simulationTime:
            frame.time +
            (paused
              ? 0
              : Math.min(1, (now - frameAt) / 1000) *
                frame.battle.speed *
                (root.OverwatchRealtime?.GAME_RATE || 4)),
        });
        m.motion = motion.mode;
        m.flash = motion.flash;
        // Sizes stay bounded; squad identity is a small pin, never an oversized name plate.
        const facing = root.OverwatchMotion.facing(
            u,
            m.from,
            m.to,
            motion.mode === "walk",
          ),
          entityScale = Math.max(
            v.scale,
            Math.min(
              ((desktop ? 12 : 8) * v.scale) /
                (host.clientHeight / frame.map.height),
              host.clientHeight * 0.1,
            ),
          ),
          height = 1.8 * entityScale,
          width = height * 0.75,
          direction = (Math.round(facing / (Math.PI / 2)) + 4) % 4;
        m.entityScale = entityScale;
        const bob = motion.mode === "walk" ? Math.sin(now * 0.012) * 1.1 : 0;
        ctx.save();
        ctx.globalAlpha = u.stale
          ? 0.45
          : friendly
            ? 1
            : Math.max(0.25, u.confidence || 0.5);
        ctx.fillStyle = "#18271b33";
        ctx.beginPath();
        ctx.ellipse(q.x, q.y + 2, width * 0.3, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        const chosen = root.OverwatchSprites.select(u, {
          moving: motion.mode === "walk",
          mode: motion.mode,
        });
        m.sprite = uncertain ? "unidentified" : chosen.key;
        m.spriteFallback = chosen.fallback;
        const entry = !uncertain && chosen.art ? artImage(chosen.art) : null;
        const im = entry?.texture;
        let rendered = false;
        if (im) {
          const [x1, y1, x2, y2] = chosen.art.bounds;
          const width = chosen.widthM * entityScale,
            h = (width * (y2 - y1)) / (x2 - x1);
          m.renderedWidth = width;
          m.renderedHeight = h;
          const facingLeft = Math.cos(facing) < 0;
          ctx.save();
          ctx.translate(q.x, q.y + bob);
          if (facingLeft) ctx.scale(-1, 1);
          ctx.drawImage(
            im,
            x1 * entry.scale,
            y1 * entry.scale,
            (x2 - x1) * entry.scale,
            (y2 - y1) * entry.scale,
            -width / 2 - motion.recoil * v.scale,
            -h * 0.85,
            width,
            h,
          );
          ctx.restore();
          if (u.health?.wounds?.length) {
            ctx.fillStyle = "#8e2926bb";
            for (const wound of u.health.wounds) {
              const part = wound.part || "torso";
              const dx = part.includes("Arm")
                ? width * (part.startsWith("left") ? -0.16 : 0.16)
                : part.includes("Leg")
                  ? width * (part.startsWith("left") ? -0.08 : 0.08)
                  : 0;
              const dy =
                h *
                (part === "head"
                  ? -0.76
                  : part.includes("Leg")
                    ? -0.14
                    : -0.48);
              ctx.fillStyle = wound.treated ? "#72504788" : "#8e2926bb";
              ctx.beginPath();
              ctx.ellipse(
                q.x + dx * (facingLeft ? -1 : 1),
                q.y + bob + dy,
                Math.max(0.7, 0.1 * v.scale),
                Math.max(0.7, 0.14 * v.scale),
                0,
                0,
                Math.PI * 2,
              );
              ctx.fill();
            }
          }
          rendered = true;
        }
        if (!rendered) {
          ctx.fillStyle = uncertain
            ? "#d5b782"
            : friendly
              ? "#557a8b"
              : "#9e633c";
          ctx.beginPath();
          ctx.arc(q.x, q.y - 5, uncertain ? 5 : 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = friendly
          ? "#70c4e6"
          : knownArmed
            ? "#ec9d76"
            : "#d6bb7d";
        ctx.strokeStyle = "#fff9";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(q.x, q.y + 4, Math.min(2.5, entityScale * 0.4), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (friendly) {
          ctx.font =
            v.scale < 4
              ? desktop
                ? "600 10px -apple-system,sans-serif"
                : "600 9px -apple-system,sans-serif"
              : "600 10px -apple-system,sans-serif";
          ctx.fillStyle = "#fff";
          ctx.shadowColor = "#16301a";
          ctx.shadowBlur = 4;
          ctx.textAlign = "center";
          const label =
              (u.name || u.callsign || "지원요원") +
              (v.scale < 4
                ? ""
                : " · " +
                  (u.role === "sniper"
                    ? "저격수"
                    : u.role === "observer"
                      ? "관측수"
                      : u.role === "medic"
                        ? "의무요원"
                        : u.roleLabel ||
                          (u.role === "civilian" ? "민간인" : "기관 보병"))),
            labelWidth = ctx.measureText(label).width;
          let labelY = Math.max(13, q.y - height - 3);
          for (
            let i = 0;
            i < 6 &&
            labelBoxes.some(
              (b) =>
                Math.abs(b.y - labelY) < 12 &&
                Math.abs(b.x - q.x) < (b.width + labelWidth) / 2 + 4,
            );
            i++
          )
            labelY += 13;
          labelBoxes.push({ x: q.x, y: labelY, width: labelWidth });
          ctx.fillText(label, q.x, labelY);
          ctx.shadowBlur = 0;
        }
        if (!friendly && u.objectiveCode) {
          ctx.fillStyle = "#ffe089";
          ctx.font = "700 11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(u.objectiveCode, q.x, q.y - height - 4);
        }
        if (now - (m.hitAt || -Infinity) < 650) {
          ctx.strokeStyle = "#f06b59";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(q.x, q.y - 9, 12 + (now - m.hitAt) / 70, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "#ffb8a9";
          ctx.font = "700 11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("피격", q.x, q.y - 28);
        }
        if (
          friendly &&
          (u.health?.alive === false || u.health?.conscious === false)
        ) {
          ctx.fillStyle = u.health.alive === false ? "#ffc6c2" : "#ffe2a2";
          ctx.font = "700 10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(
            u.health.alive === false ? "전사" : "중상 · 의식소실",
            q.x,
            q.y + 19,
          );
        }
        if (u.pose === "aid") {
          ctx.strokeStyle = "#9bdab7";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(q.x, q.y - 7, 12, -Math.PI / 2, Math.PI * 0.9);
          ctx.stroke();
        }
        if (motion.mode === "reload") {
          ctx.fillStyle = "#f3df9b";
          ctx.font = "600 10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("재장전", q.x, q.y - height - 3);
        }
        ctx.restore();
      }
      for (const shot of shots.values()) {
        const age = now - shot.at;
        if (paused || age < 0 || age > 650) continue;
        if (shot.fx.kind === "incoming") {
          const p = screen(shot.fx.to, v);
          ctx.save();
          ctx.strokeStyle = shot.fx.hit ? "#ec6858" : "#e4c498";
          ctx.globalAlpha = Math.max(0, 1 - age / 650);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y - 6, 5 + age / 45, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          continue;
        }
        const a = screen(shot.fx.from, v),
          b = screen(shot.fx.to, v),
          angle = Math.atan2(b.y - a.y, b.x - a.x);
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - age / 350);
        ctx.strokeStyle = "#ffe5a7";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - 9);
        ctx.lineTo(b.x, b.y - 9);
        ctx.stroke();
        if (age < 120) {
          ctx.translate(a.x, a.y - 9);
          ctx.rotate(angle);
          ctx.fillStyle = "#fff0ba";
          ctx.shadowColor = "#ffc96e";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(0, -3);
          ctx.lineTo(13, 0);
          ctx.lineTo(0, 3);
          ctx.lineTo(3, 0);
          ctx.fill();
        }
        ctx.restore();
      }
      if (selected) {
        const p = screen(selected, v);
        ctx.strokeStyle = "#fff3c5";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(p.x - 5, p.y - 5, 10, 10, 2);
        ctx.stroke();
      }
      const raw = 80 / v.scale,
        power = 10 ** Math.floor(Math.log10(raw)),
        metres = [1, 2, 5, 10].map((n) => n * power).find((n) => n >= raw),
        pixels = metres * v.scale;
      ctx.save();
      ctx.fillStyle = "#0c181dcc";
      ctx.fillRect(v.w - pixels - 24, v.h - 38, pixels + 18, 32);
      ctx.strokeStyle = "#e0eadc";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(v.w - pixels - 16, v.h - 12);
      ctx.lineTo(v.w - 16, v.h - 12);
      ctx.stroke();
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.fillStyle = "#e0eadc";
      ctx.fillText(metres + " m", v.w - 16, v.h - 20);
      ctx.restore();
      if (now < until && !paused) raf = requestAnimationFrame(draw);
    }
    function invalidate() {
      dirty = true;
      if (raf === null && !disposed) raf = requestAnimationFrame(draw);
    }
    function update(next) {
      frame = next;
      const now = performance.now();
      frameAt = now;
      let animate = 0;
      const all = [
        ...next.friends,
        ...next.contacts.filter((c) => !c.expired),
        ...(next.supportActors || []),
        ...(next.transports || []),
      ];
      if ((next.transports || []).some((t) => t.rotorActive)) animate = 2100;
      const ids = new Set(all.map((u) => u.id));
      for (const [id] of positions) if (!ids.has(id)) positions.delete(id);
      for (const u of all) {
        let m = positions.get(u.id);
        if (!m) {
          m = {
            from: { x: u.x, y: u.y },
            to: { x: u.x, y: u.y },
            drawn: { x: u.x, y: u.y },
            at: now,
            duration: 900,
            observedAt: u.observedAt,
            shotAt: -Infinity,
          };
          positions.set(u.id, m);
        }
        const wounds = u.health?.wounds?.length || 0;
        if (
          m.wounds != null &&
          wounds > m.wounds &&
          initialized &&
          !next.paused
        ) {
          m.hitAt = now;
          animate = Math.max(animate, 1200);
        }
        m.wounds = wounds;
        if (m.to.x !== u.x || m.to.y !== u.y) {
          m.from = { ...m.drawn };
          m.to = { x: u.x, y: u.y };
          m.duration = Math.max(
            250,
            Math.min(
              2100,
              ((u.observedAt - m.observedAt || 1) * 1000) /
                ((next.battle?.speed || 1) *
                  (root.OverwatchRealtime?.GAME_RATE || 4)),
            ),
          );
          m.at = now;
          m.observedAt = u.observedAt;
          animate = Math.max(animate, m.duration);
        }
        if (u.weapon?.reloadUntil != null && u.weapon.reloadUntil > next.time)
          animate = Math.max(animate, 2100);
      }
      for (const fx of next.battle?.effects || []) {
        if (fx.kind === "heard") continue;
        if (shots.has(fx.eventId)) continue;
        const at =
          initialized && !next.paused && next.status === "running"
            ? now
            : -Infinity;
        shots.set(fx.eventId, { fx, at });
        animate = Math.max(animate, 1200);
        if (fx.hit && fx.targetId) {
          const victim = positions.get(fx.targetId);
          if (victim && at === now) victim.hitAt = now;
        }
        const m = positions.get(fx.actorId);
        if (m && at === now) {
          m.shotAt = now;
          animate = Math.max(animate, 1100);
        }
      }
      while (shots.size > 40) shots.delete(shots.keys().next().value);
      if (follow) {
        const visible = (
          focusId
            ? [
                ...next.friends,
                ...next.contacts.filter((c) => !c.expired),
                ...(next.transports || []),
              ]
            : next.friends
        ).filter(
          (u) =>
            !u.stale &&
            !u.home &&
            u.health?.alive !== false &&
            (!focusId || u.id === focusId),
        );
        if (visible.length) {
          target = {
            x: visible.reduce((n, u) => n + u.x, 0) / visible.length,
            y: visible.reduce((n, u) => n + u.y, 0) / visible.length,
          };
        }
      }
      initialized = true;
      until =
        next.paused || next.status !== "running" || next.battle?.reducedMotion
          ? now
          : Math.max(until, now + animate);
      invalidate();
    }
    listen("pointerdown", (e) => {
      const p = root.OverwatchViewport.point(canvas, e);
      if (e.button !== 0) return;
      drag = {
        x: p.x,
        y: p.y,
        startX: p.x,
        startY: p.y,
        moved: false,
      };
      canvas.setPointerCapture(e.pointerId);
    });
    listen("pointermove", (e) => {
      const p = root.OverwatchViewport.point(canvas, e);
      if (!drag) return;
      if (Math.hypot(p.x - drag.startX, p.y - drag.startY) > 6)
        drag.moved = true;
      if (drag.moved) {
        const v = view();
        follow = false;
        target.x -= (p.x - drag.x) / v.scale;
        target.y -= (p.y - drag.y) / v.scale;
        invalidate();
      }
      drag.x = p.x;
      drag.y = p.y;
    });
    listen("pointerup", (e) => {
      const p = root.OverwatchViewport.point(canvas, e);
      if (drag && !drag.moved) {
        const rect = canvas.getBoundingClientRect(),
          v = view();
        pick({
          x: v.left + p.x / v.scale,
          y: v.top + p.y / v.scale,
        });
      }
      drag = null;
    });
    listen("pointercancel", () => (drag = null));
    listen(
      "wheel",
      (e) => {
        e.preventDefault();
        span = Math.max(
          18,
          Math.min(frame.map.height * 1.05, span * Math.exp(e.deltaY * 0.001)),
        );
        invalidate();
      },
      { passive: false },
    );
    const resize = new ResizeObserver(size);
    resize.observe(host);
    size();
    const api = {
      host,
      id: initial.id,
      update,
      zoom(f) {
        span = Math.max(18, Math.min(frame.map.height * 1.05, span * f));
        invalidate();
      },
      follow() {
        if (focusId) {
          focusId = null;
          follow = true;
        } else follow = !follow;
        update(frame);
        return follow;
      },
      overview() {
        follow = false;
        target = { x: frame.map.width / 2, y: frame.map.height / 2 };
        span = frame.map.height;
        invalidate();
      },
      focus(id) {
        focusId = id;
        follow = true;
        const u = [
          ...frame.friends,
          ...frame.contacts,
          ...(frame.transports || []),
        ].find((u) => u.id === id);
        span = Math.min(frame.map.height, u?.type === "drone" ? 520 : 28);
        if (u) target = { x: u.x, y: u.y };
        update(frame);
      },
      setRange(id) {
        const nextIds = new Set(Array.isArray(id) ? id : id ? [id] : []);
        if ([...nextIds].join("|") === [...rangeIds].join("|")) return;
        rangeIds = nextIds;
        invalidate();
      },
      setPickHandler(fn) {
        pick = fn;
      },
      setTarget(p) {
        if (JSON.stringify(p) !== JSON.stringify(selected)) {
          selected = p ? { ...p } : null;
          invalidate();
        }
      },
      resize: size,
      stats() {
        return {
          rangeIds: [...rangeIds],
          viewSpan: span,
          pixelsPerMetre: host.clientHeight / span,
          worldExtent: { width: frame.map.width, height: frame.map.height },
          knownIds: [...positions.keys()],
          transportSizes: (frame.transports || []).map((t) => ({
            id: t.id,
            type: t.type,
            pixels: positions.get(t.id)?.displaySize || 0,
          })),
          framesPending: raf === null ? 0 : 1,
          motions: [...positions].map(([id, m]) => ({
            id,
            mode: m.motion,
            flash: m.flash,
            sprite: m.sprite,
            entityScale: m.entityScale,
            spriteFallback: m.spriteFallback,
            renderedWidth: m.renderedWidth,
            renderedHeight: m.renderedHeight,
          })),
          assetsReady:
            images.every((im) => im.complete && im.naturalWidth > 0) &&
            [...spriteImages.values()].every((x) => x.texture || x.failed),
          textures: spriteImages.size,
        };
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        if (raf !== null) cancelAnimationFrame(raf);
        resize.disconnect();
        for (const fn of handlers) fn();
        for (const im of images) im.onload = null;
        host.replaceChildren();
        positions.clear();
        shots.clear();
        spriteImages.clear();
        if (active === api) active = null;
      },
    };
    update(initial);
    active = api;
    return api;
  }
  root.OverwatchIllustratedRenderer = {
    create,
    get: () => active,
    dispose: () => active?.dispose(),
  };
})(typeof window === "undefined" ? globalThis : window);
