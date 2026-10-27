// Офлайн-режим: файлы сайта сохраняются в телефон при первом открытии.
// Файлы всегда отдаются из сохранённых — приложение открывается сразу при любой сети.
// Новая версия скачивается в фоне и включается кнопкой «Обновить» на плашке.
// После любой правки файлов поменяйте номер в CACHE — иначе телефоны не узнают об обновлении.
var CACHE = "minna-v3";
var FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "data/lesson01.js",
  "data/lesson02.js",
  "data/lesson03.js",
  "data/lesson04.js",
  "data/lesson05.js",
  "data/lesson06.js",
  "data/lesson07.js",
  "data/lesson08.js",
  "data/lesson09.js",
  "data/lesson10.js",
  "data/lesson11.js",
  "data/lesson12.js",
  "data/lesson13.js",
  "data/lesson14.js",
  "data/lesson15.js",
  "data/lesson16.js",
  "data/lesson17.js",
  "data/lesson18.js",
  "data/lesson19.js",
  "data/lesson20.js",
  "data/lesson21.js",
  "data/lesson22.js",
  "data/lesson23.js",
  "data/lesson24.js",
  "data/lesson25.js",
  "data/lessons.js"
];

self.addEventListener("install", function (e) {
  // cache: "reload" — мимо HTTP-кеша браузера, чтобы в новую версию не попали старые файлы
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(FILES.map(function (f) { return new Request(f, { cache: "reload" }); }));
  }));
});

// Страница присылает это по кнопке «Обновить»
self.addEventListener("message", function (e) {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return n !== CACHE; })
        .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (req.mode === "navigate") return c.match("index.html");
        return fetch(req);
      });
    }).then(function (res) {
      return res || fetch(req);
    })
  );
});
