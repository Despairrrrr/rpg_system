# Neon Goal Tracker — frontend CRUD demo

Vanilla **HTML + CSS + JavaScript** frontend based on the dashboard concept from the conversation.

Works fully offline with `localStorage`. Optionally, Google sign-in syncs progress to **Firebase (Auth + Cloud Firestore)** so it can be opened from any device.

## Files

- `AGENTS.md` — accepted product decisions and implementation guidance for coding agents.
- `index.html` — semantic structure, dashboard, dialogs and templates.
- `login.html` — optional sign-in page with a single "Continue with Google" button.
- `skill.html` — per-skill page: skill goal text and its goals rendered as a tree (no type columns).
- `styles.css` — visual system, responsive layout, neon theme.
- `app.js` — state, rendering, CRUD logic, `localStorage` and cloud sync.
- `statistics-model.js` — completion-history migration, local calendar weeks, weekly aggregations and Life Area operations.
- `statistics.js` — Statistics view, shared week picker, charts and Life Area management.
- `schedule-model.js` — schedule validation, recurrence and local reminder times.
- `reminders.js` — reminder panel, minute checks and optional browser notifications.
- `login.js` — login page logic, kept separate from `app.js` (which needs the full dashboard DOM).
- `firebase.init.js` — Firebase configuration + initialization (paste your `firebaseConfig` here).
- `CRUD.md` — detailed CRUD documentation.

## Interface decisions to preserve

The top navigation contains **Goals** and **Statistics**, without a Skills tab or inactive
settings icons. The notification bell opens a working reminder panel on both Goal pages. Skills remain in the dashboard sidebar. Goals use the same
**… → Edit / Delete** menu both on the dashboard and on the Skill detail page. The avatar
in the profile card is an upload control: it shows a **+** inside the ring until a photo is
set, and opens the same shared **…** menu with **Load a photo / Delete photo**.

