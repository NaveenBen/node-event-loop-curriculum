# Notes — Lesson 13: Errors and the loop

## Exercise 1 — try/catch cannot guard a future stack

```
timer scheduled inside try
try block exited without incident
uncaughtException handler: boom from a timer
(without this handler, the process would have crashed)
```

By the time the timer callback throws, the `try` block is ancient history —
its stack frame was popped long ago (lesson 1). The throw happens on a fresh
stack whose base is Node's timer machinery, unwinds all the way down, finds
no catch anywhere, and becomes an **uncaughtException**: the process-level
last resort. Without a handler, Node prints the stack and exits with code 1.

Interview phrasing: *"try/catch is lexical over the current synchronous
stack; a callback runs on a different stack, so the only protection is a
try/catch **inside** the callback, or process-level handlers."*

And the follow-up they always ask: `process.on('uncaughtException')` is for
**logging and dying gracefully**, not for carrying on — after an uncaught
throw, program state is suspect (half-finished operations, dangling locks).
The Node docs say: clean up, then exit.

## Exercise 2 — async functions never throw, they reject

```
boom: entered (running synchronously!)
line after the call — did we get here?
.catch got it: a very synchronous-looking throw
```

The try/catch **never fires** — even though the throw executed synchronously,
before any await, while `boom()` was literally on the stack inside the `try`.

The `async` keyword wraps the entire body: any throw, no matter how early,
is converted into a **rejected promise** as the return value. The caller's
try/catch sees a function that returned successfully (returned a promise!).
The error travels the promise channel: only `.catch` (or `await`) can see it.

Corollary that catches seniors: an async function can't crash its caller
synchronously. There is exactly one error channel out of it — the promise.

## Exercise 3 — await re-throws

```
start
end
caught via await: rejected!
main continues normally
bystander microtask
```

`await` is the inverse of exercise 2: it converts a rejection back into a
synchronous-looking throw at the await site, which a normal try/catch
catches. Error handling and the microtask queue are the same machinery.

Ordering detail worth tracing: `main()` runs sync until the `await` of an
already-rejected promise — its resumption (the catch path) enters the
microtask queue **before** the bystander's `.then` is registered. So the
catch runs first, `main continues normally` is synchronous within that same
resumption, and the bystander goes last.

## Exercise 4 — unhandledRejection is a deadline, not a verdict

```
rejected promise created, no handler attached
unhandledRejection: nobody caught me... yet
attaching handler now (10ms later)
late .catch: nobody caught me... yet
rejectionHandled (a late handler arrived)
```

The exact semantics interviewers want:

- A rejection is "unhandled" if **the microtask queue drains** and no handler
  was attached. It's not instant — attaching `.catch` on the same tick is
  fine. Notice `unhandledRejection` fired *before* the loop moved on to
  timers: the check happens right after the microtask drain.
- Attaching a handler *later* fires **`rejectionHandled`** — Node keeps a
  ledger of pending unhandled rejections and crosses entries off.
- Since Node 15, the default (no `unhandledRejection` listener) is
  `--unhandled-rejections=throw`: the rejection becomes an
  uncaughtException and **crashes the process**. Interviewers love asking
  "what happens to an unhandled rejection in modern Node?" — the answer is
  "it kills the process", not "it logs a warning" (that was Node ≤14).

## Exercise 5 — the 'error' event

```
— with a listener —
error listener got: handled fine
still alive

— without a listener (in a child process) —
about to emit...
child stderr (first line): Error: nobody is listening
child exit code: 1 (non-zero = crashed)
```

`'error'` is the one **magic** event name: `emit('error', err)` with no
listener doesn't quietly no-op like every other event — it throws the error
synchronously at the emit site (an `ERR_UNHANDLED_ERROR` crash if nothing
catches it). This is why every stream/socket tutorial nags you to attach an
`'error'` listener: a hiccup on an unwatched socket kills the whole process.

Note the crash was **synchronous**: "you will never see this line" indeed
never printed. `emit` runs listeners (or throws) on the current stack —
that's lesson 15's opening theme.

## The one-sentence takeaway

> Errors follow the stack they were thrown on: sync throws hit try/catch,
> callback throws hit uncaughtException, async/promise throws become
> rejections (fatal if unhandled in modern Node), and `await` is the adapter
> that turns rejections back into catchable throws.

## Go further

In exercise 4, delete both `process.on` handlers and run again — watch the
process crash with `ERR_UNHANDLED_REJECTION` *before* the 10ms timer can
attach its too-late `.catch`. Then run with
`node --unhandled-rejections=warn` and see the old, forgiving behavior.
