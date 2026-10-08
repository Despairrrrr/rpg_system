# CRUD documentation

## Current interface contract

These decisions describe the implemented interface and must be preserved when adding
unrelated features. Change them only when the user's new request calls for it, and update
this section at the same time. See also [AGENTS.md](AGENTS.md) for coding-agent guidance.

| Surface | Accepted behavior | Implementation |
|---|---|---|
| Top navigation | **Goals** and **Statistics** only; no Skills tab | `index.html`, navigation handler in `app.js` |
| Header actions | Search, sign-in and a functional reminder bell; no inactive settings buttons | `index.html`, `skill.html`, `reminders.js` |
| Profile photo | Empty circle with a **+** by default; opens the shared **…** menu with **Load a photo** and **Delete photo**; Delete is disabled while there is no photo | `#profileAvatar`, `#profilePhotoInput`, `renderAvatar()`, `PHOTO_MENU_ITEMS` |
| Dashboard Goals | One **…** menu containing Edit and Delete | `#goalCardTemplate`, `renderGoals()`, `createGoalActionsMenu()` |
| Goals inside a Skill | The same **…** menu; no permanent Edit/Delete buttons | `renderGoalTreeNode()`, `createGoalActionsMenu()` |
| Skill rows | Aligned progress list with **… → Edit / Delete** and link to `skill.html?id=...` | `#skillCardTemplate`, `renderSkills()` |
| Skill creation | **+ Add skill** in the dashboard Skills panel | `#openSkillModalBtn`, `openSkillModal()` |
| Statistics → Life Areas | Create/rename/delete Areas and assign existing Skills; no **+ Create a Skill** button | `#lifeAreasModal`, `createStatisticsView()` |
| Statistics overview | Week selector plus Goals completed and XP earned only; no Active Skills metric | `#weekSummary`, `#summaryGoals`, `#summaryXp` |
| Statistics charts | No Skill icons; dynamic user-created Life Areas, not a fixed set of six | `statistics.js`, `statistics-model.js` |

The shared Goal menu uses `GOAL_MENU_ITEMS`, calls `openGoalModal()` and `deleteGoal()`,
and retains delete confirmation, keyboard navigation, Escape and outside-click dismissal.
The profile photo reuses that same shared menu through `PHOTO_MENU_ITEMS`, so the avatar
inherits its positioning and keyboard behavior instead of growing a second menu. Because
the element is shared, `openGoalMenu()` repaints item labels, modifiers and `disabled`
per open; a descriptor may compute `disabled` as a function.
The dashboard and Skill page render Goals separately, so changes to Goal actions must
account for both render paths. The Life Areas dialog intentionally has no
`createStatisticsSkill` element or `addSkill` callback.

Old screenshots and commits may show the removed controls. They are not a specification
for new work. The CRUD snippets below explain individual operations; inspect the actual
functions before editing so validation, history, migration and shared UI behavior survive.

## 1. What CRUD means

CRUD is the basic set of operations used to manage entities:

| Letter | Operation | Goal example | Skill example |
|---|---|---|---|
| C | Create | Add a new goal | Add a new skill |
| R | Read | Render all goals | Render all skills |
| U | Update | Edit/complete a goal | Edit a skill |
| D | Delete | Delete a goal | Delete a skill |

This frontend performs CRUD completely in the browser.

---

# 2. State shape

The application keeps one `state` object:

```js
{
  profile: {
    name: "User User",
    photo: ""             // optional data URL; "" or absent means the empty plus
  },
  goals: [],
  skills: [],
  lifeAreas: [],
  completionHistory: [],
  statisticsStartedOn: "2026-10-04",
  updatedAt: 0,
  schemaVersion: 3
}
```

`profile.photo` is a centre-cropped 256x256 JPEG data URL (quality 0.82).
It is capped at roughly 150 KB and re-encoded smaller once if it does not
fit, because the cloud upload sends the whole state as a single JSON string
and Firestore rejects documents over 1 MiB. Existing documents have no `photo`
field at all, which is why every read goes through `readProfilePhoto()`
instead of trusting the field to exist or to hold a data URL.

A goal looks like this:

```js
{
  id: "uuid",
  title: "Read 20 pages",
  type: "step",          // "step" | "quest" | "arc"
  repeatsDaily: true,    // daily compatibility flag; only Step/Quest
  schedule: { type: "daily", time: "07:00" }, // optional
  reminder: { enabled: true, offset: "5m" },  // optional
  skillId: "uuid",
  parentGoalId: "",      // optional; a step may sit under a quest or an arc
  description: "Before bed",
  xp: 10,
  completed: false,
  completedDay: "",
  activeCompletionId: "",
  createdAt: "2026-09-22T18:00:00.000Z"
}
```

The three types describe how big a goal is, not how often it repeats. Recurrence lives in
`schedule` when present, with `repeatsDaily` retained for legacy daily behavior.
A daily quest is still a quest:

| Type | Meaning | May repeat daily | May be a child of |
|---|---|---|---|
| `step` | A concrete action you can start now | yes | quest, arc |
| `quest` | A meaningful outcome you are working toward | yes | arc |
| `arc` | A larger direction that can contain several quests | no | nothing |

A Step can sit under a Quest under an Arc, or directly under an Arc. A parent is optional,
and it must belong to the same Skill. Every Goal must reference an existing Skill.

A skill looks like this:

```js
{
  id: "uuid",
  name: "Reading",
  goal: "Read regularly",
  xp: 25,
  lifeAreaId: "" // uncategorized
}
```

---

# 3. Persistence

`localStorage` acts as a tiny client-side database.

```js
const STORAGE_KEY = "neonGoalTracker.v1";
```

## Read persisted state

```js
function loadState() {
  return migrateState(readStoredState());
}
```

`migrateState()` upgrades a stored document written by an older version of the app:

| Old | New |
|---|---|
| `type: "short"` | `type: "step"` |
| `type: "medium"` | `type: "quest"` |
| `type: "long"` | `type: "arc"` |
| `type: "daily"` | `type: "step"`, `repeatsDaily: true` |

It also re-resolves `parentGoalId` values against the new type rules and clears any link
that is no longer legal (missing goal, deleted goal, a cycle, or a parent that is now the
wrong type). Goals are never dropped by a migration.

Migration runs on every read, including a pull from the cloud, and is idempotent: running
it on an already migrated document changes nothing. It deliberately does not save, because
writing during a read would bump `updatedAt` and make a stale local document look newer
than the cloud copy. Startup persists the new shape with `saveState({ maintenance: true })`,
which preserves the edit timestamp. The loader preserves `updatedAt`, `schemaVersion` and
the additional Statistics fields. Cloud uploads wait for the sign-in comparison.

## Save state

```js
function saveState({ maintenance = false } = {}) {
  if (!maintenance) state.updatedAt = Date.now();

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueCloudSync();
}
```

After each create/update/delete operation:

```js
saveState();
render();
```

This pattern ensures UI and stored data stay synchronized.

---

# 4. Goals CRUD

## CREATE

The create function receives validated form data:

```js
function createGoal(data) {
  if (!state.skills.some(skill => skill.id === data.skillId)) return;
  state.goals.push({
    id: crypto.randomUUID(),
    title: data.title.trim(),
    type: data.type,
    repeatsDaily: data.repeatsDaily,
    skillId: data.skillId,
    parentGoalId: data.parentGoalId, // optional arc, or quest for a step
    description: data.description.trim(),
    xp: Number(data.xp) || 0,
    completed: false,
    completedDay: "",
    activeCompletionId: "",
    createdAt: new Date().toISOString(),
  });

  syncGoalParents();
  saveState();
  render();
}
```

The form requires a title and Skill. `createGoal()` trims the title and checks that the
Skill exists. `buildGoalPatch()` clears `repeatsDaily` for an Arc and blanks a parent that
is not legal for the chosen type and Skill.

```js
syncGoalParents(); // re-resolves parentGoalId after any change
```

Flow:

```text
User clicks Add goal
→ dialog opens
→ user enters data
→ form submit event fires
→ createGoal()
→ localStorage updated
→ UI re-rendered
```

---

## READ

Goals are read from:

```js
state.goals
```

Then filtered by type:

```js
const allOfType = state.goals.filter((goal) => goal.type === type);
```

And rendered into the correct column:

```js
visible.forEach((goal) => {
  // clone template
  // insert title, description, XP
  // show the "Daily" badge when goal.repeatsDaily
  // attach the shared … menu with Edit/Delete actions
  // append card
});
```

The dashboard has one column per type (`STEPS`, `QUESTS`, `ARCS`) and the skill page nests
the same goals under their Arc or Quest. Both views use `createGoalActionsMenu()` for
Edit/Delete. A repeating goal is marked with a `↻ Daily` badge in both places.

