# The Event-Loop Interview Handbook

Prediction puzzles (lessons 12 and 17) are half of what interviews test.
The other half is **explaining** — clearly, at the right depth, without
reciting myths. This handbook is that half: a canonical whiteboard answer,
tiered Q&A with model answers, and the trick-question inventory.

Every answer here maps to a lesson where you *ran the proof*. If an answer
doesn't feel obvious, that lesson number is your homework.

---

## The 90-second whiteboard answer

*"Explain the Node.js event loop."* — the opener at every level. A complete,
correct, non-rambling answer:

> JavaScript in Node runs on a single thread with a call stack, and nothing
> asynchronous can run until that stack is empty. When it empties, Node
> first drains two priority queues completely: the `process.nextTick` queue,
> then the microtask queue — promise callbacks and `queueMicrotask`. This
> drain happens between *every* callback, not just occasionally.
>
> Then there's the event loop proper — libuv — which cycles through phases:
> **timers** (expired setTimeout/setInterval), a **pending-callbacks** phase,
> **poll** (where finished I/O callbacks run, and where the loop blocks
> waiting for I/O when idle), **check** (setImmediate), and **close**
> callbacks. Between every callback in every phase, that nextTick/microtask
> drain runs again.
>
> I/O itself doesn't happen on the JS thread: files, DNS, and crypto run on
> libuv's thread pool (4 threads by default), and sockets use the OS's
> readiness notifications — epoll, kqueue. The loop's job is dispatching
> completions back into JS.
>
> The process stays alive while referenced handles exist — timers, sockets,
> servers — and exits when none remain. The practical consequences: never
> block the stack with heavy synchronous work, never recursively schedule
> microtasks or nextTicks because they starve the loop, and move real CPU
> work to worker threads.

If you can also *draw* the phase circle with the drain marked between
callbacks (README diagram), most interviews are effectively over.

---

## Tier 1 — Junior ("do you know what happens")

**Q: Why does `setTimeout(fn, 0)` not run immediately?**
A: The callback can only run when the current stack is empty and the loop
reaches the timers phase; 0 is also clamped to 1ms. The delay is a minimum,
not a schedule. *(Lessons 1–2)*

**Q: What's the output order of sync code, a promise `.then`, and a
`setTimeout(0)`?**
A: Sync first, promise second (microtask), timeout last (task). Scheduling
order never beats queue priority. *(Lesson 3)*

**Q: Is `async`/`await` a new threading mechanism?**
A: No — sugar over promises. The function runs synchronously until the first
`await`, then suspends; the rest resumes as a microtask. *(Lesson 5)*

**Q: Why is my variable still undefined right after I set it in a
callback?**
A: The callback hasn't run yet — your synchronous code always finishes
first, in its entirety. *(Lesson 1)*

**Q: Does calling an async function block the caller?**
A: Up to its first `await`, yes — everything before the first await runs
synchronously on the caller's stack. *(Lesson 5, exercise 1)*

**Q: What does `Promise.all` return if one input rejects?**
A: It rejects with that first error, immediately — but the other operations
keep running; nothing is cancelled. *(Lesson 14)*

## Tier 2 — Mid ("do you know how it works")

**Q: `process.nextTick` vs `setImmediate` — which runs first, and are the
names right?**
A: nextTick runs first — before promises, before any phase. setImmediate
runs in the check phase, after poll. The names are famously backwards
("immediate" is later than "next tick"); the Node docs admit it. Prefer
`queueMicrotask` over nextTick for new code. *(Lessons 4, 6)*

**Q: `setTimeout(fn, 0)` vs `setImmediate(fn)` — which fires first?**
A: From the main script: **unspecified** — it depends on whether the loop
reaches the timers phase within the 1ms clamp, which varies with machine
and load. From inside an I/O callback: **setImmediate, always** — poll is
followed by check; the timer waits for the next lap. *(Lesson 6)*

**Q: Is Node single-threaded?**
A: The JS execution is. But fs, dns.lookup, crypto, zlib run on libuv's
thread pool (default 4, `UV_THREADPOOL_SIZE` to change), and network
sockets use OS readiness APIs with no threads at all. "Your JS is
single-threaded; Node is not." *(Lesson 7)*

**Q: How do errors travel in async code — will try/catch around a
setTimeout catch a throw inside it?**
A: No — the callback runs on a future stack. try/catch works only around
`await`. Callback throws become uncaughtException; promise rejections
without handlers crash the process in modern Node
(`--unhandled-rejections=throw` is the default since 15). *(Lesson 13)*

