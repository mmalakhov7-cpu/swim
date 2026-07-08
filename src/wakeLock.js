// wakeLock.js — «не гасить экран» через Screen Wake Lock API с мягким фолбэком.
// Wake Lock спадает при сворачивании вкладки — перезапрашиваем по возвращении.

export function createWakeLock() {
  let sentinel = null;
  let active = false;

  async function acquire() {
    if (!("wakeLock" in navigator)) return;
    try {
      sentinel = await navigator.wakeLock.request("screen");
      sentinel.addEventListener("release", () => { sentinel = null; });
    } catch (e) {
      // Отказ (нет фокуса/поддержки) — не критично, просто без блокировки.
      console.debug("wakeLock: недоступен", e && e.message);
    }
  }

  function onVisibility() {
    if (active && document.visibilityState === "visible" && !sentinel) acquire();
  }

  return {
    enable() {
      if (active) return;
      active = true;
      acquire();
      document.addEventListener("visibilitychange", onVisibility);
    },
    disable() {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel) { sentinel.release().catch(() => {}); sentinel = null; }
    },
  };
}
