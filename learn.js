#!/usr/bin/env node
// Compatibility shim — the trainer lives in learn.mjs (ESM).
// `node learn.js` keeps working exactly as documented.
import('./learn.mjs');
