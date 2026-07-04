# Notes — Lesson 14: Promise combinators & thenables

## Exercise 1 — completion order vs result order

```
fast finished (10ms)
slow finished (30ms)
results: ["slow","fast"]
```

The promises **complete** in time order (fast first), but the results array
is in **input order** (`slow` is index 0 because it was first in the array).
`Promise.all` remembers each promise's position and slots results
accordingly — completion order is invisible in the output.

Interview one-liner: *"Promise.all preserves input order in its results,
regardless of settlement order."* The follow-up: the work runs
**concurrently** (total time ≈ 30ms, the max, not 40ms, the sum) — the array
was full of already-started promises before `all` ever saw it.

## Exercise 2 — fails fast, cancels nothing

```
bad rejecting (10ms)
all rejected with: bad
ok still ran (20ms)
```

Two separate facts, and interviews test whether you conflate them:

1. **Fail-fast**: `Promise.all` rejects the moment *any* input rejects
   (at 10ms) — it doesn't wait for the rest.
2. **No cancellation**: `ok` still ran to completion at 20ms. JavaScript
   promises are not cancellable; `all` rejecting simply means nobody is
   listening to the survivors anymore. Their side effects (DB writes! HTTP
   calls!) still happen.

If you need "all results even if some fail", that's **`allSettled`**. If you
need actual cancellation, that's **`AbortController`** passed into the
underlying operations — the promise layer alone can't do it.

## Exercise 3 — race vs any

```
race → catch: rejected at 10ms
any  → then: fulfilled at 20ms
```

Same two contestants, opposite outcomes:

- **`race`** — first to *settle* wins, fulfillment or rejection alike. The
  10ms rejection settles first → race rejects.
- **`any`** — first to *fulfill* wins; rejections are collected and only if
  **all** inputs reject does it reject (with an `AggregateError`). The 10ms
  rejection is ignored, the 20ms fulfillment wins.

Mnemonic: `race` = first result of any kind; `any` = first *success*.
Classic use: `race` for timeouts (result vs timer), `any` for redundant
mirrors (first server to answer).

## Exercise 4 — thenables pay a toll

```
await native done
thenable.then invoked
hop 1
await thenable done
hop 2
hop 3
```

Trace it: the native `await` resumption is queued **immediately** (V8's
fast path recognizes a real promise). The thenable can't be trusted — the
spec must call its `.then` method *as its own microtask job*, passing fresh
resolve/reject functions. So:

1. native resumption → `await native done`
2. thenable job → `thenable.then invoked`, which resolves → resumption queued
3. `hop 1`
4. thenable's resumption → `await thenable done`
5. `hop 2`, `hop 3`

One extra microtask hop for duck-typing. This is also a **security-relevant
detail**: awaiting untrusted objects *executes their `.then` method* — a
malicious thenable runs code the moment you await it.

## Exercise 5 — returning a promise from .then

```
A1 (returns a promise)
B1
B2
B3
A2 (after unwrapping it)
B4
```

A2 lands after **B3** — two extra hops behind a plain value. Returning a
promise from a `.then` callback triggers the same slow-path unwrapping as
lesson 5's `return p`: one job to call the returned promise's `.then`, one
more to resolve the outer promise, and only then is A2's callback queued.

You'll never design code around this — but interviewers use it to check
whether your mental model is "magic" or mechanical. The mechanical answer:
*resolving with a promise/thenable is always indirect; plain values are
direct.*

## The one-sentence takeaway

> `all` keeps input order and fails fast without cancelling anything, `race`
> takes the first settlement while `any` takes the first success, and
> anything promise-shaped that isn't a native promise costs extra microtask
> hops to unwrap.

## Go further

Replace `Promise.all` in exercise 2 with `Promise.allSettled` and predict
the output shape (`[{status, value}, {status, reason}]` — in which order?).
Then build the classic timeout pattern with `race`:
`Promise.race([fetch-ish work, rejectAfter(50)])` — and explain why the
losing work still completes in the background (exercise 2's lesson again).
