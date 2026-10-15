<script lang="ts">
  /**
   * A hand-off opened as a pull request, said on its row (decision-16): it
   * left Ready to merge and lands when it merges on the forge, so the row says
   * its number, and the number opens it there. The row stays a row: clicking
   * elsewhere on it still opens the task.
   */
  import { tip } from '../lib/tooltip';
  import Icon from './Icon.svelte';
  import type { PullRequestRecord } from '../../shared/api';

  let { pr }: { pr: PullRequestRecord } = $props();
</script>

<a
  class="pr mono"
  href={pr.url}
  target="_blank"
  rel="noreferrer"
  use:tip={`Pull request #${pr.number} open into ${pr.base}: it lands when that merges`}
  onclick={(e) => e.stopPropagation()}><Icon name="pull" size={12} />#{pr.number}</a
>

<style>
  .pr {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: var(--s4);
    font-size: var(--t-xs);
    color: var(--ink-3);
    text-decoration: none;
  }

  .pr:hover,
  .pr:focus-visible {
    color: var(--ink);
  }
</style>
