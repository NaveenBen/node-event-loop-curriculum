/*
 * LESSON 5 — async/await desugared: what `await` actually does
 * ────────────────────────────────────────────────────────────
 * async/await is not a new execution model — it's promise chains wearing
 * a nice syntax. Every `await` means: "pause THIS function here, schedule
 * the rest of it as a microtask when the awaited thing settles, and
 * meanwhile return control to my caller."
 *
 * If lessons 3–4 clicked, you can derive every answer here from first
 * principles. That's the point of this lesson.
 *
 * Run:   node lessons/05-async-await.js <exercise>
 * Answers & why: notes/05-async-await.md
 */

/* ═══════ EXERCISE 1 — async functions start synchronously ═══════
 * Common myth: "calling an async function schedules it for later."
 * Predict the order of all 5 lines.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex1() {
  async function greet() {
    console.log('greet: before await');
    await null;
    console.log('greet: after await');
  }

  console.log('main: before call');
  greet();
  console.log('main: after call');
}

/* ═══════ EXERCISE 2 — one await ≈ one .then hop ═══════
 * The same logic written twice: once with .then, once with await.
 * Predict the interleaving of A1/A2 and B1/B2.
 *
 * YOUR PREDICTION (order of 4 lines):
 *
 */
function ex2() {
  Promise.resolve()
    .then(() => console.log('A1 (.then)'))
    .then(() => console.log('A2 (.then)'));

  (async () => {
    await null;
    console.log('B1 (await)');
    await null;
    console.log('B2 (await)');
  })();
}

/* ═══════ EXERCISE 3 — the famous interview question ═══════
 * This exact snippet (give or take names) has haunted interviews for
 * years. Take your time. Predict all 8 lines.
 *
 * YOUR PREDICTION:
 *   1.            5.
 *   2.            6.
 *   3.            7.
 *   4.            8.
 */
function ex3() {
  async function async1() {
    console.log('async1 start');
    await async2();
    console.log('async1 end');
  }
  async function async2() {
    console.log('async2');
  }

  console.log('script start');
  setTimeout(() => console.log('setTimeout'), 0);
  async1();
  new Promise((resolve) => {
    console.log('promise executor');
    resolve();
  }).then(() => console.log('promise then'));
  console.log('script end');
}

/* ═══════ EXERCISE 4 — `return p` vs `return await p` ═══════
 * Both functions resolve to the same value. But WHEN? The .then ladder
 * is a metronome — each "hop N" is one microtask pass. Predict at which
 * hop each function's result lands.
 *
 * YOUR PREDICTION:
 *   'return await p' lands after hop:
 *   'return p' lands after hop:
 */
function ex4() {
  async function viaReturn() { return Promise.resolve('return p'); }
  async function viaAwait()  { return await Promise.resolve('return await p'); }

  viaReturn().then((v) => console.log(`${v} → resolved`));
  viaAwait().then((v) => console.log(`${v} → resolved`));

  Promise.resolve()
    .then(() => console.log('hop 1'))
    .then(() => console.log('hop 2'))
    .then(() => console.log('hop 3'))
    .then(() => console.log('hop 4'));
}

/* ═══════ EXERCISE 5 — sequential awaits vs Promise.all ═══════
 * Two 100ms "requests", two strategies. Predict BOTH total times
 * before running. (This one is about real-world performance, not
 * ordering trivia.)
 *
 * YOUR PREDICTION:
 *   sequential total: ~   ms
 *   parallel total:   ~   ms
 */
function ex5() {
  const fakeRequest = (name) =>
    new Promise((resolve) => setTimeout(() => resolve(name), 100));

  async function sequential() {
    const t0 = Date.now();
    await fakeRequest('one');
    await fakeRequest('two');
    console.log(`sequential took ${Date.now() - t0}ms`);
  }

  async function parallel() {
    const t0 = Date.now();
    await Promise.all([fakeRequest('one'), fakeRequest('two')]);
    console.log(`parallel took ${Date.now() - t0}ms`);
  }

  sequential().then(parallel);
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['async functions start synchronously', ex1],
  2: ['one await ≈ one .then hop', ex2],
  3: ['the famous interview question', ex3],
  4: ['`return p` vs `return await p`', ex4],
  5: ['sequential awaits vs Promise.all', ex5],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/05-async-await.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/05-async-await.md
