"""Проверка: у всех слов (words и reference) поле translation не пустое.

Запуск:  python tools/check_translations.py          — все уроки
         python tools/check_translations.py 1 2      — только указанные
"""
import pathlib
import re
import sys

DATA = pathlib.Path(__file__).resolve().parent.parent / "data"

# Объект слова — фигурные скобки без вложенных, в которых есть reading
WORD_RE = re.compile(r"\{[^{}]*?\breading:\s*\"[^\"]*\"[^{}]*\}")
FIELD_RE = r'\b{}:\s*"([^"]*)"'


def section(text, name, next_names):
    """Кусок файла от `name:` до следующего раздела."""
    start = text.find(name + ":")
    if start < 0:
        return ""
    ends = [text.find(n + ":", start) for n in next_names]
    ends = [e for e in ends if e > start]
    return text[start:min(ends) if ends else len(text)]


def check(n):
    path = DATA / f"lesson{n:02}.js"
    text = path.read_text(encoding="utf-8")
    problems = []
    for part in ("words", "reference"):
        chunk = section(text, part, ["words", "reference", "grammar", "exercises"])
        for m in WORD_RE.finditer(chunk):
            obj = m.group(0)
            tr = re.search(FIELD_RE.format("translation"), obj)
            if not tr or not tr.group(1).strip():
                kanji = re.search(FIELD_RE.format("kanji"), obj)
                reading = re.search(FIELD_RE.format("reading"), obj).group(1)
                word = kanji.group(1) if kanji and kanji.group(1) else reading
                problems.append((part, word, reading))
    words_total = len(WORD_RE.findall(section(text, "words", ["reference", "grammar", "exercises"])))
    return words_total, problems


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # консоль Windows иначе падает на японских символах
    lessons = [int(a) for a in sys.argv[1:]] or range(1, 26)
    bad = 0
    for n in lessons:
        total, problems = check(n)
        if total == 0 and not problems:
            continue  # урок ещё не заполнен
        if problems:
            bad += len(problems)
            print(f"Урок {n}: без перевода — {len(problems)}")
            for part, word, reading in problems:
                print(f"   [{part}] {word} ({reading})")
        else:
            print(f"Урок {n}: ок, переводы есть у всех слов")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
