// Run with: gjs tests/goal-model.js (or node tests/goal-model.js).
const read = (name) =>
  typeof require === 'function'
    ? require('fs').readFileSync(name, 'utf8')
    : new TextDecoder().decode(imports.gi.GLib.file_get_contents(name)[1]);
function assert(ok, message) { if (!ok) throw new Error(message); }

const app = read('app.js');
const styles = read('styles.css');
const index = read('index.html');
const skillPage = read('skill.html');

// ===============================
// LOAD THE REAL MODEL
// ===============================

// app.js keeps the goal model in a marked, DOM-free block, so the app
// and this test run the exact same code.
const model = app.slice(
  app.indexOf('// <goal-model>'),
  app.indexOf('// </goal-model>') + '// </goal-model>'.length);
assert(model.length > 0, 'goal model block not found');
// Wrapped in a function so the block's own declarations live in the
// eval's scope instead of colliding with the names destructured below.
function loadModel() {
  return eval(read('statistics-model.js') + '\n' + model + '\n({ goalTypes, goalTypeOrder, goalTypeMeta, goalXpOptions, goalParentTypes,' +
    ' legacyGoalTypes, SCHEMA_VERSION, getGoalTypeMeta, isRepeatingGoal, canGoalRepeatDaily,' +
    ' isCompatibleParentType, resolveParentId, normalizeGoalParents, buildGoalPatch,' +
    ' migrateGoalType, migrateGoals, migrateState });');
}
const {
  goalTypes, goalTypeOrder, goalTypeMeta, goalXpOptions, goalParentTypes, legacyGoalTypes,
  SCHEMA_VERSION, getGoalTypeMeta, isRepeatingGoal, canGoalRepeatDaily,
  isCompatibleParentType, resolveParentId, normalizeGoalParents,
  buildGoalPatch, migrateGoalType, migrateGoals, migrateState,
} = loadModel();

// A small stand-in world: one skill with an Arc, a Quest under it and a
// Step under that, plus a Quest owned by a different skill.
const SKILL = 's-coding';
const world = () => [
  { id: 'arc', type: 'arc', skillId: SKILL, parentGoalId: '' },
  { id: 'quest', type: 'quest', skillId: SKILL, parentGoalId: 'arc' },
  { id: 'step', type: 'step', skillId: SKILL, parentGoalId: 'quest' },
  { id: 'other-skill', type: 'quest', skillId: 's-other', parentGoalId: '' },
];
const draft = (over) => ({
  type: 'step', repeatsDaily: false, skillId: SKILL, parentGoalId: '', ...over,
});

// ===============================
// THE THREE ROLES
// ===============================

assert(JSON.stringify(goalTypes) === '["step","quest","arc"]', 'goal types must be exactly Step/Quest/Arc');
assert(goalTypes.every((type) => !legacyGoalTypes[type]), 'a legacy type is still a current type');
assert(legacyGoalTypes.daily.type === 'step', 'Daily is gone as a type');
assert(Object.keys(goalTypeOrder).join() === 'step,quest,arc', 'the type order is Step, Quest, Arc');
assert(!('daily' in goalTypeOrder), 'Daily is gone from the type order');
assert(migrateGoalType({ type: 'daily' }).repeatsDaily === true, 'Daily migrates to a repeating Step');
assert(migrateGoalType({ type: 'arc', repeatsDaily: true }).repeatsDaily === false, 'an Arc never keeps a recurrence flag');
assert(migrateGoalType({ type: 'mystery' }).type === 'step', 'an unreadable type becomes a Step');
assert(resolveParentId(world(), { type: 'step', id: 'x', parentGoalId: 'arc', skillId: SKILL }) === 'arc', 'resolveParentId keeps a legal link');
assert(normalizeGoalParents(world()).length === 4, 'a legal hierarchy is left alone');
assert(JSON.stringify(normalizeGoalParents(world())) === JSON.stringify(world()), 'a legal hierarchy is unchanged, object for object');

