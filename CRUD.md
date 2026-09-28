# CRUD documentation

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
    name: "User User"
  },
  goals: [],
  skills: [],
  schemaVersion: 2
}
```

A goal looks like this:

```js
{
  id: "uuid",
  title: "Read 20 pages",
  type: "step",          // "step" | "quest" | "arc"
  repeatsDaily: true,    // only "step" and "quest" may set this
  skillId: "uuid",
  parentGoalId: "",      // optional; a step may sit under a quest or an arc
  description: "Before bed",
  xp: 10,
  completed: false,
  completedDay: "",
  createdAt: "2026-09-22T18:00:00.000Z"
}
```

The three types describe how big a goal is, not how often it repeats. Recurrence lives in
`repeatsDaily`, so a daily quest is still a quest:

| Type | Meaning | May repeat daily | May be a child of |
|---|---|---|---|
| `step` | A concrete action you can start now | yes | quest, arc |
| `quest` | A meaningful outcome you are working toward | yes | arc |
| `arc` | A larger direction that can contain several quests | no | nothing |

A goal is only ever one level deep: steps and quests hang off a goal, and that goal is
always an arc. A parent is optional, and it must belong to the same skill.

A skill looks like this:

```js
{
  id: "uuid",
  name: "Reading",
  xp: 25
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
than the cloud copy. The new shape is written out with the next real change.

## Save state

```js
function saveState() {
  state.updatedAt = Date.now();

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
    createdAt: new Date().toISOString(),
  });

  syncGoalParents();
  saveState();
  render();
}
```

The form hands over already validated data: `buildGoalPatch()` trims the title, drops
`repeatsDaily` for an arc, and blanks a parent that is not a legal parent for the chosen
type, so the model never has to repair an illegal shape it was given.

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
  // attach edit/delete events
  // append card
});
```

The dashboard has one column per type (`STEPS`, `QUESTS`, `ARCS`) and the skill page nests
the same goals under their arc. A repeating goal is marked with a `↻ Daily` badge in both
places, which is the only visual difference between a repeating and a one off goal.

No explicit server `GET` request exists because this version has no backend.

---

## UPDATE

Generic update:

```js
function updateGoal(id, patch) {
  const goal = state.goals.find((item) => item.id === id);
  if (!goal) return;

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

Completing a goal uses exactly the same CRUD operation:

```js
updateGoal(id, {
  completed: true
});
```

This is useful because UI interactions do not need separate update functions for every field.

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
  state.skills = state.skills.filter((item) => item.id !== id);
  saveState();
  render();
}
```

---

# 6. Why rendering is centralized

The app uses:

```js
function render() {
  renderProfile();
  renderGoals();
  renderSkills();
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
goal all move exactly the same amount of XP. The daily streak follows the same rule: only a
goal with `repeatsDaily: true` counts toward it, whatever its type.

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
