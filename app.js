const STORAGE_KEY = "neonGoalTracker.v1";

const defaultState = {
  profile: { name: "User User" },

  streak: { count: 0, date: "" },

  updatedAt: 0,

  goals: [],

  skills: [],

  lifeAreas: [],
  completionHistory: [],
  statisticsStartedOn: "",
};

// ===============================
// GOAL MODEL V2
// ===============================
// A goal has a role, and it may repeat. Those are two different
// questions, so they are two different fields: Step / Quest / Arc
// describe what the goal is for, `repeatsDaily` answers "does it come
// back tomorrow?".
//
// Everything in this block is pure (no DOM, no `state`), so the
// model can be reasoned about and tested on its own.
// <goal-model>
const goalTypes =
  ["step", "quest", "arc"];

const goalTypeOrder = {
  step: 0,
  quest: 1,
  arc: 2,
};

// The one place the three roles are described. The placeholder is the
// guidance in the form: it changes with the selected type and goes
// away as soon as the user types.
const goalTypeMeta = {
  step: {
    label: "STEP",

    hint: "Concrete action",

    placeholder:
      "A concrete action you can start now",
  },

  quest: {
    label: "QUEST",

    hint: "Meaningful outcome",

    placeholder:
      "A meaningful outcome you're working toward",
  },

  arc: {
    label: "ARC",

    hint: "Larger direction",

    placeholder:
      "A larger direction that can contain multiple quests",
  },
};

// Rewards are unchanged, they only moved with their type. Step now
// carries the old Daily options (10/15/30) next to the old Short ones
// (50/100/125), because both of those goals are Steps today.
const goalXpOptions = {
  step: [10, 15, 30, 50, 100, 125],

  quest: [200, 350, 500],

  arc: [1000, 2000, 5000],
};

// The only legal nestings. A parent is always optional, so an empty
// list (Arc) means "cannot have one", never "must have one".
const goalParentTypes = {
  step: ["quest", "arc"],

  quest: ["arc"],

  arc: [],
};

// Goal model v1. Daily used to be a type of its own, which mixed
// recurrence into the role; the other three were named after a size.
const legacyGoalTypes = {
  daily: {
    type: "step",
    repeatsDaily: true,
  },

  short: {
    type: "step",
    repeatsDaily: false,
  },

  medium: {
    type: "quest",
    repeatsDaily: false,
  },

  long: {
    type: "arc",
    repeatsDaily: false,
  },
};

const SCHEMA_VERSION = 3;

function getGoalTypeMeta(type) {
  return (
    goalTypeMeta[type] ??
    goalTypeMeta.step
  );
}

function isRepeatingGoal(goal) {
  return Boolean(goal?.repeatsDaily);
}

// Only Step and Quest repeat. An Arc is a direction, not an action to
// put on a daily to-do list.
function canGoalRepeatDaily(type) {
  return (
    type === "step" ||
    type === "quest"
  );
}

function isCompatibleParentType(
  childType,
  parentType
) {
  return (
    goalParentTypes[childType] ??
    []
  ).includes(parentType);
}

function findGoalById(
  goals,
  id
) {
  if (!id) {
    return null;
  }

  return (
    goals.find((goal) =>
      goal.id === id
    ) ?? null
  );
}

// Returns a parent id that is legal under the new hierarchy, or "".
// Nothing is invented here: a link that cannot be kept (wrong type,
// gone, another skill, itself) is dropped so the goal simply becomes a
// root. Never the other way round — the goal is never dropped.
function resolveParentId(
  goals,
  goal
) {
  const parent = findGoalById(
    goals,
    goal.parentGoalId
  );

  if (!parent) {
    return "";
  }

  if (parent.id === goal.id) {
    return "";
  }

  if (
    !isCompatibleParentType(
      goal.type,
      parent.type
    )
  ) {
    return "";
  }

  // Goals are organised inside a skill, so the parent has to be one
  // too. Matches the old rule, which also only offered parents from
  // the selected skill.
  if (
    !goal.skillId ||
    parent.skillId !== goal.skillId
  ) {
    return "";
  }

  return parent.id;
}

function normalizeGoalParents(
  goals
) {
  return goals.map((goal) => {
    const parentGoalId =
      resolveParentId(goals, goal);

    return parentGoalId ===
      (goal.parentGoalId ?? "")
      ? goal
      : { ...goal, parentGoalId };
  });
}

// Form values → the type-dependent part of a goal. Runs on both create
// and edit, so an impossible combination (an Arc that repeats daily, a
// Step under another Step) can never reach the state.
function buildGoalPatch(
  draft,
  goals
) {
  const type =
    goalTypeOrder[draft.type] ===
    undefined
      ? "step"
      : draft.type;

  return {
    type,

    repeatsDaily:
      canGoalRepeatDaily(type) &&
      Boolean(draft.repeatsDaily),

    parentGoalId:
      resolveParentId(goals, {
        type,
        id: draft.id ?? null,
        parentGoalId: draft.parentGoalId ?? "",
        skillId: draft.skillId ?? "",
      }),
  };
}

function migrateGoalType(goal) {
  const legacy = legacyGoalTypes[goal.type];

  if (legacy) {
    return legacy;
  }

  return {
    type:
      goalTypeOrder[goal.type] ===
      undefined
        ? "step"
        : goal.type,

    repeatsDaily:
      canGoalRepeatDaily(goal.type) &&
      Boolean(goal.repeatsDaily),
  };
}

// Short/Medium/Long became Step/Quest/Arc, Daily became a Step that
// repeats. Title, description, skill, completion, XP and createdAt are
// carried over untouched; parents are resolved afterwards, once every
// goal already has its new type, so links that are still legal survive
// and the rest are cleared instead of deleting anything.
function migrateGoals(goals) {
  const migrated = goals.map(
    (goal) => ({
      ...goal,
      ...migrateGoalType(goal),
    })
  );

  return normalizeGoalParents(
    migrated
  );
}

function migrateState(loaded) {
  loaded = Statistics.normalize(loaded);
  return {
    ...loaded,

    schemaVersion: SCHEMA_VERSION,

    goals: migrateGoals(
      loaded.goals ?? []
    ),
  };
}
// </goal-model>


let state = loadState();

const isSkillPage =
  document.body.dataset.page ===
  "skill";

const skillParams =
  new URLSearchParams(
    location.search
  );

const currentSkillId =
  isSkillPage
    ? skillParams.get("id")
    : null;

const emptyText =
  "Add a goal for the coming weeks or months. This is your bridge to bigger achievements.";


// ===============================
// DOM ELEMENTS
// ===============================

const els = {
  goalModal: document.querySelector("#goalModal"),
  goalForm: document.querySelector("#goalForm"),
  goalModalTitle: document.querySelector("#goalModalTitle"),

  goalId: document.querySelector("#goalId"),
  goalTitle: document.querySelector("#goalTitle"),
  goalType: document.querySelector("#goalType"),
  goalTypeHint: document.querySelector("#goalTypeHint"),
  goalRepeatField: document.querySelector("#goalRepeatField"),
  goalRepeat: document.querySelector("#goalRepeat"),
  goalDescription: document.querySelector("#goalDescription"),
  goalXp: document.querySelector("#goalXp"),
  goalSkill: document.querySelector("#goalSkill"),
  goalParentField: document.querySelector("#goalParentField"),
  goalParent: document.querySelector("#goalParent"),

  skillModal: document.querySelector("#skillModal"),
  skillForm: document.querySelector("#skillForm"),
  skillModalTitle: document.querySelector("#skillModalTitle"),

  skillId: document.querySelector("#skillId"),
  skillName: document.querySelector("#skillName"),
  skillGoal: document.querySelector("#skillGoal"),

  profileModal: document.querySelector("#profileModal"),
  profileForm: document.querySelector("#profileForm"),
  profileNameInput: document.querySelector("#profileNameInput"),
  profileName: document.querySelector("#profileName"),
  streakBadgeHost: document.querySelector("#streakBadgeHost"),

  xpValue: document.querySelector("#xpValue"),
  xpMaxValue: document.querySelector("#xpMaxValue"),
  levelValue: document.querySelector("#levelValue"),
  xpBar: document.querySelector("#xpBar"),

  skillsGrid: document.querySelector("#skillsGrid"),
  searchInput: document.querySelector("#searchInput"),
  authBtn: document.querySelector("#authBtn"),
};


