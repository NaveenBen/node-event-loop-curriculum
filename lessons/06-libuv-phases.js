/*
 * LESSON 6 — The real event loop: libuv's phases
 * ──────────────────────────────────────────────
 * Until now, "task queue" was a simplification. Node's event loop (libuv)
 * is a LOOP over PHASES, each with its own queue:
 *
 *   timers → pending → poll (wait for I/O) → check (setImmediate) → close
 *
 * ...with the nextTick + microtask drain running between every callback.
 * This lesson makes the phases visible — including the famous case where
 * Node itself can't tell you what order two lines will print.
 *
 * Run:   node lessons/06-libuv-phases.js <exercise>
 * Answers & why: notes/06-libuv-phases.md
 */

/* ═══════ EXERCISE 1 — the race Node can't call ═══════
 * setTimeout(0) lives in the TIMERS phase. setImmediate lives in CHECK.
 * Scheduled from the main script, which fires first?
 *
 * RUN THIS ONE AT LEAST 5 TIMES before reading the notes.
 *
 * YOUR PREDICTION (same every run? if not, why?):
 *
 */
function ex1() {
  setTimeout(() => console.log('setTimeout(0)'), 0);
  setImmediate(() => console.log('setImmediate'));
}

/* ═══════ EXERCISE 2 — the race, 10 runs, tallied ═══════
 * Same race, but we spawn it 10 times as child processes and tally.
 * Predict the tally — 10/0? 0/10? somewhere in between?
 *
 * YOUR PREDICTION:
 *   setTimeout first:    /10
 *   setImmediate first:  /10
 */
function ex2() {
  const { spawnSync } = require('node:child_process');
  const code = `
    setTimeout(() => console.log('T'), 0);
    setImmediate(() => console.log('I'));
  `;
  const tally = { T: 0, I: 0 };
  for (let i = 0; i < 10; i++) {
    const out = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' });
    const winner = out.stdout.trim()[0];
    tally[winner]++;
    process.stdout.write(winner);
  }
  console.log(`\nsetTimeout first: ${tally.T}/10, setImmediate first: ${tally.I}/10`);
}

/* ═══════ EXERCISE 3 — the same race inside an I/O callback ═══════
 * Now we start the race from inside fs.readFile's callback — i.e. from
 * the POLL phase. Predict the order. Deterministic this time?
 *
 * YOUR PREDICTION:
 *
 */
function ex3() {
  const fs = require('node:fs');
  fs.readFile(__filename, () => {
    console.log('readFile callback (we are in the poll phase)');
    setTimeout(() => console.log('setTimeout(0)'), 0);
    setImmediate(() => console.log('setImmediate'));
  });
}

/* ═══════ EXERCISE 4 — the drain between EVERY callback ═══════
 * Two setImmediates — same phase, back to back. The first schedules a
 * nextTick and a promise. Do those run between the two immediates, or
 * after both?
 *
 * YOUR PREDICTION (order of 4 lines):
 *
 *
 */
function ex4() {
  setImmediate(() => {
    console.log('immediate A');
    process.nextTick(() => console.log('  nextTick scheduled by A'));
    Promise.resolve().then(() => console.log('  promise scheduled by A'));
  });
  setImmediate(() => console.log('immediate B'));
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['the race Node can\'t call (run 5+ times!)', ex1],
  2: ['the race, 10 runs, tallied', ex2],
  3: ['the same race inside an I/O callback', ex3],
  4: ['the drain between EVERY callback', ex4],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/06-libuv-phases.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/06-libuv-phases.md
