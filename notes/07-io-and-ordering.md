# Notes — Lesson 7: I/O and the poll phase

## Exercise 1 — where does I/O land?

```
main script done
setTimeout(0)          ← these two may swap (lesson 6's race!)
setImmediate           ←
readFile callback
```

The readFile lands **last**. Why: `fs.readFile` hands the work to a thread
pool thread, which reads the file and reports back. Even for a tiny file,
that round trip takes longer than the loop's first pass through timers and
check. The completion is picked up in a **later poll phase**.

Note the first two lines can swap between runs — that's exercise 6.1's
nondeterministic race again. The readFile's position is the reliable part.

## Exercise 2 — completion order ≠ call order

```
reading BIG first, tiny second...
tiny done (16 bytes)
BIG  done (20971520 bytes)
```

The tiny file wins even though the big one was requested first. Both reads
run **concurrently on separate thread-pool threads**; whichever finishes
first gets its callback queued first. I/O callback order reflects
*completion* order, not *request* order.

This is the heart of why Node scales: your single JS thread fired two reads
without waiting for either. It's also why you can never assume response
order matches request order — for that, you serialize explicitly (await one
before starting the next) or track ids.

## Exercise 3 — the thread pool, caught in the act

```
6 jobs submitted to the thread pool (size 4) — JS thread is free
pbkdf2 #1 done at ~Nms      ┐
pbkdf2 #2 done at ~Nms      │ four finish together...
pbkdf2 #3 done at ~Nms      │
pbkdf2 #4 done at ~Nms      ┘
pbkdf2 #5 done at ~2Nms     ┐ ...then the last two, one "batch" later
pbkdf2 #6 done at ~2Nms     ┘
```

The shape: **4, then 2**. The libuv thread pool defaults to 4 threads, so
jobs 1–4 run truly in parallel; jobs 5–6 wait for a free thread. (Which
four finish first can vary — the pattern is what matters.)

Takeaways:

- "Single-threaded Node" did ~4 CPU-cores' worth of hashing while your JS
  thread sat idle. fs, dns.lookup, crypto, zlib — all thread pool.
- The pool is a shared, bounded resource: slow fs calls can queue behind
  slow crypto calls. `UV_THREADPOOL_SIZE=8 node ...` raises it (try it on
  this exercise!).
- Network sockets do NOT use the pool — they use the OS's readiness APIs
  (kqueue on macOS, epoll on Linux), which is why Node handles 10k sockets
  without 10k threads.

## Exercise 4 — the close phase

```
connected
immediate 1: destroying socket
socket 'close' event
immediate 2 (scheduled after destroy)
```

Follow the iteration: `immediate 1` runs in the **check** phase. Destroying
the socket schedules its `'close'` event for the **close** phase — which is
*later in this same iteration*. `immediate 2`, though scheduled during
check, missed this iteration's check queue snapshot, so it waits for the
**next** iteration.

Result: the close callback — conceptually "slow, cleanup-tier" — beats a
setImmediate. Phase position, not intuition, decides.

## The one-sentence takeaway

> The poll phase is where finished I/O re-enters your single JS thread —
> ordered by completion, powered by a 4-thread pool (files/crypto) or OS
> readiness events (sockets), never by the order you asked.

## Go further

Re-run exercise 3 as `UV_THREADPOOL_SIZE=6 node lessons/07-io-and-ordering.js 3`
— the 4+2 shape becomes 6-together. Then try `UV_THREADPOOL_SIZE=1` and
watch them serialize completely: one thread, one job at a time.
