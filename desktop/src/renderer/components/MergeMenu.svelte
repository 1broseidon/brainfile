<script lang="ts">
  /**
   * Merge for an epic with a branch of its own (decision-16): it asks where
   * the branch goes. Its target, the default; another branch; a pull request
   * into its target (spec-18-4), offered when origin is on GitHub; or kept as
   * a branch, which completes the epic and leaves the branch. The choices
   * come from MERGE_CHOICES, in its order.
   */
  import { app } from '../lib/state.svelte';
  import { tip } from '../lib/tooltip';
  import { portal } from '../lib/portal';
  import Icon from './Icon.svelte';
  import { MERGE_CHOICES, type MergeChoice, type MergeTo } from '../../shared/api';

  let {
    branch,
    into,
    busy = false,
    primary = false,
    label = 'Merge',
    onchoose,
  }: { branch: string; into: string; busy?: boolean; primary?: boolean; label?: string; onchoose: (to: MergeTo) => void } = $props();

  let open = $state(false);
  let picking = $state(false);
  let key = $state<HTMLButtonElement>();
  let place = $state({ top: 0, left: 0 });
  const MENU_W = 300;

  const known = $derived(app.activeId ? app.branches[app.activeId] : undefined);
  /** Any other branch it could go into: the trunk, local branches, then origin's. */
  const others = $derived(
    [...new Set([...(known?.trunk ? [known.trunk] : []), ...(known?.local ?? []), ...(known?.remote ?? [])])].filter((b) => b !== into && b !== branch)
  );

  const LINES: Record<MergeChoice, { title: string; note: string }> = $derived({
    target: { title: `Merge into ${into}`, note: 'its target' },
    branch: { title: 'Merge into another branch…', note: '' },
    'pull-request': { title: 'Open a pull request', note: `into ${into}` },
    keep: { title: 'Keep as a branch', note: `done, ${branch} stays` },
  });

  function toggle(e: MouseEvent): void {
    e.stopPropagation();
    open = !open;
    picking = false;
    if (open && key) {
      const r = key.getBoundingClientRect();
      place = { top: r.bottom + 4, left: Math.min(Math.max(8, r.right - MENU_W), window.innerWidth - MENU_W - 8) };
      void app.refreshBranches();
    }
  }

  function choose(choice: MergeChoice): void {
    if (choice === 'branch') {
      picking = true;
      return;
    }
    open = false;
    onchoose(choice === 'keep' ? { to: 'keep' } : choice === 'pull-request' ? { to: 'pull-request' } : { to: 'target' });
  }

  function toBranch(other: string): void {
    open = false;
    picking = false;
    onchoose({ to: 'branch', branch: other });
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (open && e.key === 'Escape') {
      if (picking) picking = false;
      else open = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }}
/>

<span class="anchor">
  <button class="btn merge-key" class:primary class:on={open} disabled={busy} bind:this={key} use:tip={`Where ${branch} goes`} onclick={toggle}>
    <Icon name="git" size={13} />{label}<Icon name="chevron" size={11} />
  </button>
  {#if open}
    <div class="catch" role="presentation" use:portal onmousedown={() => (open = false)}></div>
    <div class="menu" role="listbox" use:portal style:top="{place.top}px" style:left="{place.left}px" style:width="{MENU_W}px">
      {#if picking}
        <button class="head mono back" onclick={() => (picking = false)}><Icon name="back" size={12} />Merge {branch} into</button>
        <div class="branches">
          {#each others as other (other)}
            <button class="item" role="option" aria-selected="false" onclick={() => toBranch(other)}><span class="name mono clip">{other}</span></button>
          {:else}
            <div class="empty">No other branch here</div>
          {/each}
        </div>
      {:else}
        <div class="head mono">{branch}</div>
        {#each MERGE_CHOICES.filter((c) => c !== 'pull-request' || app.canOpenPullRequest()) as choice (choice)}
          <button class="item" role="option" aria-selected={choice === 'target'} onclick={() => choose(choice)}>
            <span class="name">{LINES[choice].title}</span>
            {#if LINES[choice].note}<span class="note mono">{LINES[choice].note}</span>{/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</span>

<style>
  .anchor {
    position: relative;
    display: inline-flex;
  }

  .btn.on {
    background: var(--fill-hover);
    color: var(--ink);
  }

  .catch {
    position: fixed;
    inset: 0;
    z-index: var(--z-catch);
  }

  /* Lifted to the body, so no pane clips it. */
  .menu {
    position: fixed;
    z-index: var(--z-menu);
    padding: var(--s1);
    border-radius: var(--r-card);
    background: var(--pop);
    box-shadow: var(--top-light), var(--shadow-float);
    animation: open var(--d-open) var(--ease);
  }

  @keyframes open {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }

  .head {
    padding: var(--s2) var(--s2) var(--s1);
    color: var(--ink-3);
  }

  .back {
    display: flex;
    align-items: center;
    gap: var(--s1);
    width: 100%;
    text-align: left;
  }

  .back:hover {
    color: var(--ink);
  }

  .item {
    width: 100%;
    height: 32px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2);
    border-radius: var(--r-control);
    text-align: left;
  }

  .item:hover {
    background: var(--fill-hover);
  }

  .name {
    flex: 1;
    font-weight: 500;
  }

  .branches .name {
    font-weight: 400;
  }

  .note {
    color: var(--ink-4);
  }

  .branches {
    max-height: 280px;
    overflow-y: auto;
  }

  .empty {
    padding: var(--s2);
    color: var(--ink-4);
  }

  .clip {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
