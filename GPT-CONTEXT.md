# Goal Tracker — полный контекст для передачи другой модели (GPT)

Всё ниже написано **по коду** (app.js, страницы, модули, стили, тесты), а не по AGENTS.md/README.md.
Контекст сверен с реализацией на 15 октября 2026: Focus / Other Tasks / Completed, компактный fantasy journal, Journey Forecast и скрытые завершения Today.
Life History / Chronicles были отменены: их раздела, модулей и полей в текущей реализации нет.
Скопируй этот файл целиком в модель как контекст перед задачей.

---

## 1. Что это за сайт

**Goal Tracker** — одностраничное ванильное HTML/CSS/JS-приложение-трекер целей с геймификацией
(XP, уровни, стрик, навыки, статистика). Без фреймворков и сборщиков. Три страницы:

- `index.html` — дашборд (Today’s Journey / Goals + сайдбар) и секция Statistics;
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
statistics-model.js?v=2          — глобальный Statistics
statistics.js?v=6                — createStatisticsView({getState, save}); null без #statisticsPage (поэтому безопасен на skill.html)
schedule-model.js?v=4            — глобальный GoalSchedule
journey-forecast-model.js?v=2    — глобальный JourneyForecast: чистые расчёты и нормализация
journey-forecast.js?v=2          — createJourneyForecastView; null без #journeyForecast
reminders.js?v=2                 — createReminderPanel, createReminderSystem, createBrowserReminders
app.js?v=25                      — всё приложение
styles.css?v=25                  — на всех трёх страницах
```

`login.html` грузит только firebase-app + firebase-auth + firebase.init + `login.js?v=2` (без Firestore).
Порядок обязателен: `Statistics` → statistics.js; `Statistics` + `GoalSchedule` → JourneyForecast;
модель Forecast → её UI и `migrateState()` в app.js; `GoalSchedule` → reminders.js и app.js.
Model-тесты, вызывающие `migrateState()`, тоже должны загрузить модель Forecast после Statistics/GoalSchedule.

**Тесты** (`tests/`, gjs/node): model-тесты вырезают DOM-free блок `// <goal-model> … // </goal-model>`
из app.js или загружают отдельные модели и гоняют настоящий код:

