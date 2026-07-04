/*
 * LESSON 11 — Escaping the loop: worker_threads for CPU work
 * ──────────────────────────────────────────────────────────
 * Lessons 8–9 proved that CPU-heavy JS freezes the loop, and chunking
 * with setImmediate only shares the pain. The real fix: don't run CPU
 * work on the event loop's thread at all. worker_threads gives you real
 * OS threads, each with its OWN event loop and V8 isolate, talking to
 * yours via messages (which arrive, of course, through the poll phase).
 *
 * Run:   node lessons/11-escaping-the-loop.js <exercise>
 * Answers & why: notes/11-escaping-the-loop.md
 */

// A deliberately slow, purely-CPU function (naive fibonacci).
const FIB_N = 33; // ~a few hundred ms on a modern machine
const fibSource = `
  function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
`;

/* ═══════ EXERCISE 1 — the heartbeat under main-thread CPU work ═══════
 * A 50ms heartbeat ticks along; at ~150ms we compute fib(33) ON THE
 * MAIN THREAD. Predict the heartbeat pattern (12 beats total).
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex1() {
  const t0 = Date.now();
  let beats = 0;
  const heart = setInterval(() => {
    console.log(`♥ beat ${++beats} at ${Date.now() - t0}ms`);
    if (beats >= 12) clearInterval(heart);
  }, 50);

  setTimeout(() => {
    console.log(`starting fib(${FIB_N}) on the MAIN thread...`);
    // eslint-disable-next-line no-eval
    eval(fibSource + `fib(${FIB_N})`);
    console.log(`fib done at ${Date.now() - t0}ms`);
  }, 150);
}

/* ═══════ EXERCISE 2 — the same work, in a worker thread ═══════
 * Identical heartbeat, identical fib(33) — but the fib runs in a
 * Worker. Predict the heartbeat pattern now, and where in the beat
 * sequence the result message lands.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex2() {
  const { Worker } = require('node:worker_threads');
  const t0 = Date.now();
  let beats = 0;
  const heart = setInterval(() => {
    console.log(`♥ beat ${++beats} at ${Date.now() - t0}ms`);
    if (beats >= 12) clearInterval(heart);
  }, 50);

  setTimeout(() => {
    console.log(`starting fib(${FIB_N}) in a WORKER thread...`);
    const worker = new Worker(
      fibSource + `
      const { parentPort, workerData } = require('node:worker_threads');
      parentPort.postMessage(fib(workerData));
      `,
      { eval: true, workerData: FIB_N },
    );
    worker.on('message', (result) => {
      console.log(`worker result ${result} arrived at ${Date.now() - t0}ms`);
    });
  }, 150);
}

/* ═══════ EXERCISE 3 — workers are not free ═══════
 * If workers were free we'd use them for everything. We time three ways
 * of computing fib(20) (which takes well under 1ms):
 *   a) directly on the main thread
 *   b) spinning up a fresh Worker for it
 * Predict the cost of each.
 *
 * YOUR PREDICTION:
 *   direct: ~        fresh worker: ~
 */
function ex3() {
  const { Worker } = require('node:worker_threads');

  const t0 = Date.now();
  // eslint-disable-next-line no-eval
  const direct = eval(fibSource + 'fib(20)');
  console.log(`a) direct:       fib(20)=${direct} in ${Date.now() - t0}ms`);

  const t1 = Date.now();
  const worker = new Worker(
    fibSource + `
    const { parentPort } = require('node:worker_threads');
    parentPort.postMessage(fib(20));
    `,
    { eval: true },
  );
  worker.on('message', (r) => {
    console.log(`b) fresh worker: fib(20)=${r} in ${Date.now() - t1}ms`);
  });
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['the heartbeat under main-thread CPU work', ex1],
  2: ['the same work, in a worker thread', ex2],
  3: ['workers are not free', ex3],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/11-escaping-the-loop.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/11-escaping-the-loop.md
