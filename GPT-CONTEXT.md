# Goal Tracker — полный контекст для передачи другой модели (GPT)

Всё ниже написано **по коду** (app.js, страницы, модули, стили, тесты), а не по AGENTS.md/README.md.
Скопируй этот файл целиком в модель как системный контекст перед задачей.

---

## 1. Что это за сайт

**Goal Tracker** — одностраничное ванильное HTML/CSS/JS-приложение-трекер целей с геймификацией
(XP, уровни, стрик, навыки, статистика). Без фреймворков и сборщиков. Три страницы:

- `index.html` — дашборд (цели + сайдбар) и секция Statistics;
- `skill.html` — детальная страница навыка с деревом целей (`?id=<skillId>`);
- `login.html` + `login.js` — вход через Google (`signInWithPopup`), guard от open-redirect на `?next=`, есть «Continue without an account».

## 2. Файловая структура и порядок загрузки

Все скрипты грузятся одинаково на index и skill, с cache-bust токенами `?v=N`
(GitHub Pages кэширует ~10 мин; при изменении общего артефакта поднимать N на обеих страницах):

```
firebase-app-compat.js (10.12.2)
firebase-auth-compat.js
firebase-firestore-compat.js
firebase.init.js?v=2            — инициализирует app только если задан apiKey
statistics-model.js?v=1          — глобальный Statistics
statistics.js?v=5                — createStatisticsView({getState, save}); null без #statisticsPage (поэтому безопасен на skill.html)
schedule-model.js?v=2            — глобальный GoalSchedule
reminders.js?v=2                 — createReminderPanel, createReminderSystem, createBrowserReminders
app.js?v=16                      — всё приложение
styles.css?v=16                  — на всех трёх страницах
```

`login.html` грузит только firebase-app + firebase-auth + firebase.init + `login.js?v=2` (без Firestore).
Порядок обязателен: `Statistics` → statistics.js; `GoalSchedule` → reminders.js и app.js.

**Тесты** (`tests/`, gjs/node): model-тесты вырезают DOM-free блок `// <goal-model> … // </goal-model>`
из app.js и гоняют настоящий код:

```
gjs tests/goal-model.js
gjs tests/daily-reset.js
gjs tests/schedule-model.js
gjs tests/reminders.js
gjs tests/statistics-model.js
gjs tests/statistics-sync.js
gjs tests/streak-motion.js
TZ=America/New_York gjs tests/schedule-model.js   # и аналогично statistics-model/reminders
```

Плюс браузерные UI-тесты через изолированный раннер: `STATISTICS_TEST_SCRIPT=<file>` с
`tests/*-browser.js`. Не выдумывать другие раннеры — сначала проверить, что есть в репо.

## 3. Хранилище и синхронизация

- **Источник истины — localStorage**, ключ **`neonGoalTracker.v1`**, весь стейт — один JSON.
- `migrateState()` идемпотентен, не пишет при загрузке; стартовое сохранение идёт
  с `{maintenance:true}` (не бumpает `updatedAt`, чтобы миграция не перебила облако).
- Пользовательские сохранения bumpают `updatedAt` строго вверх:
  `Math.max(Date.now(), updatedAt + 1)` — это флаг LWW.
- **Firestore — опциональное зеркало**: документ `users/{uid}` = `{state: <JSON string>, updatedAt}`,
  debounce 800 мс (`queueCloudSync`), last-write-wins по `updatedAt`, сверка при входе,
  онлайн и каждом сохранении. Отсюда лимиты: фото ≤150 КБ, документ ≤1 MiB.
- Мульти-табы — через событие `storage` → `syncStoredProgress()` (берёт более свежий `updatedAt`).
- Отдельный device-local ключ `neonGoalTracker.v1.reminderDelivery` — только кэш доставки
  браузерных уведомлений, на прогресс не влияет.
- Неудача записи (квота) → `#storageError` + откат `structuredClone`-снапшотом (create/update/toggle).

## 4. Модель данных (точные поля)

```js
state = {
  profile: { name, photo },          // photo — data URL JPEG, центр-кроп 256×256, ≤150 КБ
  streak: { count, date },           // date = "YYYY-MM-DD"; тиры по 0/1/3/6/14 дней → 0..4
  updatedAt: number,                 // LWW-метка
  goals: [...],
  skills: [...],
  lifeAreas: [...],
  completionHistory: [...],
  statisticsStartedOn: "YYYY-MM-DD",
  schemaVersion: 3,                  // добавляется миграцией
  oneTimeSchedules?: { [goalId]: { day: "YYYY-MM-DD", configuredAt: ms } },
  reminderReceipts?: { [goalId]: { key, status: "done"|"skipped" } },
}
```

