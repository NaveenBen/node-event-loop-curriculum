/*
 * LESSON 12 — The capstone gauntlet
 * ─────────────────────────────────
 * Eight puzzles, easy → brutal, mixing everything from lessons 1–11.
 * Every puzzle is deterministic (no main-script setTimeout-vs-setImmediate
 * coin flips — you learned in lesson 6 why those can't be predicted).
 *
 * Rules of engagement:
 *   - Write your COMPLETE predicted output before running each one.
 *   - Score yourself. 8/8 with correct reasoning = you're done here.
 *
 * Run:   node lessons/12-capstone-gauntlet.js <1-8>
 * Answers & full walkthroughs: notes/12-capstone-gauntlet.md
 */

/* ═══════ PUZZLE 1 — warm-up: the four queues ═══════
 * YOUR PREDICTION (5 lines):
 *
 */
function p1() {
  console.log('one');
  setTimeout(() => console.log('two'), 0);
  Promise.resolve().then(() => console.log('three'));
  process.nextTick(() => console.log('four'));
  console.log('five');
}

/* ═══════ PUZZLE 2 — microtasks between timer callbacks ═══════
 * YOUR PREDICTION (5 lines):
 *
 */
function p2() {
  setTimeout(() => console.log('timer 1'), 0);
  setTimeout(() => {
    console.log('timer 2');
    Promise.resolve().then(() => console.log('promise inside timer 2'));
  }, 0);
  Promise.resolve()
    .then(() => console.log('then 1'))
    .then(() => console.log('then 2'));
}

/* ═══════ PUZZLE 3 — async/await, no tricks... right? ═══════
 * YOUR PREDICTION (6 lines):
 *
 */
function p3() {
  async function f() {
    console.log('f start');
    await g();
    console.log('f end');
  }
  async function g() {
    console.log('g');
  }
  console.log('start');
  f();
  Promise.resolve().then(() => console.log('then'));
  console.log('end');
}

/* ═══════ PUZZLE 4 — crossing nextTick and microtasks ═══════
 * YOUR PREDICTION (4 lines):
 *
 */
function p4() {
  process.nextTick(() => console.log('tick 1'));
  Promise.resolve().then(() => {
    console.log('then 1');
    process.nextTick(() => console.log('tick 2'));
  });
  queueMicrotask(() => console.log('micro 1'));
}

/* ═══════ PUZZLE 5 — the I/O launchpad ═══════
 * YOUR PREDICTION (4 lines after 'read done'):
 *
 */
function p5() {
  const fs = require('node:fs');
  fs.readFile(__filename, () => {
    console.log('read done');
    setTimeout(() => console.log('timeout'), 0);
    setImmediate(() => console.log('immediate'));
    process.nextTick(() => console.log('tick'));
    Promise.resolve().then(() => console.log('promise'));
  });
}

/* ═══════ PUZZLE 6 — immediates all the way down ═══════
 * YOUR PREDICTION (4 lines):
 *
 */
function p6() {
  setImmediate(() => {
    console.log('immediate 1');
    process.nextTick(() => console.log('tick from immediate 1'));
    setImmediate(() => console.log('immediate 3'));
  });
  setImmediate(() => console.log('immediate 2'));
}

/* ═══════ PUZZLE 7 — the return of `return p` ═══════
 * YOUR PREDICTION (5 lines):
 *
 */
function p7() {
  async function a() { return 1; }
  async function b() { return Promise.resolve(2); }

  a().then((v) => console.log('a resolved:', v));
  b().then((v) => console.log('b resolved:', v));

  Promise.resolve()
    .then(() => console.log('hop 1'))
    .then(() => console.log('hop 2'))
    .then(() => console.log('hop 3'));
}

/* ═══════ PUZZLE 8 — the brutal one: everything, everywhere ═══════
 * Eleven letters. Take five minutes. Trace the phases on paper.
 * YOUR PREDICTION (11 lines, K first is a freebie):
 *
 *
 *
 */
function p8() {
  const fs = require('node:fs');
  fs.readFile(__filename, () => {
    console.log('A (read done)');
    setTimeout(() => {
      console.log('B');
      process.nextTick(() => console.log('C'));
      Promise.resolve().then(() => console.log('D'));
    }, 5);
    setImmediate(() => {
      console.log('E');
      queueMicrotask(() => console.log('F'));
      setImmediate(() => console.log('G'));
    });
    (async () => {
      console.log('H');
      await null;
      console.log('I');
    })();
    process.nextTick(() => console.log('J'));
  });
  console.log('K');
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['warm-up: the four queues', p1],
  2: ['microtasks between timer callbacks', p2],
  3: ['async/await, no tricks... right?', p3],
  4: ['crossing nextTick and microtasks', p4],
  5: ['the I/O launchpad', p5],
  6: ['immediates all the way down', p6],
  7: ['the return of `return p`', p7],
  8: ['the brutal one: everything, everywhere', p8],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/12-capstone-gauntlet.js <puzzle 1-8>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Walkthroughs: notes/12-capstone-gauntlet.md
