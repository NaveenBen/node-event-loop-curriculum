#!/usr/bin/env node
/*
 * learn.mjs — interactive trainer for the event-loop curriculum
 * ─────────────────────────────────────────────────────────────
 * Drives the predict-then-run loop for you: shows an exercise, captures
 * your typed prediction, runs the real code, grades you line by line,
 * reveals the notes on demand, and remembers your progress.
 *
 *   node learn.js            resume from the first unattempted exercise
 *   node learn.js menu       pick a lesson with arrow keys
 *   node learn.js review     re-drill exercises you've done, weakest first
 *   node learn.js 3          start at lesson 3, exercise 1
 *   node learn.js 3 2        start at lesson 3, exercise 2
 *   node learn.js status     progress map
 *   node learn.js reset      clear saved progress
 *
 * Progress lives in .progress.json (safe to delete).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import readline from 'node:readline/promises';
import readlineBase from 'node:readline';

import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { diffChars } from 'diff';

const execFileAsync = promisify(execFile);

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LESSONS_DIR = path.join(ROOT, 'lessons');
const NOTES_DIR = path.join(ROOT, 'notes');
const PROGRESS_FILE = path.join(ROOT, '.progress.json');

// Exercises graded by self-assessment instead of typed prediction:
// timing-heavy, voluminous, machine-specific, or deliberately
// nondeterministic (06:1, 06:2) output.
const OBSERVE = new Set([
  '01:3', '02:5', '05:5', '06:1', '06:2', '07:1', '07:3',
  '08:1', '08:2', '08:3', '09:1', '09:2', '09:3', '09:4',
  '10:1', '10:4', '11:1', '11:2', '11:3',
  '15:4', '16:1', '16:3', '18:4',
]);

/* ───────── styling ───────── */
const { bold, dim, green, red, yellow, cyan } = chalk;
const tty = process.stdout.isTTY;

marked.use(markedTerminal({
  tab: 2,
  reflowText: false,
}));

const box = (text, opts = {}) =>
  tty
    ? boxen(text, { padding: { left: 1, right: 1 }, borderStyle: 'round', borderColor: 'cyan', ...opts })
    : text;

/* ───────── discovery: lessons + their exercise menus ───────── */
async function discover() {
  const items = [];
  const files = fs.readdirSync(LESSONS_DIR).filter((f) => f.endsWith('.js')).sort();
  const menus = await Promise.all(files.map((file) =>
    execFileAsync(process.execPath, [path.join(LESSONS_DIR, file)], { encoding: 'utf8' })));
  files.forEach((file, i) => {
    const lessonNum = file.slice(0, 2);
    for (const line of menus[i].stdout.split('\n')) {
      const m = line.match(/^\s+(\d+)\.\s+(.*\S)/);
      if (!m) continue;
      const key = `${lessonNum}:${m[1]}`;
      items.push({
        key,
        lessonNum,
        exNum: m[1],
        title: m[2],
        file: path.join(LESSONS_DIR, file),
        lessonName: file.replace(/\.js$/, ''),
        mode: OBSERVE.has(key) ? 'observe' : 'predict',
      });
    }
  });
  return items;
}

/* ───────── source + notes extraction ───────── */
function exerciseSource(item) {
  const src = fs.readFileSync(item.file, 'utf8');
  const banner = new RegExp(`^/\\* ═+ (?:EXERCISE|PUZZLE|TRAP) ${item.exNum}\\b.*$`, 'm');
  const start = src.search(banner);
  if (start === -1) return '(could not extract source — open the file)';
  const rest = src.slice(start);
  const end = rest.slice(2).search(/^\/\* [═─]/m);
  return (end === -1 ? rest : rest.slice(0, end + 2)).trimEnd();
}

