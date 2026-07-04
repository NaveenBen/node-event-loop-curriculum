/*
 * LESSON 1 — The call stack: everything async waits its turn
 * ───────────────────────────────────────────────────────────
 * Before there is an "event loop" there is a call stack: one frame per
 * function call, last-in-first-out, and NOTHING asynchronous can run until
 * that stack is completely empty. Not "soon". Not "in parallel". Empty.
 *
 * Run one exercise at a time:   node lessons/01-call-stack.js 1
 * List exercises:               node lessons/01-call-stack.js
 *
 * For each exercise: read the code, write your prediction in the comment
 * block, THEN run it. Answers & why: notes/01-call-stack.md
 */

/* ═══════════════════ EXERCISE 1 — stack order ═══════════════════
 * Plain synchronous nesting. Warm-up: predict the exact 6 lines.
 *
 * YOUR PREDICTION:
 *   1.
 *   2.
 *   3.
 *   4.
 *   5.
 *   6.
 */
function ex1() {
  function a() {
    console.log('a: start');
    b();
    console.log('a: end');
  }
  function b() {
    console.log('b: start');
    c();
    console.log('b: end');
  }
  function c() {
    console.log('c: I am the top of the stack');
  }
  a();
}

/* ═══════════════ EXERCISE 2 — the timer that couldn't ═══════════════
 * We ask for a callback in 0 ms... then keep the stack busy for ~500 ms.
 * Predict: roughly when does "timer fired" print — near 0 ms or near 500 ms?
 * And does the while loop ever get interrupted by the timer?
 *
 * YOUR PREDICTION (order + rough timings):
 *
 *
 */
function ex2() {
  const t0 = Date.now();
  const stamp = () => `${Date.now() - t0}ms`;

  setTimeout(() => {
    console.log(`timer fired at ${stamp()} (asked for 0ms)`);
  }, 0);

  console.log(`blocking the stack starting at ${stamp()}...`);
  while (Date.now() - t0 < 500) {
    // spinning. the stack is NOT empty, so nothing else can run.
  }
  console.log(`done blocking at ${stamp()}`);
}

/* ═══════════ EXERCISE 3 — the stack, caught red-handed ═══════════
 * A stack trace is a photo of the call stack at one instant.
 * Trace A is taken deep inside nested sync calls.
 * Trace B is taken inside a setTimeout callback.
 * Predict: which function names appear in trace A? Does trace B still
 * show outer/middle/inner (the functions that *scheduled* it)?
 *
 * YOUR PREDICTION:
 *   trace A contains:
 *   trace B contains:
 */
function ex3() {
  function inner() {
    console.log('— trace A (synchronous, mid-flight) —');
    console.log(new Error('not a real error, just a camera').stack
      .split('\n').slice(0, 5).join('\n'));

    setTimeout(function timerCallback() {
      console.log('\n— trace B (inside the timer callback) —');
      console.log(new Error('camera again').stack
        .split('\n').slice(0, 5).join('\n'));
    }, 0);
  }
  function middle() { inner(); }
  function outer()  { middle(); }
  outer();
}

/* ═══════════ EXERCISE 4 — return values need the stack too ═══════════
 * A common wish: "just pause and give me the value". Predict what this
 * prints — in particular, what is `result` at the moment we log it?
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex4() {
  let result = 'not ready yet';

  setTimeout(() => {
    result = 'the data!';
  }, 0);

  console.log('result is:', result);
  console.log('(and only now, with the stack empty, can the timer run)');
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['stack order (warm-up)', ex1],
  2: ['the timer that couldn\'t', ex2],
  3: ['the stack, caught red-handed', ex3],
  4: ['return values need the stack too', ex4],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/01-call-stack.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Predicted first, ran second? Now read notes/01-call-stack.md
