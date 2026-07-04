# Notes — Lesson 6: libuv's phases

First, the loop itself. Each iteration ("tick") walks these phases, running
each phase's queued callbacks (with the nextTick+microtask drain after every
single callback):

| phase | what runs there |
|-------|-----------------|
| **timers** | expired `setTimeout` / `setInterval` callbacks |
| **pending** | a few deferred system callbacks (e.g. certain TCP errors) |
| **poll** | I/O callbacks (fs, sockets). If nothing else is due, the loop **blocks here waiting for I/O** — this is where an idle server spends its life |
| **check** | `setImmediate` callbacks |
| **close** | `'close'` event callbacks |

Then it checks: anything still referenced (pending timers, open sockets)?
Yes → loop again. No → process exits.

## Exercises 1 & 2 — the race Node can't call

The tally depends on your machine: on a slower or loaded one you'll see a
**mix** (say `T` 6/10, `I` 4/10); on a fast, idle machine you may well see
`setImmediate` win **10/10**. Both results teach the same thing — the order
is *unspecified*, and here's why your machine leans the way it does:

Why nondeterministic? `setTimeout(0)` is clamped to **1ms** (lesson 2). When
the main script ends and the loop starts its first iteration, it enters the
**timers** phase and asks: "has 1ms elapsed since that timer was scheduled?"

- If process startup + your script took **≥ 1ms** to reach the loop (or the
  clock ticked over): the timer is expired → `setTimeout` fires first.
- If the loop got there in **< 1ms**: the timer isn't due yet → the timers
  phase runs nothing, the loop proceeds to check → `setImmediate` fires
  first, and the timer waits for iteration two.

So the "race" is actually your CPU racing a 1ms clock. It depends on machine
load, CPU speed, even CPU frequency scaling — a fast machine reaches the
loop in well under 1ms nearly every time (immediate wins), a busy CI box
flips back and forth. **Never write code that depends on setTimeout(0) vs
setImmediate order from the main script.**

(Compare lesson 4 exercise 1, where the timer beat the immediate reliably:
there, the extra scheduling work plus the nextTick/microtask drain before
the loop's first iteration pushed past the 1ms clamp. A few microseconds of
difference in your own code changes the winner — that's what "unspecified"
means in practice.)

## Exercise 3 — the same race inside an I/O callback

```
readFile callback (we are in the poll phase)
setImmediate
setTimeout(0)
```

**Deterministic, always.** The readFile callback runs in the **poll** phase.
From poll, the loop's next stop is **check** — so the `setImmediate` runs in
this very iteration. The timer has to wait for the *next* iteration's timers
phase. No clock race: the phase order settles it.

This is the actual meaning of `setImmediate`: "run in the check phase of
this loop iteration" — which, from inside any I/O callback, means *before*
any timer. Arguably `setImmediate` and `process.nextTick` have each other's
names ("immediate" runs later than "next tick"); the Node docs admit this
but it's too late to swap them.

## Exercise 4 — the drain between EVERY callback

```
immediate A
  nextTick scheduled by A
  promise scheduled by A
immediate B
```

Both immediates were queued in the same check phase, yet the nextTick and
promise cut in between them. After **each individual callback**, Node drains
the nextTick queue, then the microtask queue, before touching the next
callback — even within one phase.

(Fun fact: before Node 11, the drain only happened *between phases*, so this
printed A, B, nextTick, promise. Node 11 changed it to match browsers.)

## The one-sentence takeaway

> The event loop is a fixed circuit — timers → poll → check → close — and
> "which fires first" questions are answered by *where in the circuit you're
> standing when you schedule*, except for main-script setTimeout(0) vs
> setImmediate, which is a coin flip against a 1ms clock.

## Go further

In exercise 1, add `const t = Date.now(); while (Date.now() - t < 5) {}`
*after* scheduling both. Now the timer is guaranteed expired when the loop
starts — the race becomes deterministic (setTimeout always wins). One line
of blocking turned a coin flip into a certainty; make sure you can explain
why.
