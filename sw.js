// Офлайн-режим: файлы сайта сохраняются в телефон при первом открытии.
// Пока есть интернет, берём свежие файлы (и обновляем сохранённые), без интернета — отдаём сохранённые.
// При смене состава файлов поменяйте номер в CACHE.
var CACHE = "minna-v1";
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
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
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
    fetch(req).then(function (res) {
      var copy = res.clone();
      if (res.ok) caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match("index.html");
      });
    })
  );
});
