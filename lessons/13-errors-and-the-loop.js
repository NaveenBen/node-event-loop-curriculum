/*
 * LESSON 13 — Errors and the loop: where do throws actually go?
 * ─────────────────────────────────────────────────────────────
 * Every interview beyond junior level probes this: try/catch only guards
 * the CURRENT stack, callbacks run on FUTURE stacks, and promises turn
 * throws into rejections. Where an error surfaces — caught, rejected,
 * unhandledRejection, uncaughtException, or process crash — is decided
 * entirely by which queue the throwing code ran from.
 *
 * Run:   node lessons/13-errors-and-the-loop.js <exercise>
 * Answers & why: notes/13-errors-and-the-loop.md
 */

/* ═══════ EXERCISE 1 — try/catch cannot guard a future stack ═══════
 * The setTimeout is INSIDE the try block. Does the catch fire?
 * Where does the error end up?
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex1() {
  process.on('uncaughtException', (e) => {
    console.log('uncaughtException handler:', e.message);
    console.log('(without this handler, the process would have crashed)');
  });

  try {
    setTimeout(() => { throw new Error('boom from a timer'); }, 0);
    console.log('timer scheduled inside try');
  } catch (e) {
    console.log('try/catch caught:', e.message);
  }
  console.log('try block exited without incident');
}

/* ═══════ EXERCISE 2 — async functions never throw, they reject ═══════
 * The throw happens BEFORE any await — looks synchronous, right?
 * Predict whether the try/catch fires, and the order of all lines.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex2() {
  async function boom() {
    console.log('boom: entered (running synchronously!)');
    throw new Error('a very synchronous-looking throw');
  }

  try {
    boom().catch((e) => console.log('.catch got it:', e.message));
    console.log('line after the call — did we get here?');
  } catch (e) {
    console.log('try/catch got it:', e.message);
  }
}

/* ═══════ EXERCISE 3 — await re-throws: the reunion of try and catch ═══════
 * Same rejection, but awaited inside a try. Predict all 5 lines in order
 * (careful with the bystander).
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex3() {
  async function main() {
    try {
      await Promise.reject(new Error('rejected!'));
      console.log('never printed');
    } catch (e) {
      console.log('caught via await:', e.message);
    }
    console.log('main continues normally');
  }

  console.log('start');
  main();
  Promise.resolve().then(() => console.log('bystander microtask'));
  console.log('end');
}

/* ═══════ EXERCISE 4 — unhandledRejection is a deadline, not a verdict ═══════
 * A promise rejects with no handler... and gets one 10ms later.
 * Predict which process events fire, and the order of all lines.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex4() {
  process.on('unhandledRejection', (reason) =>
    console.log('unhandledRejection:', reason.message));
  process.on('rejectionHandled', () =>
    console.log('rejectionHandled (a late handler arrived)'));

  const p = Promise.reject(new Error('nobody caught me... yet'));
  console.log('rejected promise created, no handler attached');

  setTimeout(() => {
    console.log('attaching handler now (10ms later)');
    p.catch((e) => console.log('late .catch:', e.message));
  }, 10);
}

/* ═══════ EXERCISE 5 — the 'error' event: EventEmitter's live grenade ═══════
 * Emitting 'error' with no listener doesn't queue anything — it THROWS,
 * synchronously, at the emit site. We demo both with and without a
 * listener (the crash runs in a child process so you can see it safely).
 *
 * YOUR PREDICTION (what does each half print?):
 *
 *
 */
function ex5() {
  const { EventEmitter } = require('node:events');
  const { spawnSync } = require('node:child_process');

  console.log('— with a listener —');
  const safe = new EventEmitter();
  safe.on('error', (e) => console.log('error listener got:', e.message));
  safe.emit('error', new Error('handled fine'));
  console.log('still alive');

  console.log('\n— without a listener (in a child process) —');
  const out = spawnSync(process.execPath, ['-e', `
    const { EventEmitter } = require('node:events');
    const em = new EventEmitter();
    console.log('about to emit...');
    em.emit('error', new Error('nobody is listening'));
    console.log('you will never see this line');
  `], { encoding: 'utf8' });
  console.log(out.stdout.trim());
  console.log('child stderr (first line):', out.stderr.split('\n').find((l) => l.includes('Error')) ?? '(none)');
  console.log('child exit code:', out.status, '(non-zero = crashed)');
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['try/catch cannot guard a future stack', ex1],
  2: ['async functions never throw, they reject', ex2],
  3: ['await re-throws: the reunion of try and catch', ex3],
  4: ['unhandledRejection is a deadline, not a verdict', ex4],
  5: ["the 'error' event: EventEmitter's live grenade", ex5],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/13-errors-and-the-loop.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/13-errors-and-the-loop.md