// ===============================
// LOCAL STORAGE
// ===============================

// Reads the persisted document exactly as it was written. Migration is
// a separate pass, so an old document and a fresh one enter the app
// through the same door and only the model differs.
function readStoredState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return structuredClone(defaultState);
    }

    const parsed = JSON.parse(saved);

    return {
      ...parsed,
      profile:
        parsed.profile ??
        structuredClone(defaultState.profile),

      goals:
        Array.isArray(parsed.goals)
          ? parsed.goals
          : [],

      skills:
        Array.isArray(parsed.skills)
          ? parsed.skills
          : structuredClone(defaultState.skills),

      streak:
        parsed.streak &&
        typeof parsed.streak.count ===
          "number"
          ? parsed.streak
          : structuredClone(
              defaultState.streak
            ),
    };
  } catch (error) {
    console.warn(
      "Could not load local data. Using defaults.",
      error
    );

    return structuredClone(defaultState);
  }
}


// Migration is idempotent and deliberately does not save: bumping
// updatedAt here would make a stale local document look newer than the
// cloud copy and lose the sign-in last-write-wins comparison. The
// migrated shape is persisted at startup without changing the edit timestamp.
function loadState() {
  return migrateState(
    readStoredState()
  );
}


function saveState({ maintenance = false } = {}) {
  if (!maintenance) state.updatedAt = Date.now();

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );

  queueCloudSync();
}


// ===============================
// MAIN RENDER
// ===============================

let renderedDay = "";
let dayRefreshTimer = null;

function render() {
  // render() rebuilds every card, so an open menu would lose its
  // anchor. Close it before the DOM it points at is replaced.
  closeGoalMenu();

  resetRepeatingGoals();
  renderedDay = getDayKey();
  checkStreakExpiry();

  renderProfile();
  renderSkills();
  statisticsView?.render();

  if (isSkillPage) {
    renderGoalTree();
  } else {
    renderGoals();
  }
}


// ===============================
// DAILY STREAK
// ===============================

