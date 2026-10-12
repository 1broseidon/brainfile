/**
 * The SessionStart hook (spec-11): inject the brief into a new agent session.
 *
 * Kept lean on purpose: it is also the body of `dist/hook.mjs`, the entry the
 * launcher runs for `brainfile hooks session-start`, so it imports core and
 * `@brainfile/core/memory` and nothing else from the CLI (no commander, no
 * MCP server, no ink or react). It must never fail a session: every error is
 * swallowed and the hook prints nothing.
 *
 * Output by caller:
 * - Claude Code (`hook_event_name: SessionStart`): JSON with
 *   `hookSpecificOutput.additionalContext` set to the brief.
 * - Cursor's `stop` event (installed against this command): the old one-line
 *   reminder, since a stop is not a session start.
 * - Anything else (Cline's TaskStart script wraps stdout; a terminal): the
 *   brief as plain text.
 *
 * @packageDocumentation
 */

import * as path from 'path';
import { findBrainfile, isV2, getV2Dirs, readBriefState, writeBriefState } from '@brainfile/core';
import { composeBrief, DEFAULT_BRIEF_MAX_CHARS } from '@brainfile/core/memory';

/** How long the hook may spend bringing the index up to date before it briefs. */
export const HOOK_REFRESH_BUDGET_MS = 120;

export type HookCaller = 'claude-code' | 'cursor' | 'cline' | 'unknown';

export function hookCaller(input: Record<string, unknown> | null | undefined): HookCaller {
  if (!input) return 'unknown';
  if (input.clineVersion && input.hookName) return 'cline';
  const event = typeof input.hook_event_name === 'string' ? input.hook_event_name : '';
  if (event === 'SessionStart') return 'claude-code';
  if (event === 'stop') return 'cursor';
  return 'unknown';
}

function clean(name: string | undefined): string {
  return (name ?? '').replace(/[[\]<>\r\n]/g, '').trim();
}

/** Who the brief is for: BRAINFILE_AGENT, else the caller, else the agent's environment, else `agent`. */
export function hookAgent(caller: HookCaller, env: NodeJS.ProcessEnv = process.env): string {
  const named = clean(env.BRAINFILE_AGENT);
  if (named) return named;
  if (caller === 'claude-code') return 'claude';
  if (caller === 'cline') return 'cline';
  if (caller === 'cursor') return 'cursor';
  if (env.CODEX_THREAD_ID || env.CODEX_SESSION_ID) return 'codex';
  if (env.GEMINI_CLI === '1') return 'gemini';
  if (env.CLAUDECODE === '1') return 'claude';
  return 'agent';
}

function budget(env: NodeJS.ProcessEnv): number {
  const n = Number.parseInt(env.BRAINFILE_BRIEF_MAX_CHARS ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_BRIEF_MAX_CHARS;
}

/**
 * What the hook prints for an input, or null for nothing (no board, or any
 * trouble). Advances the agent's brief checkpoint: the session has seen it.
 */
export function sessionStartOutput(input: Record<string, unknown> | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    const cwd = typeof input?.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
    const found = findBrainfile(cwd, { stopAtGitRoot: true });
    if (!found || found.kind !== 'dotdir') return null;
    const caller = hookCaller(input);
    if (caller === 'cursor') {
      return `✅ Brainfile detected: @${path.basename(found.absolutePath)}\nRemember to update task status as you work.`;
    }
    if (!isV2(found.absolutePath)) return null;

    const agent = hookAgent(caller, env);
    const state = readBriefState(found.absolutePath, agent);
    const brief = composeBrief(getV2Dirs(found.absolutePath), agent, {
      lastBriefAt: state.lastBriefAt,
      maxChars: budget(env),
      refreshBudgetMs: HOOK_REFRESH_BUDGET_MS,
    });
    try {
      writeBriefState(found.absolutePath, agent, brief.generatedAt);
    } catch {
      // A read-only checkout still gets its brief.
    }
    if (caller === 'claude-code') {
      return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: brief.text } });
    }
    return brief.text;
  } catch {
    return null;
  }
}

/** Read the hook's JSON from stdin: `{}` for a terminal, empty or unreadable input, or after `timeoutMs`. */
export function readHookInput(stdin: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin, timeoutMs = 1500): Promise<Record<string, unknown>> {
  if (stdin.isTTY) return Promise.resolve({});
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(data);
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        resolve({});
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    stdin.setEncoding?.('utf-8');
    stdin.on('data', (chunk) => { data += String(chunk); });
    stdin.on('end', finish);
    stdin.on('error', finish);
  });
}

/** The whole hook: read stdin, print the brief (or nothing). */
export async function runSessionStartHook(
  stdin: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin,
  write: (text: string) => void = (text) => process.stdout.write(text),
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const input = await readHookInput(stdin);
  const out = sessionStartOutput(input, env);
  if (out) write(`${out}\n`);
  // Input that never closed (we timed out) must not keep the process alive.
  if (stdin === process.stdin) {
    process.stdin.pause();
    (process.stdin as unknown as { unref?: () => void }).unref?.();
  }
}
