/*
 * LESSON 3 — Microtasks: the queue that always cuts in line
 * ──────────────────────────────────────────────────────────
 * There are (at least) two queues. Tasks ("macrotasks": timers, I/O,
 * setImmediate) get ONE turn each. Microtasks (promise callbacks,
 * queueMicrotask) get drained COMPLETELY — the whole queue, including
 * anything added while draining — every time the stack empties.
 *
 * This one rule explains most async ordering puzzles you'll ever see.
 *
 * Run:   node lessons/03-microtasks.js <exercise>
 * Answers & why: notes/03-microtasks.md
 */

/* ═══════════════ EXERCISE 1 — the classic ═══════════════
 * If you've seen one event-loop interview question, it's this one.
 *
 * YOUR PREDICTION (order of 4 lines):
 *
 */
function ex1() {
  console.log('start');

  setTimeout(() => console.log('timeout'), 0);

  Promise.resolve().then(() => console.log('promise'));

  console.log('end');
}

/* ═══════════════ EXERCISE 2 — chains hop, they don't sprint ═══════════════
 * Two promise chains, built at the same time. Does chain A finish
 * completely before chain B starts, or do they interleave?
 *
 * YOUR PREDICTION (order of 6 lines):
 *
 *
 */
function ex2() {
  Promise.resolve()
    .then(() => console.log('A1'))
    .then(() => console.log('A2'))
    .then(() => console.log('A3'));

  Promise.resolve()
    .then(() => console.log('B1'))
    .then(() => console.log('B2'))
    .then(() => console.log('B3'));
}

/* ═══════════════ EXERCISE 3 — queueMicrotask vs .then ═══════════════
 * queueMicrotask is the "raw" way into the same queue promises use.
 * Predict the order of the 4 microtask lines.
 *
 * YOUR PREDICTION:
 *
 */
function ex3() {
  Promise.resolve().then(() => console.log('then #1'));
  queueMicrotask(() => console.log('queueMicrotask #1'));
  Promise.resolve().then(() => console.log('then #2'));
  queueMicrotask(() => console.log('queueMicrotask #2'));
  console.log('sync');
}

/* ═══════ EXERCISE 4 — the queue drains COMPLETELY (recursion test) ═══════
 * A microtask that schedules another microtask, 5 deep, racing a timer.
 * Does the timer sneak in between microtask 2 and 3? At the end?
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex4() {
  setTimeout(() => console.log('timeout — did I beat any microtasks?'), 0);

  let depth = 0;
  function again() {
    depth++;
    console.log(`microtask depth ${depth}`);
    if (depth < 5) queueMicrotask(again);
  }
  queueMicrotask(again);
}

/* ═══════ EXERCISE 5 — microtasks drain BETWEEN tasks too ═══════
 * Two timers. The first one schedules a microtask. Does that microtask
 * run before or after the second timer?
 *
 * YOUR PREDICTION (order of 3 lines):
 *
 */
function ex5() {
  setTimeout(() => {
    console.log('timer 1');
    queueMicrotask(() => console.log('microtask scheduled by timer 1'));
  }, 0);

  setTimeout(() => console.log('timer 2'), 0);
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['the classic (start/timeout/promise/end)', ex1],
  2: ['chains hop, they don\'t sprint', ex2],
  3: ['queueMicrotask vs .then', ex3],
  4: ['the queue drains completely (recursion test)', ex4],
  5: ['microtasks drain between tasks too', ex5],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/03-microtasks.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/03-microtasks.md
