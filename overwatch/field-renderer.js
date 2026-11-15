/* Three.js renderer for delivered HQ frames only; no simulation or truth actor lookup. */
(function (root) {
  "use strict";
  let active = null;
  const DPR = 1.25,
    MAX_FPS = 15;
  function create(host, initial, { onFallback = () => {} } = {}) {
    if (!root.THREE) {
      onFallback("3D 라이브러리를 불러오지 못했습니다.");
      return null;
    }
    const T = root.THREE;
    T.ColorManagement.legacyMode = false;
    let scene,
      camera,
      renderer,
      disposed = false,
      raf = null,
      lastDraw = 0,
      frame = initial,
      follow = true,
      span = 60,
      yaw = Math.PI / 5,
      pitch = 0.85,
      target = new T.Vector3(initial.map.base.x, 0, initial.map.base.y),
      drag = null,
      resize;
    const meshes = new Map(),
      materials = new Map(),
      geometries = [],
      effects = [];
    let dirty = true,
      animUntil = 0;
    const listeners = [];
    const listen = (el, n, fn, opts) => {
      el.addEventListener(n, fn, opts);
      listeners.push(() => el.removeEventListener(n, fn, opts));
    };
    const mat = (color) => {
      if (!materials.has(color))
        materials.set(color, new T.MeshLambertMaterial({ color }));
      return materials.get(color);
    };
    function box(w, h, d, color, parent, x = 0, y = 0, z = 0) {
      const geometry = new T.BoxGeometry(w, h, d);
      geometries.push(geometry);
      const m = new T.Mesh(geometry, mat(color));
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    }
    function figure(friend) {
      const group = new T.Group();
      const blue = friend.role !== undefined,
        color = blue
          ? friend.role === "observer"
            ? 0x536954
            : 0x576a78
          : 0x8d7864;
      const body = box(0.55, 0.65, 0.32, color, group, 0, 1.02, 0);
      box(0.29, 0.3, 0.28, 0xc0aa8e, group, 0, 1.52, 0);
      box(0.35, 0.12, 0.34, color, group, 0, 1.72, 0);
      const legs = [
        box(0.19, 0.65, 0.2, 0x424f41, group, -0.16, 0.36, 0),
        box(0.19, 0.65, 0.2, 0x424f41, group, 0.16, 0.36, 0),
      ];
      box(0.15, 0.57, 0.16, color, group, -0.4, 1.03, 0.02);
      box(0.15, 0.5, 0.16, color, group, 0.4, 1.08, 0.04);
      const gun = box(
        0.08,
        0.09,
        friend.role === "sniper" ? 1.15 : 0.65,
        0x303b35,
        group,
        0.32,
        1.15,
        0.43,
      );
      if (friend.role === "observer") {
        box(0.2, 0.12, 0.12, 0x303b35, group, -0.33, 1.38, 0.16);
      } else {
        box(0.1, 0.1, 0.22, 0x303b35, group, 0.32, 1.25, 0.4);
      }
      box(0.48, 0.5, 0.2, 0x75826a, group, 0, 1.06, -0.25);
      const marker = box(
        0.8,
        0.035,
        0.8,
        blue ? 0x4b86ac : 0xb3905c,
        group,
        0,
        0.025,
        0,
      );
      scene.add(group);
      return {
        group,
        body,
        legs,
        marker,
        gun,
        pose: null,
        previous: null,
        desired: null,
        updatedAt: 0,
      };
    }
    function pose(m, u) {
      const p = u.pose || (u.health && !u.health.alive ? "dead" : "standing");
      m.group.rotation.z = 0;
      m.group.rotation.x = 0;
      if (p === "dead" || p === "down" || p === "carried")
        m.group.rotation.z = Math.PI / 2;
      else if (p === "prone") m.group.rotation.x = Math.PI / 2;
      else if (p === "aid") m.group.rotation.x = 0.45;
      m.pose = p;
    }
    function size() {
      if (disposed) return;
      const w = Math.max(1, host.clientWidth),
        h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      const aspect = w / h;
      camera.left = (-span * aspect) / 2;
      camera.right = (span * aspect) / 2;
      camera.top = span / 2;
      camera.bottom = -span / 2;
      camera.updateProjectionMatrix();
      invalidate();
    }
    function draw(time) {
      raf = null;
      if (disposed) return;
      if (time - lastDraw < 1000 / MAX_FPS) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastDraw = time;
      if (!dirty && time > animUntil) return;
      dirty = false;
      const visible = frame.friends.filter(
        (u) => !u.stale && (!u.health || u.health.alive),
      );
      if (follow && visible.length) {
        target.set(
          visible.reduce((n, u) => n + u.x, 0) / visible.length,
          visible.reduce((n, u) => n + (u.elevation || 0), 0) / visible.length,
          visible.reduce((n, u) => n + u.y, 0) / visible.length,
        );
      }
      camera.position.set(
        target.x + Math.sin(yaw) * span * Math.cos(pitch),
        target.y + span * Math.sin(pitch),
        target.z + Math.cos(yaw) * span * Math.cos(pitch),
      );
      camera.lookAt(target);
      for (const m of meshes.values()) {
        if (!m.desired) continue;
        const t = Math.max(0, Math.min(1, (time - m.updatedAt) / 250));
        m.group.position.lerpVectors(m.previous, m.desired, t);
        if (t < 1 && m.pose === "standing") {
          m.legs[0].rotation.x = Math.sin(time * 0.015) * 0.35;
          m.legs[1].rotation.x = -m.legs[0].rotation.x;
        } else for (const l of m.legs) l.rotation.x = 0;
      }
      for (const v of effects) v.line.visible = time < v.until;
      renderer.render(scene, camera);
      if (time < animUntil) raf = requestAnimationFrame(draw);
    }
    function invalidate() {
      dirty = true;
      if (raf === null && !disposed) raf = requestAnimationFrame(draw);
    }
    function update(next) {
      if (disposed) return;
      frame = next;
      const cloudy = next.battle?.weather.timeOfDay === "overcast";
      scene.background.setHex(cloudy ? 0xdde4df : 0xeaf0e6);
      scene.fog.color.copy(scene.background);
      const now = performance.now(),
        ids = new Set();
      for (const u of [
        ...next.friends,
        ...next.contacts.filter((c) => !c.expired),
      ]) {
        ids.add(u.id);
        let m = meshes.get(u.id);
        if (!m) {
          m = figure(u);
          meshes.set(u.id, m);
        }
        const y = u.elevation ?? root.OverwatchGeometry.elevation(u);
        m.previous = m.group.position.clone();
        m.desired = new T.Vector3(u.x, y + (u.carriedBy ? 1.15 : 0.12), u.y);
        if (!m.updatedAt) m.previous.copy(m.desired);
        m.updatedAt = now;
        m.group.rotation.y = -(u.heading || 0) + Math.PI / 2;
        m.group.visible = true;
        m.marker.visible = !u.stale;
        m.group.traverse((o) => {
          if (o.isMesh) o.frustumCulled = true;
        });
        m.gun.visible =
          (!!u.role || u.classification === "armed-person") &&
          !["aid", "down", "dead", "carried", "carrying"].includes(u.pose);
        m.gun.scale.z = u.weapon?.model === "G19" ? 0.3 : 1;
        pose(m, u);
      }
      for (const [id, m] of meshes) if (!ids.has(id)) m.group.visible = false;
      for (const fx of next.battle?.effects || []) {
        if (effects.some((v) => v.id === fx.eventId)) continue;
        const g = new T.BufferGeometry().setFromPoints([
            new T.Vector3(
              fx.from.x,
              root.OverwatchGeometry.elevation(fx.from) + 1.2,
              fx.from.y,
            ),
            new T.Vector3(
              fx.to.x,
              root.OverwatchGeometry.elevation(fx.to) + 1.1,
              fx.to.y,
            ),
          ]),
          material = new T.LineBasicMaterial({
            color: fx.side === "red" ? 0xd68148 : 0xe2bf55,
          }),
          line = new T.Line(g, material);
        scene.add(line);
        effects.push({ id: fx.eventId, line, until: now + 220 });
      }
      while (effects.length > 40) {
        const v = effects.shift();
        scene.remove(v.line);
        v.line.geometry.dispose();
        v.line.material.dispose();
      }
      animUntil = now + 300;
      invalidate();
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (raf !== null) cancelAnimationFrame(raf);
      resize?.disconnect();
      for (const off of listeners) off();
      for (const v of effects) {
        v.line.geometry.dispose();
        v.line.material.dispose();
      }
      for (const g of geometries) g.dispose();
      for (const m of materials.values()) m.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      host.replaceChildren();
      if (active === api) active = null;
    }
    try {
      scene = new T.Scene();
      scene.background = new T.Color(0xeaf0e6);
      scene.fog = new T.Fog(0xeaf0e6, 1800, 3000);
      camera = new T.OrthographicCamera(-200, 200, 150, -150, 0.1, 5000);
      renderer = new T.WebGLRenderer({
        antialias: false,
        powerPreference: "low-power",
        alpha: false,
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, DPR));
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.9;
      host.appendChild(renderer.domElement);
      renderer.domElement.setAttribute(
        "aria-label",
        "본부 수신 정보로 구성한 실시간 3D 전장",
      );
      renderer.domElement.setAttribute("role", "img");
      scene.add(new T.HemisphereLight(0xffffff, 0x809570, 0.6));
      const sun = new T.DirectionalLight(0xffffff, 0.7);
      sun.position.set(-300, 900, 450);
      scene.add(sun);
      const map = initial.map,
        ground = new T.PlaneGeometry(map.width, map.height, 60, 40);
      ground.rotateX(-Math.PI / 2);
      ground.translate(map.width / 2, 0, map.height / 2);
      const pos = ground.attributes.position;
      for (let i = 0; i < pos.count; i++)
        pos.setY(
          i,
          root.OverwatchGeometry.elevation({ x: pos.getX(i), y: pos.getZ(i) }),
        );
      ground.computeVertexNormals();
      geometries.push(ground);
      scene.add(new T.Mesh(ground, mat(0xb8c6a3)));
      for (const b of map.buildings) {
        const x = (b[0] + b[2]) / 2,
          z = (b[1] + b[3]) / 2,
          y = root.OverwatchGeometry.elevation({ x, y: z });
        box(
          b[2] - b[0],
          b[4],
          b[3] - b[1],
          0xb5b6a7,
          scene,
          x,
          y + b[4] / 2,
          z,
        );
        box(
          b[2] - b[0] + 2,
          1,
          b[3] - b[1] + 2,
          0x949d90,
          scene,
          x,
          y + b[4] + 0.5,
          z,
        );
      }
      // Sparse actual-size trees outside movement obstacles; decorative only, no extra occlusion.
      for (let i = 0; i < 28; i++) {
        const x = 30 + ((i * 137) % 1120),
          z = 40 + ((i * 211) % 720);
        if (root.OverwatchGeometry.blocked({ x, y: z })) continue;
        const y = root.OverwatchGeometry.elevation({ x, y: z });
        box(0.5, 5, 0.5, 0x8c8d69, scene, x, y + 2.5, z);
        box(3.5, 4, 3.5, 0x809570, scene, x, y + 5, z);
      }
      box(
        35,
        0.2,
        35,
        0xc8c7ac,
        scene,
        map.base.x,
        root.OverwatchGeometry.elevation(map.base) + 0.1,
        map.base.y,
      );
      listen(renderer.domElement, "webglcontextlost", (e) => {
        e.preventDefault();
        dispose();
        onFallback("3D 그래픽 연결이 끊겨 2D 상황도로 전환했습니다.");
      });
      listen(renderer.domElement, "pointerdown", (e) => {
        drag = { x: e.clientX, y: e.clientY };
        renderer.domElement.setPointerCapture(e.pointerId);
      });
      listen(renderer.domElement, "pointermove", (e) => {
        if (!drag) return;
        yaw += (e.clientX - drag.x) * 0.007;
        pitch = Math.max(
          0.35,
          Math.min(1.4, pitch + (e.clientY - drag.y) * 0.005),
        );
        drag = { x: e.clientX, y: e.clientY };
        invalidate();
      });
      listen(renderer.domElement, "pointerup", () => (drag = null));
      listen(renderer.domElement, "pointercancel", () => (drag = null));
      listen(
        renderer.domElement,
        "wheel",
        (e) => {
          e.preventDefault();
          span = Math.max(
            35,
            Math.min(1400, span * Math.exp(e.deltaY * 0.001)),
          );
          size();
        },
        { passive: false },
      );
      resize = new ResizeObserver(size);
      resize.observe(host);
      size();
    } catch (error) {
      renderer?.dispose();
      host.replaceChildren();
      onFallback(
        "이 기기에서 3D를 시작하지 못했습니다. 2D 상황도를 사용할 수 있습니다.",
      );
      return null;
    }
    const api = {
      host,
      id: initial.id,
      update,
      dispose,
      zoom(factor) {
        span = Math.max(35, Math.min(1400, span * factor));
        size();
      },
      follow() {
        follow = !follow;
        invalidate();
        return follow;
      },
      overview() {
        follow = false;
        target.set(600, 0, 400);
        span = 900;
        size();
      },
      resize: size,
      stats() {
        return {
          meshes: meshes.size,
          knownIds: [...meshes]
            .filter(([id, m]) => m.group.visible)
            .map(([id]) => id),
          drawCalls: renderer.info.render.calls,
          geometries: renderer.info.memory.geometries,
          framesPending: raf === null ? 0 : 1,
        };
      },
    };
    update(initial);
    active = api;
    return api;
  }
  root.OverwatchFieldRenderer = {
    create,
    get: () => active,
    dispose: () => active?.dispose(),
  };
})(typeof window === "undefined" ? globalThis : window);
