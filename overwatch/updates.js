(function (root) {
  "use strict";
  const parts = (version) =>
    /^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(version || "")
      ? version.split(".").map(Number)
      : null;
  function newer(candidate, current) {
    const a = parts(candidate),
      b = parts(current);
    if (!a || !b) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
  }
  function create(options) {
    const win = options.window || root,
      doc = win.document;
    let available = null,
      checking = null,
      lastCheck = -Infinity,
      applying = false;
    let banner;
    function show(message, canApply = false) {
      if (!banner) {
        banner = doc.createElement("section");
        banner.className = "app-update-banner";
        banner.setAttribute("aria-label", "앱 업데이트");
        banner.innerHTML =
          '<p role="status" aria-live="polite"></p><div><button data-apply-update>저장 후 업데이트</button><button data-close-update aria-label="업데이트 안내 닫기">닫기</button></div>';
        banner
          .querySelector("[data-apply-update]")
          .addEventListener("click", apply);
        banner
          .querySelector("[data-close-update]")
          .addEventListener("click", () => (banner.hidden = true));
        doc.body.append(banner);
      }
      banner.hidden = false;
      banner.querySelector("p").textContent = message;
      banner.querySelector("[data-apply-update]").hidden = !canApply;
      banner.querySelector("[data-apply-update]").disabled = applying;
    }
    async function check(manual = false) {
      if (checking) return checking;
      if (!manual && (doc.hidden || Date.now() - lastCheck < 60000)) return;
      lastCheck = Date.now();
      checking = (async () => {
        const abort = new win.AbortController(),
          timer = win.setTimeout(() => abort.abort(), 10000);
        if (manual) show("새 버전을 확인하고 있습니다.");
        try {
          const url = new URL("version.json", win.location.href);
          url.searchParams.set("check", Date.now());
          const response = await win.fetch(url.href, {
            cache: "no-store",
            signal: abort.signal,
          });
          if (!response.ok) throw Error("HTTP " + response.status);
          const release = await response.json();
          if (!parts(release.version))
            throw Error("버전 정보가 올바르지 않습니다.");
          available = newer(release.version, options.version)
            ? release.version
            : null;
          if (available)
            show(
              "새 버전 " +
                available +
                "이 있습니다. 현재 진행을 저장한 뒤 업데이트할 수 있습니다.",
              true,
            );
          else if (manual) show("최신 버전입니다. 현재 " + options.version);
        } catch (_) {
          if (manual)
            show(
              "업데이트를 확인하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 눌러주세요.",
              !!available,
            );
        } finally {
          win.clearTimeout(timer);
        }
      })();
      try {
        return await checking;
      } finally {
        checking = null;
      }
    }
    async function apply() {
      if (!available || applying) return;
      applying = true;
      show("진행을 저장하고 업데이트를 적용합니다.", true);
      try {
        await options.beforeUpdate();
        const url = new URL(win.location.href);
        url.searchParams.set("appVersion", available);
        url.searchParams.set("update", Date.now());
        (options.navigate || ((href) => win.location.replace(href)))(url.href);
      } catch (error) {
        applying = false;
        show("업데이트를 적용하지 않았습니다. " + error.message, true);
      }
    }
    const resume = () => {
      if (!doc.hidden) check();
    };
    win.addEventListener("pageshow", resume);
    win.addEventListener("focus", resume);
    doc.addEventListener("visibilitychange", resume);
    win.setInterval(resume, 300000);
    return { check, apply };
  }
  const api = { create, newer };
  root.OverwatchUpdates = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