**Goal**
```js
{ id: uuid, title (1..80), description (≤160),
  type: "step"|"quest"|"arc",
  skillId: <обязательно, существующий навык>,
  parentGoalId: "" | id,             // step→quest|arc, quest→arc, arc→нет; только в том же skill
  xp: int ≥ 0,                       // пресеты: step [10,15,30,50,100,125], quest [200,350,500], arc [1000,2000,5000] (+кастом)
  repeatsDaily: bool,                // legacy-флаг; только step/quest; у arc всегда false
  schedule?: { type: "one-time"|"daily"|"weekly"|"custom",
               time?: "HH:MM",       // обязательно для step/quest, когда есть напоминание/тайм
               daysOfWeek?: [1..7] },// 1=Пн … 7=Вс
  reminder?: { enabled: bool, offset: "0m"|"5m"|"15m"|"30m" },
  completed: bool, completedDay: "YYYY-MM-DD"|"",
  activeCompletionId: id|"",         // запись completionHistory этого завершения
  completedScheduleDay?: "YYYY-MM-DD", // ставится при завершении через напоминание
  createdAt: ISO }
```

**Skill**: `{ id, name, goal, xp, lifeAreaId }` (`lifeAreaId: ""` допустим).
**LifeArea**: `{ id, name }` (name ≤50, создание требует ≥1 существующий навык).
**CompletionHistory**: `{ id, goalId, skillId, completionDate, xpAwarded, occurrenceKey? }`.

**XP/уровни**:
- XP навыка = сумма наград за его цели; **XP игрока = сумма XP навыков** (производная, не хранится).
- `level = floor(sqrt(xp/100)) + 1`; порог `(level-1)²·100`; ширина `(2·level-1)·100`.

## 5. Поведение CRUD и прогресса

- **Валидация** — `validateGoalWrite()` + `GoalSchedule.validate()`: существует ли skillId,
  тип/роль, «Set a time to enable reminders», «Select at least one day», валидный HH:MM,
  «Only Steps and Quests can have a scheduled time / repeat».
- **Создание/редактирование** — снапшот `structuredClone(state)` → мутация → `saveState()`;
  при неудаче откат и ошибка в `#goalFormError`. `syncOneTimeSchedule()` якорит время one-time
  к локальной дате настройки; смена schedule чистит `reminderReceipts[id]` и `completedScheduleDay`.
- **Удаление** — `confirm()`; чистит записи `reminderReceipts`/`oneTimeSchedules`; у навыка
  удаление заблокировано, если на него ссылаются цели или есть записи истории.
- **Завершение/undo** — `toggleGoalCompletion()`:
  - двойное начисление невозможно (no-op при совпадении состояния);
  - undo вычитает **записанный** `xpAwarded` из **записанного** `skillId` (не из текущего);
  - XP навыка клампится в 0; level-up детектится по `getLevelInfo` до/после;
  - успешное завершение: `bumpStreak()`, запись в историю, `activeCompletionId`;
  - undo: удаляет запись истории, чистит `completedScheduleDay`, удаляет receipt со статусом `done`.
- **Сбросы** — `resetRepeatingGoals()` на каждом `render()` и по смене дня (таймер ≤60 с,
  `focus/pageshow/visibilitychange`): one-time не сбрасываются; daily — когда `completedDay ≠ сегодня`
  (с карв-аутом, чтобы напоминание «на завтра» пережило полночь); weekly/custom — когда
  последний наступивший день после `completedDay` новее его. **Сброс чистит только
  completed/completedDay/activeCompletionId — XP и история сохраняются.**
- **Навигация**: `navigateToGoal()` умеет прыгать между страницами (`skill.html?id=…&goal=…`),
  на дашборде скроллит/фокусит карточку; deep-link `?goal=` обрабатывается при старте.

## 6. Рендеринг целей (два пути!)

