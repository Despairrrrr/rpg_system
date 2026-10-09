// The panel works independently of browser notification permission.
function createReminderPanel({ complete, skip, navigate }) {
  const bell = document.getElementById('reminderBell');
  const panel = document.getElementById('reminderPanel');
  const list = document.getElementById('reminderList');
  const badge = document.getElementById('reminderCount');
  const empty = document.getElementById('reminderEmpty');
  let entries = [];

  function close(returnFocus = false) {
    panel.hidden = true;
    bell.setAttribute('aria-expanded', 'false');
    if (returnFocus) bell.focus();
  }

  bell.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    bell.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) document.getElementById('reminderClose').focus();
  });
  document.getElementById('reminderClose').addEventListener('click', () => close(true));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); }
  });
  document.addEventListener('click', event => {
    if (!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target)) close();
  });

  function render(nextEntries = entries) {
    entries = nextEntries;
    badge.textContent = String(entries.length);
    badge.hidden = !entries.length;
    bell.setAttribute('aria-label', `Reminders, ${entries.length} pending`);
    empty.hidden = Boolean(entries.length);
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused?.dataset.key;
    const focusAction = focused?.dataset.action;
    list.replaceChildren();
    for (const entry of entries) {
      const item = document.createElement('li');
      item.className = 'reminder-item';
      const title = document.createElement('button');
      title.type = 'button'; title.className = 'reminder-title'; title.textContent = entry.goal.title;
      title.dataset.key = entry.key; title.dataset.action = 'navigate';
      title.addEventListener('click', () => { close(); navigate(entry.goal); });
      const detail = document.createElement('p');
      detail.className = 'field-hint';
      detail.textContent = `${entry.day} · ${entry.time} · +${entry.goal.xp} XP${entry.missed ? ' · Missed' : ''}`;
      const actions = document.createElement('div'); actions.className = 'reminder-actions';
      for (const [action, label, handler] of [['complete', 'Mark done', complete], ['skip', 'Skip', skip]]) {
        const button = document.createElement('button'); button.type = 'button';
        button.className = action === 'complete' ? 'primary-btn' : 'secondary-btn';
        button.textContent = label; button.dataset.key = entry.key; button.dataset.action = action;
        button.addEventListener('click', () => handler(entry)); actions.append(button);
      }
      item.append(title, detail, actions); list.append(item);
    }
    if (focused) {
      const replacement = [...list.querySelectorAll('button')].find(button => button.dataset.key === focusKey && button.dataset.action === focusAction);
      (replacement || document.getElementById('reminderClose')).focus();
    }
  }
  render();
  return { render, close };
}

function createReminderSystem({ getState, save, complete, render, beforeCheck = () => {}, now = () => new Date() }) {
  let timer = null;
  let running = false;
  function refresh() {
    if (running) return [];
    running = true;
    try {
      beforeCheck();
      const entries = GoalSchedule.pending(getState(), now());
      render(entries);
      return entries;
    } catch (_) {
      // Reminders must never prevent rendering or editing ordinary Goals.
      return [];
    } finally { running = false; }
  }
  function act(entry, status) {
    beforeCheck();
    // Re-resolve after edits, deletes, midnight or changes in another tab.
    const current = GoalSchedule.pending(getState(), now()).find(item => item.key === entry.key);
    if (!current) { refresh(); return; }
    if (status === 'done' && !complete(current)) { refresh(); return; }
    const state = getState();
    const receipts = state.reminderReceipts && typeof state.reminderReceipts === 'object' && !Array.isArray(state.reminderReceipts)
      ? state.reminderReceipts : {};
    state.reminderReceipts = Object.fromEntries(Object.entries(receipts).filter(([id]) => state.goals.some(goal => goal.id === id)));
    state.reminderReceipts[current.goal.id] = { key: current.key, status };
    save();
    refresh();
  }
  function start() {
    if (timer !== null) return;
    refresh();
    timer = setInterval(refresh, 60_000);
  }
  function stop() { if (timer !== null) clearInterval(timer); timer = null; }
  return { refresh, start, stop, skip: entry => act(entry, 'skipped'), complete: entry => act(entry, 'done') };
}