```
gjs tests/goal-status-model.js
gjs tests/journey-model.js
gjs tests/journey-forecast-model.js
TZ=America/New_York gjs tests/journey-forecast-model.js
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
`tests/*-browser.js`. Команды, в том числе для мобильного экрана и reduced motion, см. в
`CRUD.md` → Verification. Проверки новых возможностей:

```sh
STATISTICS_TEST_SCRIPT=journey-forecast-browser.js python3 tests/statistics-browser.py webkit
STATISTICS_TEST_SCRIPT=journey-forecast-browser.js STATISTICS_REDUCED_MOTION=1 python3 tests/statistics-browser.py webkit 390 844
GOAL_TEST_PAGE=skill.html STATISTICS_TEST_SCRIPT=journey-forecast-browser.js python3 tests/statistics-browser.py webkit 390 844
STATISTICS_TEST_SCRIPT=journey-views-browser.js python3 tests/statistics-browser.py webkit
STATISTICS_TEST_SCRIPT=journey-polish-browser.js python3 tests/statistics-browser.py webkit
STATISTICS_TEST_SCRIPT=goal-status-browser.js python3 tests/statistics-browser.py webkit
STATISTICS_TEST_SCRIPT=statistics-stacks-browser.js python3 tests/statistics-browser.py webkit
```

Раннер использует изолированные данные и не загружает Firebase.

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
  journey: { date: "YYYY-MM-DD", selectedIds: [], hiddenIds: [], orderIds: [], focusIds: [],
             viewMode: "all"|"split", sortMode: "time"|"manual" },
  journeyForecast: { preferredEndTime: "21:00", activeDate: "", showIndicator: true, expanded: false }, // явная активация на текущий день
  oneTimeSchedules?: { [goalId]: { day: "YYYY-MM-DD", configuredAt: ms } },
  reminderReceipts?: { [goalId]: { key, status: "done"|"skipped" } },
}
```

**Goal**
```js
{ id: uuid, title (1..80), description (≤160),
  type: "step"|"quest"|"arc",
  status: "active"|"paused",
  remindersResumeAt?: ms,           // подавляет напоминания, срок которых раньше возобновления
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
**CompletionHistory**: `{ id, goalId, skillId, goalType?, completionDate, xpAwarded, occurrenceKey? }`.

`goalType` записывается при новом завершении; отсутствие/невалидное значение у старой
записи означает **Unclassified**, а не текущий тип Goal. Типы и награды истории не
переписываются при редактировании/удалении Goal. Названия и уровни в историю не записываются.

**XP/уровни**:
- XP навыка — текущий баланс с сохранением старого XP; история может покрывать лишь его часть; **XP игрока = сумма XP навыков** (производная, не хранится).
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
  - успешное завершение: `bumpStreak()`, запись фактической награды и `goalType` в историю, `activeCompletionId`;
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
- **Общее меню «…»** `createGoalActionsMenu()` + `GOAL_MENU_ITEMS` = [Edit, Delete, Pause goal / Resume goal]
  (Delete с danger-стилем; Pause/Resume зависит от собственного статуса). Один shared `<div class="goal-menu" role="menu">` в body, items
  перерисовываются при каждом открытии — этим же механизмом пользуются скиллы
  (Edit/Delete скилла) и аватар (Load a photo / Delete photo, Delete disabled без фото).
  Клавиатура: ArrowUp/Down/Home/End с skip disabled и wrap, Tab/Escape закрывают с возвратом
  фокуса, клик снаружи закрывает; позиционирование flip+clamp, репозиционирование на scroll/resize.

## 7. Интерфейс (принятые решения — не баги)

1. Топ-навигация index.html — ровно **Today’s Journey → Goals → Statistics** (Today’s Journey открыт по умолчанию). **Вкладки Skills нет** —
   навыки в сайдбаре дашборда, клик ведёт на `skill.html?id=…`.
2. У каждой цели (и на дашборде, и в дереве скилла) ровно **одно меню «…»** с Edit/Delete/Pause goal или Resume goal.
   Не заменять на постоянные кнопки или hover-контролы.
3. Statistics — ровно три модуля: **Weekly Activity** (DOM/CSS stacked-столбцы Step/Quest/Arc + Unclassified, не canvas),
   **Top Skill Progression** (топ-5 по XP за неделю, полосы в %), **Life Areas**
   (SVG-радар для 3–8 зон + список процентов, цвет зоны — хеш id из палитры). Один общий
   селектор недели Пн–Вс, будущие недели заблокированы. В сводке только «Goals completed»
   и «XP earned». Анимации входа/смены недели уважают `prefers-reduced-motion`;
   недели **без истории** (до `statisticsStartedOn`) отличаются от недель с нулевой активностью.
   Считаются события завершения, включая повторные и с нулевой наградой; XP берётся из
   `xpAwarded`, включая записи отсутствующих Skills. `Statistics.weekly()` возвращает
   `{ days, skills, areas, categorizedXp, earned }`; у дня — `count` и `types`.
   Легенда компактная; tooltip по hover/focus показывает день, все типы и итог, Escape закрывает его.
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
9. Дизайн: тёплый пергамент Journey/Goals (`--bg #E8DCC0`, `--surface #F2EAD2`),
   Midnight Archive для профиля/Skills, skill.html и Statistics. MedievalSharp — для заголовков;
   системный UI-шрифт — для кнопок/метаданных, Georgia/serif — для названий целей только в Today.
   В Today Step — sage с ромбом, Quest — bronze со свитком, левая полоса 3px; Focus сильнее типа:
   бордовый заголовок, ivory-текст и рамка gold 2px на карточках против 1px в Other Tasks.
   Completed приглушён, без opacity всей карточки; активные дети не затемняются. Заголовки 44px,
   размеры/отступы списков сохранены; CSS-значки неинтерактивны, внешних ресурсов нет.
   Стиль ограничен Journey. На Goals/Skill сохраняются structural accent borders и существующие
   макеты; XP вторичен. Анимация навигации 220ms, `prefers-reduced-motion` её отключает.
10. Модалки — нативные `<dialog>.showModal()`; удаления — браузерные `confirm()`;
    гарды — `alert()`. Это текущая конвенция.

## Today’s Journey и Pause/Resume

- `renderJourney()` / `journeySections()` показывают три непересекающихся секции:
  Today's Focus (незавершённые, явно выбранные в `focusIds`), Other Tasks (остальные незавершённые),
  Completed (выполненные с `completedDay` сегодняшнего дня). Старый `viewMode` хранится для
  совместимости, но не влияет на UI. Повторяющиеся effectively active Goals включаются по расписанию;
  ручной выбор включает и paused/one-time Goals. Никаких автоматических приоритетов.
- Bookmark на карточке и destination в существующем picker меняют Focus. Новые Goals из Today
  создаются обычным CRUD, выбираются на сегодня и по умолчанию попадают в Other Tasks.
  Завершение переносит root в Completed, сохраняя `focusIds`/`orderIds`; undo возвращает его обратно
  через обычный механизм XP/history. Старые/недатированные завершения не считаются сегодняшними.
- Дочерние Steps остаются под видимым Quest, включая завершённых детей, без дублирования в Completed.
  Место группы задаёт Focus самого Quest; Focus ребёнка не делает родителя приоритетным автоматически.
  Picker заранее поясняет, что выбор destination вложенного Step перемещает видимую группу Quest.
  Когда родитель скрыт, независимо выбранный/запланированный Step снова может стать root.
  Завершение родителя не завершает детей и наоборот. Paused-ребёнок требует ручного выбора.
- By time сортирует внутри каждой активной секции по актуальному времени, затем `createdAt`/ID;
  без времени — Anytime. My order использует `orderIds` и кнопки вверх/вниз только внутри секции;
  скрытые/вложенные/выполненные IDs сохраняют позицию для восстановления.
- Каждая секция имеет button с chevron, count, `aria-expanded`/`aria-controls`. Объект
  `collapsedJourneySections` живёт только в памяти: Focus/Other раскрыты, Completed свёрнут.
  Переключение вкладок/рендер сохраняет раскрытие, reload возвращает defaults; записей в storage нет.
- × скрывает Goal только на сегодня. `journeySummary()` сохраняет скрытые выполненные сегодня Goals
  в completed/total, исключает скрытые невыполненные и не считает ребёнка повторно с Quest.
  Undo убирает скрытое завершение из сводки; picker возвращает Goal без дубликата.
  `normalizeJourney()` очищает selected/hidden/order/focus при смене локального дня, сохраняет sort;
  idempotent-нормализация отбрасывает дубли/удалённые/Arc IDs. Focus использует обычный save/rollback/sync.
- `GoalSchedule.isEffectivelyActive()` учитывает всю цепочку родителей, не меняя статус
  детей. `setGoalStatus()` использует обычный save/rollback/sync; пауза не меняет XP,
  историю, настройки расписания или возможность ручного завершения.
- `GoalSchedule.resumeReminders()` ставит `remindersResumeAt` вновь активным Goals,
  в том числе при перепривязке/удалении предка. Напоминания с `dueAt` раньше этой метки
  подавляются. Label/tooltip общего меню различает собственную и унаследованную паузу.

## 8. Миграции (не ломать)

- Легаси-типы: `daily`→`{step, repeatsDaily:true}`, `short`→`{step, false}`,
  `medium`→`quest`, `long`→`arc`; неизвестное → step; у arc `repeatsDaily` форсится false.
- `repeatsDaily:true` без schedule → `{schedule:{type:"daily"}, reminder:{enabled:false, offset:"0m"}}`.
- Отсутствующий/невалидный `status` становится `active`; `normalizeJourney()` добавляет
  и нормализует Today без изменения XP/history/`updatedAt`. Старый `goalType` в истории не угадывается.
- `normalizeGoalParents()` отвязывает битые/самоссылочные/несовместимые/чужие-скиллу parentGoalId,
  но сами цели не удаляет. Никогда не сбрасывать `neonGoalTracker.v1` ради нового фича,
  не выдумывать историю до начала трекинга.

## Journey Forecast

Порядок шапки: заголовок → дата → By time / My order → Forecast → Focus.
Дата (14px) использует Georgia/serif; главный заголовок не менялся. Счётчик выполненных и
прогресс-бар Today удалены из UI; `journeySummary()` остаётся моделью скрытых завершений.

Forecast — нативный details со свёрнутой высотой 48px, отступом до списка 12px, без sticky.
В summary — шеврон, название, необязательный цветной круг 14px и активное время. Процент,
Calculate, Edit target и формула убраны из UI. Внутри — время, Use this target today, короткий
статус и Show status indicator. Новые пользователи получают свёрнутую панель.

`journeyForecast: { preferredEndTime: "HH:MM", activeDate: "YYYY-MM-DD" | "",
showIndicator: true, expanded: false }`. `JourneyForecast.normalize()` idempotent; неизвестное
время → 21:00/inactive, некорректные UI-флаги → defaults. На новый день activeDate очищается,
но время и UI-предпочтения сохраняются. Обычные localStorage/Firestore write, storage-sync и rollback;
нового документа нет. В отличие от task sections, раскрытие Forecast сохраняется после reload.
Статус/смена дня никогда не раскрывают панель. События toggle при восстановлении настроек не пишут снова.

Изменение валидного будущего времени явно активирует цель на сегодня, без Calculate.
Use this target today повторно использует прежнее время без редактирования; снятие выключает цель.
Прошедшее/невалидное время не заменяет сохранённое. Дата, Focus и новые Goals не активируют вчерашний
target автоматически. После expiry пользователь явно выбирает более позднее время; продления нет.

`journeyForecastGoals()` берёт существующие `journeyGoals()`, фильтрует roots по дневным `focusIds`,
затем добавляет `journeyChildren()`. Other Tasks и hidden/absent roots исключены. Focus вложенного
Step под unfocused Quest остаётся dormant и не попадает в прогноз. Завершённые roots остаются во входном
плане для отличия пустого Focus от завершённой работы; workload исключает completed/Arc и дубли по ID.
Незавершённый Quest покрывает Steps без частичного уменьшения. Незавершённые дети завершённого focused
Quest учитываются отдельно; самостоятельно видимый focused Step считается сам. Collapse/sort не влияют.

Формула и длительности сохранены: Step XP 10/125/другое валидное → 5/15/10 минут;
Quest XP 200/350/500 → 105/180/210, custom — ближайший пресет, равное расстояние → меньший XP.
`AVAILABLE_TIME_FACTOR = 0.75`; T — оставшиеся минуты × factor; W — оценка работы;
`P = 100*T²/(T²+W²)`. Rounded internal P: 75+ Good outlook (#518763), 40–74 At risk (#CE9C39),
ниже40 High risk (#A54C4C). P никогда не выводится в DOM. Это эвристика, а не проверенная вероятность.
Невалидное XP → unavailable; дни/сроки — локальный Date с прежней DST-семантикой.

Pure calculate возвращает inactive/active/completed/expired/unavailable, UI отдельно распознаёт
empty plan как No Focus goals. Empty/inactive/unavailable/completed не показывают круг;
completed поясняется Focus complete, expired — красный Time’s up. Hide indicator не отключает расчёт.
Текст доступен в раскрытой панели и screen-reader status, цвет не является единственным объяснением.

`updateJourneyForecast()` и `updateJourneyForecastPreferences()` сохраняют настройки обычным путём
с rollback. `createJourneyForecastView()` сохраняет DOM, фокус и черновик времени; на skill.html null.
Используется существующий reminder lifecycle: раз в 60s, после render/CRUD/Focus и при resume/storage.
Новых интервалов и записей от пересчёта нет. History, XP, расписания, секции и Statistics не меняются.

Модельные тесты проверяют прежнюю математику, Focus-eligibility, hierarchy, миграцию/даты/DST;
браузерный тест — состояния, прогресс 0/partial/100, цвета, activation, ошибки сохранения,
реальный reload, синхронизацию, midnight/resume, desktop/mobile/reduced motion и единственный timer.
`tests/statistics-sync.js` проверяет round-trip обоих UI-флагов вместе с настройками в mock Firestore.

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

The repository contains: index.html (Today's Journey / Goals dashboard + Statistics + dialogs), skill.html
(skill detail, body[data-page="skill"], ?id=<skillId>), login.html + login.js (Google
sign-in, open-redirect guard), app.js (state, CRUD, rendering, sync, auth, FX),
statistics-model.js (global `Statistics`), statistics.js (createStatisticsView({getState, save})),
schedule-model.js (global `GoalSchedule`), journey-forecast-model.js (global `JourneyForecast`),
journey-forecast.js (createJourneyForecastView), reminders.js (createReminderPanel,
createReminderSystem, createBrowserReminders), styles.css (parchment / Midnight Archive theme, --motion-* tokens),
firebase.init.js, tests/ (gjs/node model tests that eval the DOM-free `// <goal-model>` block
from app.js, plus isolated browser tests). Scripts load in a fixed order with ?v=N cache tokens
identical on index.html and skill.html.

DATA MODEL:
- goal: {id, title≤80, type: step|quest|arc, status: active|paused, remindersResumeAt?, skillId (must reference an existing skill),
  parentGoalId (step→quest|arc, quest→arc, arc→none; same skill only), description≤160,
  xp≥0 (presets: step [10,15,30,50,100,125], quest [200,350,500], arc [1000,2000,5000]),
  repeatsDaily, schedule? {type: one-time|daily|weekly|custom, time? "HH:MM", daysOfWeek? 1..7
  (1=Mon…7=Sun)}, reminder? {enabled, offset: 0m|5m|15m|30m}, completed, completedDay,
  activeCompletionId, completedScheduleDay?, createdAt}
- skill: {id, name, goal, xp, lifeAreaId ("" allowed)}; lifeArea: {id, name}
- completionHistory: {id, goalId, skillId, goalType?, completionDate, xpAwarded, occurrenceKey?}
- profile: {name, photo (centre-cropped 256×256 JPEG data URL ≤150 KB, read only via
  readProfilePhoto(), never injected via innerHTML)}
- journey: {date, selectedIds, hiddenIds, orderIds, focusIds, viewMode: all|split, sortMode: time|manual}
- journeyForecast: {preferredEndTime: "HH:MM", activeDate: "YYYY-MM-DD" | "", showIndicator: boolean, expanded: boolean}; no stored percentage/status
- optional: oneTimeSchedules {goalId:{day, configuredAt}}, reminderReceipts {goalId:{key,status}}
- player XP = sum of skill XP (derived, never stored); level = floor(sqrt(xp/100))+1,
  threshold (L-1)²·100, span (2L-1)·100.

BEHAVIOR TO PRESERVE (accepted product decisions, not bugs):
1. index.html top nav is Today's Journey, Goals, Statistics; Today's Journey is the default. There is NO Skills tab — skills live
   in the dashboard sidebar and link to skill.html?id=….
2. One shared "…" actions menu per Goal (createGoalActionsMenu + GOAL_MENU_ITEMS: Edit/Delete/Pause goal or Resume goal)
   used by BOTH renderGoals() (dashboard cards) and renderGoalTreeNode() (skill tree). Never
   replace it with permanently visible buttons or hover-only controls. Skills and the profile
   avatar reuse the same menu mechanism (skill-specific actions; photo actions "Load a photo"/
   "Delete photo" with Delete disabled when no photo). Keep roving-focus keyboard behavior,
   Escape/outside-click close, viewport flip positioning.
3. Statistics has exactly three modules — Weekly Activity, Top Skill Progression, Life Areas —
   sharing one Monday–Sunday week picker with future weeks disabled. Charts are DOM/CSS bars
   and an SVG radar (no canvas). No Active Skills in the weekly summary, no Skill icons in
   progression. Animation respects prefers-reduced-motion; untracked history weeks are
   distinguished from tracked weeks with zero activity. Weekly Activity stacks Step/Quest/Arc
   completion events using recorded goalType, plus Unclassified for missing/invalid snapshots.
   Never infer past type from current Goals. Summary XP sums recorded rewards (including absent
   Skills). Hover/focus tooltips show all type counts and the total; Escape dismisses them.
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
11. Visual language: warm parchment for Journey/Goals; Midnight Archive for profile/Skills,
    Skill detail and Statistics. MedievalSharp headings, system UI controls/metadata, Georgia/serif
    Today goal titles (14px Step, 15px Quest). Journey-only sage/diamond Steps and bronze/scroll
    Quests use 3px left accents. Focus outranks type: burgundy/ivory header, 2px gold card frame;
    Other uses 1px type frames; Completed is subdued without dimming active children. Keep compact
    dimensions, structural Goal/Skill accents, motion tokens and reduced-motion fallbacks.
    Bump shared cache versions consistently across pages. CSS icons are non-interactive.

12. Today's Journey has independently collapsible Focus / Other Tasks / Completed sections.
    Only explicit daily focusIds create priority; habits, ordinary selections and new goals default
    to Other. Existing picker selects a destination; bookmarks move incomplete roots between sections.
    Nested Steps stay with their visible Quest, including completed children, without duplication.
    Picker explains when selecting a nested Step moves its visible Quest group; never infer parent
    priority from child Focus. Completion moves roots completed today to Completed; normal undo
    restores section/order and reverses recorded XP. No fabricated completion dates or history.
    By time and My order operate within each active section. Date-scoped × hides without erasing
    today's completed summary contribution. Clear selected/hidden/order/focus IDs on local rollover;
    retain sort. Legacy viewMode is ignored. Disclosure state is session-only, without saves:
    Focus/Other expanded and Completed collapsed on reload. Use existing save/rollback/cloud paths.
13. Own status is active|paused; ancestor pausing is dynamic and never rewrites child statuses.
    Today and reminders share GoalSchedule.isEffectivelyActive(). Effective resume (including
    hierarchy edits) suppresses reminders due before remindersResumeAt, preserving schedules.
14. Life History/Chronicles is not part of this checked-out implementation. Its modules and
    chronicle snapshots are absent; adding them would be a separate product change.

15. Journey Forecast sits after sorting, immediately above Focus. Collapsed height 48px;
    only title, optional 14px status circle and active target time. No percentage or Calculate.
    A valid future time edit explicitly activates today; Use this target today reuses remembered
    time. Day rollover clears activation only, preserving time and expanded/showIndicator settings.
    No silent activation or deadline extension. Disclosure defaults closed and never auto-opens.
    Use focused eligible roots plus their nested children; Other Tasks never contribute.
    Preserve hierarchy estimates and formula: Step 10/125/other XP → 5/15/10 minutes;
    Quest 200/350/500 → 105/180/210, nearest preset with ties lower. T = usable minutes × .75;
    P = 100*T²/(T²+W²). Rounded internal 75+/40+/below40 retains original risks; no visible P.
    Empty Focus, inactive, unavailable and completed work have no circle; expiry is red.
    Reuse the single reminder timer/resume hooks and stable DOM, preserving drafts and focus.
    Settings use normal save/sync/rollback; calculation never writes. Keep XP/history untouched.
    Today has no visible completed/total counter or progress bar; editorial date only.

CONSTRAINTS:
- Vanilla JS only. Globals and load order matter: firebase compat → firebase.init →
  statistics-model → statistics → schedule-model → journey-forecast-model → journey-forecast → reminders → app.js (same on both pages).
- Check BOTH goal render paths and both pages when changing goal interactions.
- Use native <dialog>.showModal() for modals and browser confirm()/alert() for delete/guards
  (that is the current convention).
- Run `gjs tests/journey-forecast-model.js` and its America/New_York variant, plus
  `STATISTICS_TEST_SCRIPT=journey-forecast-browser.js python3 tests/statistics-browser.py webkit`
  (also mobile/reduced-motion and skill.html), when modifying Forecast.
- Run the relevant tests after changes: `gjs tests/goal-status-model.js`, `gjs tests/journey-model.js`,
  `gjs tests/goal-model.js`, `gjs tests/daily-reset.js`,
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
