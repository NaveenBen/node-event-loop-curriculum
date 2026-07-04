# Notes — Lesson 5: async/await desugared

## Exercise 1 — async functions start synchronously

```
main: before call
greet: before await
main: after call
greet: after await
```

Calling an async function runs its body **synchronously, right now**, until
the first `await`. Only at the `await` does it suspend: everything after that
line becomes, effectively, a `.then` callback. Control returns to the caller
(`main: after call`), the stack empties, the microtask queue drains, and the
function resumes.

Desugared, `greet` is roughly:

```js
function greet() {
  console.log('greet: before await');           // sync part
  return Promise.resolve(null).then(() => {
    console.log('greet: after await');           // resumption
  });
}
```

Corollary: an async function that does heavy computation *before* its first
await blocks the caller just like a normal function. `async` ≠ background.

## Exercise 2 — one await ≈ one .then hop

```
A1 (.then)
B1 (await)
A2 (.then)
B2 (await)
```

Perfect interleaving, exactly like lesson 3's two chains. Each `await` costs
one microtask hop; each `.then` costs one microtask hop. Same queue, same
rhythm — `await` is `.then` in a trenchcoat.

(`await null` on a non-promise still takes the hop: the value is wrapped as
if by `Promise.resolve(null)`. Suspension is unconditional.)

## Exercise 3 — the famous interview question

```
script start
async1 start
async2
promise executor
script end
async1 end
promise then
setTimeout
```

Walkthrough:

1. `script start` — sync.
2. `async1()` runs sync until its await: `async1 start`, then `async2()`
   runs **entirely** (no await inside): `async2`. Now `await` suspends
   async1, scheduling its resumption as a microtask. Back to main.
3. `new Promise(executor)` — the executor runs **synchronously**
   (`promise executor`); `resolve()` queues the `.then` callback *behind*
   async1's resumption.
4. `script end` — sync done.
5. Microtasks, FIFO: `async1 end`, then `promise then`.
6. Timers phase: `setTimeout`.

Two classic traps here: the promise executor is synchronous (people predict
it after `script end`), and `async1 end` beats `promise then` because the
await's resumption entered the queue first.

(Historical footnote: before Node 12 / V8 7.2, `await` cost 3 microtask
hops and `async1 end` came *after* `promise then`. Old blog posts show that
order — they're describing old engines, not a different truth.)

## Exercise 4 — `return p` vs `return await p`

```
hop 1
return await p → resolved
hop 2
return p → resolved
hop 3
hop 4
```

- **`return await p`** — the await costs one hop, then the function resolves
  its outer promise with a plain value. Caller's `.then` lands right after
  hop 1.
- **`return p`** — resolving a promise *with another promise* triggers the
  spec's slow path: an internal microtask unwraps the thenable, then another
  resolves the outer promise. Roughly two extra hops; the caller's `.then`
  lands after hop 2.

Practical upshot: inside async functions, `return await somePromise` is not
redundant style — it's the same-or-faster, it keeps the function in the
stack trace, and it lets a surrounding `try/catch` actually catch rejections.
(ESLint's `no-return-await` rule was deprecated for exactly these reasons.)

## Exercise 5 — sequential awaits vs Promise.all

```
sequential took ~200ms
parallel took ~100ms
```

`await` **serializes**: the second `fakeRequest` isn't even *created* until
the first finishes, because the function is suspended at the first await.
`Promise.all` starts both timers first, then waits for both — the waits
overlap.

This is the #1 real-world async/await performance bug: accidentally awaiting
independent operations one at a time. The fix is always the same: start the
work first (call the functions, collect promises), await afterwards.

## The one-sentence takeaway

> `await` = suspend here, resume as a microtask — the sync prefix runs
> immediately, every await is a queue hop, and independent awaits in
> sequence are hidden serialization.

## Go further

In exercise 3, wrap `async2()` in `Promise.resolve()`:
`await Promise.resolve(async2())`. Does the order change? Then try
`await { then(r) { r(); } }` (a hand-rolled thenable) and watch `async1 end`
slip *behind* `promise then` — the fast path only applies to native promises.
