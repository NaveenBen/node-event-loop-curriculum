# Notes — Lesson 3: Microtasks

## Exercise 1 — the classic

```
start
end
promise
timeout
```

Four things, three priority levels:

1. **Synchronous code** runs to completion first: `start`, `end`.
2. Stack empties → **microtask queue drains**: `promise`.
3. Event loop proceeds to the timers phase: `timeout`.

The promise callback was scheduled *after* the timer, yet runs *before* it.
Scheduling order only breaks ties **within** a queue, never between queues.

## Exercise 2 — chains hop, they don't sprint

```
A1
B1
A2
B2
A3
B3
```

Interleaved! Each `.then` callback is a **separate microtask**, and a chained
`.then` isn't even *scheduled* until the previous one resolves. The drain
goes: run A1 (this schedules A2 at the back of the queue, behind B1), run B1
(schedules B2 behind A2), run A2... one hop at a time, round-robin.

Mental model: a promise chain is not a block of code — it's a relay race
where each leg re-enters the queue at the back.

## Exercise 3 — queueMicrotask vs .then

```
sync
then #1
queueMicrotask #1
then #2
queueMicrotask #2
```

One queue, strict FIFO. `Promise.resolve().then(fn)` and `queueMicrotask(fn)`
land in the **same** microtask queue in scheduling order (the promise is
already resolved, so its `.then` callback is queued immediately).

`queueMicrotask` is just the promise machinery without the promise — useful
when you want "after the current stack, before anything else" without
allocating a promise. (Node also has `process.nextTick`, which is NOT this
queue — that's lesson 4's plot twist.)

## Exercise 4 — the queue drains completely

```
microtask depth 1
microtask depth 2
microtask depth 3
microtask depth 4
microtask depth 5
timeout — did I beat any microtasks?
```

The timer never sneaks in. Microtasks scheduled *while draining the
microtask queue* are appended and drained in the same pass — the loop only
moves on when the queue is **empty**. Five deep, five hundred deep, doesn't
matter.

This completeness rule is a double-edged sword: it's what makes promise
chains feel atomic, and it's also a foot-gun — an unbounded microtask
recursion freezes timers and I/O forever (lesson 9 weaponizes this).

## Exercise 5 — microtasks drain between tasks too

```
timer 1
microtask scheduled by timer 1
timer 2
```

The microtask beats timer 2 even though timer 2 was scheduled way earlier
and is sitting *expired* in the timers queue. The rule is:

> After **every** callback (task) completes, the microtask queue is drained
> before the next task runs — even between two callbacks in the same phase.

Not "between phases", not "once per loop iteration" — between *every single
task*. This is the detail most diagrams get wrong.

## The one-sentence takeaway

> Tasks take turns; microtasks butt in after every turn and don't leave
> until their queue is empty.

## Go further

In exercise 4, change `depth < 5` to `depth < 5_000_000` and add a
`Date.now()` timestamp to the timeout log. Watch a "0ms" timer take seconds.
You've built a starvation bug — lesson 9 explores when this happens in real
code.