function getDayKey(offsetDays = 0) {
  const day = new Date();

  day.setDate(
    day.getDate() + offsetDays
  );

  const year = day.getFullYear();

  const month = String(
    day.getMonth() + 1
  ).padStart(2, "0");

  const date = String(
    day.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${date}`;
}

// A new local day clears only the daily checkmark, never earned XP.
function resetRepeatingGoals() {
  const today = getDayKey();
  let changed = false;

  for (const goal of state.goals) {
    if (
      isRepeatingGoal(goal) &&
      goal.completed &&
      goal.completedDay !== today
    ) {
      goal.completed = false;
      goal.completedDay = "";
      goal.activeCompletionId = "";
      changed = true;
    }
  }

  if (changed) saveState({ maintenance: true });
  return changed;
}

function refreshLocalDay() {
  clearTimeout(dayRefreshTimer);

  if (renderedDay !== getDayKey()) render();

  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);

  // Recheck the clock periodically as well, in case the timezone changes.
  dayRefreshTimer = setTimeout(
    refreshLocalDay,
    Math.min(60_000, midnight.getTime() - now.getTime())
  );
}

function bumpStreak() {
  const today = getDayKey();
  const yesterday = getDayKey(-1);

  if (
    state.streak.date === today
  ) {
    return;
  }

  if (
    state.streak.date === yesterday
  ) {
    state.streak.count += 1;
  } else {
    state.streak.count = 1;
  }

  state.streak.date = today;
}

function checkStreakExpiry() {
  if (!state.streak.date) {
    return;
  }

  const today = getDayKey();
  const yesterday = getDayKey(-1);

  if (
    state.streak.date !== today &&
    state.streak.date !== yesterday
  ) {
    state.streak.count = 0;
    state.streak.date = "";

    saveState({ maintenance: true });
  }
}


// ===============================
// STREAK BADGE
// ===============================

// Presentation only. The streak count itself is owned by
// bumpStreak() and checkStreakExpiry() above, this component
// never reads anything but the number it is given.
const STREAK_TIERS = [
  { tier: 0, from: 0 },
  { tier: 1, from: 1 },
  { tier: 2, from: 3 },
  { tier: 3, from: 6 },
  { tier: 4, from: 14 },
];

// Static flame with an orange silhouette and a warm yellow core.
// Frame artwork and flame colors follow the tier through CSS.
// index.html and skill.html carry the canonical copy; this is the
// fallback for hosts that ship without badge markup.
const STREAK_FLAME_SVG = [
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
  '<path class="streak-badge__flame-outer" d="M13 1C8 4 7 8 9 12 6 11 6 8 6 7 2 11 2 14 3 17 4 21 7 23 12 23 18 23 21 19 21 15 21 11 19 8 17 6 18 10 16 12 15 12 16 8 11 6 13 1Z"/>',
  '<path class="streak-badge__flame-inner" d="M12 11C13 15 16 15 16 18 16 21 14 22 12 22 8 22 7 20 7 18 7 16 8 15 9 14 9 17 10 18 11 18 10 15 12 14 12 11Z"/>',
  "</svg>",
].join("");


function getStreakCount(streak) {
  return Math.max(
    0,
    Number(streak) || 0
  );
}


function getStreakTier(streak) {
  const count =
    getStreakCount(streak);

  return STREAK_TIERS.reduce(
    (tier, step) =>
      count >= step.from
        ? step.tier
        : tier,
    0
  );
}


// Fallback for hosts without badge markup of their own: builds the
// same structure index.html and skill.html declare.
function buildStreakFrame() {
  const frame =
    document.createElement(
      "div"
    );

  frame.className =
    "streak-badge__frame";

  const icon =
    document.createElement(
      "span"
    );

  icon.className =
    "streak-badge__icon";

  icon.innerHTML =
    STREAK_FLAME_SVG;

  const value =
    document.createElement(
      "span"
    );

  value.className =
    "streak-badge__value";

  frame.append(
    icon,
    value
  );

  return frame;
}


// Keep motion local to presentation; the first render is always static.
function createStreakBadge(host) {
  if (!host) return null;
  let frame = host.querySelector(".streak-badge__frame");
  if (!frame) {
    frame = buildStreakFrame();
    host.append(frame);
  }
  let value = frame.querySelector(".streak-badge__value");
  if (!value) {
    value = document.createElement("span");
    value.className = "streak-badge__value";
    frame.append(value);
  }

  const previousFrame = document.createElement("span");
  previousFrame.className = "streak-badge__previous-frame";
  previousFrame.setAttribute("aria-hidden", "true");
  frame.append(previousFrame);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let previousCount = null;
  let finishTimer;

  function settle() {
    clearTimeout(finishTimer);
    host.dataset.motion = "idle";
    value.removeAttribute("data-previous");
    previousFrame.style.removeProperty("--sb-previous-art");
  }
  reducedMotion.addEventListener("change", settle);
  settle();

  return {
    render(streak) {
      const count = getStreakCount(streak);
      // Unrelated dashboard renders must not interrupt an ongoing celebration.
      if (count === previousCount) return;
      const tier = getStreakTier(count);
      const increased = previousCount !== null && count > previousCount;
      const tierUp = increased && tier > getStreakTier(previousCount);
      const oldText = value.textContent;
      const oldArt = getComputedStyle(host).getPropertyValue("--sb-art");
      settle();
      STREAK_TIERS.forEach((step) => {
        host.classList.toggle(`streak-badge--tier-${step.tier}`, step.tier === tier);
      });
      const label = `${count} ${count === 1 ? "day" : "days"}`;
      host.title = `Daily streak: ${label}`;
      // The accessible and final value update immediately; the old value is visual only.
      value.setAttribute("aria-label", label);
      value.textContent = label;
      previousCount = count;

      if (increased && !reducedMotion.matches) {
        value.dataset.previous = oldText;
        previousFrame.style.setProperty("--sb-previous-art", oldArt);
        // Flush the reset only on an increase so rapid updates restart cleanly.
        void host.offsetWidth;
        host.dataset.motion = tierUp ? "tier-up" : "incrementing";
        finishTimer = setTimeout(settle, tierUp ? 850 : 550);
      }
    },
  };
}


const streakBadge =
  createStreakBadge(
    els.streakBadgeHost
  );


// ===============================
// LEVELS
// ===============================

function getLevelInfo(xp) {
  const value =
    Number(xp) || 0;

  const level =
    Math.floor(
      Math.sqrt(
        value / 100
      )
    ) + 1;

  const threshold =
    (level - 1) ** 2 * 100;

  const span =
    (2 * level - 1) * 100;

  const current =
    value - threshold;

  return {
    level,
    current,
    span,
    progress:
      Math.min(
        100,
        (current / span) * 100
      ),
  };
}


// Player XP is the sum of every skill XP, so one goal reward
// advances the linked skill and the player in a single step.
function getTotalPlayerXp() {
  return state.skills.reduce(
    (sum, skill) =>
      sum + (Number(skill.xp) || 0),
    0
  );
}


// ===============================
// MOTION
// ===============================

// Durations live in CSS (--motion-*). They are read back here so the
// animation code never hardcodes its own timings.
const motionFallbackMs = {
  check: 200,
  float: 800,
  bar: 700,
  levelup: 1200,
};

function getMotionMs(name) {
  const raw =
    getComputedStyle(
      document.documentElement
    ).getPropertyValue(
      `--motion-${name}`
    );

  const value =
    Number.parseFloat(raw);

  return Number.isFinite(value) && value > 0
    ? value
    : motionFallbackMs[name];
}


// ===============================
// COMPLETION FEEDBACK
// ===============================

let fxLayer = null;

let toastLayer = null;

// Both layers are decorative and sit above the page, but they never
// take pointer input, so a completion can never block the UI.
function ensureFxLayers() {
  if (!fxLayer?.isConnected) {
    fxLayer =
      document.createElement("div");

    fxLayer.className = "fx-layer";

    fxLayer.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.append(fxLayer);
  }

  if (!toastLayer?.isConnected) {
    toastLayer =
      document.createElement("div");

    toastLayer.className = "toast-layer";

    toastLayer.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.append(toastLayer);
  }
}


// "+10 XP" near the completed goal, then gone.
function showFloatingXp(
  rect,
  xp
) {
  if (
    !rect ||
    !(xp > 0)
  ) {
    return;
  }

  ensureFxLayers();

  const float =
    document.createElement("span");

  float.className = "xp-float";

  float.textContent =
    `+${xp} XP`;

  float.style.left =
    `${rect.left + rect.width / 2}px`;

  float.style.top =
    `${rect.top + 10}px`;

  const remove = () =>
    float.remove();

  fxLayer.append(float);

  float.addEventListener(
    "animationend",
    remove,
    { once: true }
  );

  setTimeout(
    remove,
    getMotionMs("float") + 200
  );
}


// Level-ups are queued so several events from one completion play
// in sequence instead of stacking on top of each other.
const levelUpQueue = [];

let levelUpBusy = false;

function queueLevelUp(item) {
  levelUpQueue.push(item);

  drainLevelUpQueue();
}

function drainLevelUpQueue() {
  if (levelUpBusy) {
    return;
  }

  levelUpBusy = true;

  (async () => {
    try {
      while (levelUpQueue.length > 0) {
        await showLevelUp(
          levelUpQueue.shift()
        );
      }
    } finally {
      levelUpBusy = false;
    }
  })();
}

function showLevelUp({
  kicker,
  from,
  to,
}) {
  ensureFxLayers();

  return new Promise((resolve) => {
    const toast =
      document.createElement("div");

    toast.className =
      "level-toast";

    const label =
      document.createElement("span");

    label.className =
      "level-toast-kicker";

    label.textContent = kicker;

    const value =
      document.createElement("span");

    value.className =
      "level-toast-value";

    value.textContent =
      `Lv. ${from} → Lv. ${to}`;

    toast.append(
      label,
      value
    );

    toastLayer.append(toast);

    let settled = false;

    const done = () => {
      if (settled) {
        return;
      }

      settled = true;

      toast.remove();

      resolve();
    };

    toast.addEventListener(
      "animationend",
      (event) => {
        if (event.target === toast) {
          done();
        }
      }
    );

    setTimeout(
      done,
      getMotionMs("levelup") + 120
    );
  });
}


// How much of its track a fill currently covers (0-100). Used to take
// the animation start value straight from what is on screen, so a
// click during a running animation stays smooth.
function readFillPercent(fill) {
  const track = fill?.parentElement;

  const trackWidth =
    track?.clientWidth ?? 0;

  const fillWidth =
    fill?.getBoundingClientRect().width ??
    0;

  if (
    !trackWidth ||
    !fillWidth
  ) {
    return null;
  }

  return (fillWidth / trackWidth) * 100;
}

function animateFill(
  fill,
  fromPercent,
  toPercent
) {
  if (!fill) {
    return;
  }

  const target =
    Math.max(
      0,
      Math.min(100, toPercent)
    );

  const start =
    fromPercent == null
      ? target
      : Math.max(
          0,
          Math.min(100, fromPercent)
        );

  fill.classList.remove("is-animating");

  if (
    Math.abs(target - start) < 0.05
  ) {
    fill.style.width = `${target}%`;

    return;
  }

  fill.style.width = `${start}%`;

  // Force the start width to be applied before the transition is
  // enabled, otherwise the bar jumps instead of animating.
  void fill.offsetWidth;

  fill.classList.add("is-animating");

  fill.style.width = `${target}%`;
}


// One click can produce several events: the goal itself, a skill
// level-up and a player level-up. This plays them in order.
function runCompletionFeedback(
  fx,
  events
) {
  if (!fx.awarded) {
    return;
  }

  showFloatingXp(
    fx.rect,
    fx.xp
  );

  animateFill(
    els.xpBar,
    fx.fromPlayerPercent,
    fx.toPlayerPercent
  );

  if (fx.skillId) {
    animateFill(
      document.querySelector(
        `.skill-row[data-id="${CSS.escape(fx.skillId)}"] .skill-fill`
      ),
      fx.fromSkillPercent,
      fx.toSkillPercent
    );
  }

  playCheckPop(fx.goalId);

  const levelUps = [];

  if (events.skill) {
    levelUps.push({
      kicker:
        `${events.skill.name} LEVEL UP`.toUpperCase(),
      from: events.skill.from,
      to: events.skill.to,
    });
  }

  if (events.player) {
    levelUps.push({
      kicker: "LEVEL UP",
      from: events.player.from,
      to: events.player.to,
    });
  }

  if (levelUps.length === 0) {
    return;
  }

  // The bars land first, then the level-up confirms the result.
  setTimeout(() => {
    levelUps.forEach(queueLevelUp);
  }, getMotionMs("bar"));
}


// The re-render replaces the goal node, so the check pop is replayed
// on the new one to cover the instant state change.
function playCheckPop(goalId) {
  const selector =
    `.goal-card[data-id="${CSS.escape(goalId)}"] .goal-check, ` +
    `.goal-tree-item[data-id="${CSS.escape(goalId)}"] .goal-check`;

  document
    .querySelectorAll(selector)
    .forEach((check) => {
      check.classList.remove("is-pop");

      void check.offsetWidth;

      check.classList.add("is-pop");

      setTimeout(
        () =>
          check.classList.remove("is-pop"),
        getMotionMs("check") + 60
      );
    });
}


// ===============================
// PROFILE
// ===============================

function renderProfile() {
  els.profileName.textContent =
    state.profile.name;

  streakBadge?.render(
    state.streak.count
  );

  const totalXP = getTotalPlayerXp();

  const info =
    getLevelInfo(totalXP);

  els.levelValue.textContent =
    info.level;

  els.xpValue.textContent =
    info.current;

  els.xpMaxValue.textContent =
    info.span;

  els.xpBar.style.width =
    `${info.progress}%`;
}


// ===============================
// GOAL ACTIONS MENU
// ===============================

// Utility UI, not a reward. One shared element on <body> gives us
// "only one menu open" for free, and position:fixed keeps it clear of
// the goal column boxes, so it can neither be clipped by a card nor
// reflow one. The items just call the existing goal handlers, which
// stay the single source of CRUD behaviour.
const GOAL_MENU_ITEMS = [
  {
    label: "Edit",
    run: (goal) => {
      openGoalModal(goal);
    },
  },
  {
    label: "Delete",
    modifier: "goal-menu-item--danger",
    run: (goal) => {
      deleteGoal(goal.id);
    },
  },
];

const GOAL_MENU_GAP = 6;
const GOAL_MENU_EDGE = 8;

let goalMenu = null;


function createGoalMenuItem(descriptor) {
  const item =
    document.createElement(
      "button"
    );

  item.type = "button";
  item.className =
    descriptor.modifier
      ? `goal-menu-item ${descriptor.modifier}`
      : "goal-menu-item";

  item.textContent =
    descriptor.label;

  item.setAttribute(
    "role",
    "menuitem"
  );

  item.tabIndex = -1;

  return item;
}


// Right aligned under the trigger, flipped above when the viewport
// ends first, then pulled back inside horizontally.
function positionGoalMenu() {
  const trigger =
    goalMenu.trigger;

  if (!trigger) {
    return;
  }

  const anchor =
    trigger.getBoundingClientRect();

  const box =
    goalMenu.el.getBoundingClientRect();

  let top =
    anchor.bottom +
    GOAL_MENU_GAP;

  let left =
    anchor.right -
    box.width;

  if (
    top + box.height >
      window.innerHeight -
      GOAL_MENU_EDGE
  ) {
    const above =
      anchor.top -
      box.height -
      GOAL_MENU_GAP;

    if (above >= GOAL_MENU_EDGE) {
      top = above;
    } else {
      top = Math.max(
        GOAL_MENU_EDGE,
        Math.min(
          top,
          window.innerHeight -
            box.height -
            GOAL_MENU_EDGE
        )
      );
    }
  }

  const maxLeft =
    window.innerWidth -
    box.width -
    GOAL_MENU_EDGE;

  left = Math.min(
    Math.max(
      left,
      GOAL_MENU_EDGE
    ),
    Math.max(
      GOAL_MENU_EDGE,
      maxLeft
    )
  );

  goalMenu.el.style.top =
    `${Math.round(top)}px`;

  goalMenu.el.style.left =
    `${Math.round(left)}px`;
}


function openGoalMenu(trigger, goal) {
  const menu =
    getGoalMenu();

  menu.trigger = trigger;
  menu.goal = goal;

  trigger.setAttribute(
    "aria-expanded",
    "true"
  );

  // Measured while still closed, which works because the menu stays
  // in the layout via visibility rather than display.
  positionGoalMenu();

  menu.el.classList.add(
    "is-open"
  );

  menu.items[0].focus();
}


function closeGoalMenu(returnFocus = false) {
  const menu = goalMenu;

  if (!menu?.el.classList.contains("is-open")) {
    return;
  }

  menu.el.classList.remove(
    "is-open"
  );

  const trigger =
    menu.trigger;

  if (trigger) {
    trigger.setAttribute(
      "aria-expanded",
      "false"
    );

    if (returnFocus && trigger.isConnected) {
      trigger.focus();
    }
  }

  menu.trigger = null;
  menu.goal = null;
}


function getGoalMenu() {
  if (goalMenu) {
    return goalMenu;
  }

  const el =
    document.createElement(
      "div"
    );

  el.className = "goal-menu";
  el.setAttribute("role", "menu");
  el.setAttribute(
    "aria-label",
    "Goal actions"
  );

  const items =
    GOAL_MENU_ITEMS.map(
      createGoalMenuItem
    );

  el.append(
    ...items
  );

  document.body.append(el);

  items.forEach(
    (item, index) => {
      item.addEventListener(
        "click",
        () => {
          const goal =
            goalMenu.goal;

          closeGoalMenu();

          if (goal) {
            GOAL_MENU_ITEMS[index].run(goal);
          }
        }
      );
    }
  );

  el.addEventListener(
    "keydown",
    (event) => {
      const index =
        items.indexOf(
          document.activeElement
        );

      if (index === -1) {
        return;
      }

      const keys = {
        ArrowDown: index + 1,
        ArrowUp: index - 1,
        Home: 0,
        End: items.length - 1,
      };

      const next = keys[event.key];

      if (next === undefined) {
        if (event.key === "Tab") {
          // Let focus leave, but hand it back to the trigger first,
          // otherwise hiding the menu drops focus on <body>.
          closeGoalMenu(true);
        }

        return;
      }

      event.preventDefault();

      items[
        (next + items.length) %
        items.length
      ].focus();
    }
  );

  goalMenu = {
    el,
    items,
    trigger: null,
    goal: null,
    frame: 0,
  };

  return goalMenu;
}


// Roving focus inside the menu, one trigger per card. Clicking the
// same trigger again toggles it shut.
function createGoalActionsMenu(trigger, goal) {
  trigger.addEventListener(
    "click",
    () => {
      const menu =
        getGoalMenu();

      if (
        menu.trigger === trigger &&
        menu.el.classList.contains("is-open")
      ) {
        closeGoalMenu();

        return;
      }

      openGoalMenu(trigger, goal);
    }
  );

  trigger.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp"
      ) {
        return;
      }

      event.preventDefault();

      openGoalMenu(trigger, goal);

      const items =
        getGoalMenu().items;

      items[
        event.key === "ArrowDown"
          ? 0
          : items.length - 1
      ].focus();
    }
  );

  return trigger;
}


// Clicking away closes it. pointerdown rather than click, so a
// touch tap outside dismisses before focus moves.
document.addEventListener(
  "pointerdown",
  (event) => {
    if (!goalMenu?.el.classList.contains("is-open")) {
      return;
    }

    if (goalMenu.el.contains(event.target)) {
      return;
    }

    if (goalMenu.trigger?.contains(event.target)) {
      return;
    }

    closeGoalMenu();
  }
);


document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (!goalMenu?.el.classList.contains("is-open")) {
      return;
    }

    event.preventDefault();

    closeGoalMenu(true);
  }
);


// Scrolling or resizing moves the anchor, so re-measure instead of
// leaving the menu behind. A re-rendered card loses its trigger, so
// that case closes the menu.
function keepGoalMenuAnchored() {
  if (!goalMenu?.el.classList.contains("is-open")) {
    return;
  }

  if (goalMenu.frame) {
    return;
  }

  goalMenu.frame =
    requestAnimationFrame(() => {
      goalMenu.frame = 0;

      if (!goalMenu.trigger?.isConnected) {
        closeGoalMenu();

        return;
      }

      positionGoalMenu();
    });
}


window.addEventListener(
  "scroll",
  keepGoalMenuAnchored,
  true
);

window.addEventListener(
  "resize",
  keepGoalMenuAnchored
);


// ===============================
// GOALS RENDER
// ===============================

// Recurring goals can be re-done, so the chip says when the last
// completion happened. Everything else just reads as finished. The
// streak itself is driven by any completion, so it only has to keep
// finding the repeating goals through isRepeatingGoal().
function getGoalStateLabel(goal) {
  if (isRepeatingGoal(goal)) {
    return goal.completedDay === getDayKey()
      ? "Done today"
      : "Done";
  }

  return "Completed";
}


function renderGoalRepeat(
  host,
  goal
) {
  const badge =
    host.querySelector(
      ".goal-repeat-badge"
    );

  if (!badge) {
    return;
  }

  badge.hidden =
    !isRepeatingGoal(goal);
}

function renderGoalState(
  card,
  goal
) {
  const chip =
    card.querySelector(".goal-state");

  if (!chip) {
    return;
  }

  chip.hidden = !goal.completed;

  chip.textContent =
    goal.completed
      ? getGoalStateLabel(goal)
      : "";
}


function renderGoals() {
  const query =
    (els.searchInput?.value ?? "")
      .trim()
      .toLowerCase();

  goalTypes.forEach((type) => {
    const list =
      document.querySelector(
        `[data-list="${type}"]`
      );

    const count =
      document.querySelector(
        `[data-count="${type}"]`
      );

    const allOfType =
      state.goals.filter(
        (goal) =>
          goal.type === type
      );

    count.textContent =
      `${allOfType.length} ${
        allOfType.length === 1
          ? "goal"
          : "goals"
      }`;

    const visible =
      allOfType.filter((goal) => {
        if (!query) {
          return true;
        }

        const text =
          `${goal.title} ${goal.description}`
            .toLowerCase();

        return text.includes(query);
      });

    list.innerHTML = "";

    if (visible.length === 0) {
      list.append(
        createEmptyState(
          query
            ? "No matching goals"
            : "No goals yet"
        )
      );

      return;
    }

    visible.forEach((goal) => {
      const template =
        document.querySelector(
          "#goalCardTemplate"
        );

      const card =
        template.content
          .firstElementChild
          .cloneNode(true);

      card.dataset.id =
        goal.id;

      card.querySelector("h3")
        .textContent =
        goal.title;

      card.querySelector(
        ".goal-xp"
      ).textContent =
        `+${goal.xp} XP`;

      card.querySelector(
        ".goal-description"
      ).textContent =
        goal.description ||
        "No description";

      const skillEl =
        card.querySelector(
          ".goal-skill"
        );

      const skill =
        goal.skillId
          ? state.skills.find(
              (item) =>
                item.id ===
                goal.skillId
            )
          : null;

      if (skill) {
        skillEl.querySelector(
          ".goal-skill-name"
        ).textContent =
          skill.name;

        skillEl.hidden =
          false;
      }

      const parentEl =
        card.querySelector(
          ".goal-parent"
        );

      const parent =
        goal.parentGoalId
          ? state.goals.find(
              (item) =>
                item.id ===
                goal.parentGoalId
            )
          : null;

      if (parent) {
        parentEl.querySelector(
          ".goal-parent-title"
        ).textContent =
          parent.title;

        parentEl.hidden =
          false;
      }

      renderGoalRepeat(
        card,
        goal
      );

      const checkbox =
        card.querySelector(
          'input[type="checkbox"]'
        );

      checkbox.checked =
        Boolean(goal.completed);

      if (goal.completed) {
        card.classList.add(
          "completed"
        );
      }

      renderGoalState(card, goal);

      checkbox.addEventListener(
        "change",
        () => {
          toggleGoalCompletion(
            goal.id,
            checkbox.checked,
            card
          );
        }
      );

      createGoalActionsMenu(
        card.querySelector(
          ".goal-menu-trigger"
        ),
        goal
      );

      list.append(card);
    });
  });
}


// ===============================
// EMPTY STATE
// ===============================

function createEmptyState(title) {
  const wrapper =
    document.createElement("div");

  wrapper.className =
    "empty-state";

  const heading =
    document.createElement("strong");

  heading.textContent =
    title;

  const text =
    document.createElement("div");

  text.textContent =
    emptyText;

  wrapper.append(
    heading,
    text
  );

  return wrapper;
}


// ===============================
// SKILLS RENDER
// ===============================

function renderSkills() {
  const query =
    (els.searchInput?.value ?? "")
      .trim()
      .toLowerCase();

  els.skillsGrid.innerHTML = "";

  const visible =
    state.skills.filter(
      (skill) => {
        if (!query) {
          return true;
        }

        return skill.name
          .toLowerCase()
          .includes(query);
      }
    );

  visible.forEach((skill) => {
    const template =
      document.querySelector(
        "#skillCardTemplate"
      );

    const row =
      template.content
        .firstElementChild
        .cloneNode(true);

    const info =
      getLevelInfo(
        skill.xp
      );

    row.dataset.id =
      skill.id;

    const nameLink =
      row.querySelector(
        ".skill-name"
      );

    nameLink.textContent =
      skill.name;

    nameLink.href =
      `skill.html?id=${skill.id}`;

    row.querySelector(
      ".skill-level"
    ).textContent =
      `Lvl. ${info.level}`;

    row.querySelector(
      ".skill-points"
    ).textContent =
      `${info.current} / ${info.span}`;

    row.querySelector(
      ".skill-fill"
    ).style.width =
      `${info.progress}%`;

    row.querySelector(
      ".edit-skill"
    ).addEventListener(
      "click",
      () => {
        openSkillModal(skill);
      }
    );

    row.querySelector(
      ".delete-skill"
    ).addEventListener(
      "click",
      () => {
        deleteSkill(skill.id);
      }
    );

    els.skillsGrid.append(row);
  });
}


// ===============================
// SKILL PAGE (TREE VIEW)
// ===============================

function renderGoalTree() {
  const tree =
    document.querySelector(
      "#goalTree"
    );

  const title =
    document.querySelector(
      "#skillPageTitle"
    );

  const goalText =
    document.querySelector(
      "#skillPageGoal"
    );

  const skill =
    state.skills.find(
      (item) =>
        item.id ===
        currentSkillId
    );

  if (!skill) {
    document.title = "Skill not found";
    title.textContent =
      "Skill not found";

    goalText.textContent = "";

    tree.innerHTML = "";

    const wrapper =
      document.createElement("div");

    wrapper.className =
      "empty-state";

    const heading =
      document.createElement("strong");

    heading.textContent =
      "Skill not found";

    const text =
      document.createElement("div");

    text.textContent =
      "This skill may have been deleted.";

    const back =
      document.createElement("a");

    back.className =
      "nav-back";

    back.href =
      "index.html";

    back.textContent =
      "← Back to dashboard";

    back.style.display =
      "inline-block";

    back.style.marginTop =
      "14px";

    wrapper.append(
      heading,
      text,
      back
    );

    tree.append(wrapper);

    return;
  }

  document.title =
    skill.name;

  title.textContent =
    skill.name;

  goalText.textContent =
    skill.goal || "";

  tree.innerHTML = "";

  const skillGoals =
    state.goals.filter(
      (goal) =>
        goal.skillId ===
        skill.id
    );

  if (
    skillGoals.length === 0
  ) {
    tree.append(
      createEmptyState(
        "No goals yet"
      )
    );

    return;
  }

  const nodes = new Map(
    skillGoals.map((goal) => [
      goal.id,
      { goal, children: [] },
    ])
  );

  const roots = [];

  skillGoals.forEach((goal) => {
    const node =
      nodes.get(goal.id);

    const parent =
      goal.parentGoalId
        ? nodes.get(
            goal.parentGoalId
          )
        : null;

    if (
      parent &&
      parent !== node
    ) {
      parent.children.push(
        node
      );
    } else {
      roots.push(node);
    }
  });

  const reachable =
    new Set();

  const walk = (node) => {
    if (
      reachable.has(node)
    ) {
      return;
    }

    reachable.add(node);

    node.children.forEach(
      walk
    );
  };

  roots.forEach(walk);

  skillGoals.forEach((goal) => {
    const node =
      nodes.get(goal.id);

    if (
      !reachable.has(node)
    ) {
      roots.push(node);
      reachable.add(node);
    }
  });

  const byType = (a, b) =>
    goalTypeOrder[a.goal.type] -
    goalTypeOrder[b.goal.type];

  roots.sort(byType);

  nodes.forEach((node) => {
    node.children.sort(byType);
  });

  const rootList =
    document.createElement("ul");

  rootList.className =
    "goal-tree-list";

  roots.forEach((node) => {
    renderGoalTreeNode(
      node,
      rootList
    );
  });

  tree.append(rootList);
}


function renderGoalTreeNode(
  node,
  parentList
) {
  const goal =
    node.goal;

  const item =
    document.createElement("li");

  item.className =
    `goal-tree-item ${goal.type}`;

  item.dataset.id = goal.id;

  if (goal.completed) {
    item.classList.add(
      "completed"
    );
  }

  const top =
    document.createElement("div");

  top.className =
    "goal-tree-top";

  const check =
    document.createElement("label");

  check.className =
    "goal-check";

  const input =
    document.createElement("input");

  input.type = "checkbox";
  input.checked =
    Boolean(goal.completed);

  const checkSpan =
    document.createElement("span");

  check.append(
    input,
    checkSpan
  );

  const title =
    document.createElement("span");

  title.className =
    "goal-tree-title";

  title.textContent =
    goal.title;

  const xp =
    document.createElement("strong");

  xp.className =
    "goal-tree-xp";

  xp.textContent =
    `+${goal.xp} XP`;

  top.append(
    check,
    title,
    xp
  );

  item.append(top);

  const desc =
    document.createElement("p");

  desc.className =
    "goal-tree-desc";

  desc.textContent =
    goal.description ||
    "No description";

  item.append(desc);

  const chip = document.createElement("p");

  chip.className = "goal-state";

  item.append(chip);

  renderGoalState(item, goal);

  const repeat =
    document.createElement("p");

  repeat.className =
    "goal-repeat-badge";

  repeat.textContent =
    "↻ Daily";

  item.append(repeat);

  renderGoalRepeat(item, goal);

  const actions =
    document.createElement("div");

  actions.className =
    "goal-tree-actions";

  const menuTrigger = document.createElement("button");
  menuTrigger.type = "button";
  menuTrigger.className = "goal-menu-trigger";
  menuTrigger.setAttribute("aria-haspopup", "menu");
  menuTrigger.setAttribute("aria-expanded", "false");
  menuTrigger.setAttribute("aria-label", "Goal actions");
  menuTrigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>';
  actions.append(createGoalActionsMenu(menuTrigger, goal));

  item.append(actions);

  input.addEventListener(
    "change",
    () => {
      toggleGoalCompletion(
        goal.id,
        input.checked,
        item
      );
    }
  );

  parentList.append(item);

  if (
    node.children.length > 0
  ) {
    const childList =
      document.createElement("ul");

    childList.className =
      "goal-tree-list";

    item.append(childList);

    node.children.forEach(
      (child) => {
        renderGoalTreeNode(
          child,
          childList
        );
      }
    );
  }
}


// =================================
// GOALS CRUD
// =================================


// CREATE
function createGoal(data) {
  if (!state.skills.some(skill => skill.id === data.skillId)) return;
  const newGoal = {
    id: crypto.randomUUID(),

    title:
      data.title.trim(),

    type:
      data.type,

    // Recurrence is its own field, never a type. Only Step and Quest
    // may set it; an Arc is always false.
    repeatsDaily:
      data.repeatsDaily,

    skillId:
      data.skillId,

    parentGoalId:
      data.parentGoalId,

    description:
      data.description.trim(),

    xp:
      Number(data.xp) || 0,

    completed:
      false,

    completedDay: "",
    activeCompletionId: "",

    createdAt:
      new Date()
        .toISOString(),
  };

  state.goals.push(
    newGoal
  );

  syncGoalParents();

  saveState();

  render();
}


// Every goal write re-runs the same parent pass. Editing an Arc into a
// Step can strand a child under it, and deleting a goal can strand a
// whole subtree; both are fixed by clearing the link here, which never
// touches the goal itself.
function syncGoalParents() {
  state.goals =
    normalizeGoalParents(
      state.goals
    );
}


// TOGGLE COMPLETION
//
// The goal reward is applied once, to the linked skill, and the
// player total follows from it because the player XP is the sum of
// all skill XP. A click that would not change the goal is ignored,
// so XP can never be awarded twice.
function toggleGoalCompletion(
  goalId,
  completed,
  anchorEl = null
) {
  // A click may arrive before the midnight timer after a suspended tab wakes.
  if (resetRepeatingGoals()) render();

  const goal =
    state.goals.find(
      (item) =>
        item.id === goalId
    );

  if (!goal) {
    return;
  }

  const wasCompleted =
    Boolean(goal.completed);

  if (wasCompleted === completed) {
    return;
  }

  const previousRecord = state.completionHistory.find(record => record.id === goal.activeCompletionId);
  const rewardSkillId = !completed && previousRecord ? previousRecord.skillId : goal.skillId;
  const skill =
    state.skills.find(
      (item) =>
        item.id === rewardSkillId
    );

  if (!skill) {
    alert("Assign this goal to an existing Skill before changing its completion.");
    render();
    return;
  }
  const xp = Math.max(0, Number(!completed && previousRecord ? previousRecord.xpAwarded : goal.xp) || 0);

  const prevSkillXp =
    Number(skill?.xp) || 0;

  const prevPlayerXp =
    getTotalPlayerXp();

  const delta =
    completed ? xp : -xp;

  const nextSkillXp =
    Math.max(0, prevSkillXp + delta);

  // Derived from the clamped skill value, not the nominal delta, so
  // the player total can never disagree with the sum of all skills.
  const nextPlayerXp =
    prevPlayerXp +
    (nextSkillXp - prevSkillXp);

  // What the bars look like right now, before the re-render throws
  // the current nodes away.
  const skillFill =
    skill
      ? document.querySelector(
          `.skill-row[data-id="${CSS.escape(skill.id)}"] .skill-fill`
        )
      : null;

  const fx = {
    goalId: goal.id,
    awarded:
      completed &&
      Boolean(skill) &&
      xp > 0,
    xp,
    rect:
      anchorEl?.getBoundingClientRect() ??
      null,
    skillId: skill?.id ?? null,
    fromSkillPercent:
      readFillPercent(skillFill),
    toSkillPercent:
      getLevelInfo(nextSkillXp)
        .progress,
    fromPlayerPercent:
      readFillPercent(els.xpBar),
    toPlayerPercent:
      getLevelInfo(nextPlayerXp)
        .progress,
  };

  const events = {
    skill: null,
    player: null,
  };

  if (skill) {
    const prevLevel =
      getLevelInfo(prevSkillXp).level;

    const nextLevel =
      getLevelInfo(nextSkillXp).level;

    if (nextLevel > prevLevel) {
      events.skill = {
        name: skill.name,
        from: prevLevel,
        to: nextLevel,
      };
    }
  }

  const prevPlayerLevel =
    getLevelInfo(prevPlayerXp).level;

  const nextPlayerLevel =
    getLevelInfo(nextPlayerXp).level;

  if (nextPlayerLevel > prevPlayerLevel) {
    events.player = {
      from: prevPlayerLevel,
      to: nextPlayerLevel,
    };
  }

  if (skill) {
    skill.xp = nextSkillXp;
  }

  if (completed) {
    bumpStreak();
  }

  if (completed) {
    const record = {
      id: crypto.randomUUID(), goalId: goal.id, skillId: skill.id,
      completionDate: getDayKey(), xpAwarded: nextSkillXp - prevSkillXp,
    };
    state.completionHistory.push(record);
    goal.activeCompletionId = record.id;
  } else {
    state.completionHistory = state.completionHistory.filter(record => record.id !== goal.activeCompletionId);
    goal.activeCompletionId = "";
  }
  goal.completed = completed;

  goal.completedDay =
    completed ? getDayKey() : "";

  saveState();

  render();

  runCompletionFeedback(fx, events);
}


// UPDATE
function updateGoal(
  id,
  patch
) {
  const goal =
    state.goals.find(
      (item) =>
        item.id === id
    );

  if (!goal) {
    return;
  }

  if (patch.skillId !== undefined && !state.skills.some(skill => skill.id === patch.skillId)) return;

  Object.assign(
    goal,
    patch
  );

  syncGoalParents();

  saveState();

  render();
}


// DELETE
function deleteGoal(id) {
  const goal =
    state.goals.find(
      (item) =>
        item.id === id
    );

  if (!goal) {
    return;
  }

  const confirmed =
    confirm(
      `Delete goal "${goal.title}"?`
    );

  if (!confirmed) {
    return;
  }

  state.goals =
    state.goals.filter(
      (item) =>
        item.id !== id
    );

  syncGoalParents();

  saveState();

  render();
}


// ===============================
// GOAL MODAL
// ===============================

function populateSkillSelect(
  selectedId = ""
) {
  els.goalSkill.innerHTML = "";

  const placeholder =
    document.createElement("option");

  placeholder.value = "";
  placeholder.textContent =
    "Select a skill";

  els.goalSkill.append(
    placeholder
  );

  state.skills.forEach((skill) => {
    const option =
      document.createElement("option");

    option.value =
      skill.id;

    option.textContent =
      skill.name;

    els.goalSkill.append(
      option
    );
  });

  els.goalSkill.value =
    selectedId;
}


// Only the goals that may sit above this one are offered: a Quest
// lists the Arcs, a Step lists both. "None" is always there, so a goal
// never has to be planned into a hierarchy before it can be created.
function populateParentSelect(
  skillId = "",
  type = "step",
  currentGoalId = null,
  selectedId = ""
) {
  els.goalParent.innerHTML = "";

  const placeholder =
    document.createElement("option");

  placeholder.value = "";
  placeholder.textContent =
    "None";

  els.goalParent.append(
    placeholder
  );

  els.goalParent.disabled =
    !skillId;

  const allowed = goalParentTypes[type] || [];

  if (skillId) {
    state.goals.forEach((goal) => {
      if (
        goal.id === currentGoalId ||
        !allowed.includes(goal.type) ||
        goal.skillId !== skillId
      ) {
        return;
      }

      const option =
        document.createElement("option");

      option.value =
        goal.id;

      // Step can pick between two roles, so the option names the role
      // it would be nested under.
      option.textContent =
        `${getGoalTypeMeta(goal.type).label} · ${goal.title}`;

      els.goalParent.append(
        option
      );
    });
  }

  els.goalParent.value =
    selectedId;
}


function populateXpOptions(
  type,
  selectedXp = null
) {
  const options =
    goalXpOptions[type] ||
    goalXpOptions.step;

  let values = options;

  if (
    selectedXp != null &&
    !options.includes(
      Number(selectedXp)
    )
  ) {
    values = [
      ...options,
      Number(selectedXp),
    ];
  }

  els.goalXp.innerHTML = "";

  values.forEach((value) => {
    const option =
      document.createElement("option");

    option.value =
      value;

    option.textContent =
      `${value} XP`;

    els.goalXp.append(
      option
    );
  });

  const target =
    selectedXp != null
      ? Number(selectedXp)
      : values[0];

  els.goalXp.value =
    String(target);
}


// Keeps the form in step with the selected role: the title
// placeholder explains the type, the compact hint names it, and the two
// fields that do not apply to an Arc are taken away. The title input is
// only ever given a placeholder, never a value, so switching type mid
// sentence cannot throw away what the user typed.
function syncGoalTypeUI() {
  const meta = getGoalTypeMeta(
    els.goalType.value
  );

  els.goalTitle.placeholder =
    meta.placeholder;

  els.goalTypeHint.textContent =
    meta.hint;

  els.goalTypeHint.dataset.type =
    meta.label.toLowerCase();

  const repeatable =
    canGoalRepeatDaily(
      els.goalType.value
    );

  els.goalRepeatField.hidden =
    !repeatable;

  els.goalRepeat.disabled =
    !repeatable;

  if (!repeatable) {
    els.goalRepeat.checked = false;
  }

  const canNest =
    (goalParentTypes[els.goalType.value] || [])
      .length > 0;

  els.goalParentField.hidden =
    !canNest;

  if (!canNest) {
    els.goalParent.value = "";
  }
}


function openGoalModal(
  goal = null,
  presetType = null,
  presetSkillId = null
) {
  els.goalForm.reset();

  const type =
    goal
      ? goal.type
      : presetType || "step";

  const defaultSkill =
    goal
      ? goal.skillId
      : presetSkillId ??
        (
          isSkillPage
            ? currentSkillId
            : ""
        );

  populateSkillSelect(
    defaultSkill
  );

  const skillId =
    els.goalSkill.value;

  els.goalType.value = type;

  populateParentSelect(
    skillId,
    type,
    goal
      ? goal.id
      : null,
    goal
      ? goal.parentGoalId
      : ""
  );

  populateXpOptions(
    type,
    goal
      ? goal.xp
      : null
  );

  // Editing keeps whatever the goal already had, so opening the form
  // never changes a goal on its own.
  els.goalRepeat.checked =
    isRepeatingGoal(goal);

  if (goal) {
    els.goalModalTitle.textContent =
      "Edit goal";

    els.goalId.value =
      goal.id;

    els.goalTitle.value =
      goal.title;

    els.goalDescription.value =
      goal.description;
  } else {
    els.goalModalTitle.textContent =
      "Add goal";

    els.goalId.value =
      "";
  }

  syncGoalTypeUI();

  els.goalModal.showModal();
}


// =================================
// SKILLS CRUD
// =================================


// CREATE
function createSkill(data) {
  const skill = {
    id:
      crypto.randomUUID(),

    name:
      data.name.trim(),

    goal:
      data.goal.trim(),

    xp: 0,
    lifeAreaId: "",
  };

  state.skills.push(
    skill
  );

  saveState();

  render();
}


// UPDATE
function updateSkill(
  id,
  patch
) {
  const skill =
    state.skills.find(
      (item) =>
        item.id === id
    );

  if (!skill) {
    return;
  }

  Object.assign(
    skill,
    patch
  );

  saveState();

  render();
}


// DELETE
function deleteSkill(id) {
  const skill =
    state.skills.find(
      (item) =>
        item.id === id
    );

  if (!skill) {
    return;
  }

  if (state.goals.some(goal => goal.skillId === id) || state.completionHistory.some(record => record.skillId === id)) {
    alert("This Skill has goals or recorded progress. Keep it to preserve your history; you can rename it or change its Life Area.");
    return;
  }
  const confirmed =
    confirm(
      `Delete skill "${skill.name}"?`
    );

  if (!confirmed) {
    return;
  }

  state.skills =
    state.skills.filter(
      (item) =>
        item.id !== id
    );

  saveState();

  render();
}


// ===============================
// SKILL MODAL
// ===============================

function openSkillModal(
  skill = null
) {
  els.skillForm.reset();

  if (skill) {
    els.skillModalTitle.textContent =
      "Edit skill";

    els.skillId.value =
      skill.id;

    els.skillName.value =
      skill.name;

    els.skillGoal.value =
      skill.goal || "";
  } else {
    els.skillModalTitle.textContent =
      "Add skill";

    els.skillId.value =
      "";
  }

  els.skillModal.showModal();
}


// ===============================
// PROFILE UPDATE
// ===============================

function updateProfile(name) {
  state.profile.name =
    name.trim();

  saveState();

  render();
}


// ===============================
// EVENTS
// ===============================


// Main add goal button
document
  .querySelector(
    "#openGoalModalBtn"
  )
  .addEventListener(
    "click",
    () => {
      openGoalModal();
    }
  );


// Main add skill button
document
  .querySelector(
    "#openSkillModalBtn"
  )
  .addEventListener(
    "click",
    () => {
      openSkillModal();
    }
  );


// Add goal buttons inside columns
document
  .querySelectorAll(
    "[data-add-goal]"
  )
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        openGoalModal(
          null,
          button.dataset.addGoal
        );
      }
    );
  });


// Edit profile
document
  .querySelector(
    "#editProfileBtn"
  )
  .addEventListener(
    "click",
    () => {
      els.profileNameInput.value =
        state.profile.name;

      els.profileModal.showModal();
    }
  );


// Close modal buttons
document
  .querySelectorAll(
    "[data-close]"
  )
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        document
          .querySelector(
            `#${button.dataset.close}`
          )
          .close();
      }
    );
  });


