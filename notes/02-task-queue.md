# Notes — Lesson 2: The task queue

## Exercise 1 — same delay, what order?

```
all three scheduled
timer A
timer B
timer C
```

`main: done` first, of course (lesson 1). Timers with the same due time fire
in **FIFO order** — first scheduled, first fired. Under the hood Node keeps
one list per due-time, and appends.

## Exercise 2 — 0ms vs 1ms vs 2ms (clamping)

```
0ms timer
1ms timer
2ms timer
```

Even though the 2ms timer was *scheduled first*, timers fire ordered by
**due time**, not scheduling order.

The trick: **Node clamps `setTimeout(fn, 0)` to 1ms.** There is no true
zero-delay timer. So the 0ms and the 1ms timer have the *same* due time, and
the tie is broken by insertion order (0ms was scheduled before 1ms). If you
ever see code relying on `setTimeout(fn, 0)` beating `setTimeout(fn, 1)`,
it's relying on this clamp + FIFO tie-break.

(Browsers have a related but different rule: nested timers beyond depth 5 are
clamped to 4ms. That's HTML-spec, not Node.)

## Exercise 3 — a timer scheduled from inside a timer

```
main: done
outer: start
outer: end
inner (scheduled from inside outer)
```

`inner` can **never** run in the same turn as `outer`, even at 0ms. When
`outer` runs, the timers phase is processing a snapshot of *already expired*
timers; `inner` is brand new (due ~1ms from *now*) and must wait for a future
pass through the timers phase. One callback finishing completely before the
next begins — run-to-completion again, now at the queue level.

## Exercise 4 — expired timers fire in delay order

```
unblocked at 100ms
10ms timer fired at 100ms
30ms timer fired at 100ms
```

Both timers expired ages ago, but they still fire in **due-time order**
(10 before 30), not scheduling order (30 was scheduled first), and both fire
immediately after the block ends — back to back in the same timers phase.

So a timer's delay determines *ordering priority*, and the event loop's
availability determines *actual firing time*. Two independent things.

## Exercise 5 — setInterval while blocked: do ticks pile up?

```
unblocked at 100ms
tick 1 at 100ms
tick 2 at 12xms
tick 3 at 14xms
... (steady ~20ms apart until tick 8)
```

**Missed intervals are dropped, not queued.** We blocked through ~5 would-be
ticks but got only ONE catch-up tick, after which the interval resumes its
rhythm. Node reschedules the next fire relative to when the callback actually
ran — it doesn't maintain a debt of missed executions.

If you need "exactly N executions" or "catch up on missed work", an interval
can't give you that; you need to track time yourself (lesson 10 digs into
interval drift).

## The one-sentence takeaway

> A timer is an *eligibility time* plus a place in line — the event loop
> decides when it actually runs, ordering expired timers by due time.

## Go further

In exercise 4, add a third `setTimeout(..., 30)` scheduled *before* the
existing 30ms one. Same due time — verify the FIFO tie-break from exercise 1
still holds among expired timers.
