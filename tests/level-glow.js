// Run from front/: gjs tests/level-glow.js (or node tests/level-glow.js).
const source = typeof require === 'function'
  ? require('fs').readFileSync('app.js', 'utf8')
  : new TextDecoder().decode(imports.gi.GLib.file_get_contents('app.js')[1]);
const level = eval(source.slice(source.indexOf('function getLevelInfo('),
  source.indexOf('// Player XP is the sum')) + '\ngetLevelInfo;');
let now = 0, nextId = 0;
const timers = new Map();
const setTimeout = (fn, delay) => { timers.set(++nextId, { fn, at: now + delay }); return nextId; };
const clearTimeout = id => timers.delete(id);
function advance(ms) {
  const end = now + ms;
  while (true) {
    const entry = [...timers].sort((a,b) => a[1].at-b[1].at)[0];
    if (!entry || entry[1].at > end) break;
    now = entry[1].at; timers.delete(entry[0]); entry[1].fn();
  }
  now = end;
}
const media = { matches: false, addEventListener: (_, fn) => { media.change = fn; } };
const window = { matchMedia: () => media };
const getMotionMs = name => ({ bar: 700, sweep: 380, burst: 560 })[name];
const motion = eval(source.slice(source.indexOf('const fillFeedback ='),
  source.indexOf('// One click can produce several events:')) + '\n({ updateLevelGlow, animateFill, fillFeedback });');
function assert(ok, message) { if (!ok) throw new Error(message); }
function bar() {
  const classes = new Set();
  return { style: {}, offsetWidth: 100, isConnected: true, classes, classList: {
    toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
    add: (...names) => names.forEach(name => classes.add(name)),
    remove: (...names) => names.forEach(name => classes.delete(name)),
  } };
}
for (const initial of [0, 75, 89.99, 90, 99.99]) {
  const fill = bar(); motion.updateLevelGlow(fill, initial);
  assert(fill.classes.has('is-near-level') === (initial >= 90), 'Initial threshold');
}
// Profile and Skill independently follow fill -> gold sweep -> pulse.
const player = bar(), skill = bar();
for (const fill of [player, skill]) motion.animateFill(fill, 80, 90, { awarded: true });
assert(!player.classes.has('is-near-level') && !skill.classes.has('is-xp-sweep'), 'No early pulse/sweep');
advance(699); assert(!player.classes.has('is-xp-sweep'), 'Wait for width');
advance(1);
assert(player.classes.has('is-xp-sweep') && skill.classes.has('is-xp-sweep'), 'Gold sweep on both');
advance(380);
assert(player.classes.has('is-near-level') && !player.classes.has('is-xp-sweep'), 'Pulse after sweep');
assert(skill.classes.has('is-near-level'), 'Skill pulse independent');
// Real XP threshold rollover: finish old level, celebrate, fill remainder.
motion.animateFill(player, level(99).progress, level(110).progress, { awarded: true, levelUp: true });
assert(player.style.width === '100%', 'Fill old level first');
advance(700); assert(player.classes.has('is-xp-sweep'), 'Sweep full old level');
advance(380); assert(player.classes.has('is-level-up'), 'Burst after sweep');
advance(560); assert(player.style.width === `${level(110).progress}%`, 'New-level remainder');
assert(!player.classes.has('is-level-up'), 'Burst ends');
advance(700); assert(!player.classes.has('is-near-level'), 'Rollover clears pulse');
// Undo supersedes pending reward and never celebrates.
motion.animateFill(player, 80, 95, { awarded: true });
advance(100); motion.animateFill(player, 82, 70);
advance(3000);
assert(player.style.width === '70%' && !player.classes.has('is-near-level'), 'Undo wins');
assert(!player.classes.has('is-xp-sweep'), 'No delayed reward sweep');
// Rapid rewards leave only the newest sequence; detached rows release their timer.
motion.animateFill(player, 70, 85, { awarded: true });
advance(200); motion.animateFill(player, 75, 92, { awarded: true });
advance(1080); assert(player.classes.has('is-near-level'), 'Newest reward wins');
motion.animateFill(skill, 10, 30, { awarded: true });
skill.isConnected = false; advance(700);
assert(!motion.fillFeedback.has(skill), 'Detached row released');
// Rendering new state cancels old feedback.
motion.animateFill(player, 92, 96, { awarded: true });
player.style.width = '20%'; motion.updateLevelGlow(player, 20); advance(2000);
assert(player.style.width === '20%', 'Render cannot be overwritten by stale timer');
// Reduced motion, including changing the preference during a level burst.
motion.animateFill(player, 95, 20, { awarded: true, levelUp: true });
advance(1080); media.matches = true; media.change({ matches: true });
assert(player.style.width === '20%' && !player.classes.has('is-level-up'), 'Preference settles active job');
motion.animateFill(player, 20, 90, { awarded: true });
assert(player.style.width === '90%' && player.classes.has('is-near-level'), 'Reduced motion settles immediately');
assert(timers.size === 0 && motion.fillFeedback.size === 0, 'No pending jobs');
motion.animateFill(null, 0, 90);
console.log('PASS: XP sequence, 90% threshold, rollover, undo, rapid rewards, render cancellation and reduced motion.');
