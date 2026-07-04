# Notes — Lesson 15: EventEmitter & streams

## Exercise 1 — emit() is a plain function call

```
before emit
listener 1
listener 2
after emit
```

No queue involved. `emit()` walks the listener array and **calls each one
synchronously, on the current stack**, in registration order, then returns.
"Event-driven" describes the *architecture*, not the timing.

Consequences interviewers fish for:

- A slow listener blocks the emitter (and the whole loop — lesson 8).
- A throw in a listener propagates synchronously out of `emit()`.
- If asynchrony matters, the *emitter* must defer —
  `process.nextTick(() => this.emit(...))`, which is exactly lesson 4's
  constructor pattern. Node's own I/O events feel async only because the
  *source* is the poll phase, not because emit defers anything.

## Exercise 2 — the listener list is snapshotted per emit

```
--- emit #1 ---
original listener
--- emit #2 ---
original listener
listener added mid-emit
```

A listener added *during* an emit does not run for that emit — `emit()`
iterates a copy of the listener array taken when it started. Same idea as
lesson 7's setImmediate queue snapshot, one level up the stack. (Removal
mid-emit follows the same rule: the departing listener still gets this
emit's call.)

## Exercise 3 — backpressure

```
wrote chunk-0 → write() returned false
backpressure! stopping the producer.
consumer wakes up and starts reading...
'drain' fired — buffer emptied, produce again
```

The very first `write()` returned `false` — the 7-byte chunk overshot the
4-byte `highWaterMark` instantly. Crucial subtleties:

- **`false` doesn't mean "write failed."** The chunk *was* accepted and
  buffered. It means: "I'm holding ≥ highWaterMark bytes — please stop until
  `'drain'`." It's advice, and code that ignores it doesn't error — it
  buffers unboundedly in memory. That's the classic "Node service OOMs
  under load" postmortem.
- The contract is: stop on `false`, resume on `'drain'`. That's the entire
  backpressure protocol.
- `pipe()` (and `stream.pipeline`) implement this protocol for you —
  pause the source on `false`, resume on `'drain'`. Interview answer for
  "how does pipe handle backpressure": exactly that sentence.

## Exercise 4 — 'data' arrives in loop-sized chunks

```
2 MB arrived as 32 'data' events (64 KB each)
the event loop got ~3 timer laps in while streaming
(one giant read would have delivered 1 event and 0 laps)
```

`fs.createReadStream` defaults to 64 KB reads: 2 MB → 32 events, delivered
across multiple poll-phase visits — and the timer-lap counter proves the
loop kept breathing between chunks. Timers fired, other I/O could interleave,
a server would have kept answering.

That's the event-loop case for streams in one picture: `readFile` = one
giant callback after everything is in memory; a stream = many small
callbacks with loop turns between them, constant memory, and backpressure
when the consumer lags. (Exact lap counts vary run to run — the point is
it's more than zero.)

## The one-sentence takeaway

> `emit()` is a synchronous loop over a snapshot of listeners, and streams
> are the loop-friendly way to move data: chunk-sized callbacks with
> `write() === false` / `'drain'` as the flow-control handshake.

## Go further

In exercise 3, ignore the `false` and keep writing all 10 chunks, logging
`pt.writableLength` after each — watch the buffer grow past the
highWaterMark without complaint. Now imagine those chunks are 10 MB video
segments and the consumer is a slow mobile client. Then rewrite it with
`await pipeline(producer, pt, consumer)` from `node:stream/promises` and
watch the protocol handled for you.
