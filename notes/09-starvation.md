# Notes — Lesson 9: Starvation

## Exercise 1 — recursive nextTick

```
recursive nextTick started (will stop rescheduling at 150ms)
10ms timer finally fired at ~150ms, after ~X,XXX,XXX nextTicks
```

The timer fires **15× late**, and only because we mercifully stopped
rescheduling. Millions of individually-tiny callbacks starved it completely:
the nextTick queue must be **empty** before the loop advances, and it never
was. Each callback yielding the stack is irrelevant — the *queue* never
yielded.

Without the 150ms bound, that timer would never fire. Ever. Neither would
any I/O. The process would sit at 100% CPU doing nothing observable —
"async" code behaving exactly like `while(true)`.

## Exercise 2 — recursive microtasks

```
recursive queueMicrotask started (will stop at 150ms)
10ms timer finally fired at ~150ms, after ~X,XXX,XXX microtasks
```

Identical disease, different queue. And this one has an innocent disguise
that ships to production regularly:

```js
while (!done) {
  await somethingThatResolvesImmediately();   // e.g. a cache hit!
}
```

If the awaited thing is already resolved, each iteration is just one
microtask hop — this loop **is** exercise 2. It runs "asynchronously"
forever while timers, sockets, and your health-check endpoint all starve.
The classic real-world shape: a retry/poll loop whose backoff timer gets
skipped on some path.

## Exercise 3 — recursive setImmediate

```
recursive setImmediate started (will stop at 150ms)
10ms timer fired at ~10ms, after only ~N,NNN immediates
```

The timer fires **on time** (~10–12ms), after only a few hundred immediates
(vs the *millions* of nextTicks/microtasks in the same window — each
immediate is a full loop lap, and laps aren't free). Night and day. Why?

`setImmediate` callbacks run in the **check phase**, and callbacks scheduled
*during* check go to the **next loop iteration** (lesson 7, exercise 4 showed
this). So each immediate = one full lap of the loop — passing through the
timers phase (our timer fires the lap after it expires) and the poll phase
(I/O gets serviced) every single time.

That's the design rule for chunked work on the main thread:

> **Yield with `setImmediate` between chunks — never with nextTick,
> queueMicrotask, or a bare `await` of something resolved.**

Only setImmediate gives the rest of the loop a turn per chunk.

## Exercise 4 — starving I/O, not just timers

```
process.nextTick loop:
   read completed at ~150ms
queueMicrotask loop:
   read completed at ~150ms
setImmediate loop:
   read completed at ~1–5ms
```

Same story with a file read: the data was ready in ~1ms (pool thread did its
job, lesson 8), but the poll phase couldn't run to deliver it. The
setImmediate loop visits poll every lap, so the read completes at its
natural speed.

If you starve poll on a server, you starve **accepting connections** —
this is how a "fully async" service can time out every request while CPU
sits at 100% in tiny callbacks.

## The one-sentence takeaway

> Starvation is blocking with extra steps: nextTick and microtask queues
> must empty before the loop moves, so recursive scheduling there freezes
> timers and I/O — `setImmediate` is the only self-rescheduling primitive
> that gives the whole loop a turn each round.

## Go further

Take exercise 2 and change exactly one thing: `queueMicrotask(again)` →
`setTimeout(again, 0)`. Measure how many iterations happen in 150ms compared
to setImmediate. (You'll find timers are much slower per-lap than immediates
— the 1ms clamp. Now you know why data-pump libraries chain setImmediate,
not setTimeout.)