function notesSection(item) {
  const notesFile = path.join(NOTES_DIR, `${item.lessonName}.md`);
  try {
    const md = fs.readFileSync(notesFile, 'utf8');
    const lines = md.split('\n');
    const isMine = (line) => {
      const m = line.match(/^## (?:Exercises?|Puzzles?|Traps?) ([\d &,]+)\b/);
      return m && m[1].split(/\D+/).includes(item.exNum);
    };
    const start = lines.findIndex(isMine);
    if (start === -1) return `(section not found — see ${path.relative(ROOT, notesFile)})`;
    let end = lines.slice(start + 1).findIndex((l) => l.startsWith('## '));
    end = end === -1 ? lines.length : start + 1 + end;
    return lines.slice(start, end).join('\n').trim();
  } catch {
    return `(notes file missing: ${notesFile})`;
  }
}

function renderNotes(md) {
  try {
    // marked-terminal skips inline styles inside list items — sweep up any
    // markers it left behind.
    return marked.parse(md)
      .replace(/\*\*([^*]+)\*\*/g, (_, t) => bold(t))
      .replace(/`([^`]+)`/g, (_, t) => yellow(t))
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd();
  } catch {
    return md;
  }
}

/* ───────── running + grading ───────── */
async function runExercise(item) {
  const spinner = ora({ text: dim('running the real thing...'), isEnabled: tty }).start();
  let stdout = '';
  let stderr = '';
  try {
    ({ stdout, stderr } = await execFileAsync(process.execPath, [item.file, item.exNum],
      { encoding: 'utf8', timeout: 60_000 }));
  } catch (err) {
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? String(err);
  } finally {
    spinner.stop();
  }
  let out = stdout;
  if (stderr && stderr.trim()) out += `\n[stderr]\n${stderr.trim()}`;
  return out.replace(/\n+$/, '').split('\n');
}

// Forgiving-but-honest comparison, two layers:
//  - `loose` forgives typography that isn't event-loop knowledge:
//    case, all whitespace ("b:end" == "b: end"), trailing punctuation.
//  - `normalize` additionally wildcards values: digit runs ("500ms" ==
//    "503ms"), digits with units, and ${...} template literals copied
//    straight from the exercise source.
const loose = (line) =>
  line
    .toLowerCase()
    .replace(/[.…!?:;,]+\s*$/g, '')
    .replace(/\s+/g, '');

const normalize = (line) =>
  loose(
    line
      .replace(/\$\{[^}]*\}/g, '#')
      .replace(/\d+\s*ms\b/gi, '#')
      .replace(/\d[\d,._]*/g, '#'),
  );

function grade(predicted, actual) {
  const total = Math.max(actual.length, predicted.length, 1);
  let correct = 0;
  const rows = [];
  for (let i = 0; i < Math.max(actual.length, predicted.length); i++) {
    const a = actual[i]; const p = predicted[i];
    const ok = a !== undefined && p !== undefined && normalize(a) === normalize(p);
    // Matched only because values were wildcarded? Flag it — a ✓ must not
    // silently validate a wrong timing/count model.
    const valuesDiffer = ok && loose(a) !== loose(p);
    if (ok) correct++;
    rows.push({ ok, a, p, valuesDiffer });
  }
  return { score: correct / total, correct, total, rows };
}

// Character-level diff of a missed prediction against the actual line,
// so a one-letter typo is visible at a glance.
function charDiff(predicted, actual) {
  return diffChars(predicted, actual).map((part) => {
    if (part.added) return green.underline(part.value);     // missing from your prediction
    if (part.removed) return red.strikethrough(part.value); // extra in your prediction
    return dim(part.value);
  }).join('');
}

/* ───────── progress ───────── */
const loadProgress = () => {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch { return {}; }
};
const saveProgress = (p) => fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2) + '\n');

function record(progress, key, score) {
  const prev = progress[key] ?? { score: 0, attempts: 0 };
  progress[key] = {
    score: Math.max(prev.score, score),
    attempts: prev.attempts + 1,
    at: new Date().toISOString(),
  };
  saveProgress(progress);
}

/* ───────── status view ───────── */
function progressCells(exs, progress) {
  return exs.map((it) => {
    const rec = progress[it.key];
    if (!rec) return dim('·');
    if (rec.score >= 0.99) return green('✓');
    if (rec.score > 0) return yellow('◐');
    return red('✗');
  }).join(' ');
}

function byLesson(items) {
  const map = new Map();
  for (const it of items) {
    if (!map.has(it.lessonName)) map.set(it.lessonName, []);
    map.get(it.lessonName).push(it);
  }
  return map;
}

function showStatus(items, progress) {
  console.log('\n' + box(bold('The Node.js Event Loop — your progress'), { borderColor: 'magenta' }) + '\n');
  let attempted = 0; let sum = 0;
  for (const [name, exs] of byLesson(items)) {
    for (const it of exs) {
      const rec = progress[it.key];
      if (rec) { attempted++; sum += rec.score; }
    }
    console.log(`  ${name.padEnd(26)} ${progressCells(exs, progress)}`);
  }
  console.log(`\n  ${bold(`${attempted}/${items.length}`)} attempted` +
    (attempted ? `, average score ${bold((100 * (sum / attempted)).toFixed(0) + '%')}` : '') + '\n');
  if (attempted < items.length) {
    const next = items.find((it) => !progress[it.key]);
    console.log(dim(`  next up: lesson ${next.lessonNum} exercise ${next.exNum} — ${next.title}`));
    console.log(dim('  start it with: node learn.js\n'));
  } else {
    console.log(box(green(bold('Curriculum complete. Go break something asynchronous.')), { borderColor: 'green' }) + '\n');
  }
}

/* ───────── the buffering line reader ───────── */
// Lines that arrive before we ask for them (pasted multi-line predictions,
// piped stdin) are queued, not dropped — plain readline.question() loses any
// line that lands while no question is open.
function makeReader() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
  });
  const queue = [];
  let waiter = null;
  let closed = false;
  rl.on('line', (l) => {
    if (waiter) { const w = waiter; waiter = null; w(l); }
    else queue.push(l);
  });
  rl.on('close', () => {
    closed = true;
    if (waiter) { const w = waiter; waiter = null; w('\x04'); }
  });
  return {
    async ask(prompt) {
      let line;
      if (queue.length) {
        // Answer arrived before we asked (paste / type-ahead / pipe):
        // reconstruct the intended display so the transcript stays readable.
        line = queue.shift();
        console.log(prompt + line);
      } else if (closed) {
        line = '\x04';
      } else {
        // Let readline own the prompt — mixing raw stdout writes with
        // terminal-mode readline makes it redraw its default '> ' prompt.
        rl.setPrompt(prompt);
        rl.prompt();
        line = await new Promise((resolve) => { waiter = resolve; });
        if (line !== '\x04' && !process.stdin.isTTY) console.log(line); // echo piped input
      }
      return line === '\x04' ? line : line.trim();
    },
    close: () => rl.close(),
  };
}

/* ───────── the lesson menu ───────── */
function menuRows(items, progress) {
  return [...byLesson(items).entries()].map(([name, exs]) => {
    const doneCount = exs.filter((it) => progress[it.key]).length;
    const firstGap = exs.find((it) => !progress[it.key]) ?? exs[0];
    return {
      label: `${name.padEnd(26)} ${progressCells(exs, progress)}  ${dim(`${doneCount}/${exs.length}`)}`,
      startIdx: items.indexOf(firstGap),
      allDone: doneCount === exs.length,
    };
  });
}

// Arrow-key picker on a TTY; numbered fallback everywhere else.
// Returns an index into `items`, or null (cancelled).
async function lessonMenu(items, progress) {
  const rows = menuRows(items, progress);

  if (!process.stdin.isTTY) {
    const rl = makeReader();
    console.log(bold('\nLessons:\n'));
    rows.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. ${r.label}`));
    const a = await rl.ask('\nlesson number (or Enter to cancel) ▸ ');
    rl.close();
    const n = parseInt(a, 10);
    return Number.isInteger(n) && rows[n - 1] ? rows[n - 1].startIdx : null;
  }

  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    readlineBase.emitKeypressEvents(stdin);
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    let sel = rows.findIndex((r) => !r.allDone);
    if (sel < 0) sel = 0;

    console.log('\n' + box(bold('Pick a lesson') + dim('   ↑/↓ then Enter · q to cancel')) + '\n');
    const draw = (redraw) => {
      if (redraw) stdout.write(`\x1b[${rows.length}A`);
      for (let i = 0; i < rows.length; i++) {
        stdout.write(`\x1b[2K${i === sel ? cyan('▶ ') : '  '}${rows[i].label}\n`);
      }
    };
    draw(false);

    const finish = (val) => {
      stdin.removeListener('keypress', onKey);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      resolve(val);
    };
    const onKey = (str, key) => {
      if (!key) return;
      if (key.name === 'up' || key.name === 'k') sel = (sel - 1 + rows.length) % rows.length;
      else if (key.name === 'down' || key.name === 'j') sel = (sel + 1) % rows.length;
      else if (key.name === 'return') return finish(rows[sel].startIdx);
      else if (key.name === 'q' || key.name === 'escape') return finish(null);
      else if (key.ctrl && key.name === 'c') { finish(null); return; }
      else if (/^[1-9]$/.test(str ?? '')) {
        const n = parseInt(str, 10) - 1;
        if (rows[n]) { sel = n; }
      }
      draw(true);
    };
    stdin.on('keypress', onKey);
  });
}

