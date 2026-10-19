# Wayfarer — frontend CRUD demo

Vanilla **HTML + CSS + JavaScript** frontend based on the dashboard concept from the conversation.

Works fully offline with `localStorage`. Optionally, Google sign-in syncs progress to **Firebase (Auth + Cloud Firestore)** so it can be opened from any device.

## Visual skin

Journey and Goals use quiet warm parchment; the profile and Skills sidebar uses a sci-fi
Status Window HUD. Translucent teal/emerald glass (86–90% opacity, 12px backdrop blur)
reveals the page beneath it, with a saturated emerald centre, dark blue-green edges,
#1CEED6 / #00F0FF glowing borders and white text with a soft turquoise halo. The gradient remains usable without backdrop-filter support.
The two panels have white diamond ornaments at all four corners, without neon corner brackets or a Status Window caption. Typography restores
MedievalSharp for the name and Skills heading and the system UI stack for other text.
Skill creation shows only **+**, with an accessible Add skill label; **…** menu contours fade in on hover and out on mouse leave (180 ms).
Keyboard focus stays visible; reduced motion disables the fade. Edit and **+** use
the original 10px rounded corners. Add a Goal retains its outline treatment.

The avatar retains photo upload and its menu. Two glowing outer arcs rotate clockwise
at a constant speed (12 seconds per revolution) on the outer radius formerly used by
the dashed guide. The guide is removed. There is no solid middle ring or inner arc; reduced motion keeps the arcs stationary.
The original five SVG day-streak frames and their tier animations are restored.
Existing user names, XP and Skills are never replaced by display fixtures.
The storage key remains `neonGoalTracker.v1`.

XP and Skill bars restore the original rounded tracks and satin fills: gold XP and
white/silver Skills. Only the Skill fill palette changes; gradient stops, highlights,
track shape and reward timing remain intact. Rewards fill over 700 ms, followed by the original 380 ms gold
sweep. At 90% or more, a slow 4.2-second glow pulse follows. Level-up flashes for
560 ms before showing the new level's remaining XP. Undo and fresh renders cancel
obsolete effects; reduced motion settles immediately with a static halo.

Skill detail and Statistics retain deep Midnight Archive surfaces and the existing
chart palette. MedievalSharp is bundled under the SIL Open Font License; body text
uses the system UI stack and Goal titles use Georgia with Cyrillic fallback.
The existing navigation, forms, layouts and persistence behavior remain in place.

Today's cards retain their compact dimensions: emerald Steps carry a small diamond, amber Quests
a scroll. Focus has a wine/ivory header and a thin 2px gold frame, stronger than either type
in Other Tasks. Completed uses muted parchment without dimming whole cards or active children.
Header counts align right; decorative icons are non-interactive SVG masks. Goals and Skill
cards reuse the Journey type palette, compact row/content styles and Georgia titles.
Arcs use the existing burgundy family with an outlined hexagon, including parent references.
Journey retains its Focus frame and controls; Skill cards keep dark surfaces and nested lists.

Main-view navigation updates immediately and uses a single 220 ms CSS content fade
with a matching background-color transition. Rapid switches cancel the prior fade;
no timers, duplicate views, routing changes or persisted transition state are used.
Reduced motion skips these effects. Statistics retains its pre-restyle 1320 px cap.

## Files

- `AGENTS.md` — accepted product decisions and implementation guidance for coding agents.
- `index.html` — semantic structure, dashboard, dialogs and templates.
- `login.html` — optional sign-in page with a single "Continue with Google" button.
- `skill.html` — per-skill page: skill goal text and its goals rendered as a tree (no type columns).
- `styles.css` — visual system, preserved responsive layout, parchment journal and Midnight Archive themes.
- `app.js` — state, rendering, CRUD logic, `localStorage` and cloud sync.
- `statistics-model.js` — completion-history migration, local calendar weeks, weekly aggregations and Life Area operations.
- `statistics.js` — Statistics view, shared week picker, charts and Life Area management.
- `schedule-model.js` — schedule validation, recurrence and local reminder times.
- `journey-forecast-model.js` — pure workload, duration, local deadline and forecast calculations.
- `journey-forecast.js` — compact Today forecast UI using the existing minute/resume lifecycle.
- `reminders.js` — reminder panel, minute checks and optional browser notifications.
- `login.js` — login page logic, kept separate from `app.js` (which needs the full dashboard DOM).
- `firebase.init.js` — Firebase configuration + initialization (paste your `firebaseConfig` here).
- `CRUD.md` — detailed CRUD documentation.

## Interface decisions to preserve