No explicit server `GET` request exists because this version has no backend.

---

## UPDATE

Generic update:

```js
function updateGoal(id, patch) {
  const goal = state.goals.find((item) => item.id === id);
  if (!goal) return;
  if (patch.skillId !== undefined && !state.skills.some(skill => skill.id === patch.skillId)) return;

  Object.assign(goal, patch);
  syncGoalParents();
  saveState();
  render();
}
```

Editing a goal uses:

```js
updateGoal(id, {
  title,
  type,
  repeatsDaily,
  parentGoalId,
  description,
  xp
});
```

`updateGoal()` does not fail when a change makes a goal an illegal parent. If an arc is
edited into a step, the goals that pointed at it simply lose that link and become top level
goals; they are never deleted.

Completing or manually unchecking a goal uses `toggleGoalCompletion()`, which also
adds or subtracts its XP:

```js
toggleGoalCompletion(id, true);
```

Repeating goals automatically clear `completed` and `completedDay` on the next local
calendar day without subtracting earned XP. This runs on render (including loading
local or cloud data), at local midnight, and when returning to the page. A periodic
clock check also handles timezone changes. Non-repeating goals keep their completion.

---

## DELETE

```js
function deleteGoal(id) {
  state.goals = state.goals.filter((item) => item.id !== id);
  syncGoalParents();
  saveState();
  render();
}
```

A confirmation dialog is shown before the delete is executed. `syncGoalParents()` then heals
the goals that pointed at the deleted one: they stay, and their `parentGoalId` becomes `""`.

---

# 5. Skills CRUD

## CREATE

```js
function createSkill(data) {
  state.skills.push({
    id: crypto.randomUUID(),
    name: data.name.trim(),
    goal: data.goal.trim(),
    xp: 0,
    lifeAreaId: "",
  });

  saveState();
  render();
}
```

## READ

```js
state.skills.forEach((skill) => {
  // render compact skill card
});
```

## UPDATE

```js
function updateSkill(id, patch) {
  const skill = state.skills.find((item) => item.id === id);
  if (!skill) return;

  Object.assign(skill, patch);
  saveState();
  render();
}
```

## DELETE

```js
function deleteSkill(id) {
  const skill = state.skills.find(item => item.id === id);
  if (!skill) return;
  if (state.goals.some(goal => goal.skillId === id) ||
      state.completionHistory.some(record => record.skillId === id)) {
    alert("This Skill has goals or recorded progress and cannot be deleted.");
    return;
  }
  if (!confirm(`Delete skill "${skill.name}"?`)) return;
  state.skills = state.skills.filter((item) => item.id !== id);
  saveState();
  render();
}
```

---

# 6. Why rendering is centralized

The app uses a central `render()` entry point. Its main responsibilities are:

```js
function render() {
  closeGoalMenu();
  resetRepeatingGoals();
  renderedDay = getDayKey();
  checkStreakExpiry();
  renderProfile();
  renderSkills();
  statisticsView?.render();
  if (isSkillPage) renderGoalTree();
  else renderGoals();
}
```

CRUD functions modify state rather than manually changing many separate DOM nodes.

Example:

```text
updateGoal()
  ↓
changes state.goals
  ↓
saveState()
  ↓
render()
  ↓
DOM reflects state
```

This is a simple version of the same state-driven approach used by React/Vue/Svelte.

---

# 7. Search

Search does not modify state.

```js
const query = searchInput.value.trim().toLowerCase();
```

Goals:

```js
return `${goal.title} ${goal.description}`
  .toLowerCase()
  .includes(query);
```

Skills:

```js
return skill.name.toLowerCase().includes(query);
```

So search is a presentation filter, not CRUD.

---

# 8. XP and level logic

Profile XP is the sum of all skill XP. Goal XP is awarded to the linked skill on completion.

```js
const totalXP = skills.reduce((sum, s) => sum + s.xp, 0);
```

The type of a goal never changes what it pays out. XP is stored on the goal, so editing a
step into an arc, completing a repeating goal twice on different days, or un-completing a
goal manually all move exactly the same amount of XP. The automatic daily reset preserves
earned XP, so completing a repeating goal on a new day awards XP again. Completing any
goal counts toward the daily streak, whatever its type.

Progression is exponential: reaching level N requires (N-1)^2 * 100 total XP.

