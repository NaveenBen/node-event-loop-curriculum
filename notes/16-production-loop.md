# Notes — Lesson 16: The loop in production

## Exercise 1 — monitorEventLoopDelay

```
healthy loop  → mean 11.0ms, p99 11.2ms, max 11.2ms
after a 250ms block → mean 19.0ms, p99 267.0ms, max 267.0ms
(alert rule in real life: p99 loop delay > 100ms for 1 minute)
```

Reading the histogram like an SRE:

- The healthy baseline sits near the sampler's **resolution** (we asked for
  10ms), not near zero — the number reported is "how long between chances to
  run," so ~10–12ms *is* a healthy reading at this resolution. Know this or
  you'll page yourself at 3am over a healthy service.
- After the block: the **mean barely moved** (19ms) but **p99/max exploded**
  (267ms ≈ our 250ms block + baseline). Loop blocking is a tail-latency
  phenomenon — means hide it, percentiles reveal it. This is why the
  interview answer is "alert on p99, not mean."
- It's implemented natively (no JS timer of its own), so it keeps measuring
  accurately even when JS is the thing misbehaving.

This is the production-grade version of the toy monitor you built in lesson
8 — same idea, histogram-quality data, near-zero overhead.

## Exercise 2 — AsyncLocalStorage

```
[req B] finished a 10ms query
[req B] still me, even in a detached microtask
[req A] finished a 20ms query
[req A] still me, even in a detached microtask
```

Two requests interleave through timers and microtasks, no id passed as an
argument anywhere — yet every line knows its request. `als.run(store, fn)`
establishes a context, and Node **propagates it across every async hop**:
timer callbacks, promise resumptions, queueMicrotask, I/O callbacks.

Why this needs runtime support (a favorite senior question): a plain global
variable breaks the instant two requests interleave — request B's callback
would read request A's id. The continuation-tracking machinery (async_hooks
under the hood) snapshots and restores the context around every callback,
which is exactly the bookkeeping the event loop's queue-hopping otherwise
destroys.

Real-world uses: request-scoped logging, distributed tracing (OpenTelemetry
is built on this), per-request feature flags and auth context.

B logs before A purely because its "query" was 10ms vs 20ms — completion
order, as always (lesson 7).

## Exercise 3 — chunking with setImmediate

```
monolithic: done at ~156ms — heartbeats so far: 0
chunked:    done at ~158ms — heartbeats during: 8
(same answer both times: true)
```

Same computation, same ~total time, opposite behavior under the hood:

- **Monolithic**: 150ms of stack occupancy — zero heartbeats. Every request,
  timer, and socket in a real service waits.
- **Chunked**: `setImmediate` between 1M-item chunks = one full loop lap per
  chunk (lesson 9's rule) — the heartbeat landed 8 times *during* the work.
  Throughput cost: negligible here (~2ms).

The decision tree to recite in interviews (lesson 11's, now complete):
occasional tens-of-ms work → **chunk with setImmediate** (never nextTick or
bare `await` — lesson 9 explains why those starve); reliably heavy CPU →
**worker threads, pooled**; already-native crypto/zlib/fs → they're on the
libuv pool anyway.

## The one-sentence takeaway

> In production you *watch* the loop with `monitorEventLoopDelay` (alert on
> p99), *carry request context* across its queue-hops with
> AsyncLocalStorage, and *keep it breathing* under CPU load by chunking
> with setImmediate or moving work to pooled workers.

## Go further

In exercise 2, replace `queueMicrotask` with `setImmediate` and `fs.readFile`
callbacks — context still follows. Then try to *lose* it: call the handler
via an EventEmitter listener registered **outside** `als.run` and watch
`getStore()` return undefined — the context binds at registration time, the
classic ALS gotcha (`AsyncResource.bind` is the standard fix).