assert(getGoalTypeMeta('step').hint === 'Concrete action', 'Step hint');
assert(getGoalTypeMeta('quest').hint === 'Meaningful outcome', 'Quest hint');
assert(getGoalTypeMeta('arc').hint === 'Larger direction', 'Arc hint');
assert(getGoalTypeMeta('nonsense').hint === 'Concrete action', 'unknown type must not throw');
assert(getGoalTypeMeta('step').label === 'STEP' && getGoalTypeMeta('arc').label === 'ARC', 'type labels');

// ===============================
// 13. DYNAMIC TITLE PLACEHOLDER
// ===============================

assert(goalTypeMeta.step.placeholder === 'A concrete action you can start now', 'Step placeholder');
assert(goalTypeMeta.quest.placeholder === "A meaningful outcome you're working toward", 'Quest placeholder');
assert(goalTypeMeta.arc.placeholder === 'A larger direction that can contain multiple quests', 'Arc placeholder');
// The placeholder text has to be unique per type, otherwise switching
// type would leave the guidance unchanged.
assert(new Set(Object.values(goalTypeMeta).map((meta) => meta.placeholder)).size === 3, 'placeholders must differ per type');
// The markup starts on the Step placeholder, so the field is never
// empty before JS runs.
assert(index.includes('placeholder="A concrete action you can start now"'), 'initial placeholder in markup');
assert(skillPage.includes('placeholder="A concrete action you can start now"'), 'initial placeholder in markup (skill page)');

// ===============================
// 7, 8, 9. REPEAT DAILY
// ===============================

assert(canGoalRepeatDaily('step') && canGoalRepeatDaily('quest'), 'Step and Quest may repeat');
assert(!canGoalRepeatDaily('arc'), 'Arc must not repeat');
assert(buildGoalPatch(draft({ type: 'step', repeatsDaily: true }), world()).repeatsDaily === true, 'daily Step');
assert(buildGoalPatch(draft({ type: 'quest', repeatsDaily: true }), world()).repeatsDaily === true, 'daily Quest');
assert(buildGoalPatch(draft({ type: 'arc', repeatsDaily: true }), world()).repeatsDaily === false, '9: Arc cannot repeat daily');
assert(buildGoalPatch(draft({ type: 'arc' }), world()).repeatsDaily === false, 'Arc never repeats');
assert(isRepeatingGoal({ repeatsDaily: true }) && !isRepeatingGoal({ repeatsDaily: false }), 'recurrence predicate');
assert(!isRepeatingGoal(null), 'recurrence predicate is null safe');
assert(!canGoalRepeatDaily('nonsense'), 'an unknown type must not be allowed to repeat');

// ===============================
// 1-6, 10, 12. PARENT COMPATIBILITY
// ===============================

assert(goalParentTypes.arc.length === 0, 'Arc cannot have a parent');
assert(JSON.stringify(goalParentTypes.quest) === '["arc"]', 'Quest belongs to an Arc');
assert(JSON.stringify(goalParentTypes.step) === '["quest","arc"]', 'Step belongs to a Quest or an Arc');
assert(isCompatibleParentType('step', 'quest') && isCompatibleParentType('step', 'arc'), 'Step parents');
assert(!isCompatibleParentType('step', 'step') && !isCompatibleParentType('quest', 'quest'), 'same-type parents are illegal');
assert(!isCompatibleParentType('quest', 'step') && !isCompatibleParentType('arc', 'arc'), 'no downward parents');

const parentOf = (over) => buildGoalPatch(draft(over), world()).parentGoalId;

