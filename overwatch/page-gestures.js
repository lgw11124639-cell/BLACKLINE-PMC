/* Page gestures stay at native scale. The map's own zoom/pan controls are independent. */
(function () {
  "use strict";
  window.OverwatchViewport = {
    point(element, event) {
      const r = element.getBoundingClientRect();
      return matchMedia("(orientation: portrait)").matches &&
        element.closest("#overwatch-root")
        ? { x: event.clientY - r.top, y: r.right - event.clientX }
        : { x: event.clientX - r.left, y: event.clientY - r.top };
    },
  };
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
