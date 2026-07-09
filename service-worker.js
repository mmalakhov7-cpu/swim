// service-worker.js — офлайн-кэш «оболочки» приложения (ТЗ §8).
//
// Стратегия: NETWORK-FIRST для своих ресурсов.
//   • онлайн — всегда берём свежую версию из сети (правки видны сразу после reload),
//     параллельно обновляя кэш;
//   • офлайн — отдаём последнюю закэшированную версию.
// Так офлайн-работа сохраняется, но обновления не «залипают» в кэше.

const CACHE = "swim-v32";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/main.css",
  "./vendor/chart.min.js",
  "./src/app.js",
  "./src/storage.js",
  "./src/sync.js",
  "./src/models.js",
  "./src/timer.js",
  "./src/splits.js",
  "./src/workout.js",
  "./src/workoutGenerator.js",
  "./src/presetWorkouts.js",
  "./src/wakeLock.js",
  "./src/ui.js",
  "./src/charts.js",
  "./src/screens/dashboard.js",
  "./src/screens/prepare.js",
  "./src/screens/activeWorkout.js",
  "./src/screens/analytics.js",
  "./src/screens/templates.js",
  "./src/screens/sessionDetail.js",
  "./src/screens/settings.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // только свои ресурсы

  event.respondWith(
    fetch(request)
      .then((resp) => {
        // Успех из сети — обновляем кэш и отдаём свежее.
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return resp;
      })
      .catch(async () => {
        // Офлайн — из кэша; для навигаций фолбэк на оболочку.
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      })
  );
});