// ===============================
// GOAL FORM
// ===============================

// Selecting a different role re-reads the form: the placeholder and hint
// follow the type, the parent list is rebuilt for the type, and the
// rewards follow the type. The current parent is kept when it is still
// legal, and dropped when it is not.
function handleGoalTypeChange() {
  syncGoalTypeUI();

  populateXpOptions(
    els.goalType.value
  );

  populateParentSelect(
    els.goalSkill.value,
    els.goalType.value,
    els.goalId.value || null,
    els.goalParent.value
  );
}

els.goalType.addEventListener(
  "change",
  handleGoalTypeChange
);

els.goalSkill.addEventListener(
  "change",
  () => {
    populateParentSelect(
      els.goalSkill.value,
      els.goalType.value,
      els.goalId.value || null
    );
  }
);

els.goalForm.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    // buildGoalPatch settles everything that depends on the type, so an
    // Arc can never be saved as repeating and a Step can never be saved
    // under a Step.
    const payload = {
      ...buildGoalPatch(
        {
          id: els.goalId.value,
          type: els.goalType.value,
          repeatsDaily:
            els.goalRepeat.checked,
          skillId: els.goalSkill.value,
          parentGoalId:
            els.goalParent.value,
        },
        state.goals
      ),

      title:
        els.goalTitle.value,

      skillId:
        els.goalSkill.value,

      description:
        els.goalDescription.value,

      xp:
        els.goalXp.value,
    };

    if (
      !payload.title.trim() ||
      !payload.skillId
    ) {
      return;
    }

    if (
      els.goalId.value
    ) {
      updateGoal(
        els.goalId.value,
        payload
      );
    } else {
      createGoal(
        payload
      );
    }

    els.goalModal.close();
  }
);