```js
function getLevelInfo(xp) {
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const span = (2 * level - 1) * 100; // width of the current level's bar
  const current = xp - (level - 1) ** 2 * 100;
  return { level, current, span };
}
```

---

# 9. What changes when a backend is added

Current frontend:

```text
JavaScript state
↕
localStorage
```

With a REST backend:

```text
Frontend
↕ fetch()
REST API
↕
Database
```

Typical REST mapping:

| Operation | HTTP |
|---|---|
| Create goal | `POST /api/goals` |
| Read goals | `GET /api/goals` |
| Update goal | `PATCH /api/goals/:id` |
| Delete goal | `DELETE /api/goals/:id` |

Example replacement for `createGoal()`:

```js
async function createGoal(data) {
  const response = await fetch("/api/goals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  const createdGoal = await response.json();
  state.goals.push(createdGoal);
  render();
}
```

The visual code can remain mostly unchanged.

---

# 10. Suggested next architecture

This section is a hypothetical future refactor, not the current file structure or a task
to perform when adding a feature. Preserve the interface contract and existing persistence.

For a larger version:

```text
frontend/
  index.html
  css/
    tokens.css
    layout.css
    components.css
  js/
    api.js
    state.js
    goals.js
    skills.js
    ui.js
    main.js
```

When a real backend appears:

```text
client/
server/
  routes/
  controllers/
  services/
  repositories/
database/
```

This keeps DOM rendering separate from data access and business logic.

# Statistics (schema v3)

`statistics-model.js` holds DOM-free calendar, migration, aggregation and Life Area logic.
`statistics.js` renders the Statistics section in `index.html`. No chart dependency is used:
activity and progression use CSS, and the radar uses SVG with an adjacent text breakdown.

Each newly recorded completion adds one fact to `state.completionHistory`:

```js
{
  id: "completion-uuid",
  goalId: "goal-uuid",
  skillId: "skill-that-received-xp",
  completionDate: "2026-10-04", // logical local calendar date
  xpAwarded: 30
}
```

`goal.activeCompletionId` links the checked state to its reward. Manual undo removes that
record and subtracts its recorded reward from its recorded Skill, even after the Goal is
edited. For legacy completions without a record, undo retains the previous behavior of
subtracting the Goal's current reward from its current Skill. Automatic daily reset clears
only the checked state, completion date and active link; past records and earned XP remain.
Deleting a Goal preserves its completion history. Skill deletion is blocked while Goals or
history reference it. Old orphaned Goals remain editable so they can be reassigned, but
cannot earn XP until they reference an existing Skill.

A Life Area is `{ id, name }` in `state.lifeAreas`. `skill.lifeAreaId` is the sole assignment
field. `Statistics.createArea()` validates a nonblank name and at least one existing Skill
before changing anything. Creation and assignment are saved together. Skills can later move
between Areas or become uncategorized. An Area can become empty afterwards; deleting it
uncategorizes its Skills without touching Goals, XP or history.

`Statistics.weekly(state, monday)` filters completion dates into a Monday-inclusive,
next-Monday-exclusive range, then calculates:

- **Weekly Activity:** record counts for seven calendar days, including zero-XP completions.
- **Top Skill Progression:** sums of `xpAwarded` by Skill, sorted by earned XP; the view shows
  up to five Skills with positive weekly XP. Uncategorized Skills participate normally.
- **Life Areas:** current Area assignments group weekly Skill XP. Each percentage is Area XP
  divided by XP of all categorized Skills, including those outside the top five. Moving a
  Skill changes the grouping for previous weeks too. Uncategorized XP never enters this
  denominator. Display percentages are rounded to one decimal place.

All modules share one in-memory Monday date. Future weeks are disabled. Calendar arithmetic
uses local dates rather than UTC conversion or fixed 24-hour durations. Fewer than three
Areas shows setup guidance; no categorized XP shows an empty state. Three to eight Areas
use a radar; more than eight use the complete percentage list. No weekly aggregates are saved.

Migration preserves existing XP and completed Goals without inventing historical rewards.
Missing new arrays default to empty, old Skills are uncategorized, and `statisticsStartedOn`
records when reliable tracking began. Earlier dates show unavailable data rather than zero.
Migration is idempotent for both
localStorage and cloud documents. Whole-document cloud sync still uses last-write-wins and
does not merge simultaneous changes from multiple devices.

## Verification

From `front/`, run:

