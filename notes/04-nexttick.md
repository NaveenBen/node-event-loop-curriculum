# Notes — Lesson 4: process.nextTick

## Exercise 1 — the full pecking order

```
sync
nextTick
promise.then
queueMicrotask
setTimeout
setImmediate
```

The complete priority ladder in Node:

1. **Synchronous code** — always finishes first.
2. **nextTick queue** — drained completely.
3. **Microtask queue** (promises + queueMicrotask, FIFO among themselves).
4. **Tasks**, in event-loop phase order: timers (`setTimeout`) before check
   (`setImmediate`) — *in this case*; lesson 6 shows when that's actually
   nondeterministic, and why here (scheduled from the main script with other
   work delaying loop entry) the timer reliably wins.

## Exercise 2 — nextTick drains completely, before promises

```
nextTick depth 1
nextTick depth 2
nextTick depth 3
promise
```

Just like the microtask queue, the nextTick queue drains **completely**,
including callbacks added mid-drain — and the whole thing happens *before*
the first promise callback. A recursive `process.nextTick` therefore starves
promises too, not just timers (lesson 9).

## Exercise 3 — crossing the streams

```
nextTick #1
microtask #1
microtask scheduled by nextTick #1
nextTick scheduled by microtask #1
```

Walk it through with two queues:

| step | nextTick queue | microtask queue |
|------|----------------|-----------------|
| start | `[nT1]` | `[mT1]` |
| drain nextTick → run nT1 | `[]` | `[mT1, mT-from-nT1]` |
| drain microtasks → run mT1 | `[nT-from-mT1]` | `[mT-from-nT1]` |
| ...keep draining microtasks → run mT-from-nT1 | `[nT-from-mT1]` | `[]` |
| microtasks empty → back to nextTick → run nT-from-mT1 | `[]` | `[]` |

The key subtlety: a nextTick scheduled *from inside a microtask* does **not**
preempt the remaining microtasks. The microtask checkpoint drains fully;
only then does Node loop back and notice the nextTick queue is non-empty
(it alternates: drain ticks → drain microtasks → repeat until both empty).

So "nextTick beats microtasks" is about *queue drain order*, not about
individual callbacks teleporting to the front.

## Exercise 4 — why nextTick exists

```
listeners attached
version B: listener heard it
```

**Version A's event vanishes.** `SyncSource`'s constructor emits `'ready'`
while still inside `new SyncSource()` — the `.on('ready', ...)` hasn't run
yet, so there are zero listeners and the emit is a no-op.

Version B defers the emit with `nextTick`: the constructor returns, `.on()`
attaches the listener, the sync code finishes (`listeners attached`), *then*
the nextTick fires and the listener hears it.

This is the original purpose of `nextTick`: **"finish letting the caller set
things up, then fire."** It guarantees your API is consistently asynchronous
— an API that's sometimes sync, sometimes async is a bug factory (Isaac
Schlueter's classic essay calls this "releasing Zalgo").

## nextTick vs queueMicrotask — which should you use?

The Node docs now recommend **`queueMicrotask`** for new code: it's
standard (works in browsers), and it can't starve I/O quite as aggressively
because promise rejections and some internals share the drain machinery.
`process.nextTick` remains for compatibility and for the rare case where you
must run *before* any promise work. In practice: know both, write
`queueMicrotask`.

## The one-sentence takeaway

> `process.nextTick` is Node's front-of-the-line pass: it runs after the
> current operation but before promises — use it to make APIs reliably
> async, never for general scheduling.

## Go further

In exercise 4, move the `.on('ready')` attachment into a `setTimeout(..., 0)`
and see version B *also* go silent — nextTick only defers past the current
synchronous run, not past the listener's own lateness. What would you use if
listeners might attach a whole tick later? (Hint: not scheduling — state.
Look at how `fs.promises` or `'readable'` streams handle this.)