// ===============================
// SKILL FORM
// ===============================

els.skillForm.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    const payload = {
      name:
        els.skillName.value,

      goal:
        els.skillGoal.value,
    };

    if (
      !payload.name.trim()
    ) {
      return;
    }

    if (
      els.skillId.value
    ) {
      updateSkill(
        els.skillId.value,
        payload
      );
    } else {
      createSkill(
        payload
      );
    }

    els.skillModal.close();
  }
);


// ===============================
// PROFILE FORM
// ===============================

els.profileForm.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    updateProfile(
      els.profileNameInput.value
    );

    els.profileModal.close();
  }
);


// ===============================
// SEARCH
// ===============================

if (!isSkillPage) {
  els.searchInput.addEventListener(
    "input",
    render
  );
}


// ===============================
// NAVIGATION
// ===============================

document
  .querySelectorAll(
    ".nav-item"
  )
  .forEach((item) => {
    item.addEventListener(
      "click",
      () => {
        document
          .querySelectorAll(
            ".nav-item"
          )
          .forEach((navItem) => {
            navItem.classList.remove(
              "active"
            );
          });

        item.classList.add(
          "active"
        );

        const section = item.dataset.section;
        document.querySelector(".dashboard").hidden = section === "statistics";
        const statisticsPage = document.querySelector("#statisticsPage");
        if (statisticsPage) statisticsPage.hidden = section !== "statistics";
        if (els.searchInput) els.searchInput.closest("label").hidden = section === "statistics";
        statisticsView?.render();

        if (
          section === "goals"
        ) {
          document
            .querySelector(
              ".main-column"
            )
            .scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
        }
      }
    );
  });