- **Дашборд** `renderGoals()`: три колонки step/quest/arc из `#goalCardTemplate`;
  счётчик остатка исключает только выполненные **нерепитинговые** цели; порядок —
  стабильный партишн: невыполненные сверху, выполненные в конец; поиск по title+description;
  пустые состояния. Карточка: чекбокс, заголовок, `+N XP`, описание (скрыто если пустое),
  бейдж навыка, бейдж родителя, бейдж расписания (`GoalSchedule.label`), чип состояния
  («Done today»/«Done»/«Completed»).
- **Страница навыка** `renderGoalTree()/renderGoalTreeNode()`: карта дети→родители,
  цикл-гард (недостижимые узлы становятся корнями), сортировка по `goalTypeOrder`,
  вложенные `<ul class="goal-tree-list">`, узел с `border-left: 4px solid currentColor`
  по роли; рекурсивные дети.
- **Общее меню «…»** `createGoalActionsMenu()` + `GOAL_MENU_ITEMS` = [Edit, Delete]
  (danger-стиль). Один shared `<div class="goal-menu" role="menu">` в body, items
  перерисовываются при каждом открытии — этим же механизмом пользуются скиллы
  (Edit/Delete скилла) и аватар (Load a photo / Delete photo, Delete disabled без фото).
  Клавиатура: ArrowUp/Down/Home/End с skip disabled и wrap, Tab/Escape закрывают с возвратом
  фокуса, клик снаружи закрывает; позиционирование flip+clamp, репозиционирование на scroll/resize.

## 7. Интерфейс (принятые решения — не баги)

1. Топ-навигация index.html — ровно **Goals** и **Statistics**. **Вкладки Skills нет** —
   навыки в сайдбаре дашборда, клик ведёт на `skill.html?id=…`.
2. У каждой цели (и на дашборде, и в дереве скилла) ровно **одно меню «…»** с Edit/Delete.
   Не заменять на постоянные кнопки или hover-контролы.
3. Statistics — ровно три модуля: **Weekly Activity** (DOM/CSS столбцы, не canvas),
   **Top Skill Progression** (топ-5 по XP за неделю, полосы в %), **Life Areas**
   (SVG-радар для 3–8 зон + список процентов, цвет зоны — хеш id из палитры). Один общий
   селектор недели Пн–Вс, будущие недели заблокированы. В сводке только «Goals completed»
   и «XP earned». Анимации входа/смены недели уважают `prefers-reduced-motion`;
   недели **без истории** (до `statisticsStartedOn`) отличаются от недель с нулевой активностью.
4. Диалог Life Areas только **назначает существующие навыки** — кнопки «+ Create a Skill» там
   нет; создание навыков — в панели Skills дашборда.
5. Аватар — настоящая загрузка: «+» в кольце пока фото нет, меню Load/Delete photo;
   фото — data URL в общем state-записи, **без второго upload path и Firebase Storage**;
   только через `readProfilePhoto()`; не вставлять data URL в `innerHTML`.
6. Расписание: one-time — дефолт формы; weekly/custom требуют ≥1 день; время — опциональный
   локальный `HH:MM`; напоминания только при времени; у Arc нет времени/напоминаний/повторов;
   повтор разрешён только Step/Quest; «отключить время» можно только выключив напоминание.
7. Напоминания: in-app панель работает без разрешений; `Notification` запрашивается только
   при включении чекбокса; опрос раз в 60 с + по focus/pageshow/visibilitychange/storage;
   без service workers/push; максимум одна актуальная запись на цель (включая **Missed**);
   **Skip** гасит одну вхождение без XP; **Mark done** идёт через обычное завершение/undo;
   Missed не создаёт фиктивную историю; отказ уведомлений не ломает in-app напоминания.
8. Секция профиля: стрик-бейдж с 5 тирами (SVG из `assets/streak-tier-*.svg`), уровень и
   XP-бар; анимации на CSS-переменных `--motion-*` с reduced-motion фолбэками.
9. Дизайн: тёмная неоновая тема (фон `#061a2d→#03111e`, `--blue #20b9ff`, `--green #1df4a1`,
   `--orange`, красный `--ff4f4f`), Inter, радиус 16px; цвета ролей — step циан `#27d9d0`,
   quest фиолет `#7c6cff`, arc оранжевый; колонки/узлы дерева с structural accent borders,
   выполненные карточки — тише, но не затемняют активных детей; XP — вторичный текст.
   Брейкпоинты 1180/1100/850/720/480px (на 720px доска в колонку, поиск скрыт).
