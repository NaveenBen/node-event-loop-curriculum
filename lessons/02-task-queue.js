/*
 * LESSON 2 — The task queue: setTimeout is a request, not a command
 * ─────────────────────────────────────────────────────────────────
 * Timers don't "run in the background". setTimeout(fn, ms) registers fn
 * with the event loop's TIMERS phase: "once at least `ms` have passed,
 * and it's your turn, run this." This lesson is about what "your turn"
 * actually means.
 *
 * Run:   node lessons/02-task-queue.js <exercise>
 * Answers & why: notes/02-task-queue.md
 */

/* ═══════════════ EXERCISE 1 — same delay, what order? ═══════════════
 * Three timers, all 10ms, scheduled back to back.
 *
 * YOUR PREDICTION (order):
 *
 */
function ex1() {
  setTimeout(() => console.log('timer A'), 10);
  setTimeout(() => console.log('timer B'), 10);
  setTimeout(() => console.log('timer C'), 10);
  console.log('all three scheduled');
}

/* ═══════════════ EXERCISE 2 — 0ms vs 1ms vs 2ms ═══════════════
 * Scheduled in the order 2, 0, 1. Predict the firing order.
 * Trick question inside: is a 0ms timer actually different from a 1ms one?
 *
 * YOUR PREDICTION (order):
 *
 */
function ex2() {
  setTimeout(() => console.log('2ms timer'), 2);
  setTimeout(() => console.log('0ms timer'), 0);
  setTimeout(() => console.log('1ms timer'), 1);
}

/* ═══════ EXERCISE 3 — a timer scheduled from inside a timer ═══════
 * Both ask for 0ms. Predict the order of all four lines, and whether
 * "inner" can possibly run in the same event-loop turn as "outer".
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex3() {
  setTimeout(() => {
    console.log('outer: start');
    setTimeout(() => console.log('inner (scheduled from inside outer)'), 0);
    console.log('outer: end');
  }, 0);
  console.log('main: done');
}

/* ═══════ EXERCISE 4 — expired timers fire in delay order ═══════
 * We schedule 30ms and 10ms timers, then block the stack for 100ms.
 * By unblock time, BOTH are long expired. Predict the order they fire
 * and their approximate timestamps.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex4() {
  const t0 = Date.now();
  const stamp = () => `${Date.now() - t0}ms`;

  setTimeout(() => console.log(`30ms timer fired at ${stamp()}`), 30);
  setTimeout(() => console.log(`10ms timer fired at ${stamp()}`), 10);

  while (Date.now() - t0 < 100) { /* blocking */ }
  console.log(`unblocked at ${stamp()}`);
}

/* ═══════ EXERCISE 5 — setInterval while blocked: do ticks pile up? ═══════
 * An interval every 20ms, then we block for 100ms (≈5 missed intervals).
 * Predict: after unblocking, do we get 5 rapid-fire "tick"s to catch up,
 * or fewer? (Then it runs normally and stops itself after 8 total.)
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex5() {
  const t0 = Date.now();
  let n = 0;
  const id = setInterval(() => {
    n++;
    console.log(`tick ${n} at ${Date.now() - t0}ms`);
    if (n >= 8) clearInterval(id);
  }, 20);

  while (Date.now() - t0 < 100) { /* blocking */ }
  console.log(`unblocked at ${Date.now() - t0}ms`);
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['same delay, what order?', ex1],
  2: ['0ms vs 1ms vs 2ms (clamping)', ex2],
  3: ['a timer scheduled from inside a timer', ex3],
  4: ['expired timers fire in delay order', ex4],
  5: ['setInterval while blocked: do ticks pile up?', ex5],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/02-task-queue.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/02-task-queue.md
