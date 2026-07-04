/*
 * LESSON 14 — Promise combinators & thenables: the ordering fine print
 * ────────────────────────────────────────────────────────────────────
 * Promise.all / race / any / allSettled questions are interview staples
 * because their edge cases reveal whether you know what a promise IS:
 * completion order vs result order, fail-fast vs keep-going, and the
 * hidden microtask cost of "thenable" unwrapping.
 *
 * Run:   node lessons/14-promise-combinators.js <exercise>
 * Answers & why: notes/14-promise-combinators.md
 */

/* ═══════ EXERCISE 1 — Promise.all: completion order vs result order ═══════
 * slow (30ms) is first in the array, fast (10ms) second.
 * Predict all three lines — especially the ORDER inside the results array.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex1() {
  const slow = new Promise((r) =>
    setTimeout(() => { console.log('slow finished (30ms)'); r('slow'); }, 30));
  const fast = new Promise((r) =>
    setTimeout(() => { console.log('fast finished (10ms)'); r('fast'); }, 10));

  Promise.all([slow, fast]).then((results) =>
    console.log('results:', JSON.stringify(results)));
}

/* ═══════ EXERCISE 2 — Promise.all fails fast... but nothing is cancelled ═══════
 * `bad` rejects at 10ms; `ok` succeeds at 20ms. Predict every line —
 * including whether "ok still ran" appears at all.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex2() {
  const ok = new Promise((r) =>
    setTimeout(() => { console.log('ok still ran (20ms)'); r('ok'); }, 20));
  const bad = new Promise((_, reject) =>
    setTimeout(() => { console.log('bad rejecting (10ms)'); reject(new Error('bad')); }, 10));

  Promise.all([ok, bad])
    .then(() => console.log('then: never?'))
    .catch((e) => console.log('all rejected with:', e.message));
}

/* ═══════ EXERCISE 3 — race vs any: same contestants, different winners ═══════
 * A rejection at 10ms races a fulfillment at 20ms.
 * Predict what race() settles to, what any() settles to, and the order.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex3() {
  const fulfillLater = () => new Promise((r) =>
    setTimeout(() => r('fulfilled at 20ms'), 20));
  const rejectSooner = () => new Promise((_, rj) =>
    setTimeout(() => rj(new Error('rejected at 10ms')), 10));

  Promise.race([fulfillLater(), rejectSooner()])
    .then((v) => console.log('race → then:', v))
    .catch((e) => console.log('race → catch:', e.message));

  Promise.any([fulfillLater(), rejectSooner()])
    .then((v) => console.log('any  → then:', v))
    .catch((e) => console.log('any  → catch:', e.message));
}

/* ═══════ EXERCISE 4 — thenables: duck-typed promises pay a toll ═══════
 * A "thenable" is any object with a .then method — await accepts them.
 * But native promises ride the fast path; thenables don't.
 * The hop ladder is your metronome. Predict the full order.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex4() {
  const thenable = { then(resolve) { console.log('thenable.then invoked'); resolve('T'); } };

  (async () => { await Promise.resolve('N'); console.log('await native done'); })();
  (async () => { await thenable;             console.log('await thenable done'); })();

  Promise.resolve()
    .then(() => console.log('hop 1'))
    .then(() => console.log('hop 2'))
    .then(() => console.log('hop 3'));
}

/* ═══════ EXERCISE 5 — returning a promise from .then costs extra hops ═══════
 * Chain A's first .then returns a promise; chain B is a plain 4-rung
 * ladder. Predict exactly where A2 lands among B1–B4.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex5() {
  Promise.resolve()
    .then(() => { console.log('A1 (returns a promise)'); return Promise.resolve('x'); })
    .then(() => console.log('A2 (after unwrapping it)'));

  Promise.resolve()
    .then(() => console.log('B1'))
    .then(() => console.log('B2'))
    .then(() => console.log('B3'))
    .then(() => console.log('B4'));
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['Promise.all: completion order vs result order', ex1],
  2: ['Promise.all fails fast... but nothing is cancelled', ex2],
  3: ['race vs any: same contestants, different winners', ex3],
  4: ['thenables: duck-typed promises pay a toll', ex4],
  5: ['returning a promise from .then costs extra hops', ex5],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/14-promise-combinators.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/14-promise-combinators.md