// ===============================
// AUTH + CLOUD SYNC
// ===============================

const SYNC_DEBOUNCE = 800;

const LOGIN_PAGE = "login.html";

let currentUser = null;
let syncTimer = null;
let cloudReady = false;
let cloudPull = null;

function renderAuthButton() {
  if (!els.authBtn) {
    return;
  }

  if (!currentUser) {
    els.authBtn.classList.remove(
      "logged-in"
    );

    els.authBtn.textContent =
      "Sign in";

    els.authBtn.title =
      "Sign in to sync progress across devices";

    els.authBtn.href = LOGIN_PAGE;
    return;
  }

  els.authBtn.classList.add(
    "logged-in"
  );

  // Signed in: the element is a sign-out control, not a navigation link.
  els.authBtn.removeAttribute("href");

  els.authBtn.title =
    `${currentUser.displayName || currentUser.email} — click to sign out`;

  const name =
    currentUser.displayName ||
    currentUser.email ||
    "User";

  const avatar =
    document.createElement("span");

  avatar.className =
    "auth-avatar";

  if (currentUser.photoURL) {
    const img =
      document.createElement("img");

    img.src =
      currentUser.photoURL;

    img.alt = "";

    avatar.append(img);
  } else {
    avatar.textContent =
      name.trim().charAt(0).toUpperCase() ||
      "?";
  }

  els.authBtn.replaceChildren(avatar);

  const label =
    document.createElement("span");

  label.className =
    "auth-avatar-name";

  label.textContent =
    name.split(" ")[0];

  els.authBtn.append(label);
}

