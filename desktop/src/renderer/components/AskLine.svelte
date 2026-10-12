<script lang="ts">
  import { api, app } from '../lib/state.svelte';
  import type { PermissionAsk } from '../../shared/api';

  /** The one interruption: an agent asking before it acts, said once, in the band. */
  let { ask }: { ask: PermissionAsk } = $props();

  const label = (kind: string, name: string) =>
    kind === 'allow_once' ? 'Allow once' : kind === 'allow_always' ? 'Always' : kind === 'reject_once' ? 'Deny' : kind === 'reject_always' ? 'Never' : name;
  const shown = $derived(ask.options.filter((o) => o.kind !== 'reject_always'));
</script>

<span class="ask">
  <span class="what"><b>{app.agentName(ask.agentId)}</b> wants to {ask.title.charAt(0).toLowerCase() + ask.title.slice(1)}</span>
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

  .what {
    min-width: 0;
    margin-right: var(--s2);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .what b {
    font-weight: 500;
    color: var(--ink);
  }
</style>
