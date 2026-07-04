# Notes — Lesson 17: Interview hell walkthroughs

## Trap 1 — forEach + async

```
start
kicking off 1
kicking off 2
kicking off 3
end — but is anything actually done?
processed 1
processed 2
processed 3
done 1
done 2
done 3
```

`forEach` **ignores return values** — it fires three async callbacks and
moves on. Each callback runs sync to its first suspension (`kicking off n`),
then the loop and `end` finish before any awaited work resumes. The resumes
then interleave in queue order: all three `processed` (first resumption
wave), then all three `done` (second wave).

The interview answers: `forEach` cannot await; the enclosing function can't
know when the work finishes; errors inside become unhandled rejections. Fix:
`for..of` with `await` (sequential) or `await Promise.all(arr.map(fn))`
(concurrent). Never `forEach(async ...)`.

## Trap 2 — await in a loop vs Promise.all

```
sequential (await in a loop):
  30ms query finished
  20ms query finished
  10ms query finished
sequential total: ~63ms
concurrent (Promise.all):
  10ms query finished
  20ms query finished
  30ms query finished
concurrent total: ~33ms
```

Sequential finishes in **call order** (each query only *starts* when the
previous one ends) and costs the **sum** (~60ms). Concurrent finishes in
**duration order** (all started together) and costs the **max** (~30ms).
The completion-order flip is the detail that proves you understand it —
not just the timing.

(Totals run a few ms over the ideal: timer clamping and loop overhead,
lesson 2.)

## Trap 3 — one promise, three consumers

```
executor runs (how many times total?)
A before await
B before await
sync end
A got 42
B got 42
C got 42
```

Once. The executor runs **synchronously at construction, exactly once** —
a promise is a *result container*, not a *task*. Awaiting it twice and
`.then`-ing it once just registers three reactions on the same settled
value, served in registration order (A, B, C).

This kills two widespread myths in one puzzle: "promises run when you await
them" (no — they were already running/settled) and "awaiting twice re-runs
the work" (no — same value, cached forever). Also why you can safely cache
in-flight promises for deduplication.

## Trap 4 — Promise.all with an already-rejected input

```
hop 1
hop 2
catch: nope
hop 3
finally
hop 4
```

`then (does this run?)` never prints — `all` rejects. The hop math: the
already-rejected input still takes one internal microtask for `Promise.all`
to observe it, and the rejection then has to *fall through* the `.then`
(which has no rejection handler — it just forwards) before reaching
`.catch`. That's why `catch` lands after hop 2, and `finally` — one more
link down the chain — after hop 3.

Nobody expects you to count these hops cold; interviewers use it to see if
you know that (a) rejections skip `.then` handlers but still traverse the
chain link by link, and (b) `.finally` is a chained microtask, not a
synchronous epilogue.

## Trap 5 — a throw in the nextTick queue

```
io callback
uncaught: tick goes boom
promise — do I still run?
immediate — still alive?
```

The throw unwinds out of the nextTick drain into `uncaughtException` — but
with a handler installed, **the loop then carries on**: the microtask queue
still drains (`promise`), the check phase still runs (`immediate`).

Two interview points: an uncaughtException handler resumes the *loop*, not
the failed *operation* (the rest of that nextTick queue drain was abandoned
— state may be inconsistent, which is why the docs say log-and-exit); and
each queued callback fails independently — one bad callback doesn't poison
the queues behind it.

## Trap 6 — async does not mean asynchronous (entirely)

```
a runs
object
b runs
b-value
a resolved with a-value
bystander
```

Line by line: `a()` executes its body **synchronously** (`a runs` — lesson
5), returns a promise; `.then()` returns another promise, and
`typeof promise === 'object'` (not "function", not "Promise" — `typeof`
only knows primitives). `b()` is plain sync. Then the microtasks: a's
reaction was registered before the bystander's, so it wins.

The trap is the `object` line — candidates who've never printed `typeof` a
promise guess "function" or hesitate. And `a resolved with a-value`
reinforces: an async function's return value is always delivered through
the promise, never synchronously.

## Trap 7 — the drain, mid-check-phase, with a twist

```
immediate 1
tick (from immediate 1)
microtask (from immediate 1)
tick (from the microtask)
immediate 2
```

After `immediate 1` returns, the between-callbacks drain runs — and it
**alternates until both queues are empty** (lesson 4 ex 3): nextTick queue
(`tick from immediate 1`), microtask queue (`microtask`, which enqueues a
new nextTick), then *back* to the nextTick queue (`tick from the
microtask`). Only when both are empty does the check phase proceed to
`immediate 2`.

If you predicted `immediate 2` before the second tick, you had the
simplified "drain once" model — this is the puzzle that upgrades it.

## Trap 8 — the final boss

```
S1
S2
S3
main tick
thenable.then runs
got T
all: x
IO
IO tick
IO immediate
```

The full trace:

1. **Sync**: `S1`; the async IIFE runs to its await (`S2`); awaiting the
   thenable queues its unwrap job. `readFile` starts. `Promise.all` of one
   resolved promise queues its internal observation job. `main tick` joins
   the nextTick queue. `S3`.
2. **nextTick drain**: `main tick` — beats every promise job.
3. **Microtask drain**: thenable unwrap job runs (`thenable.then runs`),
   resolving the await → resumption queued; `all`'s internal job resolves
   its promise → reaction queued. Then, same drain: `got T`, `all: x`.
4. **Poll phase** (next loop lap, once the read completes): `IO`, then its
   post-callback drain (`IO tick`), then **check** in the same iteration:
   `IO immediate`.

If you got all ten lines *and* can narrate why `main tick` beats the
thenable, why `got T` beats `all: x` (queue positions after the unwrap
job), and why `IO immediate` needs no clock luck (poll → check, lesson 6) —
there is no event-loop question left that can hurt you.

## After the gauntlet

Score yourself across all 8: **8/8 with spoken reasoning** = interview-proof.
6–7 = re-run the lessons the misses map to (each trap names its lesson).
Then read `INTERVIEW.md` for the conceptual side — output prediction is only
half of what interviews test.