async function pushToCloud() {
  if (!currentUser || !cloudReady) {
    return;
  }

  await firebase
    .firestore()
    .collection("users")
    .doc(currentUser.uid)
    .set({
      state: JSON.stringify(state),
      updatedAt: state.updatedAt,
    });
}

function queueCloudSync() {
  clearTimeout(syncTimer);

  syncTimer = setTimeout(() => {
    if (!currentUser) return;
    if (!cloudReady) {
      reconcileCloud();
      return;
    }

    pushToCloud().catch((error) => {
      console.warn(
        "Cloud sync failed.",
        error
      );
    });
  }, SYNC_DEBOUNCE);
}

async function pullFromCloud() {
  if (!currentUser) {
    return;
  }

  const userId = currentUser.uid;
  const ref = firebase
    .firestore()
    .collection("users")
    .doc(currentUser.uid);

  const snapshot =
    await ref.get();

  if (currentUser?.uid !== userId) return;
  if (!snapshot.exists) {
    cloudReady = true;
    await pushToCloud();
    return;
  }

  const data =
    snapshot.data();

  const serverTime =
    Number(data.updatedAt) || 0;

  const localTime =
    Number(state.updatedAt) || 0;

  if (serverTime <= localTime) {
    cloudReady = true;
    await pushToCloud();
    return;
  }

  let remoteState;

  try {
    remoteState = JSON.parse(data.state);
  } catch (error) {
    console.warn(
      "Could not parse cloud state.",
      error
    );
    return;
  }

  // A cloud document can be older than this build, so it goes through
  // the same migration as the local one before it is used.
  state = migrateState(remoteState);
  state.updatedAt = serverTime;
  cloudReady = true;

  saveState({ maintenance: true });
  render();
}

