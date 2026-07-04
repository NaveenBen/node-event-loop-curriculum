/*
 * LESSON 17 — Interview hell: the trap collection
 * ───────────────────────────────────────────────
 * Eight puzzles built from the traps interviewers actually set — each one
 * is a real pattern that has shipped bugs to production. All deterministic.
 *
 * Rules: full predicted output, in writing, before running. If you clear
 * this AND can explain each answer out loud, no interviewer can touch you.
 *
 * Run:   node lessons/17-interview-hell.js <1-8>
 * Walkthroughs: notes/17-interview-hell.md
 */

/* ═══════ TRAP 1 — forEach + async: the classic ═══════
 * "Why does 'end' log before the work is done?" — asked everywhere.
 * YOUR PREDICTION (11 lines):
 *
 *
 */
function p1() {
  async function work(n) {
    await null;
    console.log(`processed ${n}`);
  }

  console.log('start');
  [1, 2, 3].forEach(async (n) => {
    console.log(`kicking off ${n}`);
    await work(n);
    console.log(`done ${n}`);
  });
  console.log('end — but is anything actually done?');
}

/* ═══════ TRAP 2 — await in a loop vs Promise.all ═══════
 * Three "queries" of 30, 20, 10ms, two strategies. Predict every line
 * INCLUDING the completion order within each strategy and rough totals.
 * YOUR PREDICTION (7 lines):
 *
 *
 */
function p2() {
  const query = (ms) => new Promise((r) =>
    setTimeout(() => { console.log(`  ${ms}ms query finished`); r(ms); }, ms));

  (async () => {
    console.log('sequential (await in a loop):');
    const t0 = Date.now();
    for (const ms of [30, 20, 10]) await query(ms);
    console.log(`sequential total: ~${Date.now() - t0}ms`);

    console.log('concurrent (Promise.all):');
    const t1 = Date.now();
    await Promise.all([30, 20, 10].map(query));
    console.log(`concurrent total: ~${Date.now() - t1}ms`);
  })();
}

/* ═══════ TRAP 3 — one promise, three consumers ═══════
 * A promise is awaited twice and .then'd once. Does the executor rerun?
 * Who gets the value, in what order?
 * YOUR PREDICTION (8 lines):
 *
 *
 */
function p3() {
  const p = new Promise((resolve) => {
    console.log('executor runs (how many times total?)');
    resolve(42);
  });

  (async () => { console.log('A before await'); console.log('A got', await p); })();
  (async () => { console.log('B before await'); console.log('B got', await p); })();
  p.then((v) => console.log('C got', v));

  console.log('sync end');
}

/* ═══════ TRAP 4 — Promise.all with an already-rejected input ═══════
 * Where do 'catch' and 'finally' land against the hop ladder?
 * YOUR PREDICTION (6 lines):
 *
 *
 */
function p4() {
  Promise.all([
    Promise.resolve(1),
    Promise.reject(new Error('nope')),
    Promise.resolve(3),
  ])
    .then(() => console.log('then (does this run?)'))
    .catch((e) => console.log('catch:', e.message))
    .finally(() => console.log('finally'));

  Promise.resolve()
    .then(() => console.log('hop 1'))
    .then(() => console.log('hop 2'))
    .then(() => console.log('hop 3'))
    .then(() => console.log('hop 4'));
}

/* ═══════ TRAP 5 — a throw in the nextTick queue ═══════
 * Inside an I/O callback: an immediate, a THROWING nextTick, and a
 * promise. Does the throw kill the promise? The immediate? Predict
 * the order of the 4 lines after 'io callback'.
 * YOUR PREDICTION:
 *
 *
 */
function p5() {
  process.on('uncaughtException', (e) => console.log('uncaught:', e.message));

  const fs = require('node:fs');
  fs.readFile(__filename, () => {
    console.log('io callback');
    setImmediate(() => console.log('immediate — still alive?'));
    process.nextTick(() => { throw new Error('tick goes boom'); });
    Promise.resolve().then(() => console.log('promise — do I still run?'));
  });
}

/* ═══════ TRAP 6 — async does not mean asynchronous (entirely) ═══════
 * What does `typeof` report? When does each line print?
 * YOUR PREDICTION (6 lines):
 *
 *
 */
function p6() {
  async function a() { console.log('a runs'); return 'a-value'; }
  function b() { console.log('b runs'); return 'b-value'; }

  console.log(typeof a().then((v) => console.log('a resolved with', v)));
  console.log(b());
  Promise.resolve().then(() => console.log('bystander'));
}

/* ═══════ TRAP 7 — the drain, mid-check-phase, with a twist ═══════
 * A microtask that spawns a nextTick, between two immediates.
 * Alternation rules from lesson 4 apply — trace carefully.
 * YOUR PREDICTION (5 lines):
 *
 *
 */
function p7() {
  setImmediate(() => {
    console.log('immediate 1');
    process.nextTick(() => console.log('tick (from immediate 1)'));
    queueMicrotask(() => {
      console.log('microtask (from immediate 1)');
      process.nextTick(() => console.log('tick (from the microtask)'));
    });
  });
  setImmediate(() => console.log('immediate 2'));
}

/* ═══════ TRAP 8 — the final boss ═══════
 * Thenable, Promise.all, nextTick, I/O, immediate, async/await — all of
 * it. Eleven lines. Trace the phases on paper; take your time.
 * YOUR PREDICTION:
 *
 *
 *
 */
function p8() {
  const fs = require('node:fs');

  console.log('S1');

  const thenable = { then(resolve) { console.log('thenable.then runs'); resolve('T'); } };
  (async () => {
    console.log('S2');
    const v = await thenable;
    console.log('got', v);
  })();

  fs.readFile(__filename, () => {
    console.log('IO');
    process.nextTick(() => console.log('IO tick'));
    setImmediate(() => console.log('IO immediate'));
  });

  Promise.all([Promise.resolve('x')]).then((v) => console.log('all:', v[0]));
  process.nextTick(() => console.log('main tick'));
  console.log('S3');
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['forEach + async: the classic', p1],
  2: ['await in a loop vs Promise.all', p2],
  3: ['one promise, three consumers', p3],
  4: ['Promise.all with an already-rejected input', p4],
  5: ['a throw in the nextTick queue', p5],
  6: ['async does not mean asynchronous (entirely)', p6],
  7: ['the drain, mid-check-phase, with a twist', p7],
  8: ['the final boss', p8],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/17-interview-hell.js <trap 1-8>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Walkthroughs: notes/17-interview-hell.md
