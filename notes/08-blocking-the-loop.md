# Notes — Lesson 8: Blocking the loop

## Exercise 1 — one callback delays all the others

```
20ms timer fired at ~21ms — now hogging the thread for 300ms
40ms timer fired at ~321ms
60ms timer fired at ~321ms
```

The 40ms and 60ms timers fire **~280ms late, back to back**, the instant the
hog releases the thread. They did nothing wrong — they were expired and
ready at 40/60ms — but callbacks run one at a time, and the loop couldn't
get back to the timers phase until the 300ms callback returned.

Now scale the picture: replace "timers" with "HTTP requests" and this is
exactly how one expensive request makes a Node server slow *for every
user*. There is no per-request isolation; there is one loop.

## Exercise 2 — the lag monitor

```
t=~50ms   loop lag: 0ms
t=~100ms  loop lag: 0ms
...steady ~0–2ms lag...
t=~6xxms  loop lag: NNNms   ◀ BLOCKED     ← the JSON.parse
t=~7xxms  loop lag: 0ms
...steady again...
```

The monitor is genuinely how production tools work: schedule something at a
known interval, measure how late it actually runs. When `JSON.parse` chewed
through ~33 MB (a couple hundred ms of purely synchronous work), the interval
callback due during that window fired late — the lag spike IS the blockage,
measured. (See also: `perf_hooks.monitorEventLoopDelay()`, Node's built-in,
histogram-grade version of this trick.)

Note what blocked us: not a `while` loop stunt but **`JSON.parse` on a big
payload** — one of the most common real-world loop-blockers, along with big
`JSON.stringify`, synchronous fs calls, complex regexes on long strings
(ReDoS), and heavy loops over large arrays.

## Exercise 3 — I/O keeps working while JS is blocked

```
baseline read completed at ~1ms (loop was free)
unblocked at ~300ms
blocked-loop read callback ran at ~300ms after start
```

The disk read itself finished in ~1ms (we know from the baseline) — on a
**thread pool thread**, unaffected by our spinning JS. Its *callback*,
though, is JavaScript, and JavaScript waits for the one JS thread. The
completed result sat queued in the poll phase for ~299ms.

So "blocking the loop" doesn't stop I/O from *happening* — kernel and pool
threads keep working. It stops your program from *reacting* to anything.
That distinction matters when you read monitoring dashboards: disk/network
metrics can look healthy while your service is unresponsive.

## The one-sentence takeaway

> Every callback shares one JS thread — a single slow synchronous
> computation delays every timer, request, and I/O *reaction* in the
> process, and loop lag is how you catch it.

## Go further

Wrap exercise 2's `JSON.parse` in `await` / `.then` chunks — you'll find you
**can't**: parse is atomic. The real fixes are: stream the JSON
(`JSONStream`/`stream-json`), split work with `setImmediate` between chunks,
or move it off-thread entirely — which is exactly lesson 11.