```sh
gjs tests/goal-model.js
gjs tests/daily-reset.js
gjs tests/schedule-model.js
gjs tests/reminders.js
gjs tests/streak-motion.js
gjs tests/statistics-model.js
gjs tests/statistics-sync.js
TZ=America/New_York gjs tests/statistics-model.js
TZ=America/New_York gjs tests/schedule-model.js
TZ=America/New_York gjs tests/reminders.js
python3 tests/statistics-browser.py webkit
python3 tests/statistics-browser.py webkit 390 844
STATISTICS_TEST_SCRIPT=schedule-browser.js python3 tests/statistics-browser.py webkit
STATISTICS_TEST_SCRIPT=schedule-browser.js python3 tests/statistics-browser.py webkit 390 844
GOAL_TEST_PAGE=skill.html STATISTICS_TEST_SCRIPT=schedule-browser.js python3 tests/statistics-browser.py webkit
GOAL_TEST_PAGE=skill.html STATISTICS_TEST_SCRIPT=schedule-browser.js python3 tests/statistics-browser.py webkit 390 844
```

The JavaScript tests also support Node. The browser runner accepts a Chromium executable
instead of `webkit`. It uses isolated browser storage, fixture data and a localhost server;
it omits Firebase scripts so tests cannot change real cloud data. Screenshots are saved to
`/tmp/statistics-<width>.png`.

## Statistics presentation and motion

The compact overview aligns the title/week selector with a two-metric summary: completed
Goals and total weekly earned XP. XP includes uncategorized Skills and Skills beyond the
five displayed ranking rows. There is deliberately no Active Skills metric or Skill icon.
The reference image guides spacing and layout, not category count, names or palette.
Charts use existing neon theme tokens. The activity axis uses integer ticks; its scale is
presentation only and does not change completion counts.

Life Areas show a radar beside rows containing a color marker, full name, share bar,
percentage and weekly XP. Colors follow Area identity consistently across week changes.
Axes show names and percentages; long names are shortened using measured SVG text widths,
with full names retained in titles and the breakdown. The radar uses 3–8 user-created Areas;
more Areas use the complete breakdown. No categories or demonstration data are seeded.

`createStatisticsView()` owns its selected week and presentation state in a local closure.
On entry, bars grow with 520 ms CSS transitions and a small stagger; the SVG data polygon
expands over 580 ms using `requestAnimationFrame`. On week/data changes, displayed bar
sizes and polygon points are sampled before rebuilding, so interrupted transitions continue
from the visible geometry. Skill bars match by ID when ranking changes. Names, XP, grid,
labels and the page stay still. Unchanged data does not restart animations.

Hidden views and reduced motion render final values immediately. A live reduced-motion
change cancels the radar frame and settles charts. Empty states also cancel old frames.
The summary and graph show unavailable history separately from genuine zero activity.
Partial tracking weeks explain their coverage; no categorized XP produces no zero radar;
fewer than three Areas shows setup guidance and the existing Manage Life Areas action.

Additional browser scenarios (same isolated runner, no Firebase):

```sh
STATISTICS_TEST_SCRIPT=statistics-polish-browser.js python3 tests/statistics-browser.py webkit
STATISTICS_TEST_SCRIPT=statistics-polish-browser.js STATISTICS_REDUCED_MOTION=1 python3 tests/statistics-browser.py webkit 390 844
```

These check entry and interrupted week transitions, summaries, zero/untracked states,
uncategorized rewards, 3/4/6/8/9 Areas, long names, overflow, and unchanged application data.

## Goals page visual hierarchy

Columns keep their neon accent borders while inner lists have no extra frame and cards
use subdued surfaces. Step/Quest/Arc share one layout with progressively larger padding
and title sizes. XP sits below the title in smaller, muted text. Completed cards keep a
readable title, state badge and usable controls but lose the bright outline/glow. Completed
parents do not visually mark active tree children as completed. Empty descriptions are
hidden, and Skill/parent metadata wraps into compact tags without truncating information.

The Skills panel uses two progress columns on wide screens and one at viewport widths
up to 720px. In compact columns the level moves below the name to keep values readable.
Names, levels, XP values and bars
align between rows; long names wrap. Both page templates use a visible, labelled overflow
trigger instead of permanent Edit/Delete buttons. `createGoalActionsMenu()` accepts optional
action descriptors and an accessible menu label, reusing positioning, keyboard navigation,
Escape/focus return and click-away dismissal. Skill handlers still call the original
`openSkillModal()` and `deleteSkill()`; all validation and deletion restrictions remain.
Goal completion checkboxes remain keyboard focusable. No Goal/Skill/XP or persistence rules
changed. Optional cross-highlighting of Skills was not added; existing Skill links remain.