assert(parentOf({ type: 'step', parentGoalId: '' }) === '', '1: standalone Step');
assert(parentOf({ type: 'step', parentGoalId: 'quest' }) === 'quest', '2: Step in a Quest');
assert(parentOf({ type: 'step', parentGoalId: 'arc' }) === 'arc', '3: Step directly in an Arc');
assert(parentOf({ type: 'quest', parentGoalId: '' }) === '', '4: standalone Quest');
assert(parentOf({ type: 'quest', parentGoalId: 'arc' }) === 'arc', '5: Quest in an Arc');
assert(parentOf({ type: 'arc', parentGoalId: 'quest' }) === '', '6: Arc has no parent');
assert(parentOf({ type: 'quest', parentGoalId: 'step' }) === '', 'a Quest cannot be part of a Step');
assert(parentOf({ type: 'step', parentGoalId: 'other-skill' }) === '', 'parents come from the same skill');
assert(parentOf({ type: 'step', parentGoalId: 'ghost' }) === '', 'a missing parent is dropped');
assert(parentOf({ type: 'step', id: 'quest', parentGoalId: 'quest' }) === '', 'a goal cannot be part of itself');
assert(parentOf({ type: 'step', skillId: '', parentGoalId: 'quest' }) === '', 'a goal without a skill has no parent');
// 10: editing a Step (nested in a Quest) into a Quest cannot keep it,
// because a Quest may only sit under an Arc.
assert(parentOf({ type: 'quest', id: 'step', parentGoalId: 'quest' }) === '', '10: Step -> Quest clears the Quest parent');
// 11: editing a Quest (nested in an Arc) into an Arc.
assert(parentOf({ type: 'arc', id: 'quest', parentGoalId: 'arc' }) === '', '11: Quest -> Arc clears the parent');
// 14: the patch only owns the type-dependent fields, so it can never
// carry (and therefore never erase) a title.
const patchKeys = Object.keys(buildGoalPatch(draft(), world())).sort();
assert(JSON.stringify(patchKeys) === '["parentGoalId","repeatsDaily","type"]', 'patch must not touch the title');

// Editing a Step that hangs off an Arc into a Quest keeps the parent:
// an Arc is still a legal parent for a Quest.
assert(parentOf({ type: 'quest', id: 'step2', parentGoalId: 'arc' }) === 'arc', 'Arc stays a legal parent across a type change');

// ===============================
// 15-18, 22. MIGRATION
// ===============================

const legacyGoals = [
  { id: 'g-short', title: 'Fix redirect bug', type: 'short', skillId: SKILL, parentGoalId: 'g-long', description: 'notes', xp: 50, completed: true, completedDay: '', createdAt: 'then' },
  { id: 'g-medium', title: 'Implement auth', type: 'medium', skillId: SKILL, parentGoalId: 'g-long', xp: 200, completed: false, createdAt: 'then' },
  { id: 'g-long', title: 'Build my app', type: 'long', skillId: SKILL, parentGoalId: '', xp: 1000, completed: false, createdAt: 'then' },
  { id: 'g-daily', title: 'Posture exercises', type: 'daily', skillId: SKILL, parentGoalId: '', description: 'Ten reps in the morning', xp: 10, completed: true, completedDay: '2026-09-27', createdAt: 'then' },
  // Data the old form could produce but the new model cannot hold.
  { id: 'g-nested-long', title: 'Second arc', type: 'long', skillId: SKILL, parentGoalId: 'g-long' },
  { id: 'g-step-in-step', title: 'Sub step', type: 'short', skillId: SKILL, parentGoalId: 'g-short' },
  { id: 'g-medium-in-short', title: 'Odd link', type: 'medium', skillId: SKILL, parentGoalId: 'g-short' },
  { id: 'g-ghost', title: 'Orphan', type: 'medium', skillId: SKILL, parentGoalId: 'g-gone' },
  { id: 'g-loop-a', title: 'Loop A', type: 'long', skillId: SKILL, parentGoalId: 'g-loop-b' },
  { id: 'g-loop-b', title: 'Loop B', type: 'long', skillId: SKILL, parentGoalId: 'g-loop-a' },
];
const migrated = migrateGoals(legacyGoals);
const byId = new Map(migrated.map((goal) => [goal.id, goal]));

assert(migrated.length === legacyGoals.length, '12: migration must never delete a goal');
assert(byId.get('g-short').type === 'step' && byId.get('g-short').repeatsDaily === false, '15: Short -> Step');
assert(byId.get('g-medium').type === 'quest' && byId.get('g-medium').repeatsDaily === false, '16: Medium -> Quest');
assert(byId.get('g-long').type === 'arc' && byId.get('g-long').repeatsDaily === false, '17: Long -> Arc');
assert(byId.get('g-daily').type === 'step' && byId.get('g-daily').repeatsDaily === true, '18: Daily -> repeating Step');
assert(isRepeatingGoal(byId.get('g-daily')), '18: an old Daily goal is still identifiable as repeating');