**Q: Is `emit()` asynchronous?**
A: No — listeners run synchronously on the emitting stack, in registration
order, from a per-emit snapshot of the listener list. Node's I/O events
feel async because the *emit sites* are in the poll phase. *(Lesson 15)*

**Q: What happens to missed setInterval ticks when the loop is blocked?**
A: Dropped, not queued — you get one late tick, then the rhythm resumes.
An interval promises *at most* one tick per period. *(Lessons 2, 10)*

**Q: What keeps a Node process alive, and what does `unref()` do?**
A: Referenced handles: pending timers, open sockets/servers, workers,
in-flight I/O. Pending *promises* keep nothing alive. `unref()` excludes a
handle from the count — housekeeping timers use it so the process can exit.
*(Lesson 10)*

**Q: Why is `array.forEach(async ...)` a bug?**
A: forEach discards the returned promises — nothing awaits them, completion
is unknowable, rejections go unhandled. Use `for..of` + await (sequential)
or `Promise.all(arr.map(...))` (concurrent). *(Lesson 17, trap 1)*

## Tier 3 — Senior ("do you know why, and what breaks")

**Q: Explain starvation. Why is recursive setImmediate safe when recursive
nextTick isn't?**
A: nextTick/microtask queues must drain *completely* before the loop
advances — recursive scheduling there freezes timers and I/O forever while
CPU sits at 100%. A setImmediate scheduled during check runs the *next*
iteration, so each recursion grants the whole loop a lap: timers fire, poll
serves I/O. That's why chunked work yields with setImmediate. The disguised
version: `while (!done) await alreadyResolvedThing()` is a microtask-loop
starvation bug. *(Lesson 9)*

**Q: How do you detect event-loop blocking in production?**
A: `perf_hooks.monitorEventLoopDelay()` — a native histogram of loop lag.
Alert on p99, not mean: blocking is a tail phenomenon (a 250ms block barely
moves the mean but explodes p99/max). The DIY version is measuring how late
a fixed-interval timer fires. *(Lessons 8, 16)*

**Q: A request takes 2 seconds of CPU. What are your options and their
trade-offs?**
A: (1) Chunk with setImmediate — keeps the loop breathing, same total CPU,
adds code complexity; good for tens-of-ms work. (2) Worker threads —
true parallelism, ~30–100ms spawn cost so use a pool sized to cores
(piscina); right for reliably heavy work. (3) A separate service/process —
adds ops cost, right for isolation. Never nextTick/microtask chunking —
that's starvation with extra steps. *(Lessons 9, 11, 16)*

**Q: How does AsyncLocalStorage keep request context across await/timer
hops, and why can't a global variable do it?**
A: A global breaks the moment two requests interleave through the queues —
callbacks read whichever request wrote last. ALS (async_hooks machinery)
snapshots the store at scheduling time and restores it around every
callback the operation spawns. Gotcha: listeners registered *outside*
`als.run` don't inherit the context — `AsyncResource.bind` fixes it.
*(Lesson 16)*

**Q: What is backpressure and what does `write()` returning false mean?**
A: The consumer is slower than the producer. `false` means "chunk accepted
but buffer is ≥ highWaterMark — stop until `'drain'`." Ignoring it doesn't
error; it buffers unboundedly (the classic OOM-under-load postmortem).
`pipe`/`pipeline` implement the stop/resume protocol automatically.
*(Lesson 15)*

**Q: Why can a "fully async" service time out every request at 100% CPU?**
A: Something is starving the poll phase — a microtask/nextTick loop or
back-to-back CPU-heavy callbacks. I/O completions (and new connections!)
are ready but never dispatched. Diagnose with loop-delay monitoring and a
CPU profile. *(Lessons 8, 9)*

**Q: `return p` vs `return await p` inside async functions?**
A: Same value, different mechanics: `return p` resolves the outer promise
*with a promise*, costing ~2 extra microtask hops via the unwrap job;
`return await p` unwraps in one hop, keeps the function in stack traces,
and lets an enclosing try/catch see rejections. `no-return-await` lint
advice is obsolete. *(Lessons 5, 14)*

## Tier 4 — Staff / "no matter how experienced the interviewer"

**Q: Walk me through one full iteration of uv_run.**
A: Update the loop's cached time; run due timers; run pending callbacks
(deferred system errors); idle/prepare (internal); compute the **poll
timeout** — 0 if immediates are queued or timers are due, otherwise the
time until the nearest timer, or infinite if none — then block in
epoll/kqueue for at most that long, dispatching I/O callbacks; run the
check queue (immediates); run close callbacks; check for referenced
handles; repeat or exit. The poll-timeout computation is *why* the loop
never oversleeps a timer and why an idle server costs ~zero CPU. *(Lesson 6
+ libuv design docs)*

