/*
 * LESSON 4 — process.nextTick: Node's queue that beats even promises
 * ──────────────────────────────────────────────────────────────────
 * Surprise: Node has a THIRD queue, older than promises, that runs before
 * the microtask queue. process.nextTick(fn) means "run fn as soon as the
 * current operation finishes — before promises, before timers, before
 * everything." The name is a lie (it does NOT wait for the next tick),
 * kept for historical reasons.
 *
 * Priority so far:  sync code  >  nextTick queue  >  microtasks  >  tasks
 *
 * Run:   node lessons/04-nexttick.js <exercise>
 * Answers & why: notes/04-nexttick.md
 */

/* ═══════════════ EXERCISE 1 — the full pecking order ═══════════════
 * One of everything. Predict the order of all 6 lines.
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
  setTimeout(() => console.log('setTimeout'), 0);
  setImmediate(() => console.log('setImmediate'));
  Promise.resolve().then(() => console.log('promise.then'));
  queueMicrotask(() => console.log('queueMicrotask'));
  process.nextTick(() => console.log('nextTick'));
  console.log('sync');
}

/* ═══════ EXERCISE 2 — nextTick drains completely, before promises ═══════
 * A nextTick that schedules another nextTick, 3 deep, with a promise
 * waiting. Does the promise run between nextTicks? After all of them?
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex2() {
  Promise.resolve().then(() => console.log('promise'));

  let depth = 0;
  function again() {
    depth++;
    console.log(`nextTick depth ${depth}`);
    if (depth < 3) process.nextTick(again);
  }
  process.nextTick(again);
}

/* ═══════ EXERCISE 3 — crossing the streams ═══════
 * A microtask schedules a nextTick; a nextTick schedules a microtask.
 * This is the subtle one — think hard about which queue is drained when.
 *
 * YOUR PREDICTION (order of 4 lines):
 *
 *
 */
function ex3() {
  process.nextTick(() => {
    console.log('nextTick #1');
    queueMicrotask(() => console.log('microtask scheduled by nextTick #1'));
  });

  queueMicrotask(() => {
    console.log('microtask #1');
    process.nextTick(() => console.log('nextTick scheduled by microtask #1'));
  });
}

/* ═══════ EXERCISE 4 — why nextTick exists: the constructor-emit bug ═══════
 * An EventEmitter that emits 'ready' from its constructor. The listener
 * is attached one line later. Version A emits synchronously; version B
 * emits via nextTick. Predict what each version prints.
 *
 * YOUR PREDICTION:
 *   version A:
 *   version B:
 */
function ex4() {
  const { EventEmitter } = require('node:events');

  class SyncSource extends EventEmitter {
    constructor() {
      super();
      this.emit('ready', 'version A');   // emits RIGHT NOW
    }
  }
  class TickSource extends EventEmitter {
    constructor() {
      super();
      process.nextTick(() => this.emit('ready', 'version B'));
    }
  }

  new SyncSource().on('ready', (v) => console.log(`${v}: listener heard it`));
  new TickSource().on('ready', (v) => console.log(`${v}: listener heard it`));
  console.log('listeners attached');
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['the full pecking order', ex1],
  2: ['nextTick drains completely, before promises', ex2],
  3: ['crossing the streams (nextTick ↔ microtask)', ex3],
  4: ['why nextTick exists: the constructor-emit bug', ex4],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/04-nexttick.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/04-nexttick.md
