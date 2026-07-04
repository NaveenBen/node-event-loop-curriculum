# The Node.js Event Loop — Inside Out

A predict-then-run curriculum. You don't read about the event loop here — you
bet against it, lose, and figure out why. That's the whole method.

18 lessons · 83 runnable exercises · an interview handbook · zero
dependencies · Node 18+ (all expected outputs verified on Node 23)

The goal is zero → interview-proof: finish this and there is no Node.js
event-loop question — predict-the-output or conceptual, junior or staff
level — that should be able to surprise you. The conceptual half lives in
[INTERVIEW.md](INTERVIEW.md).

## How to use this

### Interactive mode (recommended)

```sh
node learn.js            # resume from your first unattempted exercise
node learn.js 3          # jump to lesson 3
node learn.js 3 2        # jump to lesson 3, exercise 2
node learn.js status     # progress map
node learn.js reset      # wipe saved progress
```

The trainer shows each exercise's code, has you **type your predicted
output line by line**, runs the real code, and grades you against it
(✓/✗ per line — numbers are wildcarded, so "fired at 500ms" matches
"fired at 503ms"). Timing-heavy and deliberately nondeterministic
exercises switch to honest self-assessment instead. After each exercise:
`[n]ext`, `[r]etry`, `[o]pen notes`, `[q]uit`. Progress is saved in
`.progress.json` (safe to delete).

Grading is fair by construction: exercises whose ordering *can* genuinely
vary under OS load are the self-assessed ones — every diff-graded exercise
is settled by queue priority or phase geometry, which your machine can't
flip. If a graded line ever surprises you, it's the model, not the OS.

### Manual mode

Every lesson is also a plain runnable file in `lessons/` with numbered
**exercises**. For each exercise:

1. **Read** the exercise code in the lesson file.
2. **Predict** the exact output. Write it in the `YOUR PREDICTION` comment
   block *before running anything*. No skipping — the prediction is the lesson.
3. **Run** just that exercise:
   ```sh
   node lessons/03-microtasks.js 2    # runs exercise 2 of lesson 3
   node lessons/03-microtasks.js     # no number → lists the exercises
   ```
4. **Compare.** If you were wrong (you will be, that's good), open the
   matching file in `notes/` for a line-by-line walkthrough of *why*.

Don't open the notes file until you've made a prediction. Being wrong first
is what makes the explanation stick.

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

## Lessons

| # | File | What you'll internalize |
|---|------|------------------------|
| 1 | [01-call-stack.js](lessons/01-call-stack.js) | Nothing async runs until the stack is empty. Ever. |
| 2 | [02-task-queue.js](lessons/02-task-queue.js) | `setTimeout(fn, 0)` is a request, not a command. Timer ordering + clamping. |
| 3 | [03-microtasks.js](lessons/03-microtasks.js) | Microtasks (promises) drain *completely* before the next task. Chained `.then` hops. |
| 4 | [04-nexttick.js](lessons/04-nexttick.js) | `process.nextTick` beats even promises. Node's secret pre-queue. |
| 5 | [05-async-await.js](lessons/05-async-await.js) | What `await` compiles down to. Why line order ≠ run order in async fns. |
| 6 | [06-libuv-phases.js](lessons/06-libuv-phases.js) | The real loop: timers → poll → check. `setImmediate` vs `setTimeout(0)`, incl. the famous nondeterministic case. |
| 7 | [07-io-and-ordering.js](lessons/07-io-and-ordering.js) | Where `fs.readFile` callbacks land, the 4-thread pool caught in the act, and proof that sockets never touch it. |
| 8 | [08-blocking-the-loop.js](lessons/08-blocking-the-loop.js) | One slow sync function delays every timer, request, and I/O. Measuring loop lag. |
| 9 | [09-starvation.js](lessons/09-starvation.js) | Recursive nextTick/microtasks freeze the loop forever; recursive `setImmediate` doesn't. Why. |
| 10 | [10-timers-deep-dive.js](lessons/10-timers-deep-dive.js) | `setInterval` drift, `unref()`, and why Node knows when to exit. |
| 11 | [11-escaping-the-loop.js](lessons/11-escaping-the-loop.js) | When the loop is the wrong tool: `worker_threads` keep timers alive during CPU work. |
| 12 | [12-capstone-gauntlet.js](lessons/12-capstone-gauntlet.js) | 8 mixed puzzles, easy → brutal. First checkpoint. |
| 13 | [13-errors-and-the-loop.js](lessons/13-errors-and-the-loop.js) | Where throws go: try/catch vs future stacks, rejections, uncaughtException, the 'error' event. |
| 14 | [14-promise-combinators.js](lessons/14-promise-combinators.js) | `all`/`race`/`any` fine print: result order, fail-fast without cancellation, thenable unwrap costs. |
| 15 | [15-emitters-and-streams.js](lessons/15-emitters-and-streams.js) | `emit()` is synchronous; streams and backpressure — `write() === false` and `'drain'`. |
| 16 | [16-production-loop.js](lessons/16-production-loop.js) | `monitorEventLoopDelay` (alert on p99), AsyncLocalStorage context, chunking with setImmediate. |
| 17 | [17-interview-hell.js](lessons/17-interview-hell.js) | 8 real interview traps (forEach+async, double await, throwing nextTick...). The final boss. |
| 18 | [18-esm-and-tla.js](lessons/18-esm-and-tla.js) | ES modules & top-level await: import hoisting, suspended module graphs, exit code 13. |

Lessons 1–5 are about **JavaScript's** queues (stack, tasks, microtasks —
mostly true in browsers too). Lessons 6–11 are about **Node/libuv**
specifically. Lesson 12 is the first checkpoint; 13–16 are the
senior/production tier (errors, combinators, backpressure, observability);
17 is the interview gauntlet; 18 covers how ES modules and top-level await
change the startup rules.

## Interview prep

[INTERVIEW.md](INTERVIEW.md) is the conceptual companion: the canonical
90-second "explain the event loop" whiteboard answer, ~30 tiered Q&As
(junior → staff) each mapped to the lesson that proves it, and a
trick-question inventory with one-line defenses. Suggested path: lessons
1–11 with the trainer → gauntlets 12 and 17 (target 8/8 with spoken
reasoning) → the handbook → rehearse the whiteboard answer out loud.

## Glossary

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

## A note on heavy exercises

A few exercises intentionally do real CPU work so you can *feel* the loop
block: lesson 7 hashes with `pbkdf2`, lesson 8 parses a ~33 MB JSON string,
lesson 11 computes `fib(33)`. Each takes at most a few seconds, runs only
when you explicitly invoke that exercise, and always terminates on its own.

## License

[MIT](LICENSE) — learn from it, fork it, teach with it.
