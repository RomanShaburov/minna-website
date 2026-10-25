(function () {
  "use strict";

  var LESSON_COUNT = 25;
  var lessons = window.LESSONS || {};

  // ---------- Сохранение настроек (работает и без localStorage) ----------
  function load(key, fallback) {
    try {
      var v = localStorage.getItem("mnn." + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem("mnn." + key, JSON.stringify(value)); } catch (e) {}
  }

  var state = {
    lesson: load("lesson", 1),
    tab: load("tab", "words"),
    show: load("show", { reading: true, translation: true }),
    refShow: load("refShow", { reading: true, translation: true }),
    onlyMarked: load("onlyMarked", false),
    marks: load("marks", {}), // { "1": ["私|わたし", ...] } — отмеченные слова по урокам
    done: load("done", {}), // { "3": true } — уроки, отмеченные как пройденные
    theme: load("theme", "auto"),
    searchScope: load("searchScope", "all"),
    found: null // { lesson, kind: "word" | "ref", i } — строка, на которую перешли из поиска
  };
  var THEMES = ["auto", "light", "dark", "sakura", "matcha", "ocean", "sepia", "space"];

  // ---------- Утилиты ----------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  // Японский текст: [ ] — часть, которую можно опустить, выделяется отдельно
  function jp(s) {
    return esc(s).replace(/\[([^\]]*)\]/g, '<span class="opt" title="можно опустить">[$1]</span>');
  }
  function $(id) { return document.getElementById(id); }
  function getLesson(n) { return lessons[n] || { title: "", words: [], grammar: [] }; }

  // ---------- Навигация ----------
  function renderNav() {
    var html = "";
    for (var i = 1; i <= LESSON_COUNT; i++) {
      var words = getLesson(i).words || [];
      var cls = "lesson-btn";
      if (i === state.lesson) cls += " is-active";
      if (!words.length) cls += " is-empty";
      if (state.done[i]) cls += " is-done";
      html += '<button class="' + cls + '" data-lesson="' + i + '" title="Урок ' + i +
        (words.length ? " — слов: " + words.length : " — пусто") + (state.done[i] ? ", пройден" : "") + '">' + i + "</button>";
    }
    $("lesson-nav").innerHTML = html;
  }

  function wordHtml(w) {
    return jp(w.kanji || w.reading);
  }

  // Чтение показываем только если в слове есть кандзи или цифры (1つ, 10) — у слов из одной каны оно дублирует само слово
  var KANJI_RE = /[㐀-䶿一-鿿々0-9０-９]/;
  function needsReading(w) { return !!w.kanji && KANJI_RE.test(w.kanji); }

  function isFound(kind, i) {
    var f = state.found;
    return !!f && f.lesson === state.lesson && f.kind === kind && f.i === i;
  }

  // ---------- Отметки ----------
  function wordKey(w) { return (w.kanji || "") + "|" + w.reading; }
  function lessonMarks() { return state.marks[state.lesson] || []; }
  function isMarked(w) { return lessonMarks().indexOf(wordKey(w)) >= 0; }
  function toggleMark(w) {
    var list = lessonMarks().slice();
    var k = wordKey(w);
    var i = list.indexOf(k);
    if (i >= 0) list.splice(i, 1); else list.push(k);
    if (list.length) state.marks[state.lesson] = list; else delete state.marks[state.lesson];
    save("marks", state.marks);
  }

  // ---------- Таблица слов ----------
  function renderWords() {
    var words = getLesson(state.lesson).words || [];
    var marked = 0;
    var rows = "";
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var m = isMarked(w);
      if (m) marked++;
      if (state.onlyMarked && !m) continue;
      var cls = (m ? "is-marked" : "") + (isFound("word", i) ? " is-found" : "");
      rows += '<tr data-i="' + i + '"' + (cls ? ' class="' + cls.trim() + '"' : "") + ">" +
        '<td class="col-num">' + (i + 1) + "</td>" +
        '<td class="col-word">' + wordHtml(w) +
          // На телефоне колонка «Чтение» скрыта, чтение показывается здесь, под словом
          (needsReading(w) ? '<div class="word-read"><span>' + jp(w.reading) + "</span></div>" : "") + "</td>" +
        '<td class="col-reading">' + (needsReading(w) ? "<span>" + jp(w.reading) + "</span>" : "") + "</td>" +
        '<td class="col-translation"><span>' + esc(w.translation) + "</span></td>" +
        '<td class="col-note">' + esc(w.note) + "</td>" +
        "</tr>";
    }
    $("words-body").innerHTML = rows;
    $("words-table").hidden = !rows;
    $("words-empty").hidden = !!rows;
    $("words-empty").textContent = words.length
      ? "Отмеченных слов нет — кликните по номеру или слову, чтобы отметить."
      : "В этом уроке слов пока нет.";
    $("word-count").textContent = words.length
      ? "Слов: " + words.length + (marked ? " · отмечено: " + marked : "")
      : "";
    $("only-marked").checked = state.onlyMarked;
    renderReference();
  }

  // ---------- Справочная таблица ----------
  function renderReference() {
    var ref = getLesson(state.lesson).reference;
    $("reference").hidden = !ref || state.onlyMarked;
    if (!ref) return;
    $("ref-title").textContent = ref.title || "Справочно";
    $("ref-count").textContent = "Строк: " + ref.rows.length;
    $("ref-note").hidden = !ref.note;
    $("ref-note").innerHTML = ref.note ? jp(ref.note) : "";
    var hasHead = ref.columns.some(function (c) { return c; });
    $("ref-head").innerHTML = !hasHead ? "" : "<tr>" + ref.columns.map(function (c) {
      return "<th>" + esc(c) + "</th>";
    }).join("") + "</tr>";
    $("ref-body").innerHTML = ref.rows.map(function (row, ri) {
      return '<tr data-r="' + ri + '"' + (isFound("ref", ri) ? ' class="is-found"' : "") + ">" + row.map(function (w) {
        if (!w) return "<td></td>"; // пустая ячейка, если колонки разной длины
        return "<td>" +
          '<div class="ref-word">' + wordHtml(w) + "</div>" +
          (needsReading(w) ? '<div class="ref-read"><span>' + jp(w.reading) + "</span></div>" : "") +
          (w.translation ? '<div class="ref-tr"><span>' + esc(w.translation) + "</span></div>" : "") +
          "</td>";
      }).join("") + "</tr>";
    }).join("");
  }

  // ---------- Грамматика ----------
  function renderGrammar() {
    var items = getLesson(state.lesson).grammar || [];
    if (!items.length) {
      $("grammar-body").innerHTML = '<p class="empty">Конспект грамматики для этого урока пока не добавлен.</p>';
      return;
    }
    $("grammar-body").innerHTML = items.map(function (g) {
      var paras = (g.points || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
      var examples = (g.examples || []).map(function (e) { return '<p class="ex">' + jp(e) + "</p>"; }).join("");
      return '<article class="grammar-item"><h3>' + esc(g.title) + "</h3>" + paras + examples + "</article>";
    }).join("");
  }

  // ---------- Упражнения ----------
  // Плоский список всех заданий урока — для перехода «Назад / Дальше» в окне
  var exList = [];
  var exIndex = -1;

  function renderExercises() {
    var groups = getLesson(state.lesson).exercises || [];
    exList = [];
    if (!groups.length) {
      $("exercises-body").innerHTML = '<p class="empty">Упражнений для этого урока пока нет.</p>';
      return;
    }
    $("exercises-body").innerHTML = groups.map(function (g) {
      var items = (g.items || []).map(function (it, i) {
        exList.push({ group: g, item: it, num: i + 1, total: g.items.length });
        return '<button class="ex-item" data-ex="' + (exList.length - 1) + '">' +
          '<span class="ex-num">' + (i + 1) + ')</span><span>' + jp(it.task) + "</span></button>";
      }).join("");
      return '<article class="ex-group"><h3>' + esc(g.title) + "</h3>" +
        (g.instruction ? '<p class="ex-instr">' + esc(g.instruction) + "</p>" : "") +
        givenHtml(g.given) +
        (g.example ? '<p class="ex-example"><b>Пример:</b> ' + jp(g.example) + "</p>" : "") +
        '<div class="ex-items">' + items + "</div></article>";
    }).join("");
  }

  // Данные из таблицы учебника — столбцами
  function givenHtml(g) {
    if (!g) return "";
    return '<table class="given">' +
      "<tr>" + g.columns.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>" +
      g.rows.map(function (r) {
        return "<tr>" + r.map(function (c) { return "<td>" + jp(c) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</table>";
  }

  function openExercise(i) {
    if (i < 0 || i >= exList.length) return;
    exIndex = i;
    var e = exList[i];
    $("ex-modal-title").textContent = e.group.title + " · " + e.num + " из " + e.total;
    $("ex-task").innerHTML = jp(e.item.task);
    $("ex-given").innerHTML = givenHtml(e.group.given);
    $("ex-hint").textContent = e.item.hint || e.group.hint || "—";
    $("ex-answer").innerHTML = jp(e.item.answer);
    $("ex-answer").hidden = true;
    $("ex-answer-btn").hidden = false;
    $("ex-pos").textContent = (i + 1) + " / " + exList.length;
    $("ex-prev").disabled = i === 0;
    $("ex-next").disabled = i === exList.length - 1;
    $("ex-modal").hidden = false;
  }

  function closeExercise() {
    $("ex-modal").hidden = true;
    exIndex = -1;
  }

  function showAnswer() {
    $("ex-answer").hidden = false;
    $("ex-answer-btn").hidden = true;
  }

  // ---------- Переключатели и вкладки ----------
  // У основной и справочной таблицы свои переключатели
  function applyToggles() {
    ["reading", "translation"].forEach(function (key) {
      $("words-table").classList.toggle("hide-" + key, !state.show[key]);
      document.querySelector('[data-toggle="' + key + '"]').checked = state.show[key];
      $("reference").classList.toggle("hide-" + key, !state.refShow[key]);
      document.querySelector('[data-ref-toggle="' + key + '"]').checked = state.refShow[key];
    });
  }

  function clearReveals(containerId) {
    var cells = document.querySelectorAll("#" + containerId + " .revealed");
    for (var i = 0; i < cells.length; i++) cells[i].classList.remove("revealed");
  }

  function applyTab() {
    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle("is-active", tabs[i].dataset.tab === state.tab);
    }
    $("tab-words").hidden = state.tab !== "words";
    $("tab-grammar").hidden = state.tab !== "grammar";
    $("tab-exercises").hidden = state.tab !== "exercises";
  }

  function applyDone() {
    var on = !!state.done[state.lesson];
    var btn = $("done-btn");
    btn.classList.toggle("is-done", on);
    btn.setAttribute("aria-pressed", on);
    btn.textContent = "Урок пройден";
    btn.title = on ? "Снять отметку «пройден»" : "Отметить урок как пройденный";
  }

  function renderLesson() {
    var lesson = getLesson(state.lesson);
    $("lesson-title").textContent = "Урок " + state.lesson + (lesson.title ? " · " + lesson.title : "");
    document.title = "Урок " + state.lesson + " — Minna no Nihongo";
    renderNav();
    applyDone();
    renderWords();
    renderGrammar();
    renderExercises();
  }

  // ---------- События ----------
  $("lesson-nav").addEventListener("click", function (e) {
    var btn = e.target.closest(".lesson-btn");
    if (!btn) return;
    state.lesson = Number(btn.dataset.lesson);
    state.found = null;
    save("lesson", state.lesson);
    renderLesson();
    trainerOn = false;
    showSearch(false);
    window.scrollTo(0, 0);
  });

  $("done-btn").addEventListener("click", function () {
    if (state.done[state.lesson]) delete state.done[state.lesson]; else state.done[state.lesson] = true;
    save("done", state.done);
    applyDone();
    renderNav();
  });

  document.querySelector(".tabs").addEventListener("click", function (e) {
    var btn = e.target.closest(".tab");
    if (!btn) return;
    state.tab = btn.dataset.tab;
    save("tab", state.tab);
    applyTab();
  });

  document.querySelector(".toolbar").addEventListener("change", function (e) {
    var key = e.target.dataset.toggle;
    if (!key) return;
    state.show[key] = e.target.checked;
    save("show", state.show);
    clearReveals("words-table");
    applyToggles();
  });

  $("ref-toolbar").addEventListener("change", function (e) {
    var key = e.target.dataset.refToggle;
    if (!key) return;
    state.refShow[key] = e.target.checked;
    save("refShow", state.refShow);
    clearReveals("reference");
    applyToggles();
  });

  $("only-marked").addEventListener("change", function (e) {
    state.onlyMarked = e.target.checked;
    save("onlyMarked", state.onlyMarked);
    renderWords();
  });

  // Отметить все слова урока / снять отметки (слова из справочной таблицы не отмечаются)
  $("mark-all").addEventListener("click", function () {
    var words = getLesson(state.lesson).words || [];
    if (!words.length) return;
    state.marks[state.lesson] = words.map(wordKey);
    save("marks", state.marks);
    renderWords();
  });
  $("unmark-all").addEventListener("click", function () {
    delete state.marks[state.lesson];
    save("marks", state.marks);
    renderWords();
  });

  // Клик по скрытой ячейке открывает/закрывает только её,
  // клик по номеру или слову — отмечает строку
  $("words-body").addEventListener("click", function (e) {
    var td = e.target.closest("td");
    if (!td) return;
    var tr = td.parentNode;
    var w = getLesson(state.lesson).words[Number(tr.dataset.i)];

    var under = e.target.closest(".word-read");
    if (under && !state.show.reading) {
      under.classList.toggle("revealed");
      return;
    }
    if ((td.classList.contains("col-reading") && !state.show.reading) ||
        (td.classList.contains("col-translation") && !state.show.translation)) {
      td.classList.toggle("revealed");
      return;
    }
    if (td.classList.contains("col-num") || td.classList.contains("col-word")) {
      toggleMark(w);
      if (state.onlyMarked) renderWords();
      else {
        tr.classList.toggle("is-marked");
        var words = getLesson(state.lesson).words;
        var n = lessonMarks().length;
        $("word-count").textContent = "Слов: " + words.length + (n ? " · отмечено: " + n : "");
      }
    }
  });

  $("ref-body").addEventListener("click", function (e) {
    var cell = e.target.closest(".ref-tr, .ref-read");
    if (!cell) return;
    if ((cell.classList.contains("ref-tr") && !state.refShow.translation) ||
        (cell.classList.contains("ref-read") && !state.refShow.reading)) {
      cell.classList.toggle("revealed");
    }
  });

  var toTop = $("to-top");
  window.addEventListener("scroll", function () {
    toTop.hidden = window.scrollY < 300;
  });
  toTop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("exercises-body").addEventListener("click", function (e) {
    var btn = e.target.closest(".ex-item");
    if (btn) openExercise(Number(btn.dataset.ex));
  });

  $("ex-close").addEventListener("click", closeExercise);
  $("ex-answer-btn").addEventListener("click", showAnswer);
  $("ex-prev").addEventListener("click", function () { openExercise(exIndex - 1); });
  $("ex-next").addEventListener("click", function () { openExercise(exIndex + 1); });
  $("ex-modal").addEventListener("click", function (e) {
    if (e.target === this) closeExercise(); // клик мимо окна
  });

  document.addEventListener("keydown", function (e) {
    if ($("ex-modal").hidden) return;
    if (e.key === "Escape") closeExercise();
    else if (e.key === "ArrowLeft") openExercise(exIndex - 1);
    else if (e.key === "ArrowRight") openExercise(exIndex + 1);
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); showAnswer(); }
  });

  // ---------- Темы ----------
  function applyTheme() {
    if (state.theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", state.theme);
    $("theme-select").value = state.theme;
    syncThemeColor();
  }

  // Цвет системной полосы телефона (строка состояния) — как у шапки текущей темы
  function syncThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    var color = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
    if (meta && color) meta.setAttribute("content", color);
  }
  if (window.matchMedia) {
    var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    var onSchemeChange = function () { if (state.theme === "auto") syncThemeColor(); };
    if (darkQuery.addEventListener) darkQuery.addEventListener("change", onSchemeChange);
  }

  $("theme-select").addEventListener("change", function (e) {
    state.theme = e.target.value;
    save("theme", state.theme);
    applyTheme();
  });

  // ---------- Поиск ----------
  // Сравниваем без регистра, катакану приводим к хирагане, скобки [ ] и пробелы не учитываем
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase()
      .replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
      .replace(/[\[\]\s]/g, "");
  }

  // Слова в скобках — пояснение к переводу («интересный (фильм, книга…)»), по ним не ищем
  function noParens(s) {
    return String(s == null ? "" : s).replace(/\([^)]*\)|（[^）]*）/g, " ");
  }

  function hl(text, q) {
    text = String(text == null ? "" : text);
    var raw = q.trim().toLowerCase();
    var at = raw ? text.toLowerCase().indexOf(raw) : -1;
    if (at < 0) return esc(text);
    return esc(text.slice(0, at)) + "<mark>" + esc(text.slice(at, at + raw.length)) + "</mark>" +
      esc(text.slice(at + raw.length));
  }

  var MAX_RESULTS = 200;

  function runSearch(query) {
    var q = norm(query);
    var out = [];
    if (!q) return out;
    var from = state.searchScope === "lesson" ? state.lesson : 1;
    var to = state.searchScope === "lesson" ? state.lesson : LESSON_COUNT;
    function hit(w) {
      return norm(w.kanji).indexOf(q) >= 0 || norm(w.reading).indexOf(q) >= 0 ||
        norm(noParens(w.translation)).indexOf(q) >= 0;
    }
    for (var n = from; n <= to; n++) {
      var l = getLesson(n);
      (l.words || []).forEach(function (w, i) {
        if (hit(w)) out.push({ lesson: n, kind: "word", i: i, w: w, where: "слово № " + (i + 1) });
      });
      if (l.reference) {
        l.reference.rows.forEach(function (row, ri) {
          row.forEach(function (w) {
            if (w && hit(w)) out.push({ lesson: n, kind: "ref", i: ri, w: w, where: "справка: " + (l.reference.title || "").replace(/^справочн(о|ик):\s*/i, "") });
          });
        });
      }
    }
    return out;
  }

  var searchResults = [];

  var trainerOn = false;

  function showSearch(on) {
    if (on) trainerOn = false;
    $("search-results").hidden = !on;
    $("trainer-view").hidden = !trainerOn;
    $("lesson-view").hidden = on || trainerOn;
    syncTrainerMode();
  }

  // Режим тренажёра: на телефоне прячем заголовок урока и сворачиваем список уроков (style.css)
  function syncTrainerMode() {
    document.body.classList.toggle("trainer-on", trainerOn);
    setNavOpen(false);
  }
  function setNavOpen(open) {
    document.querySelector(".header").classList.toggle("nav-open", open);
    $("nav-toggle").setAttribute("aria-expanded", String(open));
  }
  $("nav-toggle").addEventListener("click", function () {
    setNavOpen($("nav-toggle").getAttribute("aria-expanded") !== "true");
  });

  function renderSearch() {
    var query = $("search-input").value;
    if (!norm(query)) { showSearch(false); renderSuggest([], query); return; }
    var all = runSearch(query);
    renderSuggest(all, query);
    searchResults = all.slice(0, MAX_RESULTS);
    showSearch(true);
    $("sr-count").textContent = all.length
      ? "Найдено: " + all.length + (all.length > MAX_RESULTS ? " (показаны первые " + MAX_RESULTS + ")" : "")
      : "Ничего не найдено";
    $("sr-list").innerHTML = searchResults.map(function (r, idx) {
      var w = r.w;
      return '<button class="sr-item" data-r="' + idx + '">' +
        '<span class="sr-lesson">Урок ' + r.lesson + "</span>" +
        '<span class="sr-word">' + hl(w.kanji || w.reading, query) + "</span>" +
        (needsReading(w) ? '<span class="sr-read">' + hl(w.reading, query) + "</span>" : "") +
        '<span class="sr-tr">' + hl(w.translation, query) + "</span>" +
        '<span class="sr-where">' + esc(r.where) + "</span></button>";
    }).join("");
  }

  // Подсказки под полем: слова, которые начинаются с введённого, идут первыми; повторы (слово + чтение) убираем
  var suggestItems = [];
  var suggestPos = -1;

  function renderSuggest(all, query) {
    var q = norm(query);
    var seen = {};
    var starts = [], rest = [];
    all.forEach(function (r) {
      if (r.kind !== "word") return;
      var key = wordKey(r.w) + "|" + r.lesson;
      if (seen[key]) return;
      seen[key] = true;
      var begins = norm(r.w.kanji).indexOf(q) === 0 || norm(r.w.reading).indexOf(q) === 0 ||
        norm(noParens(r.w.translation)).indexOf(q) === 0;
      (begins ? starts : rest).push(r);
    });
    suggestItems = starts.concat(rest).slice(0, 6);
    suggestPos = -1;
    var box = $("suggest");
    box.hidden = !suggestItems.length || document.activeElement !== $("search-input");
    box.innerHTML = suggestItems.map(function (r, idx) {
      var w = r.w;
      return '<button class="sg-item" role="option" data-s="' + idx + '">' +
        '<span class="sg-word">' + hl(w.kanji || w.reading, query) + "</span>" +
        (needsReading(w) ? '<span class="sg-read">' + hl(w.reading, query) + "</span>" : "") +
        '<span class="sg-tr">' + hl(w.translation, query) + "</span>" +
        '<span class="sg-lesson">Урок ' + r.lesson + "</span></button>";
    }).join("");
  }

  function moveSuggest(d) {
    if (!suggestItems.length) return;
    suggestPos = (suggestPos + d + suggestItems.length + 1) % (suggestItems.length + 1);
    if (suggestPos === suggestItems.length) suggestPos = -1;
    var items = $("suggest").children;
    for (var i = 0; i < items.length; i++) items[i].classList.toggle("is-active", i === suggestPos);
  }

  // Переход к уроку: открываем вкладку со словами, подсвечиваем строку и прокручиваем к ней
  function goToResult(r) {
    state.lesson = r.lesson;
    state.tab = "words";
    state.onlyMarked = false;
    state.found = { lesson: r.lesson, kind: r.kind, i: r.i };
    save("lesson", state.lesson);
    save("tab", state.tab);
    save("onlyMarked", false);
    renderLesson();
    applyTab();
    showSearch(false);
    $("suggest").hidden = true;
    var row = document.querySelector(r.kind === "word"
      ? '#words-body tr[data-i="' + r.i + '"]'
      : '#ref-body tr[data-r="' + r.i + '"]');
    // Убираем клавиатуру: на телефоне она сдвигает экран уже после прокрутки
    $("search-input").blur();
    if (row) {
      centerRow(row);
      // вёрстка на телефоне доезжает позже (шрифты, адресная строка) — выравниваем ещё раз
      setTimeout(function () { centerRow(row); }, 150);
      setTimeout(function () { centerRow(row); }, 450);
    }
  }

  // Ставит строку в середину видимой области (ниже закреплённой шапки, если она закреплена)
  function centerRow(row) {
    var header = document.querySelector(".header");
    var top = header && getComputedStyle(header).position === "sticky" ? header.getBoundingClientRect().height : 0;
    var rect = row.getBoundingClientRect();
    var target = window.scrollY + rect.top - top - (window.innerHeight - top - rect.height) / 2;
    window.scrollTo(0, Math.max(0, target));
  }

  $("search-input").addEventListener("input", renderSearch);
  $("search-input").addEventListener("keydown", function (e) {
    if (e.isComposing || e.keyCode === 229) return; // идёт набор через IME: Enter и стрелки принадлежат ему
    if (e.key === "Escape") { this.value = ""; renderSearch(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); moveSuggest(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSuggest(-1); }
    else if (e.key === "Enter" && searchResults.length && !$("search-results").hidden) {
      goToResult(suggestPos >= 0 ? suggestItems[suggestPos] : searchResults[0]);
    }
  });
  $("search-input").addEventListener("focus", renderSearch);
  $("search-input").addEventListener("blur", function () { $("suggest").hidden = true; });
  // mousedown срабатывает раньше blur, иначе подсказка исчезла бы до клика
  $("suggest").addEventListener("mousedown", function (e) {
    e.preventDefault();
    var b = e.target.closest(".sg-item");
    if (b) goToResult(suggestItems[Number(b.dataset.s)]);
  });
  // Часть браузеров не шлёт input в конце набора через IME — обновляем результаты сами
  $("search-input").addEventListener("compositionend", renderSearch);
  $("search-scope").addEventListener("change", function (e) {
    state.searchScope = e.target.value;
    save("searchScope", state.searchScope);
    renderSearch();
  });
  $("sr-close").addEventListener("click", function () {
    $("search-input").value = "";
    renderSearch();
  });
  $("sr-list").addEventListener("click", function (e) {
    var b = e.target.closest(".sr-item");
    if (b) goToResult(searchResults[Number(b.dataset.r)]);
  });

  // ---------- Тренажёр ----------
  var tset = load("trainer", { lessons: [], mode: "cards", dir: "word" });
  var tr = { queue: [], total: 0, wrong: [], answered: false, revealed: false, cur: null, lastWrong: [] };

  function markedWordsOf(n) {
    var keys = state.marks[n] || [];
    if (!keys.length) return [];
    return (getLesson(n).words || []).filter(function (w) { return keys.indexOf(wordKey(w)) >= 0; });
  }

  function markedCount(n) { return markedWordsOf(n).length; }

  function saveTrainer() { save("trainer", tset); }

  function openTrainer() {
    trainerOn = true;
    $("search-input").value = "";
    $("suggest").hidden = true;
    $("search-results").hidden = true;
    $("lesson-view").hidden = true;
    $("trainer-view").hidden = false;
    syncTrainerMode();
    // выбранные уроки без отмеченных слов отбрасываем; если выбора нет — берём все с отметками
    var avail = [];
    for (var n = 1; n <= LESSON_COUNT; n++) if (markedCount(n)) avail.push(n);
    tset.lessons = (tset.lessons || []).filter(function (n) { return avail.indexOf(n) >= 0; });
    if (!tset.lessons.length) tset.lessons = avail.slice();
    if (["cards", "typing"].indexOf(tset.mode) < 0) tset.mode = "cards";
    if (["word", "tr"].indexOf(tset.dir) < 0) tset.dir = "word";
    showTrSection("setup");
    renderTrSetup();
    window.scrollTo(0, 0);
  }

  function showTrSection(name) {
    $("tr-setup").hidden = name !== "setup";
    $("tr-play").hidden = name !== "play";
    $("tr-done").hidden = name !== "done";
  }

  function selectedTrWords() {
    var out = [];
    tset.lessons.forEach(function (n) {
      markedWordsOf(n).forEach(function (w) { out.push({ w: w, lesson: n }); });
    });
    return out;
  }

  function renderTrSetup() {
    var html = "";
    var any = false;
    for (var n = 1; n <= LESSON_COUNT; n++) {
      var k = markedCount(n);
      if (k) any = true;
      html += '<label class="tr-lesson' + (k ? "" : " is-off") + '">' +
        '<input type="checkbox" data-tl="' + n + '"' + (k ? "" : " disabled") +
        (tset.lessons.indexOf(n) >= 0 ? " checked" : "") + "> Урок " + n + " <small>" + k + "</small></label>";
    }
    $("tr-lessons").innerHTML = html;
    $("tr-empty").hidden = any;
    document.querySelector('input[name="tr-mode"][value="' + tset.mode + '"]').checked = true;
    document.querySelector('input[name="tr-dir"][value="' + tset.dir + '"]').checked = true;
    $("tr-dir-group").classList.toggle("is-off", tset.mode !== "cards");
    updateTrStart();
  }

  function updateTrStart() {
    var cnt = selectedTrWords().length;
    $("tr-start").disabled = !cnt;
    $("tr-start").textContent = cnt ? "Начать · слов: " + cnt : "Выберите уроки с отмеченными словами";
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function startTraining(items) {
    tr.queue = shuffle(items);
    tr.total = tr.queue.length;
    tr.wrong = [];
    showTrSection("play");
    nextCard();
  }

  // Сравнение ответа: без регистра, катакана = хирагана, без пробелов, скобок и знаков ～ － ・
  function tnorm(s) {
    return norm(s).replace(/[～〜~－\-・「」。、．，.,?？!！]/g, "");
  }

  // Принимаются и кандзи, и чтение; части в [ ] можно писать или опускать; варианты через / ／ 、 — любой из них
  function acceptable(w) {
    var set = {};
    [w.kanji, w.reading].forEach(function (src) {
      String(src || "").split(/[\/／、]/).forEach(function (alt) {
        set[tnorm(alt)] = true;
        set[tnorm(alt.replace(/\[[^\]]*\]/g, ""))] = true;
      });
    });
    delete set[""];
    return set;
  }

  function wordMain(w) { return jp(w.kanji || w.reading); }
  function readingSpan(w) { return needsReading(w) ? '<span class="tr-read">' + jp(w.reading) + "</span>" : ""; }

  function nextCard() {
    if (!tr.queue.length) { finishTraining(); return; }
    tr.cur = tr.queue.shift();
    tr.answered = false;
    tr.revealed = false;
    var w = tr.cur.w;
    var typing = tset.mode === "typing";
    var showWord = !typing && tset.dir === "word";
    $("tr-pos").textContent = "Осталось слов: " + (tr.queue.length + 1) + (tr.cur.retry ? " · повтор ошибки" : "");
    $("tr-from").textContent = "Урок " + tr.cur.lesson;
    $("tr-prompt").className = "tr-prompt" + (showWord ? "" : " is-translation");
    $("tr-prompt").innerHTML = showWord ? wordMain(w) : esc(w.translation);
    $("tr-back").hidden = true;
    $("tr-feedback").hidden = true;
    $("tr-form").hidden = !typing;
    if (typing) {
      $("tr-input").value = "";
      $("tr-input").disabled = false;
      $("tr-check").disabled = false;
      $("tr-actions").innerHTML = "";
      $("tr-input").focus();
    } else {
      $("tr-actions").innerHTML = '<button class="answer-btn" id="tr-reveal">Показать ответ</button>';
    }
  }

  function revealCard() {
    if (tr.revealed) return;
    tr.revealed = true;
    var w = tr.cur.w;
    var showWord = tset.dir === "word";
    var back = $("tr-back");
    back.className = showWord ? "is-translation" : "";
    back.innerHTML = showWord ? esc(w.translation) + readingSpan(w) : wordMain(w) + readingSpan(w);
    back.hidden = false;
    $("tr-actions").innerHTML =
      '<button class="answer-btn btn-dont" id="tr-dont">Не знаю</button>' +
      '<button class="answer-btn btn-know" id="tr-know">Знаю</button>';
  }

  function recordResult(ok) {
    if (!ok && !tr.cur.retry) {
      tr.wrong.push(tr.cur);
      // ошибочное слово ещё раз встретится в конце круга
      tr.queue.push({ w: tr.cur.w, lesson: tr.cur.lesson, retry: true });
    }
  }

  function checkTyped() {
    if (tr.answered) return;
    var typed = tnorm($("tr-input").value);
    if (!typed) return;
    tr.answered = true;
    var w = tr.cur.w;
    var ok = !!acceptable(w)[typed];
    recordResult(ok);
    var fb = $("tr-feedback");
    fb.className = "tr-feedback " + (ok ? "ok" : "bad");
    fb.innerHTML = (ok ? "Верно: " : "Неверно. Правильно: ") + wordMain(w) +
      (needsReading(w) ? " (" + jp(w.reading) + ")" : "") +
      (ok ? "" : "<small>Вы ввели: " + esc($("tr-input").value) + "</small>");
    fb.hidden = false;
    $("tr-input").disabled = true;
    $("tr-check").disabled = true;
    $("tr-actions").innerHTML = '<button class="answer-btn" id="tr-next">Дальше</button>';
    $("tr-next").focus();
  }

  function finishTraining() {
    showTrSection("done");
    var right = tr.total - tr.wrong.length;
    $("tr-summary").textContent = "С первого раза верно: " + right + " из " + tr.total + ".";
    $("tr-mistakes").innerHTML = tr.wrong.map(function (x) {
      return '<div class="tr-mistake">' + wordMain(x.w) + (needsReading(x.w) ? " " + jp(x.w.reading) : "") +
        "<span>" + esc(x.w.translation) + " · урок " + x.lesson + "</span></div>";
    }).join("");
    $("tr-again-wrong").hidden = !tr.wrong.length;
    tr.lastWrong = tr.wrong.map(function (x) { return { w: x.w, lesson: x.lesson }; });
  }

  $("trainer-btn").addEventListener("click", openTrainer);

  $("tr-lessons").addEventListener("change", function (e) {
    var n = Number(e.target.dataset.tl);
    if (!n) return;
    var i = tset.lessons.indexOf(n);
    if (e.target.checked && i < 0) tset.lessons.push(n);
    if (!e.target.checked && i >= 0) tset.lessons.splice(i, 1);
    tset.lessons.sort(function (x, y) { return x - y; });
    saveTrainer();
    updateTrStart();
  });
  $("tr-all").addEventListener("click", function () {
    tset.lessons = [];
    for (var n = 1; n <= LESSON_COUNT; n++) if (markedCount(n)) tset.lessons.push(n);
    saveTrainer(); renderTrSetup();
  });
  $("tr-none").addEventListener("click", function () {
    tset.lessons = []; saveTrainer(); renderTrSetup();
  });
  document.querySelector(".tr-opts").addEventListener("change", function (e) {
    if (e.target.name === "tr-mode") tset.mode = e.target.value;
    if (e.target.name === "tr-dir") tset.dir = e.target.value;
    saveTrainer();
    $("tr-dir-group").classList.toggle("is-off", tset.mode !== "cards");
  });
  $("tr-start").addEventListener("click", function () { startTraining(selectedTrWords()); });
  $("tr-exit").addEventListener("click", function () { showTrSection("setup"); renderTrSetup(); });
  $("tr-back-setup").addEventListener("click", function () { showTrSection("setup"); renderTrSetup(); });
  $("tr-again").addEventListener("click", function () { startTraining(selectedTrWords()); });
  $("tr-again-wrong").addEventListener("click", function () { startTraining(tr.lastWrong.slice()); });

  $("tr-form").addEventListener("submit", function (e) { e.preventDefault(); checkTyped(); });
  // Enter, которым подтверждают вариант в IME, не должен отправлять ответ
  $("tr-form").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.isComposing || e.keyCode === 229)) e.preventDefault();
  });

  $("tr-actions").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.id === "tr-reveal") revealCard();
    else if (b.id === "tr-know") { recordResult(true); nextCard(); }
    else if (b.id === "tr-dont") { recordResult(false); nextCard(); }
    else if (b.id === "tr-next") nextCard();
  });

  // Клавиши в карточках: Пробел/Enter — показать ответ; ← не знаю, → знаю
  document.addEventListener("keydown", function (e) {
    if (!trainerOn || $("tr-play").hidden || tset.mode !== "cards") return;
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName)) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      revealCard();
    } else if (tr.revealed && e.key === "ArrowLeft") { recordResult(false); nextCard(); }
    else if (tr.revealed && e.key === "ArrowRight") { recordResult(true); nextCard(); }
  });

  // Звёзды для темы «Космос»: случайные место, размер и темп мерцания; видны только в этой теме (style.css)
  (function makeStars() {
    var field = document.createElement("div");
    field.id = "starfield";
    var html = "";
    for (var i = 0; i < 70; i++) {
      var big = Math.random() < 0.12;
      var size = big ? 2.5 + Math.random() * 1.5 : 1 + Math.random() * 1.2;
      html += '<span class="star' + (big ? " big" : "") + '" style="' +
        "left:" + (Math.random() * 100).toFixed(2) + "%;top:" + (Math.random() * 100).toFixed(2) + "%;" +
        "width:" + size.toFixed(1) + "px;height:" + size.toFixed(1) + "px;" +
        "--lo:" + (0.25 + Math.random() * 0.3).toFixed(2) + ";" +
        "--d:" + (3 + Math.random() * 5).toFixed(1) + "s;--delay:-" + (Math.random() * 8).toFixed(1) + 's"></span>';
    }
    field.innerHTML = html;
    document.body.insertBefore(field, document.body.firstChild);

    // Комета: изредка выныривает из-за бокового края, проходит дугу и целиком уходит за тот же край.
    // Хвост рисуется по уже пройденному пути, поэтому повторяет траекторию.
    var COMET_PAUSE = [30000, 70000];   // пауза между кометами, мс (от, до)
    var COMET_FLIGHT = [4000, 7000];   // длительность полёта, мс (от, до)
    var TAIL = 0.2;                    // длина хвоста в долях пути
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var canvas = document.createElement("canvas");
    canvas.className = "comet-canvas";
    field.appendChild(canvas);
    var ctx = canvas.getContext && canvas.getContext("2d");

    function rand(r) { return r[0] + Math.random() * (r[1] - r[0]); }

    function flyComet() {
      if (!ctx || reduced || document.hidden || document.documentElement.getAttribute("data-theme") !== "space") {
        setTimeout(flyComet, rand(COMET_PAUSE));
        return;
      }
      var dpr = window.devicePixelRatio || 1;
      var w = window.innerWidth, h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var fromLeft = Math.random() < 0.5;
      var out = 40;                                   // старт и финиш — за краем экрана
      var reach = out + 110 + Math.random() * 120;    // насколько вершина дуги заходит внутрь
      var edge = fromLeft ? -out : w + out;
      var dir = fromLeft ? 1 : -1;
      var y0 = h * (0.1 + Math.random() * 0.45);
      var dy = h * (0.25 + Math.random() * 0.3);
      // x по параболе: на краю при t = 0 и t = 1, вершина при t = 0.5
      function at(t) { return [edge + dir * 4 * reach * t * (1 - t), y0 + dy * t]; }

      var flight = rand(COMET_FLIGHT);
      var start = null;
      function frame(now) {
        if (start === null) start = now;
        var t = (now - start) / flight * (1 + TAIL);  // голова идёт дальше t = 1, пока хвост не скроется
        ctx.clearRect(0, 0, w, h);
        var steps = 40;
        for (var i = 0; i < steps; i++) {
          var k0 = i / steps, k1 = (i + 1) / steps;
          var a = at(t - TAIL * (1 - k0)), b = at(t - TAIL * (1 - k1));
          ctx.strokeStyle = "rgba(200, 212, 255, " + (0.75 * k1 * k1).toFixed(3) + ")";
          ctx.lineWidth = 0.4 + 1.8 * k1;
          ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        var head = at(t);
        var g = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 6);
        g.addColorStop(0, "rgba(255, 255, 255, 1)");
        g.addColorStop(0.4, "rgba(210, 220, 255, 0.6)");
        g.addColorStop(1, "rgba(210, 220, 255, 0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(head[0], head[1], 6, 0, Math.PI * 2); ctx.fill();

        if (t < 1 + TAIL) requestAnimationFrame(frame);
        else { ctx.clearRect(0, 0, w, h); setTimeout(flyComet, rand(COMET_PAUSE)); }
      }
      requestAnimationFrame(frame);
    }
    setTimeout(flyComet, rand(COMET_PAUSE));
  })();

  // Высота липкой шапки — чтобы панели над таблицами прилипали прямо под ней
  function syncHeaderHeight() {
    var header = document.querySelector(".header");
    var sticky = getComputedStyle(header).position === "sticky";  // на телефоне шапка не липкая
    document.documentElement.style.setProperty("--header-h", (sticky ? header.offsetHeight : 0) + "px");
  }
  window.addEventListener("resize", syncHeaderHeight);
  if (window.ResizeObserver) new ResizeObserver(syncHeaderHeight).observe(document.querySelector(".header"));
  syncHeaderHeight();

  // ---------- Старт ----------
  if (!(state.lesson >= 1 && state.lesson <= LESSON_COUNT)) state.lesson = 1;
  if (["words", "grammar", "exercises"].indexOf(state.tab) < 0) state.tab = "words";
  if (["all", "lesson"].indexOf(state.searchScope) < 0) state.searchScope = "all";
  if (THEMES.indexOf(state.theme) < 0) state.theme = "auto";
  $("search-scope").value = state.searchScope;
  applyTheme();
  renderLesson();
  applyToggles();
  applyTab();
})();
