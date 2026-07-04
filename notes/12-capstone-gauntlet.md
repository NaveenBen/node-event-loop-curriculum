# Notes — Lesson 12: Capstone walkthroughs

Score yourself per puzzle: full credit only if the *reasoning* was right too.

## Puzzle 1 — warm-up

```
one
five
four
three
two
```

Sync (`one`, `five`) → nextTick queue (`four`) → microtasks (`three`) →
timers (`two`). The four-rung priority ladder from lesson 4, verbatim.

## Puzzle 2 — microtasks between timer callbacks

```
then 1
then 2
timer 1
timer 2
promise inside timer 2
```

Main script ends → microtask drain runs the whole chain (`then 1`, `then 2`
— chained hops, but nothing competes, so back to back). Timers phase:
`timer 1`, then the drain between callbacks (nothing queued), then
`timer 2`, whose microtask runs immediately after it — before the loop goes
anywhere else (lesson 3, exercise 5).

## Puzzle 3 — async/await

```
start
f start
g
end
f end
then
```

`f()` runs sync to its await (`f start`), `g()` runs entirely (`g` — no
await inside it), then `await` suspends f, queuing its resumption. Back in
main: the `.then` is queued *behind* f's resumption. `end`. Drain: `f end`,
`then`. Lesson 5's famous question, minus the timer.

## Puzzle 4 — crossing the streams

```
tick 1
then 1
micro 1
tick 2
```

Drain nextTick queue first (`tick 1`). Then drain microtasks **fully**:
`then 1` (which schedules `tick 2` — but nextTick can't preempt a microtask
drain), then `micro 1`. Only when microtasks are empty does the alternation
return to the nextTick queue: `tick 2`. Lesson 4, exercise 3.

## Puzzle 5 — the I/O launchpad

```
read done
tick
promise
immediate
timeout
```

We're standing in the **poll** phase. After the callback: nextTick, then
microtasks. Then the loop walks forward: **check** is next (`immediate`),
and the timer waits for the next iteration's timers phase (`timeout`).
From inside I/O, immediate-beats-timer is deterministic — lesson 6,
exercise 3.

## Puzzle 6 — immediates all the way down

```
immediate 1
tick from immediate 1
immediate 2
immediate 3
```

`immediate 1` and `immediate 2` are in this check phase's queue. After
`immediate 1`: the between-every-callback drain runs its nextTick. But
`immediate 3`, scheduled *during* check, missed this iteration's snapshot —
it runs in the **next** loop iteration, after `immediate 2`. Lessons 6.4
and 7.4.

## Puzzle 7 — the return of `return p`

```
a resolved: 1
hop 1
hop 2
b resolved: 2
hop 3
```

`a` returns a plain value → its promise resolves immediately; the `.then`
callback is enqueued first of everything, so `a resolved: 1` even beats
`hop 1`. `b` returns a *promise* → the two-extra-hops slow path (unwrap
thenable, then resolve outer), landing `b resolved: 2` after hop 2.
Lesson 5, exercise 4.

## Puzzle 8 — the brutal one

```
K
A (read done)
H
J
I
E
F
G
B
C
D
```

The full trace:

1. **Main script**: `K`. Loop enters poll, waits for the read.
2. **Poll phase** — readFile callback: `A`. The async IIFE runs sync to its
   await: `H`. Timer (5ms) and immediate get scheduled; `J` queued as
   nextTick.
3. **Drain after the callback**: nextTick `J`, then microtask `I` (the
   await resumption).
4. **Check phase, same iteration**: `E`. Its own drain: `F` (queueMicrotask).
   `G` was scheduled during check → next iteration.
5. **Next iteration**: timers — B's 5ms isn't up yet, skip. Poll — nothing.
   Check: `G`.
6. The loop parks in poll until the timer is due, then: `B`, and its
   post-callback drain: nextTick `C` before promise `D`.

If you got all eleven — including *why* G beats B (a loop lap is far faster
than 5ms) and why C beats D (nextTick before microtasks, even mid-loop) —
you have the complete model:

> sync → nextTick → microtasks → and around the phase wheel:
> timers → poll → check → close — with the drain after every callback.

## Where to go from here

- `node --inspect` + Chrome DevTools' Performance tab: watch real tasks and
  microtasks on a timeline.
- `perf_hooks.monitorEventLoopDelay()` — production-grade lag monitoring
  (you built the toy version in lesson 8).
- Read libuv's own guide (docs.libuv.org — "Design overview") — after this
  curriculum, it reads like a recap.
- The async_hooks / AsyncLocalStorage rabbit hole: how Node tracks context
  *across* all these queue hops.
