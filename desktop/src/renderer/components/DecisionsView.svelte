<script lang="ts">
  /**
   * The board's standing choices (design.md, Decisions): current decisions
   * grouped by the family their claim key names, history folded away below.
   * A decision is not work, so it has no status box: its row leads with the
   * TUI's decision glyph, and says at rest only what needs saying (a kind
   * other than decision, a decision still proposed or past its date). The
   * claim key, the stance and what it replaced wait for the hand.
   */
  import { tip } from '../lib/tooltip';
  import { app } from '../lib/state.svelte';
  import { decisionGroups, isLiveDecision, shortDate } from '../lib/format';
  import type { BoardSnapshot, DecisionView } from '../../shared/api';
  import Icon from './Icon.svelte';

  let { board }: { board: BoardSnapshot } = $props();

  let folded = $state<Record<string, boolean>>({});

  const today = new Date().toISOString().slice(0, 10);
  const expired = (d: DecisionView) => !!d.validUntil && d.validUntil.slice(0, 10) < today;
  const groups = $derived(decisionGroups(board.decisions));
  const history = $derived(board.decisions.filter((d) => !isLiveDecision(d)));

  /** The rest of the claim key after its family, which the group already says. */
  function tail(d: DecisionView): string {
    if (!d.claimKey) return '';
    const parts = d.claimKey.split('.');
    return parts.length > 1 ? parts.slice(1).join('.') : d.claimKey;
  }

  function open(id: string): void {
    app.openTaskId = id;
  }
</script>

{#snippet row(d: DecisionView, retired: boolean)}
  <div
    class="row"
    class:retired
    class:selected={app.selectedTaskId === d.id}
    role="row"
    tabindex="-1"
    data-task={d.id}
    onmouseenter={() => (app.selectedTaskId = d.id)}
    onclick={() => open(d.id)}
    onkeydown={() => {}}
  >
    <span class="cell glyph" aria-hidden="true">{retired ? '○' : '●'}</span>
    <span class="title-block">
      <span class="title">{d.title}</span>
      {#if d.claimKey}<span class="key mono reveal">{retired ? d.claimKey : tail(d)}</span>{/if}
      {#if d.stance && d.subject}<span class="stance mono reveal">{d.stance} {d.subject}</span>{/if}
    </span>
    <span class="signals">
      {#if retired}
        <span class="mono quiet">{d.status}{#if d.supersededBy} → {d.supersededBy}{/if}</span>
      {:else}
        {#if d.status === 'proposed'}<span class="mono quiet">proposed</span>{/if}
        {#if d.kind && d.kind !== 'decision'}<span class="mono quiet">{d.kind}</span>{/if}
        {#if expired(d)}
          <span class="mono warn" use:tip={`Valid until ${shortDate(d.validUntil)}: time to look at it again`}>review</span>
        {:else if d.validUntil}
          <span class="mono quiet" use:tip={'Valid until'}>{shortDate(d.validUntil)}</span>
        {/if}
        {#if d.supersedes.length}<span class="mono quiet reveal">replaces {d.supersedes.join(', ')}</span>{/if}
      {/if}
    </span>
  </div>
{/snippet}

<div class="list" role="table">
  {#if board.decisions.length === 0}
    <div class="center">
      <div class="empty">
        <h1>No decisions yet</h1>
        <p>
          A decision is a standing choice, like which HTTP client to use or what not to depend on. Agents and the CLI record them
          with <code>brainfile decide</code>; each stays current until a newer one on the same claim key replaces it.
        </p>
      </div>
    </div>
  {/if}

  {#each groups as { family, decisions } (family)}
    <section class="group" role="rowgroup">
      <header class="head">
        <button class="fold" onclick={() => (folded[family] = !folded[family])}>
          <span class="name" class:mono={!!family}>{family || 'Unfiled'}</span>
          <span class="count mono tabular">{decisions.length}</span>
          <span class="chev" class:open={!folded[family]}><Icon name="chevron" size={12} stroke={1.8} /></span>
        </button>
      </header>
      {#if !folded[family]}
        {#each decisions as d (d.id)}
          {@render row(d, false)}
        {/each}
      {/if}
    </section>
  {/each}

  {#if history.length}
    <section class="group" role="rowgroup">
      <header class="head">
        <button class="fold" onclick={() => (app.showCompleted = !app.showCompleted)}>
          <span class="name">History</span>
          <span class="count mono tabular">{history.length}</span>
          <span class="chev" class:open={app.showCompleted}><Icon name="chevron" size={12} stroke={1.8} /></span>
        </button>
      </header>
      {#if app.showCompleted}
        {#each history as d (d.id)}
          {@render row(d, true)}
        {/each}
      {/if}
    </section>
  {/if}
</div>

<style>
  .list {
    height: 100%;
    overflow-y: auto;
    padding: var(--s2) 0 var(--s12);
  }

  .group + .group {
    margin-top: var(--s3);
  }

  .head {
    position: sticky;
    top: 0;
    z-index: var(--z-band);
    height: 40px;
    display: flex;
    align-items: center;
    padding: 0 var(--s5) 0 var(--s4);
    background: var(--canvas);
  }

  .fold {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding-left: 6px;
    text-align: left;
  }

  .name {
    font-weight: 600;
    margin-left: 2px;
  }

  /* A family is a claim key's first word: typed, so set in the instrument face. */
  .name.mono {
    font-weight: 500;
    color: var(--ink-2);
  }

  .count {
    color: var(--ink-4);
  }

  .chev {
    display: inline-flex;
    color: var(--ink-4);
    opacity: 0;
    transition:
      transform var(--d-open) var(--ease),
      opacity var(--d-press) var(--ease);
  }

  .chev.open {
    transform: rotate(90deg);
  }

  .head:hover .chev {
    opacity: 1;
  }

  /* A decision's row keeps a task row's measure, so the two views read alike. */
  .row {
    height: var(--row-h);
    display: flex;
    align-items: center;
    gap: var(--s1);
    padding: 0 var(--s4);
    transition: background var(--d-press) var(--ease);
  }

  .row:hover {
    background: var(--fill-hover);
  }

  .row.selected {
    background: var(--fill-selected);
  }

  .cell {
    width: 26px;
    height: 26px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .glyph {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }

  .title-block {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: var(--s2);
    margin-left: var(--s1);
  }

  .title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .retired .title,
  .retired .glyph {
    color: var(--ink-3);
  }

  .key,
  .stance {
    flex: none;
    color: var(--ink-4);
  }

  .signals {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--s3);
    margin-left: var(--s4);
  }

  .quiet {
    color: var(--ink-3);
  }

  .warn {
    color: var(--warn);
  }

  /* What waits for the hand. Space is kept so nothing shifts when it comes. */
  .reveal {
    opacity: 0;
    transition: opacity var(--d-press) var(--ease);
  }

  .row:hover .reveal,
  .row.selected .reveal {
    opacity: 1;
  }

  .center {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--s10);
  }

  .empty {
    max-width: 420px;
    text-align: center;
  }

  .empty h1 {
    margin: 0 0 var(--s2);
    font-size: var(--t-lg);
    line-height: var(--lh-lg);
    font-weight: 600;
  }

  .empty p {
    margin: 0;
    color: var(--ink-3);
  }

  .empty code {
    font-family: var(--mono);
    font-size: var(--t-xs);
    padding: 1px 4px;
    border-radius: var(--r-chip);
    background: var(--fill-code);
  }
</style>