10. Модалки — нативные `<dialog>.showModal()`; удаления — браузерные `confirm()`;
    гарды — `alert()`. Это текущая конвенция.

## 8. Миграции (не ломать)

- Легаси-типы: `daily`→`{step, repeatsDaily:true}`, `short`→`{step, false}`,
  `medium`→`quest`, `long`→`arc`; неизвестное → step; у arc `repeatsDaily` форсится false.
- `repeatsDaily:true` без schedule → `{schedule:{type:"daily"}, reminder:{enabled:false, offset:"0m"}}`.
- `normalizeGoalParents()` отвязывает битые/самоссылочные/несовместимые/чужие-скиллу parentGoalId,
  но сами цели не удаляет. Никогда не сбрасывать `neonGoalTracker.v1` ради нового фича,
  не выдумывать историю до начала трекинга.

## 9. Технические ограничения для модели

- Только ванильный JS; соблюдать глобалы и порядок загрузки (см. §2).
- При изменениях взаимодействия с целям проверять **оба** рендера (`renderGoals()` и
  `renderGoalTreeNode()`) и **обе** страницы.
- Сохранять `?v=N` токены одинаковыми на обеих страницах при правке общих артефактов.
- Держать `CRUD.md`/`README.md` согласованными с намеренными продуктовыми изменениями
  (но намерения брать из кода, а не из устаревших доков).
- Предполагаемый REST-backend в доках — гипотеза, не инструкция менять persistence.
- Не рефакторить несвязанный код, не пересобирать файлы целиком.

---

## ПРОМПТ (копировать в модель)

```
You are working on a vanilla HTML/CSS/JS frontend called "Goal Tracker" — a gamified
goal/skill tracker with XP, levels, streaks and statistics. No frameworks, no bundler.
The whole app state is one JSON document in localStorage under key `neonGoalTracker.v1`,
optionally mirrored to Firestore (single doc users/{uid} = {state: JSON string, updatedAt},
800 ms debounce, last-write-wins). localStorage is the source of truth; Firestore is an
optional mirror. Never reset storage, never invent historical data.

The repository contains: index.html (dashboard + Statistics + dialogs), skill.html
(skill detail, body[data-page="skill"], ?id=<skillId>), login.html + login.js (Google
sign-in, open-redirect guard), app.js (~4200 lines: state, CRUD, rendering, sync, auth, FX),
statistics-model.js (global `Statistics`), statistics.js (createStatisticsView({getState, save})),
schedule-model.js (global `GoalSchedule`), reminders.js (createReminderPanel,
createReminderSystem, createBrowserReminders), styles.css (dark neon theme, --motion-* tokens),
firebase.init.js, tests/ (gjs/node model tests that eval the DOM-free `// <goal-model>` block
from app.js, plus isolated browser tests). Scripts load in a fixed order with ?v=N cache tokens
identical on index.html and skill.html.

DATA MODEL:
- goal: {id, title≤80, type: step|quest|arc, skillId (must reference an existing skill),
  parentGoalId (step→quest|arc, quest→arc, arc→none; same skill only), description≤160,
  xp≥0 (presets: step [10,15,30,50,100,125], quest [200,350,500], arc [1000,2000,5000]),
  repeatsDaily, schedule? {type: one-time|daily|weekly|custom, time? "HH:MM", daysOfWeek? 1..7
  (1=Mon…7=Sun)}, reminder? {enabled, offset: 0m|5m|15m|30m}, completed, completedDay,
  activeCompletionId, completedScheduleDay?, createdAt}
- skill: {id, name, goal, xp, lifeAreaId ("" allowed)}; lifeArea: {id, name}
- completionHistory: {id, goalId, skillId, completionDate, xpAwarded, occurrenceKey?}
- profile: {name, photo (centre-cropped 256×256 JPEG data URL ≤150 KB, read only via
  readProfilePhoto(), never injected via innerHTML)}
- optional: oneTimeSchedules {goalId:{day, configuredAt}}, reminderReceipts {goalId:{key,status}}
- player XP = sum of skill XP (derived, never stored); level = floor(sqrt(xp/100))+1,
  threshold (L-1)²·100, span (2L-1)·100.

BEHAVIOR TO PRESERVE (accepted product decisions, not bugs):
1. index.html top nav has exactly Goals and Statistics. There is NO Skills tab — skills live
   in the dashboard sidebar and link to skill.html?id=….
