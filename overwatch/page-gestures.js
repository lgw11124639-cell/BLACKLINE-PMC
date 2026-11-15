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
