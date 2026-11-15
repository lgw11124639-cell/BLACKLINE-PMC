/* Page gestures stay at native scale. The map's own zoom/pan controls are independent. */
(function () {
  "use strict";
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
