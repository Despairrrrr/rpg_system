# Working on this frontend

Read this file and the "Current interface contract" section of `CRUD.md` before
changing the UI. These are accepted product decisions, not unfinished placeholders.
Preserve them when adding unrelated features. A new explicit user request can change
them; update the documentation alongside that change.

## Preserve the current interface

- `index.html` top navigation contains **Goals** and **Statistics** only. Do not
  restore a **Skills** navigation tab. Skills remain in the dashboard sidebar;
  clicking a Skill opens `skill.html?id=...`.
- Do not restore the notification or settings icon buttons. They were deliberately
  removed because they had no behavior. Do not add inactive placeholder controls.
- Every Goal, both on the dashboard and in the Skill detail tree, has one **…**
  actions trigger. Its menu contains **Edit** and **Delete**. Reuse
  `createGoalActionsMenu()` and `GOAL_MENU_ITEMS` in `app.js`; do not replace the tree
  menu with permanently visible Edit/Delete buttons. Skill rows use this shared menu mechanism with Skill-specific Edit/Delete handlers;
  do not restore permanent action buttons or hover-only controls.
- The Statistics **Life Areas** dialog has no **+ Create a Skill** button. It assigns
  existing Skills. Skill creation remains in the dashboard's Skills panel. Do not
  restore `createStatisticsSkill` or the removed `addSkill` view callback.
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
  `repeatsDaily` is independent and allowed only for Step and Quest.
- Manual undo reverses the recorded reward and Skill. Automatic local-day reset
  clears only repeating Goals' checked state and active completion link, preserving
  XP and completion history. Ordinary Goals do not reset daily.
- Preserve stored Goals, Skills, XP, completion history and Life Areas. Keep the
  `neonGoalTracker.v1` storage key and migrate existing data; never reset it to make
  a new feature work. Do not invent pre-tracking historical XP.
- Life Areas are user-created and require at least one existing Skill at creation.
  Skills have at most one `lifeAreaId` and may be uncategorized. Uncategorized XP
  counts in Skill statistics, but never in Life Area percentages or an "Other" Area.
- Historical Life Area calculations use current Skill assignments. Weekly
  aggregates are calculated from facts, not stored as independent totals.

## Implementation and verification

- This is a vanilla HTML/CSS/JS frontend. `app.js` owns application state and CRUD;
  `statistics-model.js` owns date/aggregation/Area logic; `statistics.js` owns the
  Statistics UI. Both `index.html` and `skill.html` load the shared scripts.
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
