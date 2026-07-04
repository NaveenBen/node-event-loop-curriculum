/*
 * LESSON 8 — Blocking the loop: one slow function ruins everything
 * ────────────────────────────────────────────────────────────────
 * The event loop's superpower — one thread, no locks — is also its
 * fragility: EVERY callback shares that thread. One slow synchronous
 * computation delays every timer, every request, every I/O completion
 * in the whole process. This lesson is about seeing, measuring, and
 * recognizing that.
 *
 * Run:   node lessons/08-blocking-the-loop.js <exercise>
 * Answers & why: notes/08-blocking-the-loop.md
 */

/* ═══════ EXERCISE 1 — one callback delays all the others ═══════
 * Three timers want to fire at 20ms, 40ms, 60ms. The 20ms one does
 * 300ms of synchronous work. Predict when each actually fires.
 *
 * YOUR PREDICTION:
 *   20ms timer fires at ~
 *   40ms timer fires at ~
 *   60ms timer fires at ~
 */
function ex1() {
  const t0 = Date.now();
  const at = () => `${Date.now() - t0}ms`;

  setTimeout(() => {
    console.log(`20ms timer fired at ${at()} — now hogging the thread for 300ms`);
    const start = Date.now();
    while (Date.now() - start < 300) { /* "parsing a huge report" */ }
  }, 20);

  setTimeout(() => console.log(`40ms timer fired at ${at()}`), 40);
  setTimeout(() => console.log(`60ms timer fired at ${at()}`), 60);
}

/* ═══════ EXERCISE 2 — an event-loop lag monitor (a real tool!) ═══════
 * The standard trick for detecting blocking in production: schedule a
 * timer every 50ms and measure how LATE it fires. At ~600ms in, we
 * JSON.parse a ~33 MB string. Predict what the lag readings look like
 * before, at, and after the parse.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex2() {
  console.log('building a ~33 MB JSON string...');
  const bigJson = '[' + Array.from({ length: 600_000 },
    (_, i) => `{"id":${i},"name":"item-${i}","tags":["a","b","c"]}`).join(',') + ']';
  console.log(`built (${(bigJson.length / 1e6).toFixed(1)} MB). starting lag monitor.`);

  const t0 = Date.now();
  let last = Date.now();
  let ticks = 0;
  const monitor = setInterval(() => {
    const now = Date.now();
    const lag = now - last - 50;               // how late are we?
    console.log(`t=${now - t0}ms  loop lag: ${lag}ms ${lag > 100 ? '  ◀ BLOCKED' : ''}`);
    last = now;
    if (++ticks >= 16) clearInterval(monitor);
  }, 50);

  setTimeout(() => {
    const data = JSON.parse(bigJson);          // fully synchronous!
    console.log(`   (parsed ${data.length} items)`);
  }, 600);
}

/* ═══════ EXERCISE 3 — I/O keeps working while JS is blocked ═══════
 * Subtle but important: we start a file read, then immediately block
 * the JS thread for 300ms. The READ itself happens on a pool thread.
 * Predict: does the callback fire at ~read-time, or at ~300ms?
 * And what does that tell you about WHERE the waiting happened?
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex3() {
  const fs = require('node:fs');
  const t0 = Date.now();

  // Baseline: how long does this read take with a free loop?
  fs.readFile(__filename, () => {
    console.log(`baseline read completed at ${Date.now() - t0}ms (loop was free)`);

    // Round 2: same read, but now we block right after starting it.
    const t1 = Date.now();
    fs.readFile(__filename, () => {
      console.log(`blocked-loop read callback ran at ${Date.now() - t1}ms after start`);
    });
    const spin = Date.now();
    while (Date.now() - spin < 300) { /* JS thread hogged */ }
    console.log(`unblocked at ${Date.now() - t1}ms`);
  });
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['one callback delays all the others', ex1],
  2: ['an event-loop lag monitor (a real tool!)', ex2],
  3: ['I/O keeps working while JS is blocked', ex3],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/08-blocking-the-loop.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/08-blocking-the-loop.md
