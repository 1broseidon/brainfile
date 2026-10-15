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
  import MergeMenu from './MergeMenu.svelte';
  import type { MergeTo, ReadyView } from '../../shared/api';

  let { ready, taskId }: { ready: ReadyView; taskId: string } = $props();

  let busy = $state(false);
  /** An epic with a branch of its own: Merge asks where it goes (decision-16). */
  const epicBranch = $derived(!!app.board?.tasks.some((t) => t.id === taskId && t.epicBranch));

  async function merge(e: MouseEvent | null, to?: MergeTo): Promise<void> {
    e?.stopPropagation();
    if (busy) return;
    busy = true;
    await app.settleReview(taskId, 'merge', undefined, to);
    busy = false;
  }
</script>

{#if ready.conflicts}
  <span class="conflicts mono" use:tip={`Would conflict with ${ready.into}`}>conflicts</span>
  <!-- Merge on a conflict sends it back to its agent to settle (task-63). -->
  <button class="btn merge" class:busy disabled={busy} use:tip={'Its agent settles them'} onclick={merge}>{busy ? 'Sending…' : 'Send back'}</button>
{:else}
  <span class="lines mono" use:tip={`${ready.ahead} commit${ready.ahead === 1 ? '' : 's'} on its branch`}>
    <span class="add" class:zero={!ready.added}>+{ready.added}</span>
    <span class="del" class:zero={!ready.removed}>−{ready.removed}</span>
  </span>
  {#if epicBranch}
    <!-- The row stays a row: a click on the menu does not open the task. -->
    <span class="merge" class:busy role="presentation" onclick={(e) => e.stopPropagation()}>
      <MergeMenu branch={`dispatch/${taskId}`} into={ready.into} {busy} label={busy ? 'Checking…' : 'Merge'} onchoose={(to) => merge(null, to)} />
    </span>
  {:else}
    <button
      class="btn merge"
      class:busy
      disabled={busy}
      use:tip={`Merge into ${ready.into}`}
      onclick={merge}><Icon name="git" size={13} />{busy ? 'Checking…' : 'Merge'}</button
    >
  {/if}
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
