/*
 * LESSON 7 — I/O: the poll phase, the thread pool, and close callbacks
 * ────────────────────────────────────────────────────────────────────
 * "Node is single-threaded" is a half-truth. YOUR JavaScript is single-
 * threaded. But fs operations, DNS lookups, and crypto run on libuv's
 * THREAD POOL (default: 4 threads), and network sockets use the OS's
 * async notification APIs. The event loop's poll phase is where all of
 * that finished work re-enters your single JS thread.
 *
 * Run:   node lessons/07-io-and-ordering.js <exercise>
 * Answers & why: notes/07-io-and-ordering.md
 */

/* ═══════ EXERCISE 1 — where does I/O land among timers and immediates? ═══════
 * Four things scheduled together from the main script. The file read is
 * tiny (this very file). Predict the order of all four lines.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex1() {
  const fs = require('node:fs');

  fs.readFile(__filename, () => console.log('readFile callback'));
  setTimeout(() => console.log('setTimeout(0)'), 0);
  setImmediate(() => console.log('setImmediate'));
  console.log('main script done');
}

/* ═══════ EXERCISE 2 — completion order ≠ call order ═══════
 * We create a big file (~20 MB) and a tiny file, then read BIG first,
 * tiny second. Predict which callback fires first.
 *
 * YOUR PREDICTION:
 *
 */
function ex2() {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');

  const big = path.join(os.tmpdir(), 'event-loop-lesson-big.bin');
  const tiny = path.join(os.tmpdir(), 'event-loop-lesson-tiny.bin');
  fs.writeFileSync(big, Buffer.alloc(20 * 1024 * 1024, 1)); // 20 MB
  fs.writeFileSync(tiny, Buffer.alloc(16, 1));              // 16 bytes

  let done = 0;
  const finish = () => { if (++done === 2) { fs.unlinkSync(big); fs.unlinkSync(tiny); } };

  console.log('reading BIG first, tiny second...');
  fs.readFile(big, (e, d) => { console.log(`BIG  done (${d.length} bytes)`); finish(); });
  fs.readFile(tiny, (e, d) => { console.log(`tiny done (${d.length} bytes)`); finish(); });
}

/* ═══════ EXERCISE 3 — the thread pool, caught in the act ═══════
 * crypto.pbkdf2 is CPU-heavy but runs on the libuv thread pool, NOT your
 * JS thread. We fire SIX of them, each taking roughly the same time.
 * The pool has 4 threads. Predict the completion pattern: all ~together?
 * One by one? Some other shape?
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex3() {
  const crypto = require('node:crypto');
  const t0 = Date.now();
  for (let i = 1; i <= 6; i++) {
    crypto.pbkdf2('secret', 'salt', 400_000, 64, 'sha512', () => {
      console.log(`pbkdf2 #${i} done at ${Date.now() - t0}ms`);
    });
  }
  console.log('6 jobs submitted to the thread pool (size 4) — JS thread is free');
}

/* ═══════ EXERCISE 4 — the close phase, the loop's last stop ═══════
 * A socket is destroyed inside an immediate. From there we schedule
 * another setImmediate — does the socket's 'close' event beat it?
 * (close phase comes AFTER check in the same iteration...)
 *
 * YOUR PREDICTION (order of 3 lines after "connected"):
 *
 *
 */
function ex4() {
  const net = require('node:net');
  const server = net.createServer((socket) => socket.pipe(socket));
  server.listen(0, () => {
    const client = net.createConnection(server.address().port, () => {
      console.log('connected');
      setImmediate(() => {
        console.log('immediate 1: destroying socket');
        client.on('close', () => { console.log("socket 'close' event"); server.close(); });
        client.destroy();
        setImmediate(() => console.log('immediate 2 (scheduled after destroy)'));
      });
    });
  });
}

/* ═══════ EXERCISE 5 — sockets don't use the pool: proof under saturation ═══════
 * We saturate all 4 thread-pool workers with slow pbkdf2 jobs, then
 * IMMEDIATELY fire 20 TCP echo round-trips. If sockets needed the pool,
 * they'd queue behind the hashes. Predict: do the 20 round-trips finish
 * before or after the first pbkdf2 batch?
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex5() {
  const crypto = require('node:crypto');
  const net = require('node:net');

  const server = net.createServer((socket) => socket.pipe(socket));
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    const t0 = Date.now();
    let hashesDone = 0;
    let echoes = 0;
    const finish = () => { if (hashesDone === 4 && echoes === 20) server.close(); };

    // Saturate the pool: 4 slow hashes occupy all 4 default threads.
    for (let i = 1; i <= 4; i++) {
      crypto.pbkdf2('secret', 'salt', 400_000, 64, 'sha512', () => {
        if (++hashesDone === 4) {
          console.log(`all 4 pbkdf2 jobs done at ${Date.now() - t0}ms (pool was fully busy until now)`);
          finish();
        }
      });
    }

    // While the pool is pinned: 20 TCP round-trips.
    for (let i = 0; i < 20; i++) {
      const c = net.createConnection(port, '127.0.0.1', () => c.write('ping'));
      c.on('data', () => {
        c.end();
        if (++echoes === 20) {
          console.log(`all 20 socket round-trips done at ${Date.now() - t0}ms — with zero free pool threads!`);
          finish();
        }
      });
    }
    console.log('4 pool jobs + 20 sockets, all in flight...');
  });
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['where does I/O land among timers and immediates?', ex1],
  2: ['completion order ≠ call order', ex2],
  3: ['the thread pool, caught in the act', ex3],
  4: ['the close phase, the loop\'s last stop', ex4],
  5: ['sockets don\'t use the pool: proof under saturation', ex5],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/07-io-and-ordering.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/07-io-and-ordering.md