The top navigation contains **Today's Journey → Goals → Statistics**, without a Skills tab or inactive
settings icons. The notification bell opens a working reminder panel on both Goal pages. Skills remain in the dashboard sidebar. Goals use the same
**… → Edit / Delete / Pause goal (or Resume goal)** menu both on the dashboard and on the Skill detail page. The avatar
in the profile card is an upload control: it shows a **+** inside the ring until a photo is
set, and opens the same shared **…** menu with **Load a photo / Delete photo**.

The Statistics Life Areas dialog assigns existing Skills and intentionally has no
**+ Create a Skill** button. Create Skills through **+ Add skill** in the dashboard panel.
New features should preserve these decisions unless the user explicitly changes them.
Life History / Chronicles is not included in the current implementation after its rollback.
See [AGENTS.md](AGENTS.md) and the [current interface contract](CRUD.md#current-interface-contract).

## Today's Journey

Start with today's scheduled Steps and Quests, or use **+ Add a Goal** to select an
existing goal or create one. Expand Quests to complete their child Steps. The × hides
any goal, including a nested Step, for today; add it again through the picker whenever plans change.
Hiding a completed Goal keeps its completion and reward. Hiding an unfinished Goal removes it
from today's plan. Undo elsewhere removes a hidden completion; restoring it never counts it twice.
Today's plan has three independently collapsible sections: **Today's Focus**, **Other Tasks**,
and **Completed**. Focus is an explicit choice for this local day only: use the bookmark
on an incomplete card or choose **Today's Focus** in the existing-goal picker. The picker
can also move an already included goal. Scheduled habits, ordinary selections and new goals
start in Other Tasks. There is no priority limit or automatic priority selection.

Completed is initially collapsed. Completion moves a top-level goal there; expand it to undo
using its checkbox. Undo restores its Focus membership and manual order through the normal
XP/history mechanism. Only completions recorded for today count as today's completed work;
older or undated completions are not relabelled. Hidden completed goals remain counted but
stay hidden. Nested Steps stay with their visible Quest, including completed children; they
never also appear as top-level completions. Choosing a nested Step's destination in the picker
explicitly moves the visible Quest group, as explained in the picker. A child's independently
saved Focus membership never automatically makes its parent a priority.

**By time** orders today's configured times within each active section, with untimed goals
under **Anytime**. **My order** uses keyboard-accessible up/down controls within each section.
The saved daily sequence survives moving sections, completion/undo and sort changes.

Daily `focusIds`, selection, hiding and order use the existing local state and Firebase mirror;
normalization validates IDs and clears them on the next local day. Sort preference persists.
Section expansion is session-only and survives view switches and ordinary rerenders without
storage/cloud writes. A page reload starts with Focus/Other expanded and Completed collapsed.
Forecast now counts only explicitly focused groups and their remaining work, regardless of collapse.
All views share existing Goals, XP and history; no separate rewards or completion records.

Pause a Step, Quest or Arc through its **…** menu to stop automatic Today inclusion
and reminders. Descendants inherit the pause without changing their own statuses.
Resume restores scheduling while keeping independently paused children paused; reminders
due before resume do not return as a backlog. Paused goals can still be manually selected
for Today and completed normally. The × remains a separate removal for today only.

## Journey Forecast

The compact Forecast sits below sorting, immediately above Today's Focus. Its collapsed row
shows a status circle and today's active target time; the percentage stays internal. Expand it
to edit the time or hide/show the indicator. Both disclosure and visibility preferences persist.
New users start with the panel collapsed.

Changing the time activates a valid future target for today and updates the outlook automatically.
**Use this target today** reuses a remembered time without editing. A new day clears activation,
retaining your preferred time and UI settings. Expired targets never extend automatically; choose
a later time to restart. The panel never opens automatically when status or date changes.

Only Focus root groups contribute: unfinished Quests cover their Steps; remaining children of a
completed focused Quest count separately. Other Tasks do not affect the outlook. No Focus or no
active target shows no coloured indicator; completed work is explained as **Focus complete**.
The original duration estimates, 75% usable-time factor and risk thresholds are preserved.
Green means Good outlook, yellow At risk, red High risk; expiry is explained as Time’s up.

Updates reuse the existing minute/resume lifecycle and happen after Focus changes, completion,
undo, time edits and relevant Goal changes. Calculation never writes state or changes XP/history.
Dates use the existing editorial font family. See [implementation details](CRUD.md#journey-forecast).

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
- Statistics: daily stacked Step/Quest/Arc completion events (plus Unclassified history), the top five Skills by weekly XP, and Life Area shares of categorized weekly XP. All use the same Monday–Sunday week; future weeks are disabled.
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
- Quadratic level/XP curve (reaching level N requires (N-1)^2 * 100 XP).
- Completion feedback: the checkbox pops, the card switches to a dimmed "done" state with a
  `Done today` / `Done` (repeating) or `Completed` (one-time) chip. A `+XP` hint floats up
  from the card, and the skill and player bars animate
  from their old values to the new ones. A skill or player level-up adds a compact toast
  (`READING LEVEL UP — Lv. 4 → Lv. 5`); two level-ups play one after the other. The one goal
  reward drives both bars, so nothing is counted twice. Durations live in the `--motion-*` tokens
  in `styles.css` and are reduced under `prefers-reduced-motion`.
- Daily streak: completing at least one goal per day grows a game-style streak badge next to the profile name (flame + day count, with a more angular frame per tier: dormant, sage, muted teal, bronze, and a burgundy/gold crest at 14+ days); missing a day resets it at local 00:00. Completing any Goal counts, including a one-off Quest. The badge markup ships in the page HTML and `app.js` only swaps the tier class and the day count, so the badge still renders when a stale cached script fails to run.
- Goal maintenance actions live behind one `···` trigger per goal card instead of permanent
  Edit/Delete buttons, which keeps the card quiet next to completion, title and XP. The menu is a
  single `position: fixed` element on `<body>` (`role="menu"`, `aria-haspopup` /
  `aria-expanded` on the trigger), anchored right-aligned under the trigger, flipped above when
  the viewport ends first, with arrow-key roaming, `Escape` to close and focus back on the
  trigger, and a click-away to dismiss. It calls `openGoalModal()` / `deleteGoal()` and
  `setGoalStatus()` for Pause/Resume, so
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
   `schedule-model.js`, `journey-forecast-model.js`, `journey-forecast.js`, `reminders.js`, `login.js`, `firebase.init.js`, `styles.css` and `assets/` into a repo root (or move them
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

Goal columns retain their structure and accents. Cards share Journey’s content-driven
spacing (8px/10px Step, 10px Quest/Arc; 7px/8px on mobile), 7px corners and 3px type stripe.
`applyGoalCardPresentation()` groups existing controls into the shared row/content primitives
without replacing completion or menu handlers. XP, schedule, completion and Skill/parent
metadata wrap together, with descriptions below. Completed Goals remain quieter and sort
to the bottom; completed parents never dim active children. Skill trees keep subtle
indentation and dark tinted surfaces instead of light parchment. Skills
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

### Weekly Activity completion types

Weekly Activity stacks recorded completion events by Step (muted teal), Quest (matte gold) and
Arc (burgundy), with a compact legend and daily mouse/keyboard tooltips. Escape dismisses
the tooltip. A neutral Unclassified segment preserves events without a valid historical
type; their current Goal type is not evidence of the type at completion. New history
records snapshot `goalType`; old records are preserved without guessing or backfilling.
Editing/deleting a Goal does not reclassify its recorded completions. Recurring events
count separately, and undo removes the corresponding event. The weekly summary sums all
recorded completions and awarded XP, including records referencing an absent Skill.
Top Skill Progression remains limited to five earning Skills; Life Areas are unchanged.

## Verification

Run commands from `front/`; the complete model/browser matrix is in
[CRUD.md → Verification](CRUD.md#verification). For the latest Journey, status and
stacked weekly statistics changes:

```sh
gjs tests/journey-model.js
gjs tests/journey-forecast-model.js
TZ=America/New_York gjs tests/journey-forecast-model.js
gjs tests/goal-status-model.js
gjs tests/statistics-model.js
gjs tests/statistics-sync.js
STATISTICS_TEST_SCRIPT=journey-forecast-browser.js python3 tests/statistics-browser.py webkit
STATISTICS_TEST_SCRIPT=journey-forecast-browser.js STATISTICS_REDUCED_MOTION=1 python3 tests/statistics-browser.py webkit 390 844
STATISTICS_TEST_SCRIPT=journey-views-browser.js python3 tests/statistics-browser.py webkit
STATISTICS_TEST_SCRIPT=goal-status-browser.js python3 tests/statistics-browser.py webkit
STATISTICS_TEST_SCRIPT=statistics-stacks-browser.js python3 tests/statistics-browser.py webkit
```

Browser checks use isolated fixture data and omit Firebase. Append `390 844` for a
mobile viewport; `STATISTICS_REDUCED_MOTION=1` exercises reduced motion in WebKit.