/* ───────── the interactive session ───────── */
const ask = (reader, q) => reader.ask(q);

async function collectPrediction(rl) {
  console.log(dim('\nType your predicted output, one line at a time.'));
  console.log(dim('Numbers are wildcards — "at 500ms" matches "at 503ms", so write any plausible value.'));
  console.log(dim("Empty line = done. Type 'skip' to run without a typed prediction.\n"));
  const lines = [];
  for (;;) {
    const line = await ask(rl, cyan(`  ${lines.length + 1} ▸ `));
    if (line === '\x04') return null;
    if (line === 'skip' && lines.length === 0) return 'skip';
    if (line === '') return lines;
    lines.push(line);
  }
}

async function selfAssess(rl) {
  for (;;) {
    const a = (await ask(rl, '\nHow did you do? (y)es right / (p)artly / (n)o: ')).toLowerCase();
    if (a === 'y') return 1;
    if (a === 'p') return 0.5;
    if (a === 'n') return 0;
    if (a === '\x04') return null;
  }
}

async function runOne(rl, item, progress, allItems) {
  const attempted = Object.keys(progress).length;
  const avg = attempted
    ? Math.round(100 * Object.values(progress).reduce((s, r) => s + r.score, 0) / attempted)
    : null;
  const sub = `exercise ${allItems.indexOf(item) + 1} of ${allItems.length}` +
    (avg !== null ? ` · ${attempted} attempted · avg ${avg}%` : '');
  console.log('\n' + box(
    bold(`Lesson ${item.lessonNum} · exercise ${item.exNum} — ${item.title}`) + '\n' + dim(sub),
  ));
  console.log('\n' + exerciseSource(item));

  let scored = null;

  if (item.mode === 'predict') {
    const predicted = await collectPrediction(rl);
    if (predicted === null) return 'quit';
    const actual = await runExercise(item);
    if (predicted === 'skip') {
      console.log(bold('\n─── actual output ───'));
      console.log(actual.join('\n'));
      const s = await selfAssess(rl);
      if (s === null) return 'quit';
      scored = s;
    } else {
      const { score, correct, total, rows } = grade(predicted, actual);
      console.log(bold('\n─── graded against the real run ───'));
      for (const { ok, a, p, valuesDiffer } of rows) {
        if (ok && valuesDiffer) {
          console.log(`  ${green('✓')}${yellow('~')} ${a}  ${yellow(`(you wrote: ${p})`)}`);
        } else if (ok) console.log(`  ${green('✓')} ${a}`);
        else if (a === undefined) console.log(`  ${red('✗')} ${dim('(nothing — output ended)')}  ${dim(`you predicted: ${p}`)}`);
        else if (p === undefined) console.log(`  ${red('✗')} ${a}  ${dim('you predicted: (nothing)')}`);
        else console.log(`  ${red('✗')} ${charDiff(p, a)}`);
      }
      const pct = (100 * score).toFixed(0);
      const color = score >= 0.99 ? green : score > 0 ? yellow : red;
      console.log(`\n  score: ${color(bold(`${correct}/${total} (${pct}%)`))}`);
      if (rows.some((r) => !r.ok && r.a !== undefined && r.p !== undefined)) {
        console.log(dim('  ✗ lines diff your prediction against the actual text: ') +
          red.strikethrough('extra in yours') + dim(' · ') + green.underline('missing from yours'));
      }
      if (rows.some((r) => r.valuesDiffer)) {
        console.log(yellow('  ~ = right line, different values. Values are wildcards for grading —'));
        console.log(yellow('    but if the ACTUAL numbers surprise you, your timing model is off. Check the notes.'));
      }
      scored = score;
    }
  } else {
    console.log(yellow('\nThis one is self-assessed — its output is timing-heavy or'));
    console.log(yellow('machine-dependent, so grade yourself honestly.'));
    const go = await ask(rl, '\nPredict on paper, then press Enter to run it... ');
    if (go === '\x04') return 'quit';
    const actual = await runExercise(item);
    console.log(bold('\n─── actual output ───'));
    console.log(actual.join('\n'));
    const s = await selfAssess(rl);
    if (s === null) return 'quit';
    scored = s;
  }

  record(progress, item.key, scored);

  for (;;) {
    const a = (await ask(rl, `\n${dim('[n]ext · [r]etry · [o]pen notes · [m]enu · [q]uit')} ▸ `)).toLowerCase();
    if (a === '' || a === 'n') return 'next';
    if (a === 'r') return 'retry';
    if (a === 'm') return 'menu';
    if (a === 'q' || a === '\x04') return 'quit';
    if (a === 'o') {
      console.log('\n' + dim('─'.repeat(60)));
      console.log(renderNotes(notesSection(item)));
      console.log(dim('─'.repeat(60)));
    }
  }
}

