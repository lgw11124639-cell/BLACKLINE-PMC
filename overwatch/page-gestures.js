/* Page gestures stay at native scale. The map's own zoom/pan controls are independent. */
(function () {
  "use strict";
  window.OverwatchViewport = {
    bindMap(
      element,
      {
        pan = () => {},
        zoom = () => {},
        tap = () => {},
        accept = () => true,
      } = {},
    ) {
      const pointers = new Map(),
        listeners = [];
      let moved = false,
        pinch = null,
        start = null;
      const listen = (name, fn) => {
        element.addEventListener(name, fn);
        listeners.push(() => element.removeEventListener(name, fn));
      };
      const pair = () => {
        const [a, b] = [...pointers.values()];
        return {
          distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
      };
      listen("pointerdown", (e) => {
        if (e.button !== 0 || !accept(e)) return;
        const p = window.OverwatchViewport.point(element, e);
        pointers.set(e.pointerId, p);
        element.setPointerCapture(e.pointerId);
        if (pointers.size === 1) {
          start = p;
          moved = false;
          pinch = null;
        } else {
          moved = true;
          pinch = pair();
        }
      });
      listen("pointermove", (e) => {
        const old = pointers.get(e.pointerId);
        if (!old) return;
        const p = window.OverwatchViewport.point(element, e);
        pointers.set(e.pointerId, p);
        if (pointers.size >= 2) {
          const next = pair();
          if (pinch)
            zoom(pinch.distance / next.distance, pinch.center, next.center);
          pinch = next;
          moved = true;
          return;
        }
        if (start && Math.hypot(p.x - start.x, p.y - start.y) > 6) moved = true;
        if (moved) pan(p.x - old.x, p.y - old.y);
      });
      const end = (e, cancel = false) => {
        if (!pointers.has(e.pointerId)) return;
        const p = window.OverwatchViewport.point(element, e);
        if (!cancel && pointers.size === 1 && !moved) tap(p, e);
        pointers.delete(e.pointerId);
        pinch = null;
        if (pointers.size) {
          moved = true;
          start = null;
        } else {
          moved = false;
          start = null;
        }
      };
      listen("pointerup", (e) => end(e));
      listen("pointercancel", (e) => end(e, true));
      // Prevent the synthetic click after a drag/pinch from selecting a map target.
      return () => {
        for (const remove of listeners) remove();
        pointers.clear();
      };
    },
    point(element, event) {
      const r = element.getBoundingClientRect();
      return matchMedia("(orientation: portrait)").matches &&
        element.closest("#overwatch-root")
        ? { x: event.clientY - r.top, y: r.right - event.clientX }
        : { x: event.clientX - r.left, y: event.clientY - r.top };
    },
  };
  const compact = () => {
    document.body.classList.toggle(
      "mobile-ui-short",
      Math.min(innerWidth, innerHeight) <= 340,
    );
    document.body.classList.toggle(
      "mobile-ui-narrow",
      Math.max(innerWidth, innerHeight) <= 700,
    );
    document.body.classList.toggle(
      "mobile-ui",
      Math.min(innerWidth, innerHeight) <= 600 &&
        Math.max(innerWidth, innerHeight) <= 1280,
    );
    if (!document.body.classList.contains("mobile-ui"))
      delete document.body.dataset.mobileMenu;
  };
  compact();
  window.addEventListener("resize", compact);
  window.addEventListener("orientationchange", compact);
  const closeMenu = () => {
    delete document.body.dataset.mobileMenu;
    document
      .querySelector("[data-mobile-menu]")
      ?.setAttribute("aria-expanded", "false");
  };
  document.addEventListener("click", (e) => {
    const button = e.target.closest?.("[data-mobile-menu]");
    if (button) {
      const open = document.body.dataset.mobileMenu !== "open";
      document.body.dataset.mobileMenu = open ? "open" : "closed";
      button.setAttribute("aria-expanded", String(open));
    } else if (e.target.closest?.("[data-mobile-menu-close],[data-tab]"))
      closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMenu();
      document
        .querySelector(".field-stage")
        ?.classList.remove("map-tools-open");
      document
        .querySelector("[data-field-tools]")
        ?.setAttribute("aria-expanded", "false");
    }
  });
  // Native horizontal swipes on a rotated page can become browser history gestures.
  // Scroll only the touched scroll container in its logical vertical direction.
  let scrolling = null;
  document.addEventListener(
    "touchstart",
    (e) => {
      scrolling = null;
      if (
        !matchMedia("(orientation: portrait)").matches ||
        e.touches.length !== 1
      )
        return;
      if (e.target.closest?.(".field-viewport")) return;
      let el = e.target instanceof Element ? e.target : null;
      while (el && el.id !== "overwatch-root") {
        const css = getComputedStyle(el);
        if (
          /auto|scroll/.test(css.overflowY) &&
          el.scrollHeight > el.clientHeight + 1
        ) {
          scrolling = {
            el,
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            startX: e.touches[0].clientX,
            startY: e.touches[0].clientY,
            moved: false,
          };
          break;
        }
        el = el.parentElement;
      }
    },
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      if (!scrolling || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (
        Math.hypot(t.clientX - scrolling.startX, t.clientY - scrolling.startY) >
        5
      )
        scrolling.moved = true;
      if (scrolling.moved) {
        e.preventDefault();
        scrolling.el.scrollTop += t.clientX - scrolling.x;
      }
      scrolling.x = t.clientX;
      scrolling.y = t.clientY;
    },
    { passive: false },
  );
  document.addEventListener(
    "touchend",
    (e) => {
      if (scrolling?.moved) e.preventDefault();
      scrolling = null;
    },
    { passive: false },
  );
  document.addEventListener(
    "touchcancel",
    () => {
      scrolling = null;
    },
    { passive: true },
  );
  const cancel = (e) => e.preventDefault();
  for (const type of ["gesturestart", "gesturechange", "gestureend"])
    document.addEventListener(type, cancel, { passive: false });
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) cancel(e);
    },
    { passive: false },
  );
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) cancel(e);
    },
    { passive: false },
  );
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && ["+", "=", "-"].includes(e.key)) cancel(e);
  });
})();