// Delivery receipts are device-local; Goal completion/Skip remains in normal
// synced state. No workers, background services or push subscription are used.
function createBrowserReminders({ getState, navigate, focus = () => window.focus(),
  getNotification = () => window.Notification, storage = null,
  locks = navigator.locks, secure = window.isSecureContext }) {
  if (!storage) {
    try { storage = window.localStorage; } catch (_) { storage = { getItem: () => null, setItem: () => {} }; }
  }
  const storageKey = 'neonGoalTracker.v1.reminderDelivery';
  const memory = new Map();
  const visible = new Map();
  let asked = false;
  let permissionRequest = null;

  function permission() {
    try { return secure && getNotification() ? getNotification().permission : 'unavailable'; }
    catch (_) { return 'unavailable'; }
  }
  function requestPermission() {
    if (permissionRequest) return permissionRequest;
    if (permission() !== 'default' || asked) return Promise.resolve(permission());
    asked = true;
    try {
      // Called directly from the checkbox interaction to retain user activation.
      permissionRequest = Promise.resolve(getNotification().requestPermission())
        .catch(() => 'unavailable').finally(() => { permissionRequest = null; });
      return permissionRequest;
    } catch (_) { return Promise.resolve('unavailable'); }
  }
  async function exclusive(callback) {
    if (locks?.request) {
      let started = false;
      try {
        return await locks.request('neonGoalTracker-reminders', () => { started = true; return callback(); });
      } catch (_) {
        // If the browser refuses the lock, retain usable in-app actions.
        // Never replay an action that already started and threw.
        return started ? undefined : callback();
      }
    }
    return callback();
  }
  async function deliver(entry) {
    if (entry.silent || permission() !== 'granted' || memory.get(entry.goal.id) === entry.key) return;
    await exclusive(() => {
      const current = GoalSchedule.pending(getState()).find(item => item.key === entry.key);
      if (!current || current.silent) return;
      let receipts = {};
      try {
        const parsed = JSON.parse(storage.getItem(storageKey));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) receipts = parsed;
      } catch (_) { /* In-memory delivery deduplication still works. */ }
      if (receipts[entry.goal.id] === entry.key || memory.get(entry.goal.id) === entry.key) return;
      memory.set(entry.goal.id, entry.key);
      try {
        const NotificationAPI = getNotification();
        const streak = Math.max(0, Number(getState().streak?.count) || 0);
        const notification = new NotificationAPI(entry.goal.title, {
          body: `${entry.time} · +${entry.goal.xp} XP${streak ? ` · ${streak}-day streak` : ''}`,
          tag: entry.key,
        });
        visible.set(entry.key, notification);
        notification.onclick = () => {
          notification.close();
          focus();
          const goal = getState().goals.find(goal => goal.id === entry.goal.id);
          if (goal) navigate(goal);
        };
        receipts = Object.fromEntries(Object.entries(receipts).filter(([id]) => getState().goals.some(goal => goal.id === id)));
        receipts[entry.goal.id] = entry.key;
        try { storage.setItem(storageKey, JSON.stringify(receipts)); } catch (_) { /* Optional cache only. */ }
      } catch (_) { /* Unsupported constructors and denied permissions leave in-app reminders intact. */ }
    });
  }
  function refresh(entries) {
    const keys = new Set(entries.map(entry => entry.key));
    for (const [key, notification] of visible) {
      if (!keys.has(key)) { try { notification.close(); } catch (_) {} visible.delete(key); }
    }
    for (const entry of entries) void deliver(entry).catch(() => {});
  }
  return { permission, requestPermission, refresh, exclusive };
}