The Statistics Life Areas dialog assigns existing Skills and intentionally has no
**+ Create a Skill** button. Create Skills through **+ Add skill** in the dashboard panel.
New features should preserve these decisions unless the user explicitly changes them.
See [AGENTS.md](AGENTS.md) and the [current interface contract](CRUD.md#current-interface-contract).

## Run

The CRUD part works by simply opening `index.html` in a browser.

**Sign-in, however, only works over `http(s)`** — it needs a real origin. From a
`file://` page the browser sends no `Referer` at all, which Firebase Auth rejects.
Use any static server, for example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000            dashboard
http://localhost:8000/login.html sign-in page
```

The sign-in page is `login.html`, and it is completely optional — "Continue without
an account" goes straight to the dashboard, which keeps working on `localStorage`.
Signing in and signing up are the same action: the first "Continue with Google"
creates the Firebase user, later ones just sign it in.

## Main features

- Goal CRUD:
  - create a goal;
  - read/render all goals;
  - update a goal;
  - mark a goal completed;
  - delete a goal.
- Skill CRUD:
  - create a skill;
  - read/render skills;
  - update a skill;
  - delete a skill.
- Profile name editing.
- Browser persistence through `localStorage`.
- Search across goals and skills.
- Automatic goal counts showing the remaining work: completed non-repeating Goals are
  excluded, while repeating Goals stay counted until their reset. Completed Goals sort to
  the bottom of their column.
- Statistics: daily completion counts, the top five Skills by weekly XP, and Life Area shares of categorized weekly XP. All use the same Monday–Sunday week; future weeks are disabled.
- Statistics uses a compact title/week/summary header, two upper chart panels, and a
  full-width Life Areas radar/breakdown. The summary contains **Goals completed** and
  **XP earned** only; there is no Active Skills metric and no Skill icon in the ranking.
- Charts animate on entry and transition directly between weeks, including rapid clicks.
  Names and values remain visible; reduced motion shows final values immediately.
- Life Area axes show user-defined names and percentages with full names in the breakdown.
  The count is dynamic: 3–8 Areas use a radar and larger sets use the complete list.
  Pre-tracking history is distinguished from tracked weeks with zero activity.
- User-created Life Areas require at least one existing Skill on creation. Skills can be moved or uncategorized afterwards.
- Completion history starts when schema v3 is first loaded; old Goals and XP are preserved without inventing past activity. Manual undo reverses the original recorded reward; the daily reset preserves it.
- Clicking a skill opens its detail page with a goal tree (arcs nest the steps and quests that belong to them).
- Goals come in three sizes, not four: a **step** is a concrete action, a **quest** is a meaningful
  outcome, and an **arc** is a larger direction that can contain several quests. A step may sit
  under a quest or an arc, a quest may sit under an arc, and every parent is optional.
- Recurrence is independent of size: Steps and Quests can repeat daily, weekly or on
  custom weekdays, with an optional local time. The default One-time mode has no
  frequency/day fields; Steps and Quests still show optional Time. Cards show
  frequency, days and time (or Any time). The old four types
  (`daily` / `short` / `medium` / `long`) are migrated on load: `daily` becomes a repeating step,
  `short` a step, `medium` a quest and `long` an arc, keeping titles, XP, completion and streaks.
- Exponential level/XP curve (reaching level N requires (N-1)^2 * 100 XP).
- Completion feedback: the checkbox pops, the card switches to a dimmed "done" state with a
  `Done today` chip, a `+XP` hint floats up from the card, and the skill and player bars animate
  from their old values to the new ones. A skill or player level-up adds a compact toast
  (`READING LEVEL UP — Lv. 4 → Lv. 5`); two level-ups play one after the other. The one goal
  reward drives both bars, so nothing is counted twice. Durations live in the `--motion-*` tokens
  in `styles.css` and are reduced under `prefers-reduced-motion`.
- Daily streak: completing at least one goal per day grows a game-style streak badge next to the profile name (flame + day count, with a more angular frame per tier: dormant, cyan, teal, amber, and a premium red/gold crest at 14+ days); missing a day resets it at local 00:00. Completing any Goal counts, including a one-off Quest. The badge markup ships in the page HTML and `app.js` only swaps the tier class and the day count, so the badge still renders when a stale cached script fails to run.
- Goal maintenance actions live behind one `···` trigger per goal card instead of permanent
  Edit/Delete buttons, which keeps the card quiet next to completion, title and XP. The menu is a
  single `position: fixed` element on `<body>` (`role="menu"`, `aria-haspopup` /
  `aria-expanded` on the trigger), anchored right-aligned under the trigger, flipped above when
  the viewport ends first, with arrow-key roaming, `Escape` to close and focus back on the
  trigger, and a click-away to dismiss. It calls `openGoalModal()` / `deleteGoal()` unchanged, so
  the `confirm()` on delete still applies. The Skill detail Goal tree uses this same menu;
  Skill rows use the same accessible menu with Skill-specific Edit/Delete actions.
- Optional sign-in via a dedicated `login.html` page with a "Continue with Google" button, syncing progress across devices (last-write-wins).
- Responsive layout.

## Data persistence

All app state is stored under:

```text
neonGoalTracker.v1
```

in `localStorage`.

Delete that key in DevTools → Application/Storage → Local Storage to reset the app.

## Google sign-in + cloud sync (Firebase)

Optional but needed to keep progress across devices. Setup once (free tier is enough):

1. Create a project at https://console.firebase.google.com
2. **Build → Authentication → Sign-in method → Google → Enable.**
3. **Build → Firestore Database → Create database** (production mode).
4. In Firestore, set these rules (Database → Rules):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

5. **Project settings → Your apps → `</>` (Web app)** — register the app and copy the
   `firebaseConfig` object into `firebase.init.js` (replace the empty `{}`). The sign-in
   link in the top-right only appears once a valid config is present.
6. **Authentication → Settings → Authorized domains**: if you deploy to GitHub Pages, add
   `your-username.github.io`. (`localhost` is allowed by default for local development.)
   Remove `localhost` here to block sign-in locally.

### API key restrictions

The Web API key lives in **Google Cloud Console → APIs & Services → Credentials**, not
in the Firebase console. Leave **Application restrictions** empty, or the popup flow
breaks in confusing ways:

- the sign-in popup runs through a hidden iframe on your `authDomain`
  (`<project>.firebaseapp.com`), and *that* iframe calls Google with itself as the
  referer — so the `authDomain` must be allowed too;
- browsers send only the bare origin (`https://site.com`, no path) as the `Referer` for
  cross-origin requests, so a path-scoped rule like `https://site.com/repo/*` never
  matches.

A blocked key does not report itself clearly. Depending on which of the two calls gets
refused, you either get the popup page saying *"The requested action is invalid"* or
`auth/requests-from-referer-...-are-blocked`. Restricting the key buys nothing here
anyway — it ships in the client code, so the real boundary is **Authorized domains**
plus the Firestore rules above.

### How sync works

When signed in, every state change is stored to `users/{uid}` as a single document
(`state` JSON + `updatedAt` ms). On sign-in the local copy and the cloud copy are compared
and the **newer one wins (last-write-wins)**. The first sign-in uploads whatever progress
already exists locally. Schema migration and automatic daily resets preserve the last edit
timestamp, and uploads wait for the sign-in comparison. Without a connection the app keeps
working locally and retries on the next save or when the browser comes online. Whole-document
sync does not merge simultaneous edits from different devices.

The profile photo is part of that state, so it syncs the same way and needs no separate
upload. It is stored as a small data URL (centre-cropped 256x256 JPEG, capped at roughly
150 KB) because Firestore caps a document at 1 MiB and the whole state goes up as a single
JSON string. Clearing it is **Delete photo** in the avatar menu.

### Publish on GitHub Pages

The site is purely static — no server needed:

1. Put `index.html`, `login.html`, `skill.html`, `app.js`, `statistics-model.js`, `statistics.js`,
   `schedule-model.js`, `reminders.js`, `login.js`, `firebase.init.js`, `styles.css` and `assets/` into a repo root (or move them
   into the repo root from the `front/` folder).
2. GitHub repo → **Settings → Pages → Build and deployment → Deploy from a branch →
   main / root.**
3. The app is then live at `https://<your-username>.github.io/<repo>/` with HTTPS.
4. Add `your-username.github.io` to the Firebase **Authorized domains** (step 6 above).
5. GitHub Pages serves files with a 10 minute cache, so a fresh deploy can still look like it
   did not land. Every own asset is referenced with a `?v=N` query in `index.html`, `login.html`
   and `skill.html` — bump `N` on each deploy to force browsers to refetch. To confirm a
   deploy, open `https://<your-username>.github.io/<repo>/?v=2` (the extra query bypasses the
   cached page itself) and fall back to `Ctrl+Shift+R`. The HTML comment in the profile card
   (`<!-- streak badge v3 -->`) shows which build is live.

### Streak badge motion

Active streaks animate the flame silhouette and core independently; the frame stays steady with a faint breathing glow. Increases briefly flare the flame and roll the label; tier changes crossfade the frame. Initial rendering and resets do not celebrate. Reduced motion disables all badge animation, including when the preference changes mid-animation.

Run presentation-state checks from `front` with `gjs tests/streak-motion.js` or `node tests/streak-motion.js`.

### Goals and Skills presentation

Goal columns carry the strong neon accents; inner cards use softer borders. Steps are
compact, Quests medium, and Arcs slightly more spacious. Completed Goals are quieter and
sort to the bottom of their column, XP is secondary to the title, and Skill/parent
metadata uses compact wrapping tags. Skills
appear in two progress columns on wide screens and one on narrow screens (up to 720px),
with a visible keyboard/touch-accessible
**… → Edit / Delete** menu. These are presentation changes only; progression and data
behavior remain unchanged.

### Schedules and reminders

Choose Repeating in Add/Edit Goal, then Daily, Weekly or Custom days. Weekly and
Custom both repeat on the selected weekdays; select at least one. Arcs remain
One-time with no time/reminder controls. One-time Steps and Quests show optional
Time using the same picker as repeating Goals. Time is stored as local `HH:MM`,
without UTC conversion.
Existing daily Goals migrate automatically, retain their XP/history, and have
reminders disabled until you enable them. `repeatsDaily` remains in saved data.

Send notification becomes available when a Step or Quest has a time, including
One-time Goals. Choose At
time or 5, 15 or 30 minutes before (default 5). The bell lists the latest due
occurrence per Goal, including a Missed label after its scheduled time. Mark done
awards the ordinary reward and records completion today; Skip dismisses just that
occurrence without XP. Both survive reloads. To remove time from a One-time Goal,
turn off Send notification as well; otherwise Save is disabled with “Set a time to
enable reminders”. Switching between One-time and Repeating preserves the entered time.

A One-time time belongs to the local date when you set or change it, including when
adding time to an old Goal. Editing only the title or reminder offset preserves that
date. A time already past when configured appears as Missed in the panel without
an immediate system notification. Completing the Goal before its time cancels the
reminder; completion and Skip never produce another reminder the next day.

Reminders are checked every minute while the app is open and when the page resumes.
Suspended tabs may deliver late; closed tabs do not notify. Browser notifications
are optional: permission is requested when you enable the checkbox. Denial or an
unsupported browser still leaves the in-app panel working. Native notifications
need a supported secure context, normally HTTPS or localhost; some mobile browsers
require a service worker, which this MVP intentionally does not add. See
[Notification API support](https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification).

Times follow the device's current timezone. At a daylight-saving gap, the local
Date calculation advances by the gap; a repeated local time has one occurrence.
Weekly/custom completion reopens on the next selected day. Early completion of a
reminder for tomorrow stays checked through tomorrow; late completion records XP
on the day you actually complete it. The panel retains the latest due occurrence,
not an unlimited historical backlog.

The state key and optional Firebase sync stay unchanged. Skip/completion receipts
travel with state; `neonGoalTracker.v1.reminderDelivery` is a small device-local cache
that prevents repeated system notifications. Web Locks coordinate reminders between
supported same-origin tabs; without them, delivery deduplication is best-effort.
No notification permission or Goal data is saved merely by opening or cancelling a
form (a browser permission granted during editing remains a browser setting).
