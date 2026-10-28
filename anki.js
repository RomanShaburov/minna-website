// Колода Anki (.apkg) из отмеченных слов — собирается прямо в браузере, без сервера.
// .apkg — это zip, внутри база SQLite collection.anki2 (старый формат, его понимают Anki и AnkiDroid) и файл media.
// SQLite даёт sql.js из папки vendor/ — грузится только при первом экспорте.
// У слов, колод и типа записи постоянные номера: повторный импорт обновляет старые карточки, а не дублирует их.
window.MinnaAnki = (function () {
  "use strict";

  var MODEL_ID = 1729500000001;           // тип записи «Minna no Nihongo»; не менять — иначе Anki заведёт новый
  var DECK = "Minna no Nihongo";
  var FIELDS = ["Слово", "Чтение", "Перевод", "Примечание", "Урок", "Обратная"];

  var CSS =
    ".card { font-family: \"Segoe UI\", system-ui, sans-serif; font-size: 22px; text-align: center; color: #222; background: #fff; }\n" +
    ".nightMode .card, .card.nightMode { color: #eee; background: #222; }\n" +
    ".jp { font-family: \"Yu Gothic\", \"Hiragino Sans\", \"Noto Sans JP\", sans-serif; font-size: 44px; }\n" +
    ".reading { font-family: \"Yu Gothic\", \"Hiragino Sans\", \"Noto Sans JP\", sans-serif; font-size: 26px; color: #c0504d; margin-bottom: 8px; }\n" +
    ".tr { font-size: 26px; }\n" +
    ".note { font-size: 17px; color: #888; margin-top: 10px; }\n";

  var NOTE_PART = "{{#Примечание}}<div class=\"note\">{{Примечание}}</div>{{/Примечание}}";
  var READING_PART = "{{#Чтение}}<div class=\"reading\">{{Чтение}}</div>{{/Чтение}}";
  var TEMPLATES = [
    {
      name: "Японский → русский",
      qfmt: "<div class=\"jp\">{{Слово}}</div>",
      afmt: "{{FrontSide}}\n<hr id=\"answer\">\n" + READING_PART + "\n<div class=\"tr\">{{Перевод}}</div>\n" + NOTE_PART
    },
    {
      // карточка появляется, только если в поле «Обратная» что-то есть
      name: "Русский → японский",
      qfmt: "{{#Обратная}}<div class=\"tr\">{{Перевод}}</div>{{/Обратная}}",
      afmt: "{{FrontSide}}\n<hr id=\"answer\">\n<div class=\"jp\">{{Слово}}</div>\n" + READING_PART + "\n" + NOTE_PART
    }
  ];

  // ---------- Мелочи ----------
  // Стабильный 53-битный хеш строки (cyrb53) — для постоянных номеров
  function hash53(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  // Номер в диапазоне, похожем на отметку времени в мс, как у обычных записей Anki
  function stableId(str) { return 1000000000000 + (hash53(str) % 900000000000); }

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function sha1Int(text) {
    return crypto.subtle.digest("SHA-1", new TextEncoder().encode(text)).then(function (buf) {
      var b = new Uint8Array(buf);
      return ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];  // первые 8 hex-цифр, как csum в Anki
    });
  }

  // ---------- sql.js ----------
  var sqlReady = null;
  function loadSql() {
    if (sqlReady) return sqlReady;
    sqlReady = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "vendor/sql-wasm.js";
      s.onload = function () {
        window.initSqlJs({ locateFile: function (f) { return "vendor/" + f; } }).then(resolve, reject);
      };
      s.onerror = function () { reject(new Error("не удалось загрузить vendor/sql-wasm.js")); };
      document.head.appendChild(s);
    });
    sqlReady.catch(function () { sqlReady = null; });  // при ошибке (нет сети) — попробовать снова в следующий раз
    return sqlReady;
  }

  // ---------- zip без сжатия ----------
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(data) {
    var c = 0xffffffff;
    for (var i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeZip(files) {  // files: [{ name, data: Uint8Array }], имена — латиница
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = new TextEncoder().encode(f.name);
      var crc = crc32(f.data), size = f.data.length;
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);       // версия для распаковки
      local.setUint16(8, 0, true);        // без сжатия
      local.setUint16(12, 0x21, true);    // дата 1980-01-01
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, name.length, true);
      parts.push(new Uint8Array(local.buffer), name, f.data);

      var cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(14, 0x21, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, size, true);
      cd.setUint32(24, size, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      offset += 30 + name.length + size;
    });
    var cdSize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: "application/octet-stream" });
  }

  // ---------- База Anki ----------
  var SCHEMA =
    "CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);" +
    "CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);" +
    "CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);" +
    "CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);" +
    "CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);" +
    "CREATE INDEX ix_notes_usn on notes (usn); CREATE INDEX ix_cards_usn on cards (usn); CREATE INDEX ix_revlog_usn on revlog (usn);" +
    "CREATE INDEX ix_cards_nid on cards (nid); CREATE INDEX ix_cards_sched on cards (did, queue, due);" +
    "CREATE INDEX ix_revlog_cid on revlog (cid); CREATE INDEX ix_notes_csum on notes (csum);";

  function deckJson(id, name, now) {
    return {
      id: id, name: name, desc: "", mod: now, usn: -1, collapsed: false, browserCollapsed: false,
      newToday: [0, 0], revToday: [0, 0], lrnToday: [0, 0], timeToday: [0, 0],
      dyn: 0, conf: 1, extendNew: 10, extendRev: 50
    };
  }

  function modelJson(now, did) {
    return {
      id: MODEL_ID, name: "Minna no Nihongo", type: 0, mod: now, usn: -1, sortf: 0, did: did,
      tmpls: TEMPLATES.map(function (t, i) {
        return { name: t.name, ord: i, qfmt: t.qfmt, afmt: t.afmt, did: null, bqfmt: "", bafmt: "" };
      }),
      flds: FIELDS.map(function (f, i) {
        return { name: f, ord: i, sticky: false, rtl: false, font: "Arial", size: 20, media: [] };
      }),
      css: CSS,
      latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
      latexPost: "\\end{document}",
      latexsvg: false,
      req: [[0, "any", [0]], [1, "all", [2, 5]]],
      tags: [], vers: []
    };
  }

  var DCONF = {
    1: {
      id: 1, name: "Default", mod: 0, usn: 0, dyn: false, maxTaken: 60, timer: 0, autoplay: true, replayq: true,
      new: { delays: [1, 10], ints: [1, 4, 7], initialFactor: 2500, separate: true, order: 1, perDay: 20, bury: true },
      rev: { perDay: 200, ease4: 1.3, fuzz: 0.05, minSpace: 1, ivlFct: 1, maxIvl: 36500, bury: true },
      lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8, leechAction: 0 }
    }
  };

  // items: [{ w: { kanji, reading, translation, note }, lesson }] — в нужном порядке (новые карточки идут так же)
  // opts: { subdecks: bool, reverse: bool }
  function build(items, opts) {
    var nowMs = Date.now(), now = Math.floor(nowMs / 1000);
    return loadSql().then(function (SQL) {
      var notes = items.map(function (it) {
        var w = it.w;
        var word = w.kanji || w.reading;
        return {
          guid: "mnn" + hash53("minna|" + it.lesson + "|" + (w.kanji || "") + "|" + w.reading).toString(36),
          lesson: it.lesson,
          fields: [esc(word), w.kanji ? esc(w.reading) : "", esc(w.translation), esc(w.note), String(it.lesson), opts.reverse ? "1" : ""],
          sort: word
        };
      });
      return Promise.all(notes.map(function (n) { return sha1Int(n.sort); })).then(function (sums) {
        var db = new SQL.Database();
        db.run(SCHEMA);

        var decks = { 1: deckJson(1, "Default", now) };
        var rootId = stableId("deck|" + DECK);
        decks[rootId] = deckJson(rootId, DECK, now);
        function deckFor(lesson) {
          if (!opts.subdecks) return rootId;
          var name = DECK + "::Урок " + (lesson < 10 ? "0" : "") + lesson;
          var id = stableId("deck|" + name);
          if (!decks[id]) decks[id] = deckJson(id, name, now);
          return id;
        }

        var noteStmt = db.prepare("INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)");
        var cardStmt = db.prepare("INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
        notes.forEach(function (n, i) {
          var nid = stableId("note|" + n.guid);
          var tag = " Minna::Урок_" + (n.lesson < 10 ? "0" : "") + n.lesson + " ";
          noteStmt.run([nid, n.guid, MODEL_ID, now, -1, tag, n.fields.join("\x1f"), n.sort, sums[i], 0, ""]);
          var did = deckFor(n.lesson);
          var ords = opts.reverse ? [0, 1] : [0];
          ords.forEach(function (ord) {
            cardStmt.run([stableId("card|" + n.guid + "|" + ord), nid, did, ord, now, -1, 0, 0, i + 1, 0, 0, 0, 0, 0, 0, 0, 0, ""]);
          });
        });
        noteStmt.free();
        cardStmt.free();

        var models = {};
        models[MODEL_ID] = modelJson(now, rootId);
        var conf = {
          activeDecks: [1], curDeck: 1, newSpread: 0, collapseTime: 1200, timeLim: 0, estTimes: true,
          dueCounts: true, curModel: String(MODEL_ID), nextPos: notes.length + 1, sortType: "noteFld",
          sortBackwards: false, addToCur: true
        };
        var midnight = new Date(); midnight.setHours(0, 0, 0, 0);
        db.run("INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)", [
          Math.floor(midnight.getTime() / 1000), nowMs, nowMs,
          JSON.stringify(conf), JSON.stringify(models), JSON.stringify(decks), JSON.stringify(DCONF), "{}"
        ]);
        var bytes = db.export();
        db.close();
        return makeZip([
          { name: "collection.anki2", data: bytes },
          { name: "media", data: new TextEncoder().encode("{}") }
        ]);
      });
    });
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  return { build: build, download: download };
})();
