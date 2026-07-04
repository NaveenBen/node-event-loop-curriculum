/*
 * LESSON 15 — EventEmitter & streams: the loop's delivery service
 * ───────────────────────────────────────────────────────────────
 * Two facts interviewers probe relentlessly:
 *   1. emit() is SYNCHRONOUS — "event-driven" does not mean "async".
 *   2. Streams exist because of BACKPRESSURE — the loop can produce
 *      data faster than consumers drain it, and write() returning
 *      false is the loop telling you to stop.
 *
 * Run:   node lessons/15-emitters-and-streams.js <exercise>
 * Answers & why: notes/15-emitters-and-streams.md
 */

/* ═══════ EXERCISE 1 — emit() is a plain function call ═══════
 * Two listeners, one emit, logs before and after.
 * Predict the exact order of all 4 lines.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex1() {
  const { EventEmitter } = require('node:events');
  const em = new EventEmitter();

  em.on('ping', () => console.log('listener 1'));
  em.on('ping', () => console.log('listener 2'));

  console.log('before emit');
  em.emit('ping');
  console.log('after emit');
}

/* ═══════ EXERCISE 2 — the listener list is snapshotted per emit ═══════
 * The first listener adds ANOTHER listener while handling the event.
 * Does the new one run for the current emit? Predict all lines for
 * both emits.
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex2() {
  const { EventEmitter } = require('node:events');
  const em = new EventEmitter();

  em.on('ping', function original() {
    console.log('original listener');
    em.on('ping', () => console.log('listener added mid-emit'));
  });

  console.log('--- emit #1 ---');
  em.emit('ping');
  console.log('--- emit #2 ---');
  em.emit('ping');
}

/* ═══════ EXERCISE 3 — backpressure: write() says "stop" ═══════
 * A PassThrough stream with a tiny 4-byte buffer, and a producer that
 * wants to write 10 chunks. Predict: how many writes before write()
 * returns false? And what un-blocks the producer?
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex3() {
  const { PassThrough } = require('node:stream');
  const pt = new PassThrough({ highWaterMark: 4 });   // absurdly small: 4 bytes

  let i = 0;
  while (i < 10) {
    const chunk = `chunk-${i}`;
    const ok = pt.write(chunk);
    console.log(`wrote ${chunk} → write() returned ${ok}`);
    i++;
    if (!ok) { console.log('backpressure! stopping the producer.'); break; }
  }

  pt.on('drain', () => console.log("'drain' fired — buffer emptied, produce again"));

  setTimeout(() => {
    console.log('consumer wakes up and starts reading...');
    pt.resume();   // start consuming (and discarding) the buffered data
  }, 20);
}

/* ═══════ EXERCISE 4 — 'data' events arrive in loop-sized chunks ═══════
 * We write a 2 MB file, then read it as a stream. Predict: roughly how
 * many 'data' events for 2 MB — 1? ~30? 2 million? And do they all
 * arrive in one poll phase or across many? (The immediate-counter
 * between events answers that.)
 *
 * YOUR PREDICTION:
 *
 *
 */
function ex4() {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');

  const file = path.join(os.tmpdir(), 'event-loop-lesson-stream.bin');
  fs.writeFileSync(file, Buffer.alloc(2 * 1024 * 1024, 7));   // 2 MB

  let events = 0;
  let bytes = 0;
  let loopLaps = 0;
  const lapCounter = setInterval(() => loopLaps++, 0);   // ticks ~once per lap

  const stream = fs.createReadStream(file);
  stream.on('data', (chunk) => { events++; bytes += chunk.length; });
  stream.on('end', () => {
    clearInterval(lapCounter);
    fs.unlinkSync(file);
    console.log(`2 MB arrived as ${events} 'data' events (${(bytes / events / 1024).toFixed(0)} KB each)`);
    console.log(`the event loop got ~${loopLaps} timer laps in while streaming`);
    console.log('(one giant read would have delivered 1 event and 0 laps)');
  });
}

/* ───────────────────────── runner ───────────────────────── */
const EXERCISES = {
  1: ['emit() is a plain function call', ex1],
  2: ['the listener list is snapshotted per emit', ex2],
  3: ['backpressure: write() says "stop"', ex3],
  4: ["'data' events arrive in loop-sized chunks", ex4],
};
const picked = EXERCISES[process.argv[2]];
if (!picked) {
  console.log('Usage: node lessons/15-emitters-and-streams.js <exercise>\n');
  for (const [n, [title]] of Object.entries(EXERCISES)) console.log(`  ${n}. ${title}`);
} else {
  picked[1]();
}
// Answers: notes/15-emitters-and-streams.md