// Drive a sequence of exercises; supports jumping via the lesson menu.
async function session(items, progress, startIdx) {
  let idx = startIdx;
  for (;;) {
    const rl = makeReader();
    let action = 'quit';
    while (idx < items.length) {
      action = await runOne(rl, items[idx], progress, items);
      if (action === 'quit' || action === 'menu') break;
      if (action === 'next') idx++;
      // 'retry' keeps idx as-is
    }
    rl.close();
    if (action === 'menu') {
      const pick = await lessonMenu(items, progress);
      if (pick === null) return 'quit';
      idx = pick;
      continue;
    }
    return idx >= items.length ? 'finished' : 'quit';
  }
}

async function main() {
  const args = process.argv.slice(2);
  const items = await discover();
  const progress = loadProgress();

  if (args[0] === 'status') return showStatus(items, progress);

  if (args[0] === 'reset') {
    const rl = makeReader();
    const a = await ask(rl, 'Delete all saved progress? (yes/no): ');
    rl.close();
    if (a === 'yes') { fs.rmSync(PROGRESS_FILE, { force: true }); console.log('Progress cleared.'); }
    else console.log('Kept.');
    return;
  }

  if (args[0] === 'review') {
    const done = items.filter((it) => progress[it.key]);
    if (!done.length) {
      console.log('Nothing to review yet — attempt some exercises first: node learn.js');
      return;
    }
    const order = [...done].sort((x, y) =>
      (progress[x.key].score - progress[y.key].score) ||
      (new Date(progress[x.key].at) - new Date(progress[y.key].at)));
    console.log(dim(`Review mode: re-drilling your ${order.length} attempted exercises, weakest and oldest first.`));
    const end = await session(order, progress, 0);
    if (end === 'finished') console.log(box(green(bold('Review complete. The model holds.')), { borderColor: 'green' }));
    else console.log(dim('\nProgress saved. Resume the course with: node learn.js\n'));
    return;
  }

  let idx;
  if (args[0] === 'menu') {
    idx = await lessonMenu(items, progress);
    if (idx === null) return;
  } else if (args.length) {
    const lesson = String(args[0]).padStart(2, '0');
    const ex = args[1] ?? '1';
    idx = items.findIndex((it) => it.lessonNum === lesson && it.exNum === String(ex));
    if (idx === -1) {
      console.error(`No such exercise: lesson ${args[0]}, exercise ${ex}. Try: node learn.js status`);
      process.exitCode = 1;
      return;
    }
  } else {
    idx = items.findIndex((it) => !progress[it.key]);
    if (idx === -1) {
      showStatus(items, progress);
      return;
    }
    console.log(dim(`Resuming at the first unattempted exercise (lesson ${items[idx].lessonNum}, exercise ${items[idx].exNum}).`));
    console.log(dim('(Prefer to jump around? node learn.js menu)'));
  }

  const end = await session(items, progress, idx);
  if (end === 'finished') showStatus(items, progress);
  else console.log(dim('\nProgress saved. Pick up where you left off with: node learn.js\n'));
}

main();
