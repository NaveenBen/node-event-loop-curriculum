/*
 * LESSON 9 — Starvation: queues that never let go
 * ───────────────────────────────────────────────
 * Lesson 3 established: microtask & nextTick queues drain COMPLETELY,
 * including work added mid-drain. Lesson 8 showed sync code blocking the
 * loop. This lesson combines them into the sneakiest failure mode:
 * code that is 100% "asynchronous" — no while(true), tiny callbacks —
 * that still freezes every timer and every byte of I/O in the process.
 *
 * All demos are time-bounded (~150ms) so they end on their own.
 *
 * Run:   node lessons/09-starvation.js <exercise>
 * Answers & why: notes/09-starvation.md
 */

/* ═══════ EXERCISE 1 — recursive nextTick vs a 10ms timer ═══════
 * Each nextTick callback is microscopic and immediately yields... to
 * another nextTick. We stop rescheduling after 150ms. The timer wants
 * to fire at 10ms. Predict when it ACTUALLY fires, and how many
 * nextTicks ran by then.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex1() {
  const t0 = Date.now();
  let count = 0;

  setTimeout(() => {
    console.log(`10ms timer finally fired at ${Date.now() - t0}ms, after ${count.toLocaleString()} nextTicks`);
  }, 10);

  function again() {
    count++;
    if (Date.now() - t0 < 150) process.nextTick(again);
  }
  process.nextTick(again);
  console.log('recursive nextTick started (will stop rescheduling at 150ms)');
}

/* ═══════ EXERCISE 2 — recursive microtasks: any better? ═══════
 * Same shape, but with queueMicrotask (i.e. what an innocent-looking
 * `while(cond) await something-already-resolved` loop does!).
 *
 * YOUR PREDICTION:
 *
 */
function ex2() {
  const t0 = Date.now();
  let count = 0;

  setTimeout(() => {
    console.log(`10ms timer finally fired at ${Date.now() - t0}ms, after ${count.toLocaleString()} microtasks`);
  }, 10);

  function again() {
    count++;
    if (Date.now() - t0 < 150) queueMicrotask(again);
  }
  queueMicrotask(again);
  console.log('recursive queueMicrotask started (will stop at 150ms)');
}

/* ═══════ EXERCISE 3 — recursive setImmediate: the safe one ═══════
 * Identical shape, but rescheduling with setImmediate. Predict when the
 * 10ms timer fires THIS time — and try to articulate exactly why this
 * case is different before peeking at the notes.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex3() {
  const t0 = Date.now();
  let count = 0;

  setTimeout(() => {
    console.log(`10ms timer fired at ${Date.now() - t0}ms, after only ${count.toLocaleString()} immediates`);
  }, 10);

  function again() {
    count++;
    if (Date.now() - t0 < 150) setImmediate(again);
  }
  setImmediate(again);
  console.log('recursive setImmediate started (will stop at 150ms)');
}

/* ═══════ EXERCISE 4 — starving I/O, not just timers ═══════
 * The same three strategies, but now racing a file read instead of a
 * timer. Run with an argument style:  node 09-starvation.js 4
 * It runs all three back-to-back as child processes.
 * Predict each read-completion time (the read itself takes ~1ms).
 *
 * YOUR PREDICTION:
 *   nextTick loop:     read completes at ~
 *   microtask loop:    read completes at ~
 *   setImmediate loop: read completes at ~
 */
function ex4() {
  const { spawnSync } = require('node:child_process');
  const makeCode = (scheduler) => `
    const fs = require('node:fs');
    const t0 = Date.now();
    fs.readFile(${JSON.stringify(__filename)}, () => {
      console.log('   read completed at ' + (Date.now() - t0) + 'ms');
    });
    function again() { if (Date.now() - t0 < 150) ${scheduler}(again); }
    ${scheduler}(again);
  `;
  for (const s of ['process.nextTick', 'queueMicrotask', 'setImmediate']) {
    console.log(`${s} loop:`);
    const out = spawnSync(process.execPath, ['-e', makeCode(s)], { encoding: 'utf8' });
    process.stdout.write(out.stdout);
  }
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['recursive nextTick vs a 10ms timer', ex1],
  2: ['recursive microtasks: any better?', ex2],
  3: ['recursive setImmediate: the safe one', ex3],
  4: ['starving I/O, not just timers', ex4],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/09-starvation.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/09-starvation.md
