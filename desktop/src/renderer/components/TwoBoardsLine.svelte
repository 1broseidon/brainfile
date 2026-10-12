<script lang="ts">
  import { tip } from '../lib/tooltip';
  import { app } from '../lib/state.svelte';
  import type { IntegrityView, SettleChoice } from '../../shared/api';

  /**
   * Two boards in one repository (spec-15), said once in the band like an
   * agent's ask: what was found, then Use theirs · Merge · Keep this one.
   * Nothing writes until one is pressed; what it replaces is backed up first.
   */
  let { two }: { two: NonNullable<IntegrityView['twoBoards']> } = $props();

  const busy = $derived(app.settling !== null);
  const tips: Record<SettleChoice, string> = $derived({
    theirs: two.lossless === 'theirs' ? 'Has everything · safe' : 'Backup, then replace',
    merge: 'Backup, then merge',
    keep: two.lossless === 'keep' ? 'Has everything · safe' : 'Backup, then keep',
  });
</script>

<span class="two">
  <span class="what" use:tip={two.detail}>{two.message}</span>
  <button class="btn quiet" class:sure={two.lossless === 'theirs'} disabled={busy} use:tip={tips.theirs} onclick={() => app.settleBoards('theirs')}>{two.useOther}</button>
  <button class="btn quiet" class:sure={two.lossless === 'merge'} disabled={busy} use:tip={tips.merge} onclick={() => app.settleBoards('merge')}>Merge</button>
  <button class="btn quiet" class:sure={two.lossless === 'keep'} disabled={busy} use:tip={tips.keep} onclick={() => app.settleBoards('keep')}>Keep this one</button>
</span>

<style>
  .two {
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
    color: var(--warn);
  }

  /* The choice that loses nothing reads in full ink; the others stay quiet. */
  .sure {
    color: var(--ink);
  }
</style>
