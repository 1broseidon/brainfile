<script lang="ts">
  /**
   * A hand-off's branch, said on its row (task-69): in the Ready to merge
   * group, the lines it adds and removes, and Merge under the pointer, the
   * task pane's own Merge; in its column, `conflicts` when git's merge-tree
   * found the merge would. The row stays a row: clicking it still opens the
   * task.
   */
  import { app } from '../lib/state.svelte';
  import { tip } from '../lib/tooltip';
  import Icon from './Icon.svelte';
  import type { ReadyView } from '../../shared/api';

  let { ready, taskId }: { ready: ReadyView; taskId: string } = $props();

  let busy = $state(false);
  /** Merge happens in the person's checkout, so it waits until that is on the branch it goes into (decision-12 lifts this). */
  const elsewhere = $derived(ready.checkout !== ready.into);

  async function merge(e: MouseEvent): Promise<void> {
    e.stopPropagation();
    if (busy || elsewhere) return;
    busy = true;
    await app.settleReview(taskId, 'merge');
    busy = false;
  }
</script>

{#if ready.conflicts}
  <span class="conflicts mono" use:tip={`Would conflict with ${ready.into}: open it to send it back`}>conflicts</span>
{:else}
  <span class="lines mono" use:tip={`${ready.ahead} commit${ready.ahead === 1 ? '' : 's'} on its branch`}>
    <span class="add" class:zero={!ready.added}>+{ready.added}</span>
    <span class="del" class:zero={!ready.removed}>−{ready.removed}</span>
  </span>
  <button
    class="btn merge"
    class:busy
    disabled={busy || elsewhere}
    use:tip={elsewhere ? `Check out ${ready.into} in your folder to merge` : `Merge into ${ready.into}`}
    onclick={merge}><Icon name="git" size={13} />Merge</button
  >
{/if}

<style>
  .lines {
    flex: none;
    display: inline-flex;
    gap: var(--s2);
    margin-left: var(--s4);
    font-size: var(--t-xs);
  }

  .add {
    color: var(--ok);
  }

  .del {
    color: var(--danger);
  }

  .zero {
    color: var(--ink-4);
  }

  .conflicts {
    flex: none;
    margin-left: var(--s4);
    color: var(--warn);
  }

  /* Merge waits for the hand, in space kept for it, so nothing shifts. */
  .merge {
    flex: none;
    margin-left: var(--s3);
    opacity: 0;
    transition:
      opacity var(--d-press) var(--ease),
      background var(--d-press) var(--ease);
  }

  :global(.row:hover) .merge,
  :global(.row.selected) .merge,
  .merge:focus-visible,
  .merge.busy {
    opacity: 1;
  }
</style>
