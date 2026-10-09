# Working on this frontend

Read this file and the "Current interface contract" section of `CRUD.md` before
changing the UI. These are accepted product decisions, not unfinished placeholders.
Preserve them when adding unrelated features. A new explicit user request can change
them; update the documentation alongside that change.

## Preserve the current interface

- `index.html` top navigation contains **Today's Journey**, **Goals** and **Statistics**, in that order. Do not
  restore a **Skills** navigation tab. Skills remain in the dashboard sidebar;
  clicking a Skill opens `skill.html?id=...`.
- The notification bell is a working reminder panel on both Goal pages. Preserve its
  pending count, Mark done/Skip actions and keyboard dismissal. Do not add inactive
  settings buttons or other placeholder controls.
- Every Goal, both on the dashboard and in the Skill detail tree, has one **…**
  actions trigger. Its menu contains **Edit** and **Delete**. Reuse
  `createGoalActionsMenu()` and `GOAL_MENU_ITEMS` in `app.js`; do not replace the tree
  menu with permanently visible Edit/Delete buttons. Skill rows use this shared menu mechanism with Skill-specific Edit/Delete handlers;
  do not restore permanent action buttons or hover-only controls.
- The Statistics **Life Areas** dialog has no **+ Create a Skill** button. It assigns
  existing Skills. Skill creation remains in the dashboard's Skills panel. Do not
  restore `createStatisticsSkill` or the removed `addSkill` view callback.
- The profile-card avatar is a real upload control, not a decorative placeholder. It shows
  a **+** inside the ring until a photo is set and opens the shared actions menu with
  **Load a photo** and **Delete photo**; Delete stays disabled while there is no photo. Do
  not restore the old `.avatar-head`/`.avatar-body` CSS silhouette.
- Statistics contains exactly Weekly Activity, Top Skill Progression and Life Areas,
  sharing one Monday–Sunday week selection with future weeks disabled. Do not add
  other analytics modules as part of an unrelated feature.
- The compact weekly summary shows only Goals completed and XP earned, never Active
  Skills. Top Skill Progression has no Skill icons. Life Area count and names come
  from user data; the six-Area reference image is an example, not a fixed preset.
- Preserve chart-only entry/week-change animations, reduced-motion support and the
  distinction between untracked history and tracked weeks with zero activity.

## Preserve data behavior

- Every Goal must reference an existing Skill. Step/Quest/Arc are roles, while
  recurrence is independent and allowed only for Step and Quest. Optional `schedule`
  supports daily/weekly/custom days; retain `repeatsDaily` as the daily compatibility
  flag. Arcs remain non-repeating.
- Manual undo reverses the recorded reward and Skill. Daily Goals reset at the next
  local day; weekly/custom Goals reset on their next selected day. Reset clears only
  checked state and active completion linkage, preserving XP/history. One-time Goals
  never reset. Reminder completion records the actual completion day; completing an
  early reminder for tomorrow must survive tonight's midnight reset.
- Preserve stored Goals, Skills, XP, completion history and Life Areas. Keep the
  `neonGoalTracker.v1` storage key and migrate existing data; never reset it to make
  a new feature work. Do not invent pre-tracking historical XP.
- Life Areas are user-created and require at least one existing Skill at creation.
  Skills have at most one `lifeAreaId` and may be uncategorized. Uncategorized XP
  counts in Skill statistics, but never in Life Area percentages or an "Other" Area.
- Historical Life Area calculations use current Skill assignments. Weekly
  aggregates are calculated from facts, not stored as independent totals.
- `profile.photo` is a centre-cropped 256x256 JPEG data URL that travels with the ordinary
  state write; do not add a second upload path or a Firebase Storage dependency. Keep the
  size cap (Firestore rejects documents over 1 MiB) and read it through `readProfilePhoto()`
  so documents without the field still work. Never put the data URL into `innerHTML`.

## Implementation and verification

- This is a vanilla HTML/CSS/JS frontend. `app.js` owns application state and CRUD;
  `statistics-model.js` owns date/aggregation/Area logic; `statistics.js` owns the
  Statistics UI. `schedule-model.js` owns local schedule validation/calculations;
  `reminders.js` owns the reminder panel, timer and optional browser notifications.
  Both `index.html` and `skill.html` load the shared scripts.
- Inspect the current working tree before editing. Older commits, screenshots and
  illustrative documentation snippets may predate accepted changes. Do not rebuild
  entire files from an old version or discard unrelated uncommitted changes.
- Check both Goal render paths (`renderGoals()` and `renderGoalTreeNode()`) when
  changing Goal interactions. Keep accessible menu behavior and delete confirmation.
- Run checks appropriate to the change; commands are listed in `CRUD.md` under
  "Verification". Browser tests use isolated fixture data and omit Firebase.
- Keep script/style cache-version references consistent across pages when changing
  shared assets. Keep `CRUD.md` and `README.md` consistent with intentional product
  changes. The proposed REST backend in CRUD documentation is hypothetical, not an
  instruction to replace the current persistence layer.

- Goal columns retain structural accent borders; inner cards use softer surfaces.
  Step/Quest/Arc differ subtly in padding and title size. Completed cards are quieter
  without dimming active child Goals. XP is secondary and Skill/parent metadata uses
  compact wrapping tags. Skills use two aligned progress columns on wide screens and one on screens up to 720px.

## Schedule and reminder contract

- One-time is the form default. Weekly/custom require at least one weekday (1=Mon,
  7=Sun). Time is an optional local `HH:MM` string; untimed schedules show Any time.
  Step/Quest One-time Goals also show optional Time and support reminders when time
  is set. A checked one-time reminder with no time blocks saving. Removing time
  requires turning the reminder off; saving clears its settings. Cancel never writes
  draft values. Arcs have no time or reminders.
- One-time times apply to the local date on which time is assigned/changed, stored
  in optional state.oneTimeSchedules without changing the Goal schedule shape.
  Ordinary edits preserve that date. Past times configured after their deadline
  appear as Missed in-app without a system notification. Completed one-time Goals
  never reset or remind again; Skip dismisses their sole occurrence.
- Migrate legacy `repeatsDaily: true` Goals with no schedule to `{ type: "daily" }`
  and `{ enabled: false, offset: "0m" }`, after legacy type migration. Preserve all
  facts and edit timestamps. Invalid optional scheduling data uses legacy behavior.
- Keep only the latest due reminder per Goal, including Missed occurrences. Skip
  dismisses one occurrence without XP. Mark done reuses normal completion and undo.
  Occurrence receipts are optional state data; browser delivery receipts are a small
  device-local cache. Do not manufacture completion history for missed occurrences.
- Check while open every 60 seconds and on resume; no service workers or push.
  Browser permission is requested only when the user enables Send notification.
  Denial, unavailable APIs and notification failures must leave in-app reminders usable.
