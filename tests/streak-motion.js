// Run with: gjs tests/streak-motion.js (or node tests/streak-motion.js).
const source = typeof require === 'function'
  ? require('fs').readFileSync('app.js', 'utf8')
  : new TextDecoder().decode(imports.gi.GLib.file_get_contents('app.js')[1]);
function assert(ok, message) { if (!ok) throw new Error(message); }
let timers = new Map(), nextTimer = 0;
const setTimeout = (callback) => { timers.set(++nextTimer, callback); return nextTimer; };
const clearTimeout = (id) => timers.delete(id);
function flush() { for (const callback of [...timers.values()]) callback(); }
class Element {
  constructor() {
    this.children = []; this.dataset = {}; this.textContent = ''; this.attrs = {};
    this.classes = new Set();
    this.classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
    this.style = { setProperty() {}, removeProperty() {} };
  }
  append(...children) { this.children.push(...children); }
  querySelector(selector) { return this.children.find(child => '.' + child.className === selector) || null; }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; if (key === 'data-previous') delete this.dataset.previous; }
}
const document = { createElement: () => new Element() };
let media;
const window = { matchMedia: () => (media = { matches: false, addEventListener: (_, cb) => { media.change = cb; } }) };
const getComputedStyle = () => ({ getPropertyValue: () => 'url(old.svg)' });
const component = source.slice(source.indexOf('const STREAK_TIERS'), source.indexOf('\n\nconst streakBadge'));
// Evaluate the actual component with a small DOM and controllable timers.
const create = eval(component + '\ncreateStreakBadge;');
function setup(initial) {
  const host = new Element(); const badge = create(host); badge.render(initial);
  assert(host.dataset.motion === 'idle', 'Initial render must not celebrate');
  return { host, badge, value: host.children[0].querySelector('.streak-badge__value') };
}
const cases = [[0,0,'idle'],[0,1,'tier-up'],[1,2,'incrementing'],[2,3,'tier-up'],[4,5,'incrementing'],[5,6,'tier-up'],[12,13,'incrementing'],[13,14,'tier-up'],[14,15,'incrementing']];
for (const [from,to,expected] of cases) {
  const {host,badge,value} = setup(from); badge.render(to);
  assert(host.dataset.motion === expected, `${from} -> ${to}: wrong motion`);
  assert(value.textContent === `${to} ${to === 1 ? 'day' : 'days'}`, 'Wrong final label');
  badge.render(to);
  assert(host.dataset.motion === expected, 'Repeated render interrupted animation');
  flush(); assert(host.dataset.motion === 'idle', 'Animation did not settle');
}
for (const count of [0,1,3,6,14,100]) setup(count);
{
 const {host,badge,value} = setup(1);
 badge.render(2); badge.render(3);
 assert(timers.size === 1 && host.dataset.motion === 'tier-up', 'Overlapping celebrations');
 badge.render(0); flush();
 assert(host.dataset.motion === 'idle' && value.textContent === '0 days', 'Reset left stale effects');
 assert(host.classes.has('streak-badge--tier-0'), 'Reset tier incorrect');
 badge.render(14); media.matches = true; media.change();
 assert(host.dataset.motion === 'idle' && timers.size === 0, 'Live reduced motion did not cancel');
 badge.render(15);
 assert(host.dataset.motion === 'idle' && value.textContent === '15 days', 'Reduced motion must update instantly');
}
assert(create(null) === null, 'Missing host must be safe');
(typeof print === 'function' ? print : console.log)('PASS: 9 transitions, initial renders, repeated/rapid updates, reset, reduced motion, missing host');
