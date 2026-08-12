#!/usr/bin/env node
/**
 * Stand-in for $EDITOR in the handoff tests (§C1).
 *
 * Appends a marker line to whatever file it is handed, then exits 0. Tests find
 * which file the TUI actually opened by scanning the fixture for the marker —
 * deliberately NOT via an env var, because Jest hands each test module its own
 * `process.env` copy and assignments there do not reliably reach a child.
 */
import * as fs from 'node:fs';

const target = process.argv[2];
if (!target) {
  console.error('fake-editor: no file argument');
  process.exit(2);
}

fs.appendFileSync(target, '\nEDITED-BY-FAKE-EDITOR\n', 'utf-8');
