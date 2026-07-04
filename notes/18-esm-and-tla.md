# Notes — Lesson 18: ES Modules & top-level await

## Exercise 1 — top-level await makes importers wait

```
dep: start
dep: done awaiting
entry: got 42
```

`entry` printed **after** the 50ms await, and `value` was fully initialized —
it can never be undefined. Top-level await turns `dep.mjs` into an **async
module**: its evaluation returns something promise-like, and every importer's
own evaluation is *deferred until it settles*. The loader guarantees you
never observe a half-evaluated module.

The mental model: TLA doesn't just suspend a function — it suspends a whole
branch of the module graph. That's also its cost: a slow TLA (a DB connect,
a config fetch) delays the startup of *everything downstream of it*, which
is why "TLA in a widely-imported utility module" is a real code-review flag.

## Exercise 2 — a suspended module doesn't block its siblings

```
a: evaluating
b: evaluating
a: after its await
entry: body runs
```

`b: evaluating` cut in **before** `a: after its await` — even though `a`'s
await was of `null`, instantly resolved! When `a` suspends at its TLA, the
loader moves on and evaluates the next ready module in the graph (`b`);
`a`'s continuation resumes as a microtask afterwards; `entry`'s body waits
for both.

This is the interview trap from the critique that motivated this lesson:
**renaming a file so it becomes an async module can reorder your
initialization logs** without a single line of code changing. If module
side-effect order matters (registrations, monkey-patches, env setup), TLA
just made it a scheduling question — lessons 3–5's rules, applied to the
loader.

## Exercise 3 — hoisting

```
— CommonJS —
entry: line 1
dep: evaluated
entry: line 2

— ESM —
dep: evaluated
entry: line 1
entry: line 2
```

Same three lines of intent, different order:

- **CommonJS**: `require()` is a *function call* — it runs exactly where it's
  written. Line 1 first, then the dependency, then line 2. You can require
  conditionally, in a loop, mid-file.
- **ESM**: `import` is a *declaration* — hoisted, static, resolved before
  the module body runs a single statement. The entire dependency subtree
  evaluates first, no matter where in the file you wrote the import.

Consequences worth saying in an interview: this static shape is what enables
tree-shaking, circular-import handling via live bindings, and the loader's
async pipeline — and it's why "just move the import lower" never fixes an
ESM ordering problem (use dynamic `import()` — a function call returning a
promise, the moral equivalent of require with lesson-3 timing).

## Exercise 4 — the unsettled top-level await

```
module starts
stderr says: Warning: Detected unsettled top-level await at file:///...entry.mjs:2
exit code: 13
```

Lesson 10 predicted this: a pending promise holds **nothing** open. The
never-settling TLA leaves no referenced handles, the loop finds nothing to
wait for, and the process exits — but Node knows *why* it's exiting weird,
prints a warning naming the exact file and line, and uses **exit code 13**
("unsettled top-level await").

The production shape of this bug: a TLA awaiting a connection that silently
never resolves (no timeout). The process doesn't hang — it *vanishes*, with
only code 13 as the clue. Know the number; the interviewer who asks this is
checking whether you've actually operated ESM apps.

## Bonus interop fact (asked at staff level)

`require()` of an ES module works in modern Node (22.12+/23) — *unless* the
module (or its graph) uses top-level await, in which case it throws
`ERR_REQUIRE_ASYNC_MODULE`. Synchronous `require` cannot wait; TLA makes a
module irreversibly async. One sentence: **TLA is contagious — up the import
graph, and across the CJS boundary it's a hard error.**

## The one-sentence takeaway

> ESM evaluates dependencies first (hoisting), top-level await suspends a
> module *and* everyone downstream of it while siblings proceed, and an
> unsettled TLA doesn't hang — it exits with code 13.

## Go further

In exercise 2, add `c.mjs` with a TLA of 30ms and import order a, b, c —
predict the six-line interleaving before running (the loader evaluates
ready modules in graph order; suspended ones resume as their awaits
settle). Then make `entry.mjs` itself use TLA and check the exit path: the
`'exit'` event still fires, `beforeExit` behaves differently — which, and
why?