**Q: Why did `await` ordering change in Node 12, and what does that tell
you about the spec?**
A: V8 7.2 collapsed `await` on native promises from three microtask jobs
(wrap in a new promise + unwrap dance) to one, after a spec change
(`promiseResolve` short-circuit) — old blog posts show `async1 end` after
`promise then`; modern engines show it before. Non-native thenables still
take the slow path, since their `.then` must be called as its own job.
Moral: ordering is spec-defined but *was* engine-visible — pin your mental
model to the current spec, and never write code whose correctness depends
on hop counts. *(Lessons 5, 14)*

**Q: When does Node decide a rejection is "unhandled", exactly?**
A: At the end of the microtask drain in which it settled — attaching a
handler within the same drain is safe; attaching later triggers
`unhandledRejection` (fatal by default since Node 15), and a late handler
after that fires `rejectionHandled`. It's a deadline at drain-boundary
granularity, not an instant judgment. *(Lesson 13)*

**Q: The thread pool is size 4. What's the failure mode, and would you
raise it?**
A: Convoying: slow jobs (big pbkdf2, cold-cache fs on network storage,
dns.lookup under resolver latency) occupy all 4 threads and queue *behind*
them everything else — fs reads stall because crypto is busy. Diagnose by
timing pool-bound ops. Raise `UV_THREADPOOL_SIZE` toward core count for
pool-heavy workloads, but it's a band-aid if the real issue is oversized
sync-ish work — restructure (streaming, workers, native async DNS) first.
*(Lesson 7)*

**Q: `socket.destroy()` then `setImmediate(...)` — which callback runs
first, the socket's 'close' or the immediate?**
A: Depends where you stand. From inside a check-phase callback: the close
event — the close phase is *later in the same iteration*, while a new
immediate waits for the next iteration's check snapshot. Phase geometry
beats intuition; this is the question that separates "read a diagram" from
"traced it". *(Lesson 7, exercise 4)*

**Q: How would GC interact with everything above?**
A: GC pauses happen on the JS thread (plus helper threads for concurrent
phases) and show up as loop delay indistinguishable from blocking code —
another reason to monitor loop lag rather than instrument only your own
functions. Allocation-heavy microtask storms both starve the loop *and*
feed the GC. (Beyond this repo's scope — profile with
`--trace-gc` / heap snapshots.)

---

## Trick-question inventory (one-line defenses)

| Trick | Defense | Proof |
|---|---|---|
| "setTimeout(fn,0) runs at 0ms" | Clamped to 1ms; runs when timers phase + empty stack allow | L2 |
| "the executor runs when you await" | Executor runs synchronously at `new Promise` | L17 t3 |
| "awaiting twice re-runs the work" | Promises cache; reactions just re-read the value | L17 t3 |
| "microtasks drain between phases" | Between **every callback** (post-Node-11) | L6 e4 |
| "setInterval drifts" | Modern Node holds the grid if work fits; *naive re-arm chains* drift | L10 e1 |
| "a pending promise keeps the process alive" | Only referenced *handles* do; promises are inert objects | L10 e4 |
| "setTimeout-vs-setImmediate from main script" | Unspecified — clock race; only deterministic from inside I/O | L6 |
| "async fn throws synchronously if it throws before await" | Never — always a rejection | L13 e2 |
| "unhandled rejections just log a warning" | Fatal by default since Node 15 | L13 e4 |
| "emit() queues the event" | Synchronous call, current stack | L15 e1 |
| "write() false means the write failed" | Accepted-but-please-stop; ignoring it = unbounded memory | L15 e3 |
| "typeof aPromise" | `'object'` | L17 t6 |
| "forEach can await" | It discards promises; use for..of or Promise.all+map | L17 t1 |
| "recursive setImmediate freezes the loop like nextTick" | Opposite — one loop lap per recursion; it's the *safe* one | L9 |

## How to prep with this repo

1. Lessons 1–11 with the trainer (`node learn.js`), honestly predicting.
2. Gauntlets: lesson 12, then 17. Target 8/8 *with spoken reasoning*.
3. Read this handbook; for any answer you couldn't have produced, re-run
   its lesson.
4. Day before the interview: redo lesson 17 and rehearse the 90-second
   whiteboard answer out loud, drawing the diagram from memory.
