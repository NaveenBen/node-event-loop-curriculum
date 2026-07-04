# Notes — Lesson 11: Escaping the loop

## Exercise 1 — heartbeat under main-thread CPU work

```
♥ beat 1 at ~50ms
♥ beat 2 at ~100ms
starting fib(33) on the MAIN thread...
fib done at ~150+Xms          ← X = a few hundred ms of silence
♥ beat 3 at ~150+Xms          ← late, and only ONE catch-up beat
♥ beat 4 at ~200+Xms
...
```

Flatline. While `fib(33)` grinds on the main thread, the heartbeat — a
stand-in for every request handler, socket, and timer in a real service —
simply stops. And per lesson 2, the missed beats are dropped, not queued:
you get one late beat, then the rhythm resumes, permanently shifted.

## Exercise 2 — the same work, in a worker

```
♥ beat 1 at ~50ms
♥ beat 2 at ~100ms
starting fib(33) in a WORKER thread...
♥ beat 3 at ~150ms
♥ beat 4 at ~200ms            ← no gap! the loop never blocked
...
worker result 3524578 arrived at ~150+Xms   (lands between beats)
...
♥ beat 12 at ~600ms
```

Same computation, zero missed beats. The worker is a real OS thread with its
**own V8 isolate and its own event loop** — its CPU grind is invisible to
ours. The result comes back as a `'message'` event, which arrives through
our loop's **poll phase** like any other I/O, slotting politely between
heartbeats.

Note what workers are *not*: shared-memory threads in the Java sense. No
shared variables by default (messages are copied via structured clone;
`SharedArrayBuffer` is the opt-in exception), so no locks, no data races —
the event-loop programming model stays intact on both sides.

## Exercise 3 — workers are not free

```
a) direct:       fib(20)=6765 in 0–1ms
b) fresh worker: fib(20)=6765 in ~30–100ms
```

Spinning up a worker costs tens of milliseconds (new isolate, new loop, JS
bootstrap) plus per-message serialization. For a sub-millisecond job that's
a 50–100× loss.

Decision rule:

- **< a few ms of CPU** — just do it on the loop; nobody will notice.
- **Occasionally slow** (tens of ms) — consider chunking with
  `setImmediate` (lesson 9) if latency matters.
- **Reliably CPU-heavy** (100ms+, or any "at scale" hot path) — workers,
  but **pooled**: create N ≈ CPU cores once, reuse them (e.g. the `piscina`
  package), don't pay bootstrap per task.
- **Already-native heavy ops** (crypto, zlib, fs) — they're on the libuv
  pool already (lesson 7); don't wrap them in workers.

And `child_process` remains the right tool when the work is a different
*program* (or needs memory/crash isolation) rather than a function.

## The one-sentence takeaway

> The event loop is for coordination, not computation — move real CPU work
> to worker threads (pooled!), and its results will flow back through the
> poll phase like any other I/O.

## Go further

In exercise 2, start **four** workers for fib(33) at the same time and log
each arrival. On a multi-core machine they finish ~together (true
parallelism). Then start eight and watch arrival times spread — you've
rediscovered why worker pools are sized to CPU core count.
