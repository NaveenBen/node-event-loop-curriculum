# The Node.js Event Loop — Inside Out

**You don't read about the event loop here. You bet against it, lose, and find out why.**

[![smoke](https://github.com/NaveenBen/node-event-loop-curriculum/actions/workflows/smoke.yml/badge.svg)](https://github.com/NaveenBen/node-event-loop-curriculum/actions/workflows/smoke.yml)
![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)
![license](https://img.shields.io/github/license/NaveenBen/node-event-loop-curriculum)

---

## Prove you need this in 20 seconds

What does this print?

```js
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));
console.log('sync');
```

<details>
<summary><b>Lock in your answer, then click.</b></summary>

<br>

```
sync
nextTick
promise
??? ← and here's the thing: even Node doesn't know.
```

The first three lines are law: sync code, then the `nextTick` queue, then
promises. But `timeout` vs `immediate`? **Genuinely nondeterministic** —
run it five times and it can flip, because a `setTimeout(0)` is secretly a
1ms timer racing your CPU to the event loop. Most engineers with years of
Node experience get this wrong, then get told the "right" answer wrong too.

Lesson 6 makes you run the race, tally it, and *break* the tie on purpose.
That's how everything here works.

</details>

---

## What this is

A **predict-then-run** curriculum: 18 lessons, 83 runnable exercises, an
interactive trainer that grades your predictions against reality, and an
interview handbook. All you need is Node 20+.

Every expected output in the notes was **verified against real runs**
(Node 23, plus CI on 18/20/22) — no folklore, no stale blog-post answers.
Two famous myths die in here with receipts: the `setInterval` drift myth
and the pre-Node-11 microtask ordering that half the internet still teaches.

## Try it in 60 seconds

```sh
git clone https://github.com/NaveenBen/node-event-loop-curriculum.git
cd node-event-loop-curriculum
npm install
node learn.js          # start / resume the course
node learn.js menu     # or pick a lesson with arrow keys
node learn.js review   # re-drill what you've done, weakest first
```

The trainer shows you code, you type what it'll print, it runs the real
thing and grades you line by line — with a character-level diff on every
miss, so you can see whether you were wrong about the *event loop* or just
about a space:

```
  Lesson 03 · exercise 1 — the classic (start/timeout/promise/end)

  Type your predicted output, one line at a time.

  1 ▸ start
  2 ▸ timeout
  3 ▸ end
  4 ▸ promise

─── graded against the real run ───
  ✓ start
  ✗ end       you predicted: timeout
  ✗ promise   you predicted: end
  ✗ timeout   you predicted: promise

  score: 1/4 (25%)

[n]ext · [r]etry · [o]pen notes · [q]uit ▸
```

Being wrong is the product. The friction of a failed prediction is what
makes the correct model stick — reading never does that. Progress is saved
in `.progress.json`, so quit anytime and `node learn.js` resumes where you
left off (`node learn.js status` shows your map).

## What you'll be able to do at the end

- **Predict the output** of any ordering puzzle — timers, promises,
  `nextTick`, `setImmediate`, I/O, thenables, mixed — and explain *why*.
- **Diagnose real pathologies**: event-loop blocking, microtask starvation,
  thread-pool convoys, backpressure OOMs — and name the fix.
- **Answer interview questions at any level**, from "why doesn't
  setTimeout(0) run immediately" to "walk me through uv_run's poll-timeout
  computation." That's what [INTERVIEW.md](INTERVIEW.md) is for: the
  canonical 90-second whiteboard answer, ~30 tiered Q&As, and a
  trick-question table with one-line defenses.

## The journey

| Stage | Lessons | What breaks in your brain (in a good way) |
|---|---|---|
| **The JavaScript layer** | [1](lessons/01-call-stack.js)–[5](lessons/05-async-await.js) | The call stack, why `setTimeout(0)` lies, microtasks cutting in line, Node's secret `nextTick` queue, what `await` compiles to. |
| **The Node/libuv layer** | [6](lessons/06-libuv-phases.js)–[11](lessons/11-escaping-the-loop.js) | The real phase loop, the 4-thread pool caught red-handed, proof sockets never touch it, blocking, starvation, timers as handles, worker threads. |
| **Checkpoint** | [12](lessons/12-capstone-gauntlet.js) | 8 puzzles, easy → brutal. |
| **The senior tier** | [13](lessons/13-errors-and-the-loop.js)–[16](lessons/16-production-loop.js) | Where throws actually go, `Promise.all`'s fine print, `emit()` being synchronous, backpressure, `monitorEventLoopDelay`, AsyncLocalStorage. |
| **The gauntlet** | [17](lessons/17-interview-hell.js) | 8 real interview traps: `forEach(async)`, double-awaited promises, a throwing `nextTick`, the final boss. |
| **The modern twist** | [18](lessons/18-esm-and-tla.js) | ES modules & top-level await: hoisting, suspended module graphs, and the mysterious exit code 13. |

Each lesson has a matching walkthrough in [notes/](notes/) — correct output,
line-by-line *why*, the misconception it kills, and a "go further"
experiment. Don't open it before you've made a prediction. That's the one
rule.

## The mental model you're building

```
                        ┌───────────────────────────┐
                        │        your JS runs        │
                        │      (the call stack)      │
                        └─────────────┬─────────────┘
                                      │ stack empties after EVERY callback
                                      ▼
                        ┌───────────────────────────┐
                        │  drain process.nextTick    │  ← lesson 4
                        │  drain microtasks          │  ← lessons 3, 5
                        │  (promises, queueMicrotask)│
                        └─────────────┬─────────────┘
                                      ▼
        ┌──────────────────  the libuv event loop  ─────────────────┐
        │                                                            │
        │   ┌─────────────┐  expired setTimeout / setInterval        │
        │   │   timers    │  callbacks                    lessons 2,10│
        │   └──────┬──────┘                                          │
        │   ┌──────▼──────┐  a few deferred system-level             │
        │   │   pending   │  callbacks (e.g. some TCP errors)        │
        │   └──────┬──────┘                                          │
        │   ┌──────▼──────┐  WAIT here for I/O; run I/O callbacks    │
        │   │    poll     │  (fs, network...)              lessons 7,8│
        │   └──────┬──────┘                                          │
        │   ┌──────▼──────┐  setImmediate callbacks                  │
        │   │    check    │                               lessons 6,9│
        │   └──────┬──────┘                                          │
        │   ┌──────▼──────┐  close events                            │
        │   │    close    │  (socket.on('close'))          lesson 7  │
        │   └──────┬──────┘                                          │
        │          │  anything still referenced? ──no──▶ process exits│
        │          └──────────── yes: loop again ▲        lesson 10  │
        └────────────────────────────────────────────────────────────┘

   Key rule: the nextTick + microtask drain happens between EVERY
   callback, not just between phases. It's the highest-priority queue
   in Node — and also the easiest way to starve everything (lesson 9).
```

By lesson 18 you'll draw this from memory — and know exactly which claims
in other people's diagrams are wrong.

## Who this is for

- **You use async/await daily but couldn't explain what `await` actually
  does** → start at lesson 1, it builds from zero async knowledge.
- **You're prepping for interviews** → do all 18, target 8/8 on both
  gauntlets *with spoken reasoning*, then drill [INTERVIEW.md](INTERVIEW.md).
- **You think you already know this** → go straight to
  `node learn.js 17 8`. If you clear the final boss cold, you were right.

## The fine print

**Manual mode** — every lesson also runs standalone, no trainer and no
dependencies: `node lessons/03-microtasks.js 2` runs one exercise; no
argument lists them. (Only the trainer needs `npm install` — the lessons
themselves are plain Node.)

**Grading is fair by construction** — exercises whose ordering can genuinely
vary under OS load are self-assessed, never diff-graded; every graded
exercise is settled by queue priority or phase geometry, which your machine
can't flip.

**A few exercises do real CPU work on purpose** (pbkdf2 hashing, a ~33 MB
JSON parse, fib(33)) so you can *feel* the loop block. Each takes at most a
few seconds, runs only when you invoke it, and always terminates on its own.

<details>
<summary><b>Glossary</b> (task, microtask, tick, phase, poll, handle...)</summary>

- **Task (macrotask)** — a callback scheduled to run as its own turn of the
  loop: timer callbacks, I/O callbacks, `setImmediate`. One runs, then the
  microtask queue drains, then the next.
- **Microtask** — a callback that runs as soon as the current stack empties,
  before any other task: promise reactions (`.then`, `await` resumptions),
  `queueMicrotask`.
- **`process.nextTick` queue** — Node-only queue drained even before
  microtasks. Not actually "next tick" — it's *this* tick, immediately.
- **Tick** — one full iteration of the event loop through its phases.
- **Phase** — a stage of libuv's loop (timers, pending, poll, check, close),
  each with its own callback queue.
- **Poll** — the phase where Node blocks waiting for I/O when it has nothing
  else to do. Most of a server's life is spent here.
- **Handle / ref** — a live thing (timer, socket, worker) that keeps the loop
  spinning. When nothing referenced remains, Node exits. `unref()` opts a
  handle out of this count.

</details>

## License

[MIT](LICENSE) — learn from it, fork it, teach with it.

If a prediction genuinely surprised you, that's the repo working —
⭐ star it so it can surprise the next person.
