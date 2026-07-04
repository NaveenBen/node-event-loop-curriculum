/*
 * LESSON 16 — The loop in production: observe, contextualize, protect
 * ───────────────────────────────────────────────────────────────────
 * Senior interviews leave puzzle-land and ask operational questions:
 * "How do you DETECT event-loop blocking in prod?" (monitorEventLoopDelay)
 * "How does your logger know which request it's serving?" (AsyncLocalStorage)
 * "How do you process a huge array without freezing the server?" (chunking)
 * This lesson is those three answers, runnable.
 *
 * Run:   node lessons/16-production-loop.js <exercise>
 * Answers & why: notes/16-production-loop.md
 */

/* ═══════ EXERCISE 1 — monitorEventLoopDelay: the built-in lag histogram ═══════
 * Node ships a native, histogram-grade version of lesson 8's lag monitor.
 * We sample for 300ms of healthy loop, then block for 250ms, then report.
 * Predict roughly: mean? max? p99? (before vs after the block)
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex1() {
  const { monitorEventLoopDelay } = require('node:perf_hooks');
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();

  const ms = (ns) => (ns / 1e6).toFixed(1);

  setTimeout(() => {
    console.log(`healthy loop  → mean ${ms(h.mean)}ms, p99 ${ms(h.percentile(99))}ms, max ${ms(h.max)}ms`);

    const t = Date.now();
    while (Date.now() - t < 250) { /* the incident */ }

    setTimeout(() => {
      console.log(`after a 250ms block → mean ${ms(h.mean)}ms, p99 ${ms(h.percentile(99))}ms, max ${ms(h.max)}ms`);
      console.log('(alert rule in real life: p99 loop delay > 100ms for 1 minute)');
      h.disable();
    }, 50);
  }, 300);
}

/* ═══════ EXERCISE 2 — AsyncLocalStorage: context that survives the queues ═══════
 * Two "requests" run interleaved through timers and microtasks. No id is
 * passed as an argument anywhere — yet every log line knows its request.
 * Predict all 4 log lines IN ORDER (mind the delays!).
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex2() {
  const { AsyncLocalStorage } = require('node:async_hooks');
  const als = new AsyncLocalStorage();

  const log = (msg) => console.log(`[req ${als.getStore() ?? '???'}] ${msg}`);

  async function handleRequest(delayMs) {
    await new Promise((r) => setTimeout(r, delayMs));   // "database call"
    log(`finished a ${delayMs}ms query`);
    queueMicrotask(() => log('still me, even in a detached microtask'));
  }

  als.run('A', () => handleRequest(20));
  als.run('B', () => handleRequest(10));
}

/* ═══════ EXERCISE 3 — chunking: 30 million items without flatlining ═══════
 * Same job twice: sum 30M numbers. Round 1 does it in one loop. Round 2
 * yields with setImmediate every 1M items. A 20ms heartbeat runs
 * throughout. Predict the heartbeat's behavior in each round.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex3() {
  const N = 30_000_000;
  const CHUNK = 1_000_000;
  const t0 = Date.now();
  let beats = 0;
  const heart = setInterval(() => beats++, 20);

  // Round 1: monolithic
  let sum = 0;
  for (let i = 0; i < N; i++) sum += i;
  console.log(`monolithic: done at ${Date.now() - t0}ms — heartbeats so far: ${beats}`);

  // Round 2: chunked with setImmediate
  const t1 = Date.now();
  const beatsBefore = beats;
  let sum2 = 0;
  let i2 = 0;
  (function chunk() {
    const end = Math.min(i2 + CHUNK, N);
    for (; i2 < end; i2++) sum2 += i2;
    if (i2 < N) return setImmediate(chunk);
    clearInterval(heart);
    console.log(`chunked:    done at ${Date.now() - t1}ms — heartbeats during: ${beats - beatsBefore}`);
    console.log(`(same answer both times: ${sum === sum2})`);
  })();
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['monitorEventLoopDelay: the built-in lag histogram', ex1],
  2: ['AsyncLocalStorage: context that survives the queues', ex2],
  3: ['chunking: 30 million items without flatlining', ex3],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/16-production-loop.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/16-production-loop.md
