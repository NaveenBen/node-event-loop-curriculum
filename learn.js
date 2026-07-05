#!/usr/bin/env node
/*
 * learn.js — interactive trainer for the event-loop curriculum
 * ─────────────────────────────────────────────────────────────
 * Drives the predict-then-run loop for you: shows an exercise, captures
 * your typed prediction, runs the real code, grades you line by line,
 * reveals the notes on demand, and remembers your progress.
 *
 *   node learn.js            resume from the first unattempted exercise
 *   node learn.js 3          start at lesson 3, exercise 1
 *   node learn.js 3 2        start at lesson 3, exercise 2
 *   node learn.js status     progress map
 *   node learn.js reset      clear saved progress
 *
 * No dependencies. Progress lives in .progress.json (safe to delete).
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const readline = require('node:readline/promises');

const ROOT = __dirname;
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

/* ───────── tiny ANSI palette (plain text when not a TTY) ───────── */
const tty = process.stdout.isTTY;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = paint('1'); const dim = paint('2'); const green = paint('32');
const red = paint('31'); const yellow = paint('33'); const cyan = paint('36');

/* ───────── discovery: lessons + their exercise menus ───────── */
function discover() {
  const items = [];
  const files = fs.readdirSync(LESSONS_DIR).filter((f) => f.endsWith('.js')).sort();
  for (const file of files) {
    const lessonNum = file.slice(0, 2);
    const menu = spawnSync(process.execPath, [path.join(LESSONS_DIR, file)], { encoding: 'utf8' });
    for (const line of menu.stdout.split('\n')) {
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
  }
  return items;
}

/* ───────── source + notes extraction ───────── */
function exerciseSource(item) {
  const src = fs.readFileSync(item.file, 'utf8');
  const banner = new RegExp(`^/\\* ═+ (?:EXERCISE|PUZZLE) ${item.exNum}\\b.*$`, 'm');
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
      const m = line.match(/^## (?:Exercises?|Puzzles?) ([\d &,]+)\b/);
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

/* ───────── running + grading ───────── */
function runExercise(item) {
  const res = spawnSync(process.execPath, [item.file, item.exNum],
    { encoding: 'utf8', timeout: 60_000 });
  let out = res.stdout ?? '';
  if (res.stderr && res.stderr.trim()) out += `\n[stderr]\n${res.stderr.trim()}`;
  return out.replace(/\n+$/, '').split('\n');
}

// Forgiving-but-honest comparison, two layers:
//  - `loose` forgives typography that isn't event-loop knowledge:
//    case, all whitespace ("b:end" == "b: end"), trailing punctuation
//    ("...at 0ms" == "...at 0ms...").
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
function showStatus(items, progress) {
  console.log(bold('\nYour progress\n'));
  const byLesson = new Map();
  for (const it of items) {
    if (!byLesson.has(it.lessonName)) byLesson.set(it.lessonName, []);
    byLesson.get(it.lessonName).push(it);
  }
  let attempted = 0; let sum = 0;
  for (const [name, exs] of byLesson) {
    const cells = exs.map((it) => {
      const rec = progress[it.key];
      if (!rec) return dim('·');
      attempted++; sum += rec.score;
      if (rec.score >= 0.99) return green('✓');
      if (rec.score > 0) return yellow('◐');
      return red('✗');
    });
    console.log(`  ${name.padEnd(24)} ${cells.join(' ')}`);
  }
  console.log(`\n  ${attempted}/${items.length} attempted` +
    (attempted ? `, average score ${(100 * (sum / attempted)).toFixed(0)}%` : '') + '\n');
  if (attempted < items.length) {
    const next = items.find((it) => !progress[it.key]);
    console.log(dim(`  next up: lesson ${next.lessonNum} exercise ${next.exNum} — ${next.title}`));
    console.log(dim('  start it with: node learn.js\n'));
  } else {
    console.log(green(bold('  Curriculum complete. Go break something asynchronous.\n')));
  }
}

/* ───────── the interactive session ───────── */
// A buffering reader: lines that arrive before we ask for them (pasted
// multi-line predictions, piped stdin) are queued, not dropped — plain
// readline.question() loses any line that lands while no question is open.
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

async function runOne(rl, item, progress) {
  const header = `Lesson ${item.lessonNum} · exercise ${item.exNum} — ${item.title}`;
  console.log('\n' + bold('═'.repeat(Math.min(70, header.length + 4))));
  console.log(bold(`  ${header}`));
  console.log(bold('═'.repeat(Math.min(70, header.length + 4))) + '\n');
  console.log(exerciseSource(item));

  let scored = null;

  if (item.mode === 'predict') {
    const predicted = await collectPrediction(rl);
    if (predicted === null) return 'quit';
    const actual = runExercise(item);
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
        else console.log(`  ${red('✗')} ${a}  ${dim(`you predicted: ${p ?? '(nothing)'}`)}`);
      }
      const pct = (100 * score).toFixed(0);
      const color = score >= 0.99 ? green : score > 0 ? yellow : red;
      console.log(`\n  score: ${color(bold(`${correct}/${total} (${pct}%)`))}`);
      if (rows.some((r) => r.valuesDiffer)) {
        console.log(yellow('  ~ = right line, different values. Values are wildcards for grading —'));
        console.log(yellow('    but if the ACTUAL numbers surprise you, your timing model is off. Check the notes.'));
      }
      scored = score;
    }
  } else {
    console.log(yellow('\nThis one is self-assessed — its output is timing-heavy or') );
    console.log(yellow('machine-dependent, so grade yourself honestly.'));
    const go = await ask(rl, '\nPredict on paper, then press Enter to run it... ');
    if (go === '\x04') return 'quit';
    const actual = runExercise(item);
    console.log(bold('\n─── actual output ───'));
    console.log(actual.join('\n'));
    const s = await selfAssess(rl);
    if (s === null) return 'quit';
    scored = s;
  }

  record(progress, item.key, scored);

  for (;;) {
    const a = (await ask(rl, `\n${dim('[n]ext · [r]etry · [o]pen notes · [q]uit')} ▸ `)).toLowerCase();
    if (a === '' || a === 'n') return 'next';
    if (a === 'r') return 'retry';
    if (a === 'q' || a === '\x04') return 'quit';
    if (a === 'o') {
      console.log('\n' + dim('─'.repeat(60)));
      console.log(notesSection(item));
      console.log(dim('─'.repeat(60)));
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const items = discover();
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

  let idx;
  if (args.length) {
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
  }

  const rl = makeReader();
  while (idx < items.length) {
    const action = await runOne(rl, items[idx], progress);
    if (action === 'quit') break;
    if (action === 'next') idx++;
    // 'retry' keeps idx as-is
  }
  rl.close();
  if (idx >= items.length) showStatus(items, progress);
  else console.log(dim('\nProgress saved. Pick up where you left off with: node learn.js\n'));
}

main();
