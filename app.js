const STORAGE_KEY = "neonGoalTracker.v1";

const defaultState = {
  profile: { name: "User User" },

  streak: { count: 0, date: "" },

  updatedAt: 0,

  goals: [],

  skills: [],
};

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

const goalTypes = ["daily", "short", "medium", "long"];

const goalXpOptions = {
  daily: [10, 15, 30],
  short: [50, 100, 125],
  medium: [200, 350, 500],
  long: [1000, 2000, 5000],
};

const goalTypeOrder = {
  daily: 0,
  short: 1,
  medium: 2,
  long: 3,
};

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
  goalDescription: document.querySelector("#goalDescription"),
  goalXp: document.querySelector("#goalXp"),
  goalSkill: document.querySelector("#goalSkill"),
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
  streakFlame: document.querySelector(".streak-flame"),
  streakValue: document.querySelector("#streakValue"),

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

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return structuredClone(defaultState);
    }

    const parsed = JSON.parse(saved);

    return {
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


function saveState() {
  state.updatedAt = Date.now();

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );

  queueCloudSync();
}


// ===============================
// MAIN RENDER
// ===============================

function render() {
  checkStreakExpiry();

  renderProfile();
  renderSkills();

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

  saveState();
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

    saveState();
  }
}


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


// ===============================
// PROFILE
// ===============================

function renderProfile() {
  els.profileName.textContent =
    state.profile.name;

  els.streakValue.textContent =
    state.streak.count;

  els.streakFlame.hidden =
    state.streak.count <= 0;

  const totalXP = state.skills.reduce(
    (sum, skill) =>
      sum + Number(skill.xp || 0),
    0
  );

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
// GOALS RENDER
// ===============================

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

      checkbox.addEventListener(
        "change",
        () => {
          toggleGoalCompletion(
            goal.id,
            checkbox.checked
          );
        }
      );

      card.querySelector(
        ".edit-goal"
      ).addEventListener(
        "click",
        () => {
          openGoalModal(goal);
        }
      );

      card.querySelector(
        ".delete-goal"
      ).addEventListener(
        "click",
        () => {
          deleteGoal(goal.id);
        }
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

  const actions =
    document.createElement("div");

  actions.className =
    "goal-tree-actions";

  const edit =
    document.createElement("button");

  edit.className =
    "mini-btn edit-goal";

  edit.type = "button";
  edit.textContent = "Edit";

  const del =
    document.createElement("button");

  del.className =
    "mini-btn danger delete-goal";

  del.type = "button";
  del.textContent = "Delete";

  actions.append(
    edit,
    del
  );

  item.append(actions);

  input.addEventListener(
    "change",
    () => {
      toggleGoalCompletion(
        goal.id,
        input.checked
      );
    }
  );

  edit.addEventListener(
    "click",
    () => {
      openGoalModal(goal);
    }
  );

  del.addEventListener(
    "click",
    () => {
      deleteGoal(goal.id);
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
  const newGoal = {
    id: crypto.randomUUID(),

    title:
      data.title.trim(),

    type:
      data.type,

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

    createdAt:
      new Date()
        .toISOString(),
  };

  state.goals.push(
    newGoal
  );

  saveState();

  render();
}


// TOGGLE COMPLETION
function toggleGoalCompletion(
  goalId,
  completed
) {
  const goal =
    state.goals.find(
      (item) =>
        item.id === goalId
    );

  if (!goal) {
    return;
  }

  const skill =
    state.skills.find(
      (item) =>
        item.id === goal.skillId
    );

  const xp =
    Number(goal.xp) || 0;

  if (skill) {
    skill.xp = Math.max(
      0,
      (Number(skill.xp) || 0) +
        (completed ? xp : -xp)
    );
  }

  if (
    completed &&
    !goal.completed
  ) {
    bumpStreak();
  }

  goal.completed =
    completed;

  saveState();

  render();
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

  Object.assign(
    goal,
    patch
  );

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


function populateParentSelect(
  skillId = "",
  currentGoalId = null,
  selectedId = ""
) {
  els.goalParent.innerHTML = "";

  const placeholder =
    document.createElement("option");

  placeholder.value = "";
  placeholder.textContent =
    "No parent goal";

  els.goalParent.append(
    placeholder
  );

  els.goalParent.disabled =
    !skillId;

  if (skillId) {
    state.goals.forEach((goal) => {
      if (
        goal.id ===
          currentGoalId ||
        goal.type !== "long" ||
        goal.skillId !== skillId
      ) {
        return;
      }

      const option =
        document.createElement("option");

      option.value =
        goal.id;

      option.textContent =
        goal.title;

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
    goalXpOptions.daily;

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


function openGoalModal(
  goal = null,
  presetType = null,
  presetSkillId = null
) {
  els.goalForm.reset();

  const type =
    goal
      ? goal.type
      : presetType || "daily";

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

  populateParentSelect(
    skillId,
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

  els.goalType.value =
    type;

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

els.goalType.addEventListener(
  "change",
  () => {
    populateXpOptions(
      els.goalType.value
    );
  }
);

els.goalSkill.addEventListener(
  "change",
  () => {
    populateParentSelect(
      els.goalSkill.value
    );
  }
);

els.goalForm.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    const payload = {
      title:
        els.goalTitle.value,

      type:
        els.goalType.value,

      skillId:
        els.goalSkill.value,

      parentGoalId:
        els.goalParent.value,

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

        const section =
          item.dataset.section;

        if (
          section === "skills"
        ) {
          document
            .querySelector(
              ".skills-card"
            )
            .scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
        }

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

let currentUser = null;
let syncTimer = null;

function renderAuthButton() {
  if (!els.authBtn) {
    return;
  }

  if (!currentUser) {
    els.authBtn.classList.remove(
      "logged-in"
    );

    els.authBtn.textContent =
      "Sign in with Google";

    els.authBtn.title =
      "Sign in to sync progress across devices";
    return;
  }

  els.authBtn.classList.add(
    "logged-in"
  );

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
  if (!currentUser) {
    return;
  }

  await firebase
    .firestore()
    .collection("users")
    .doc(currentUser.uid)
    .set({
      state: JSON.stringify(state),
      updatedAt: Date.now(),
    });
}

function queueCloudSync() {
  clearTimeout(syncTimer);

  syncTimer = setTimeout(() => {
    if (!currentUser) {
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

  const ref = firebase
    .firestore()
    .collection("users")
    .doc(currentUser.uid);

  const snapshot =
    await ref.get();

  if (!snapshot.exists) {
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

  state = remoteState;

  saveState();
  render();
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

  const provider =
    new firebase.auth.GoogleAuthProvider();

  els.authBtn.addEventListener(
    "click",
    () => {
      if (currentUser) {
        if (
          confirm(
            "Sign out? Your progress stays saved."
          )
        ) {
          firebase.auth().signOut();
        }
        return;
      }

      firebase
        .auth()
        .signInWithPopup(provider)
        .catch((error) => {
          console.warn(
            "Sign-in failed.",
            error
          );

          if (error.code) {
            alert(
              `Sign-in failed: ${error.message}`
            );
          }
        });
    }
  );

  firebase
    .auth()
    .onAuthStateChanged(
      (user) => {
        currentUser = user;

        renderAuthButton();

        if (user) {
          pullFromCloud().catch(
            (error) => {
              console.warn(
                "Sync on sign-in failed.",
                error
              );
            }
          );
        }
      }
    );
}


// ===============================
// INITIAL RENDER
// ===============================

initAuth();

render();