assert(byId.get('g-short').parentGoalId === 'g-long', 'a legal old link survives (Step under Arc)');
assert(byId.get('g-medium').parentGoalId === 'g-long', 'a legal old link survives (Quest under Arc)');
assert(byId.get('g-nested-long').parentGoalId === '', '12: Arc under Arc is cleared, not deleted');
assert(byId.get('g-step-in-step').parentGoalId === '', '12: Step under Step is cleared');
assert(byId.get('g-medium-in-short').parentGoalId === '', '12: Quest under Step is cleared');
assert(byId.get('g-ghost').parentGoalId === '', '12: a dangling parent is cleared');
assert(byId.get('g-loop-a').parentGoalId === '' && byId.get('g-loop-b').parentGoalId === '', 'a cycle cannot survive');
assert(migrated.every((goal) => goal.type !== 'daily'), 'no goal keeps a legacy type');
assert(migrated.every((goal) => typeof goal.repeatsDaily === 'boolean'), 'every goal gets a boolean recurrence');
assert(migrated.filter((g) => g.type === 'arc').every((g) => g.repeatsDaily === false), 'no Arc repeats after migration');

const old = byId.get('g-daily');
assert(old.title === 'Posture exercises' && old.description === 'Ten reps in the morning', 'title and description preserved');
assert(old.skillId === SKILL, 'skill relationship preserved');
assert(old.completed === true && old.completedDay === '2026-09-27', 'completion data preserved');
assert(old.xp === 10 && byId.get('g-long').xp === 1000, 'XP data preserved');
assert(old.createdAt === 'then', 'createdAt preserved');

// A new-format document is left alone, so reloading (or signing in on a
// second device) never migrates twice.
const twice = migrateGoals(migrated);
assert(JSON.stringify(twice) === JSON.stringify(migrated), '22: migration must be idempotent');
// 22: a refresh round-trips through JSON exactly like localStorage does.
const stored = JSON.stringify(migrateState({ goals: legacyGoals, updatedAt: 1 }));
const reloaded = migrateState(JSON.parse(stored));
assert(JSON.stringify(reloaded) === stored, '22: a reloaded document is byte for byte the same');
assert(reloaded.goals.find((goal) => goal.id === 'g-daily').repeatsDaily === true, '22: recurrence survives a refresh');
assert(reloaded.updatedAt === 1, '22: migration must not touch updatedAt (cloud last-write-wins)');
const mixed = migrateGoals([{ id: 'n', type: 'step', repeatsDaily: true }, { id: 'o', type: 'step' }]);
assert(mixed[0].repeatsDaily === true && mixed[1].repeatsDaily === false, 'an unknown flag is not invented');

const state = migrateState({ profile: { name: 'User User' }, goals: legacyGoals, skills: [], updatedAt: 7 });
assert(state.schemaVersion === SCHEMA_VERSION, 'the schema version is stamped');
assert(state.profile.name === 'User User' && state.updatedAt === 7, 'the rest of the document is untouched');
assert(state.goals.length === legacyGoals.length, 'goals survive a state migration');
assert(migrateGoals([]).length === 0, 'an empty list is fine');
assert(migrateState({}).goals.length === 0, 'a document without goals is fine');

// ===============================
// XP REWARDS ARE THE OLD ONES
// ===============================

assert(JSON.stringify(goalXpOptions.step) === '[10,15,30,50,100,125]', 'Step keeps the Daily and Short rewards');
assert(JSON.stringify(goalXpOptions.quest) === '[200,350,500]', 'Quest keeps the Medium rewards');
assert(JSON.stringify(goalXpOptions.arc) === '[1000,2000,5000]', 'Arc keeps the Long rewards');
// Every reward the four old types offered is still offered, and only those.
const legacyRewards = [10, 15, 30, 50, 100, 125, 200, 350, 500, 1000, 2000, 5000];
const rewards = goalXpOptions.step.concat(goalXpOptions.quest, goalXpOptions.arc);
assert(JSON.stringify(rewards.slice().sort((a, b) => a - b)) === JSON.stringify(legacyRewards), 'no reward value was invented or lost');

// ===============================
// 19, 20, 21. XP, COMPLETION, STREAK
// ===============================

