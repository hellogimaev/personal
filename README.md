# Игры на одном iPad

26 мини-игр для 2–3 человек на одном iPad. Работают без интернета.

**Играть:** https://hellogimaev.github.io/personal/

На iPad: открыть ссылку в Safari → «Поделиться» → «На экран Домой». После первого запуска работает офлайн.

Исходники: `ipad-games/src` (ядро `core.js`, игры `games/*.js`, описание API: `ipad-games/API.md`).
Сборка: `python3 ipad-games/build.py` (результат в `ipad-games/dist`); сайт лежит в `docs/`:
`OUT=docs python3 ipad-games/build.py`. Проверка: `node ipad-games/test/smoke.js`.
