/*
 * LESSON 10 — Timers deep dive: drift, unref, and why Node knows when to exit
 * ───────────────────────────────────────────────────────────────────────────
 * Timers look trivial and hide three useful truths: intervals drift,
 * timers are HANDLES that keep the process alive, and you can opt a
 * handle out of that (unref) — which is how CLIs exit cleanly while
 * still having housekeeping timers.
 *
 * Run:   node lessons/10-timers-deep-dive.js <exercise>
 * Answers & why: notes/10-timers-deep-dive.md
 */

/* ═══════ EXERCISE 1 — which schedulers drift? ═══════
 * Three schedulers all aim for a tick every 50ms, and every tick does
 * ~20ms of synchronous work FIRST (so all timestamps include it):
 *   A: naive setTimeout chain — re-arms 50ms AFTER the work finishes
 *   B: setInterval(work, 50)
 *   C: setTimeout chain re-aimed at absolute target times (t0 + n*50)
 * Ideal tick 6 ≈ 300ms (+20ms of work before the log = ~320ms).
 * Predict where tick 6 lands for EACH.
 *
 * YOUR PREDICTION:
 *   A tick 6 at ~        B tick 6 at ~        C tick 6 at ~
 */
function ex1() {
  const busy = (ms) => { const t = Date.now(); while (Date.now() - t < ms) {} };

  function runA(done) {
    const t0 = Date.now();
    let n = 0;
    function tick() {
      n++;
      busy(20);
      console.log(`A (naive re-arm)    tick ${n} at ${Date.now() - t0}ms (ideal ~${n * 50 + 20}ms)`);
      if (n < 6) setTimeout(tick, 50);   // 50ms from NOW (after the work)
      else done();
    }
    setTimeout(tick, 50);
  }

  function runB(done) {
    const t0 = Date.now();
    let n = 0;
    const id = setInterval(() => {
      n++;
      busy(20);
      console.log(`B (setInterval)     tick ${n} at ${Date.now() - t0}ms (ideal ~${n * 50 + 20}ms)`);
      if (n >= 6) { clearInterval(id); done(); }
    }, 50);
  }

  function runC() {
    const t0 = Date.now();
    let n = 0;
    function tick() {
      n++;
      busy(20);
      console.log(`C (aimed re-arm)    tick ${n} at ${Date.now() - t0}ms (ideal ~${n * 50 + 20}ms)`);
      if (n < 6) {
        const nextTarget = t0 + (n + 1) * 50;
        setTimeout(tick, Math.max(0, nextTarget - Date.now())); // re-aim!
      }
    }
    setTimeout(tick, 50);
  }

  runA(() => runB(runC));
}

/* ═══════ EXERCISE 2 — unref: the timer that won't hold the door ═══════
 * A 1-second interval (unref'd) and a 200ms timeout (normal).
 * Predict: when does the process exit, and does the interval EVER tick?
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex2() {
  const t0 = Date.now();

  const housekeeping = setInterval(() => {
    console.log('housekeeping tick (you should never see this)');
  }, 1000);
  housekeeping.unref();   // ← "don't stay alive just for me"

  setTimeout(() => {
    console.log(`main work done at ${Date.now() - t0}ms`);
  }, 200);

  process.on('exit', () => {
    console.log(`process exiting at ${Date.now() - t0}ms — nothing referenced remains`);
  });
  console.log('scheduled: unref\'d 1000ms interval + normal 200ms timeout');
}

/* ═══════ EXERCISE 3 — refresh(): re-arming instead of re-creating ═══════
 * A 100ms "inactivity alarm" gets refresh()ed at 60ms and 120ms —
 * like a session timeout being pushed back by user activity.
 * Predict when the alarm actually fires.
 *
 * YOUR PREDICTION:
 *
 */
function ex3() {
  const t0 = Date.now();
  const alarm = setTimeout(() => {
    console.log(`alarm fired at ${Date.now() - t0}ms`);
  }, 100);

  setTimeout(() => { console.log('activity at 60ms — refresh!');  alarm.refresh(); }, 60);
  setTimeout(() => { console.log('activity at 120ms — refresh!'); alarm.refresh(); }, 120);
}

/* ═══════ EXERCISE 4 — what exactly keeps Node alive? ═══════
 * Five programs, one question each: does the process exit immediately,
 * or wait? Predict all five, then run — we spawn each and time it.
 *
 * YOUR PREDICTION (exits immediately? waits how long?):
 *   a) console.log only:
 *   b) a resolved promise .then:
 *   c) a promise that never settles:
 *   d) a 300ms timer:
 *   e) an fs.readFile in flight:
 */
function ex4() {
  const { spawnSync } = require('node:child_process');
  const programs = {
    'a) console.log only        ': `console.log('hi')`,
    'b) resolved promise .then  ': `Promise.resolve().then(() => console.log('then ran'))`,
    'c) never-settling promise  ': `new Promise(() => {}).then(() => console.log('impossible'))`,
    'd) 300ms timer             ': `setTimeout(() => {}, 300)`,
    'e) fs.readFile in flight   ': `require('node:fs').readFile(${JSON.stringify(__filename)}, () => {})`,
  };
  for (const [label, code] of Object.entries(programs)) {
    const t0 = Date.now();
    spawnSync(process.execPath, ['-e', code]);
    console.log(`${label} → exited after ${Date.now() - t0}ms`);
  }
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['interval drift vs a self-correcting chain', ex1],
  2: ['unref: the timer that won\'t hold the door', ex2],
  3: ['refresh(): re-arming instead of re-creating', ex3],
  4: ['what exactly keeps Node alive?', ex4],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/10-timers-deep-dive.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/10-timers-deep-dive.md