// These three read the goal, never its type, so the new model cannot
// change how they behave. Asserted on the source, because the reward
// path is DOM-driven.
function section(source, start, end) {
  const from = source.indexOf(start);
  assert(from !== -1, 'missing section: ' + start);
  const to = source.indexOf(end, from);
  return source.slice(from, to === -1 ? source.length : to);
}
const completion = section(app, 'function toggleGoalCompletion(', '\n// UPDATE');
assert(!/goal\.type|"daily"|"short"|"medium"|"long"|repeatsDaily/.test(completion), '19, 20: completion and XP must not depend on the goal type');
const streak = section(app, 'function bumpStreak(', 'function checkStreakExpiry');
assert(!/goal\.type|repeatsDaily|"daily"/.test(streak), '21: streak rules must not depend on the goal type');
const chip = section(app, 'function getGoalStateLabel', 'function renderGoalRepeat');
assert(chip.includes('isRepeatingGoal'), 'the "Done today" chip follows recurrence');
const tree = section(app, 'function renderGoalTree', '\n\n// ====');
assert(tree.includes('goalTypeOrder'), 'the goal tree still orders by type');

// ===============================
// 14. A TYPE CHANGE NEVER ERASES THE TITLE
// ===============================

const typeChange = section(app, 'function handleGoalTypeChange', 'els.goalType.addEventListener');
const sync = section(app, 'function syncGoalTypeUI', 'function syncGoalScheduleUI');
assert(!typeChange.includes('goalTitle.value') && !typeChange.includes('goalForm'), 'changing type must not touch the title input');
assert(!sync.includes('goalTitle.value'), 'syncing the type must only set the placeholder');
assert(sync.includes('els.goalTitle.placeholder ='), 'syncing the type sets the placeholder');
assert(sync.includes('goalRepeatField.hidden') && sync.includes('goalParentField.hidden'), 'Arc hides both type-dependent fields');
assert(sync.includes('els.goalRepeat.checked = false'), 'switching to Arc clears recurrence');

// ===============================
// 6, 9, 11. THE FORM ACTUALLY REFLECTS THE RULES
// ===============================

for (const page of [['dashboard', index], ['skill page', skillPage]]) {
  const [name, html] = page;
  const form = section(html, '<label>\n        Title', '</dialog>');
  assert(form.includes('<option value="step">Step</option>'), name + ': Step in the type selector');
  assert(form.includes('<option value="quest">Quest</option>'), name + ': Quest in the type selector');
  assert(form.includes('<option value="arc">Arc</option>'), name + ': Arc in the type selector');
  const roleSelect = section(form, '<select id="goalType"', '</select>');
  assert(!/>Daily</.test(roleSelect), name + ': Daily is not a goal type');
  assert(!/value="daily"|value="short"|value="medium"|value="long"/.test(roleSelect), name + ': no legacy type values');
  assert(form.includes('id="goalRepeat"') && form.includes('Repeating'), name + ': a repeating schedule control exists');
  assert(form.includes('id="goalRepeatField"'), name + ': the recurrence control can be hidden');
  assert(form.includes('id="goalParentField"'), name + ': the parent field can be hidden');
  assert(form.includes('Part of'), name + ': the field is called "Part of"');
  assert(!form.includes('Parent goal'), name + ': the old "Parent goal" label is gone');
  assert(form.includes('<option value="">None</option>'), name + ': no parent is always available');
  assert(form.includes('id="goalTypeHint"'), name + ': the compact type hint exists');
}
assert(index.includes('goal-repeat-badge'), 'the card template carries a recurrence badge');

// Both pages share one goal form, so a change to one has to reach the
// other; drift here is the classic way the two pages diverge.
function goalModal(html) { return section(html, '<dialog class="modal" id="goalModal">', '</dialog>'); }
assert(goalModal(index) === goalModal(skillPage), 'the goal form must be identical on both pages');

// ===============================
// 6, 15-18, 23, 24, 25. THE BOARD
// ===============================

