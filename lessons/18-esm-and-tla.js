/*
 * LESSON 18 — ES Modules & top-level await: the loop meets the loader
 * ───────────────────────────────────────────────────────────────────
 * Everything so far used CommonJS, where require() is a plain synchronous
 * function call. ES modules change the rules twice: imports are HOISTED
 * (dependencies evaluate before any of your code), and top-level await
 * turns a module's body into async code — suspending not just the module,
 * but everyone who imports it.
 *
 * Each exercise writes a tiny .mjs module graph to a temp dir, runs it,
 * and cleans up — read the module sources in the exercise, predict the
 * combined output.
 *
 * Run:   node lessons/18-esm-and-tla.js <exercise>
 * Answers & why: notes/18-esm-and-tla.md
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Write a module graph to a temp dir, run entry.mjs, return output, clean up.
function runGraph(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-loop-esm-'));
  try {
    for (const [name, src] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), src.trimStart());
    }
    const res = spawnSync(process.execPath, [path.join(dir, 'entry.mjs')],
      { encoding: 'utf8', timeout: 30_000 });
    return { stdout: res.stdout.trim(), stderr: res.stderr.trim(), status: res.status };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* ═══════ EXERCISE 1 — top-level await makes importers wait ═══════
 * dep.mjs:
 *   console.log('dep: start');
 *   await new Promise((r) => setTimeout(r, 50));   // top-level await!
 *   console.log('dep: done awaiting');
 *   export const value = 42;
 *
 * entry.mjs:
 *   import { value } from './dep.mjs';
 *   console.log('entry: got', value);
 *
 * Does 'entry: got 42' print before or after the 50ms await? Could
 * `value` ever be undefined?
 *
 * YOUR PREDICTION (3 lines):
 *
 */
function ex1() {
  const { stdout } = runGraph({
    'dep.mjs': `
console.log('dep: start');
await new Promise((r) => setTimeout(r, 50));
console.log('dep: done awaiting');
export const value = 42;
`,
    'entry.mjs': `
import { value } from './dep.mjs';
console.log('entry: got', value);
`,
  });
  console.log(stdout);
}

/* ═══════ EXERCISE 2 — a suspended module doesn't block its siblings ═══════
 * a.mjs:
 *   console.log('a: evaluating');
 *   await null;                        // resolves instantly — but still awaits!
 *   console.log('a: after its await');
 *
 * b.mjs:
 *   console.log('b: evaluating');
 *
 * entry.mjs:
 *   import './a.mjs';
 *   import './b.mjs';
 *   console.log('entry: body runs');
 *
 * Import order is a-then-b. Predict all 4 lines — does b wait for a?
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex2() {
  const { stdout } = runGraph({
    'a.mjs': `
console.log('a: evaluating');
await null;
console.log('a: after its await');
`,
    'b.mjs': `
console.log('b: evaluating');
`,
    'entry.mjs': `
import './a.mjs';
import './b.mjs';
console.log('entry: body runs');
`,
  });
  console.log(stdout);
}

/* ═══════ EXERCISE 3 — hoisting: CommonJS runs in order, ESM doesn't ═══════
 * The "same" file in both systems:
 *
 * CJS entry:                          ESM entry:
 *   console.log('entry: line 1');       console.log('entry: line 1');
 *   require('./dep.js');                import './dep.mjs';
 *   console.log('entry: line 2');       console.log('entry: line 2');
 *
 * (dep just logs 'dep: evaluated')
 *
 * Predict the output of EACH version — same, or different? Why?
 *
 * YOUR PREDICTION:
 *   CJS:
 *   ESM:
 */
function ex3() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-loop-cjs-'));
  try {
    fs.writeFileSync(path.join(dir, 'dep.js'), `console.log('dep: evaluated');`);
    fs.writeFileSync(path.join(dir, 'entry.js'),
      `console.log('entry: line 1');\nrequire('./dep.js');\nconsole.log('entry: line 2');`);
    const cjs = spawnSync(process.execPath, [path.join(dir, 'entry.js')], { encoding: 'utf8' });
    console.log('— CommonJS —');
    console.log(cjs.stdout.trim());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const { stdout } = runGraph({
    'dep.mjs': `console.log('dep: evaluated');`,
    'entry.mjs': `
console.log('entry: line 1');
import './dep.mjs';
console.log('entry: line 2');
`,
  });
  console.log('— ESM —');
  console.log(stdout);
}

/* ═══════ EXERCISE 4 — the unsettled top-level await ═══════
 * entry.mjs:
 *   console.log('module starts');
 *   await new Promise(() => {});       // never settles. ever.
 *   console.log('you will never see this');
 *
 * Lesson 10 said a pending promise keeps nothing alive. So... does this
 * hang forever, exit code 0, or something weirder? Predict the output,
 * the exit code, and whether Node says anything about it.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex4() {
  const { stdout, stderr, status } = runGraph({
    'entry.mjs': `
console.log('module starts');
await new Promise(() => {});
console.log('you will never see this');
`,
  });
  console.log(stdout);
  const warning = stderr.split('\n').find((l) => l.includes('Warning')) ?? '(no warning)';
  console.log('stderr says:', warning.trim());
  console.log('exit code:', status);
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['top-level await makes importers wait', ex1],
  2: ["a suspended module doesn't block its siblings", ex2],
  3: ["hoisting: CommonJS runs in order, ESM doesn't", ex3],
  4: ['the unsettled top-level await', ex4],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/18-esm-and-tla.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/18-esm-and-tla.md
