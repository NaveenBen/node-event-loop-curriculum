# Notes — Lesson 1: The call stack

## Exercise 1 — stack order

```
a: start
b: start
c: I am the top of the stack
b: end
a: end
```

(5 lines, not 6 — if you predicted 6, note how easily we invent structure
that isn't there.)

Calling a function **pushes** a frame; returning **pops** it. `a` can't log
`a: end` until `b` returns, and `b` can't finish until `c` returns. The stack
at the deepest moment is `main → a → b → c`. Nothing surprising — this
exercise exists so you *feel* the LIFO order before async enters the picture.

## Exercise 2 — the timer that couldn't

```
blocking the stack starting at 0ms...
done blocking at 500ms
timer fired at 500ms (asked for 0ms)   ← give or take a few ms
```

The `setTimeout(…, 0)` does **not** mean "run this at 0ms". It means:
"when at least 0ms have passed **and the call stack is empty**, run this."
The while loop keeps `ex2` on the stack for 500ms, so the timer callback —
though *expired* after ~1ms — just sits in the timers queue waiting.

Key takeaways:

- The loop is **never** interrupted. JavaScript callbacks don't preempt each
  other; a callback always runs to completion ("run-to-completion" semantics).
- A timer's delay is a **minimum**, never a guarantee.

## Exercise 3 — the stack, caught red-handed

Trace A shows the full synchronous chain:

```
Error: not a real error, just a camera
    at inner (...)
    at middle (...)
    at outer (...)
    at ex3 (...)
```

Trace B shows only:

```
Error: camera again
    at Timeout.timerCallback (...)
    at listOnTimeout (node:internal/timers...)
    at process.processTimers (node:internal/timers...)
```

`outer`, `middle`, `inner` are **gone**. By the time the timer callback runs,
those functions returned long ago — their frames were popped. The callback
starts on a **fresh, nearly-empty stack** whose base is Node's internal timer
machinery (`processTimers`), not your code.

This is why stack traces in async code are famously unhelpful, and why
`async/await` (lesson 5) re-stitches traces for you: the engine keeps extra
bookkeeping, because the *real* stack genuinely doesn't contain your callers.

## Exercise 4 — return values need the stack too

```
result is: not ready yet
(and only now, with the stack empty, can the timer run)
```

The assignment `result = 'the data!'` *does* happen — but only after `ex4`
returns and the stack empties. By then, nobody is looking at `result`.

This is the trap every newcomer hits ("why is my variable undefined outside
the callback?"), and it's not a quirk — it follows directly from exercise 2:
your synchronous code always finishes **first**, in its entirety.

## The one-sentence takeaway

> Asynchronous callbacks never run *during* your code — only *between*
> complete runs of it, when the stack is empty.

## Go further

In exercise 2, change the `while` loop to block for 5000ms and, while it's
running, press Ctrl+C. Notice it *does* die — signals are handled by the
process, not the event loop — but try replacing the log inside the timer with
a `process.on('SIGINT', ...)` handler and see that the handler itself (being
a JS callback) can't run while the stack is blocked either.