for (const type of goalTypes) {
  assert(index.includes(`<article class="goal-column ${type}" data-type="${type}">`), 'a column for ' + type);
  assert(index.includes(`data-count="${type}"`) && index.includes(`data-list="${type}"`), 'a list and counter for ' + type);
  assert(index.includes(`data-add-goal="${type}"`), 'an add button for ' + type);
}
for (const legacy of ['daily', 'short', 'medium', 'long']) {
  assert(!index.includes(`data-type="${legacy}"`) && !index.includes(`data-list="${legacy}"`), 'no ' + legacy + ' column');
  assert(!new RegExp(`\\.goal-column\\.${legacy}\\b`).test(styles), 'no ' + legacy + ' column style');
  assert(!new RegExp(`\\.goal-tree-item\\.${legacy}\\b`).test(styles), 'no ' + legacy + ' tree style');
}
assert(index.includes('<h2>STEPS</h2>') && index.includes('<h2>QUESTS</h2>') && index.includes('<h2>ARCS</h2>'), 'three columns, named');
assert((index.match(/<article class="goal-column/g) || []).length === 3, 'exactly three columns');
assert((index.match(/<h2>DAILY<\/h2>/g) || []).length === 0, 'no DAILY column');

const board = section(styles, '.goal-board {', '\n}');
assert(/grid-template-columns: repeat\(3,/.test(board), '23: three columns at full width');
assert(/@media \(max-width: 1180px\)[\s\S]*?\.goal-board \{[\s\S]*?repeat\(2,/.test(styles), '23: two columns on narrow screens');
assert(/@media \(max-width: 720px\)[\s\S]*?\.goal-board \{[\s\S]*?grid-template-columns: 1fr/.test(styles), '23: one column on a phone');

const token = (name) => (styles.match(new RegExp('--' + name + ':\\s*([^;]+);')) || [])[1];
assert(token('goal-step') === '#27d9d0', '24: Step is cyan/teal');
assert(token('goal-quest') === '#7c6cff', '24: Quest is electric violet');
assert(token('goal-arc') === 'var(--orange)', '24: Arc reuses the existing amber token');
for (const type of goalTypes) {
  assert(styles.includes(`.goal-column.${type} { color: var(--goal-${type}); }`), '24: the ' + type + ' column uses its accent');
  assert(styles.includes(`.goal-tree-item.${type} { color: var(--goal-${type}); }`), '24: the ' + type + ' tree item uses its accent');
  assert(styles.includes(`--goal-${type}:`), '24: ' + type + ' has a token');
}
// 25: destructive red stays red, and is not what an Arc is drawn in.
assert(token('red') === '#ff4f4f', 'destructive red still has its own token');
assert(token('goal-arc') !== token('red'), '25: Arc is not red');
assert(/--goal-arc: var\(--orange\)/.test(styles) && token('orange') === '#ffae16', '25: Arc is amber/gold, not red');
assert(/\.goal-menu-item--danger \{[\s\S]*?255, 79, 79/.test(styles), '25: the Delete row is still red');
assert(/\.mini-btn\.danger \{[\s\S]*?255, 79, 79/.test(styles), '25: the danger button is still red');
assert(/#ff9898/.test(styles), '25: destructive text is still red-tinted');
assert(token('goal-arc') !== '#ff4f4f' && token('goal-quest') !== '#ff4f4f' && token('goal-step') !== '#ff4f4f', '25: no goal type borrows the destructive red');
assert(token('yellow') !== undefined, 'the warning yellow token is untouched, just unused by goal types');
// The recurrence badge is quiet, and never wears a type accent.
const badge = section(styles, '.goal-repeat-badge {', '\n}');
assert(/\.goal-repeat-badge\[hidden\]/.test(styles), 'the badge can be hidden');
assert(!/var\(--goal-/.test(badge), 'the badge must not compete with the type accents');
assert(/font-size: 10px/.test(badge) && /text-transform: uppercase/.test(badge), 'the badge is small and compact');
assert(styles.includes('::placeholder') && /#6d8496/.test(styles), 'placeholders keep the muted styling');

(typeof print === 'function' ? print : console.log)('PASS: 3 roles + placeholders, recurrence rules, parent compatibility, migration (v1 data, cycles, idempotency), preserved XP/completion/streak paths, 3-column board, accent tokens, destructive red');