2. One shared "…" actions menu per Goal (createGoalActionsMenu + GOAL_MENU_ITEMS: Edit/Delete)
   used by BOTH renderGoals() (dashboard cards) and renderGoalTreeNode() (skill tree). Never
   replace it with permanently visible buttons or hover-only controls. Skills and the profile
   avatar reuse the same menu mechanism (skill-specific actions; photo actions "Load a photo"/
   "Delete photo" with Delete disabled when no photo). Keep roving-focus keyboard behavior,
   Escape/outside-click close, viewport flip positioning.
3. Statistics has exactly three modules — Weekly Activity, Top Skill Progression, Life Areas —
   sharing one Monday–Sunday week picker with future weeks disabled. Charts are DOM/CSS bars
   and an SVG radar (no canvas). No Active Skills in the weekly summary, no Skill icons in
   progression. Animation respects prefers-reduced-motion; untracked history weeks are
   distinguished from tracked weeks with zero activity.
4. The Life Areas dialog assigns existing Skills only — no "+ Create a Skill" button there.
   Skill creation lives in the dashboard Skills panel.
5. Every Goal must reference an existing Skill. Roles (Step/Quest/Arc) are independent of
   recurrence; only Step/Quest may repeat or have a time; Arcs never repeat or have times.
   One-time is the form default. Reminders require a time.
6. Resets: one-time goals never reset; daily resets at the next local day; weekly/custom on
   their next selected day. Reset clears only checked state + activeCompletionId — XP and
   completionHistory are preserved. A reminder completed for tomorrow survives tonight's
   midnight. Manual undo reverses the recorded reward and the skill that actually received it;
   XP is clamped at 0 and can never be awarded twice.
7. Life Areas are user-created, need ≥1 existing skill; a skill has at most one lifeAreaId;
   uncategorized XP counts in skill stats but never in Life Area percentages or an "Other" area.
   Historical area numbers use current skill assignments; aggregates are computed from facts,
   never stored.
8. Photo upload is a plain data URL that travels with the ordinary state write — no second
   upload path, no Firebase Storage. Keep the size cap (Firestore 1 MiB doc limit).
9. Reminders: in-app panel works fully without permission; browser Notification permission is
   requested only when the user enables the checkbox; 60 s interval + refresh on focus/pageshow/
   visibilitychange/storage; no service workers or push; failures must leave in-app reminders
   usable. Keep only the latest due reminder per goal, incl. Missed; Skip dismisses one
   occurrence without XP; Missed occurrences never manufacture completion history.
10. Migration is idempotent and must keep existing data (legacy goal types daily/short/medium/
    long → step/quest/arc; repeatsDaily:true + no schedule → {type:"daily"}). `updatedAt`
    increases strictly on user saves but maintenance saves must not bump it.
11. Visual language: dark neon theme, Inter font, per-role accent colors, structural accent
    borders on goal columns/tree items, completed cards quieter without dimming active children,
    animation tokens --motion-* with reduced-motion fallbacks. Keep ?v=N cache-bust tokens
    consistent across index.html and skill.html when you change a shared asset.

CONSTRAINTS:
- Vanilla JS only. Globals and load order matter: firebase compat → firebase.init →
  statistics-model → statistics → schedule-model → reminders → app.js (same on both pages).
- Check BOTH goal render paths and both pages when changing goal interactions.
- Use native <dialog>.showModal() for modals and browser confirm()/alert() for delete/guards
  (that is the current convention).
- Run the relevant tests after changes: `gjs tests/goal-model.js`, `gjs tests/daily-reset.js`,
  `gjs tests/schedule-model.js`, `gjs tests/reminders.js`, `gjs tests/statistics-model.js`,
  `gjs tests/statistics-sync.js`, `gjs tests/streak-motion.js` (also once under
  TZ=America/New_York), plus browser tests via the isolated runner
  (STATISTICS_TEST_SCRIPT=<file> with tests/*-browser.js). Verify which commands actually exist
  in the repo before running — do not invent test runners.
- When in doubt about intended behavior, infer it from the code (app.js / schedule-model.js /
  statistics-model.js), not from stale documentation. State your assumptions if docs and code
  disagree.

Before implementing a non-trivial change, summarize your plan in 3–5 bullets; after implementing,
list the files touched and the checks you ran. Do not refactor unrelated code or rebuild whole
files from scratch.
```
