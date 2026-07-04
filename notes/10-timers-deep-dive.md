# Notes — Lesson 10: Timers deep dive

## Exercise 1 — which schedulers drift?

```
A (naive re-arm)    tick 1 at ~71ms  (ideal ~70ms)
A (naive re-arm)    tick 2 at ~141ms (ideal ~120ms)   ← +20ms per tick
...
A (naive re-arm)    tick 6 at ~420ms (ideal ~320ms)   ← ~100ms behind!
B (setInterval)     tick 6 at ~321ms (ideal ~320ms)   ← on the grid
C (aimed re-arm)    tick 6 at ~321ms (ideal ~320ms)   ← on the grid
```

**A drifts, B and C don't.** The naive chain re-arms *50ms after the work
finishes*, so each lap actually takes 50 + 20 = 70ms and the error grows
forever. This surprises people in both directions:

- The common myth says `setInterval` drifts — but modern Node re-arms each
  interval tick relative to the **previous due time**, not to when your
  callback finished. As long as the work fits inside the period, it holds
  the grid (libuv computes `next due = previous due + period`).
- What `setInterval` *won't* do is catch up: if a tick is late or the work
  exceeds the period, missed ticks are simply dropped (lesson 2, exercise
  5) and the rhythm shifts. It promises *at most* one tick per period.

C — re-aiming at absolute targets (`t0 + n*50`) — holds the grid **and**
survives lateness: one slow tick is absorbed, not inherited, and you decide
whether to skip or compress missed work. That control is why rhythm-critical
code (metrics windows, token buckets, game loops) hand-rolls C even though
B looks equivalent on a quiet loop.

## Exercise 2 — unref

```
scheduled: unref'd 1000ms interval + normal 200ms timeout
main work done at ~200ms
process exiting at ~200ms — nothing referenced remains
```

The 1-second interval **never ticks** and yet the process exits cleanly.
`unref()` says: "if you're the only reason the loop is still spinning,
don't be." The loop's liveness check counts *referenced* handles only; after
the 200ms timeout fires, the count hits zero and Node exits mid-interval.

Where you'll meet this in the wild: connection-pool reapers, cache TTL
sweepers, `server.keepAliveTimeout` internals — all unref'd so that your
CLI/test process doesn't hang for 30 extra seconds after finishing its work.
The dual, `ref()`, re-opts a handle in.

## Exercise 3 — refresh()

```
activity at 60ms — refresh!
activity at 120ms — refresh!
alarm fired at ~220ms
```

Each `refresh()` restarts the countdown from *now*: refresh at 60ms → due at
160ms; but at 120ms (still pending) another refresh → due at 220ms. The
alarm's original 100ms deadline never happens.

This is the idiomatic inactivity/session/debounce timer: one `Timeout`
object re-armed on every event, instead of `clearTimeout` + `setTimeout`
allocating a new one each time.

## Exercise 4 — what exactly keeps Node alive?

```
a) console.log only         → exited after ~Xms          (baseline overhead)
b) resolved promise .then   → ~ baseline (then DID run)
c) never-settling promise   → ~ baseline (!!)
d) 300ms timer              → ~ baseline + 300ms
e) fs.readFile in flight    → ~ baseline (read completed first)
```

Treat (a) as the cost of starting Node itself; compare the rest to it.

- **(b)** exits immediately, *after* running the `.then` — microtasks drain
  before the "should I exit?" check, so they always get their turn.
- **(c)** is the eye-opener: a pending promise is **not a handle**. It's
  just an object; nothing in the loop knows to wait for it. The process
  exits with the promise forever unsettled — no error, no warning (a float
  like this is exactly what `--unhandled-rejections` and lint rules for
  un-awaited promises try to catch). If a promise's resolution *is* pending
  work, whatever will resolve it (timer, socket, worker) must be referenced
  — the promise itself holds nothing open.
- **(d)** waits ~300ms: a pending timer is a referenced handle.
- **(e)** waits for the in-flight read (fast here): an active request keeps
  the loop alive until its callback has run.

So "Node exits when the event loop is empty" precisely means: **no
referenced handles or pending requests remain** — timers, sockets, servers,
watchers, in-flight I/O. Promises, callbacks-in-closures, and your hopes
don't count.

## The one-sentence takeaway

> Timers are handles with a due time: naive re-arm chains drift while
> setInterval holds its grid (but drops missed ticks), referenced handles
> are what keep Node alive, and `unref()`/`refresh()` are the two levers
> everyone forgets exist.

## Go further

In exercise 2, add `housekeeping.ref()` inside the 200ms timeout callback.
Predict first: when does the process exit now, and how many housekeeping
ticks do you see? (Careful — this one no longer exits on its own. Ctrl+C is
part of the lesson.)