function reconcileCloud() {
  if (cloudPull) return cloudPull;
  cloudPull = pullFromCloud()
    .catch(error => console.warn("Cloud sync failed. Progress is saved locally.", error))
    .finally(() => { cloudPull = null; });
  return cloudPull;
}

function initAuth() {
  if (
    typeof firebase === "undefined" ||
    firebase.apps.length === 0 ||
    !els.authBtn
  ) {
    if (els.authBtn) {
      els.authBtn.hidden = true;
    }
    return;
  }

  // The button is a link to login.html, so a signed-out click is left to
  // the browser. Only the signed-in state (avatar) needs intercepting.
  els.authBtn.addEventListener(
    "click",
    (event) => {
      if (!currentUser) {
        return;
      }

      event.preventDefault();

      if (
        confirm(
          "Sign out? Your progress stays saved."
        )
      ) {
        firebase
          .auth()
          .signOut();
      }
    }
  );

  firebase
    .auth()
    .onAuthStateChanged(
      (user) => {
        currentUser = user;
        cloudReady = false;

        renderAuthButton();

        if (user) {
          reconcileCloud();
        }
      }
    );
}


// ===============================
// INITIAL RENDER
// ===============================

const statisticsView = createStatisticsView({
  getState: () => state,
  save: () => { saveState(); render(); },
});

initAuth();

render();
// Persist schema additions without making old local progress look newer than cloud data.
saveState({ maintenance: true });

refreshLocalDay();
window.addEventListener("focus", refreshLocalDay);
window.addEventListener("pageshow", refreshLocalDay);
window.addEventListener("online", () => {
  if (currentUser) {
    cloudReady = false;
    reconcileCloud();
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshLocalDay();
});