Browser check: `STATISTICS_TEST_SCRIPT=goals-ui-browser.js python3 tests/statistics-browser.py webkit`
(add `390 844` for mobile or `1024 900` for medium width).

## Schedule and reminder model (optional additions to schema v3)

`Goal.schedule` is optional: `{ type: "one-time" | "daily" | "weekly" | "custom",
time?: "HH:MM", daysOfWeek?: number[] }`. Weekdays are 1=Monday through 7=Sunday.
`Goal.reminder` is optional: `{ enabled: boolean, offset: "0m" | "5m" | "15m" | "30m" }`.
The form omits both fields for One-time. Daily writes `repeatsDaily: true`;
weekly/custom write `false`. Step/Quest can repeat, Arc cannot. Weekly and Custom
both use a nonempty selected-day set. Untimed schedules are valid but cannot notify.

`GoalSchedule.validate()` rejects invalid new values before state mutation, and
`GoalSchedule.read()` safely ignores malformed persisted optional data. Legacy daily
behavior remains the fallback. After existing type conversion, `migrateGoalSchedule()`
adds `{ type: "daily" }` and `{ enabled: false, offset: "0m" }` only to Goals whose
`repeatsDaily === true` and schedule is absent. It runs for local and cloud reads,
preserves existing schedules, and does not change `updatedAt`, XP or history.

`GoalSchedule.shouldReset()` preserves the legacy local-day reset for daily Goals;
weekly/custom reopen on the next selected day, including after suspended tabs.
Ordinary Goals never reset. Automatic reset never reverses rewards. Browser reminder
Mark done reuses `toggleGoalCompletion()`, with optional `occurrenceKey` on its history
record and `completedScheduleDay` on the Goal. Completion statistics always use the
actual local completion day. The extra scheduled day prevents an early reminder for
tomorrow from resetting tonight; late completion remains checked until the next
eligible day. Undo removes that recorded reward and clears the occurrence link.

Optional `state.reminderReceipts` maps Goal IDs to `{ key, status: "done" | "skipped" }`.
There is at most one receipt per Goal; deletion and schedule changes clear it. Skip
has no effect on completion, streak or XP. Receipt keys include Goal, schedule and
local occurrence date. Pending entries are calculated, never independent totals.
Only the latest due occurrence is retained; no pre-creation historical backlog is
invented. Checks consider tomorrow too, because offsets can cross midnight.

`createReminderSystem()` checks at startup, every 60 seconds, after state changes
and on resume. A missed scheduled time stays actionable in the bell panel. Pending
items disappear after completion, Skip, deletion or reminder removal. Notification
clicks focus the app and reveal the Goal, clearing dashboard search if necessary.
Both pages preserve the shared Goal actions menus and all existing Statistics UI.

`createBrowserReminders()` requests permission only from the checkbox interaction.
Missing APIs, insecure contexts, denial, request rejection and constructor errors
leave the in-app system usable. No service worker or background push is involved.
Permission and constructor behavior are covered with an injected Notification test
double, not a real operating-system permission dialog. The browser runner also
captures page errors, unhandled rejections and console warnings. WebKit/GTK harness
messages are separate from page-console failures.

Browser delivery receipts use `neonGoalTracker.v1.reminderDelivery`, a device-local
cache with at most one entry per current Goal. They are not cloud user progress.
Web Locks serialize delivery and reminder actions across supported same-origin tabs;
without that API, stable notification tags and receipt checks provide best-effort
deduplication. Newer local-storage state is reloaded before reminder actions.

Times remain local strings. DST gaps advance by the local Date gap; repeated hours
produce one occurrence key. Closed/suspended tabs cannot guarantee punctual delivery.
The default One-time path and legacy Goals remain usable if notifications fail.
Quota/unavailable-storage errors show a visible notice; failed Goal create/edit or
completion writes roll back their in-memory mutation so retry cannot duplicate XP.

Regression coverage includes optional-field round trips, migration/idempotency,
weekday/time/offset validation, midnight/DST, missed occurrences, persistent Skip,
completion/undo, browser permission outcomes and both desktop/mobile Goal pages.
