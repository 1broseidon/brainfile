<script lang="ts">
  import { api, app } from '../lib/state.svelte';
  import type { PermissionAsk } from '../../shared/api';

  /** The one interruption: an agent asking before it acts, said once, in the band. */
  let { ask, stacked = false }: { ask: PermissionAsk; stacked?: boolean } = $props();

  const label = (kind: string, name: string) =>
    kind === 'allow_once' ? 'Allow once' : kind === 'allow_always' ? 'Always' : kind === 'reject_once' ? 'Deny' : kind === 'reject_always' ? 'Never' : name;
  const ORDER = ['allow_once', 'allow_always', 'reject_once'];
  const shown = $derived(
    ask.options.filter((o) => o.kind !== 'reject_always').sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
  );
  const VERB: Record<string, string> = { execute: 'run', edit: 'edit', delete: 'delete', move: 'move', fetch: 'fetch', read: 'read' };
  /** A tool name reads as one (`use git_push`); a sentence reads as a sentence. */
  const what = $derived(/\s/.test(ask.title.trim()) ? ask.title.charAt(0).toLowerCase() + ask.title.slice(1) : null);
</script>

<span class="ask" class:stacked>
  <span class="what"
    ><b>{app.agentName(ask.agentId)}</b> wants to {#if ask.kind && VERB[ask.kind]}{VERB[ask.kind]} <code>{ask.title}</code>{:else if what}{what}{:else}use <code>{ask.title}</code>{/if}</span
  >
  {#each shown as option (option.optionId)}
    <button class="btn quiet" onclick={() => api.answerPermission(ask.id, option.optionId)}>{label(option.kind, option.name)}</button>
  {/each}
</span>

<style>
  .ask {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--ink-2);
  }

  /* In the chat and the task pane: the question on its own line, the answers under it. */
  .ask.stacked {
    flex-wrap: wrap;
    row-gap: var(--s1);
  }

  .ask.stacked .what {
    flex-basis: 100%;
    white-space: normal;
  }

  .what {
    min-width: 0;
    margin-right: var(--s2);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .what code {
    font-family: var(--mono);
    font-size: var(--t-xs);
    letter-spacing: 0.04em;
    color: var(--ink);
  }

  .what b {
    font-weight: 500;
    color: var(--ink);
  }
</style>
