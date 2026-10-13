<script lang="ts">
  /**
   * The dock (design.md, Dock): what you keep at hand, along the board pane's
   * bottom edge beside the chat key, one cohesive row of agents and work.
   * A tab is a document you opened in the pane or handed to an agent, on any
   * board: its status box, its title, and one signal, the agent at work on
   * it or else the board it is on when that is not the one in front. As many
   * tabs show as the width allows, up to four; the rest wait under +N.
   */
  import { onMount } from 'svelte';
  import { app, CHAT, type Tab } from '../lib/state.svelte';
  import { columnProgress } from '../lib/format';
  import { tip } from '../lib/tooltip';
  import type { AgentRun } from '../../shared/api';
  import Icon from './Icon.svelte';
  import StatusIcon from './StatusIcon.svelte';
  import Working from './Working.svelte';

  const TAB_W = 236;
  const GAP = 6;
  const MAX_SHOWN = 4;
  /** The dock keeps to the right of the pane, so the rows it covers are few. */
  const SHARE = 0.72;

  interface Item {
    tab: Tab;
    title: string;
    /** Work's place on the way to done, or null for a decision. */
    progress: number | null;
    retired: boolean;
    run?: AgentRun;
    /** The board's name, when it is not the board in front. */
    away?: string;
    current: boolean;
  }

  let el = $state<HTMLElement>();
  let paneW = $state(0);
  let more = $state(false);

  onMount(() => {
    const pane = el?.offsetParent as HTMLElement | null;
    if (!pane) return;
    const observer = new ResizeObserver(() => (paneW = pane.clientWidth));
    observer.observe(pane);
    paneW = pane.clientWidth;
    return () => observer.disconnect();
  });

  /** A tab as it reads now; null when its document has gone from its board. */
  function describe(tab: Tab): Item | null {
    const board = app.boards[tab.projectId];
    if (!board) return null;
    const project = app.projects.find((p) => p.id === tab.projectId);
    const base = {
      tab,
      run: app.runOn(tab.projectId, tab.id),
      away: tab.projectId !== app.activeId ? project?.name : undefined,
      current: tab.projectId === app.activeId && tab.id === app.openTaskId,
    };
    const open = board.tasks.find((t) => t.id === tab.id);
    if (open) return { ...base, title: open.title, progress: columnProgress(board.columns, open.column), retired: false };
    const done = board.completed.find((t) => t.id === tab.id);
    if (done) return { ...base, title: done.title, progress: 1, retired: false };
    const decision = board.decisions.find((d) => d.id === tab.id);
    if (decision) return { ...base, title: decision.title, progress: null, retired: decision.status !== 'current' && decision.status !== 'proposed' };
    return null;
  }

  const items = $derived(app.tabs.map(describe).filter((i): i is Item => i !== null));

  /** Where the dock ends on the right: beside the chat key (wider while a turn is at work), or beside the chat when it is open. */
  const right = $derived(app.chatOpen ? Math.min(app.layout.chat.w, Math.max(CHAT.minW, paneW - 24)) + 12 + GAP : 12 + app.chatKeyW + GAP);

  /** As many tabs as the width allows, up to four, keeping room for +N. */
  const capacity = $derived(Math.max(0, Math.min(MAX_SHOWN, Math.floor((paneW * SHARE - right - 44 + GAP) / (TAB_W + GAP)))));

  /** The newest tabs next to the key; the one open always among them. */
  const shown = $derived.by(() => {
    if (capacity === 0) return [] as Item[];
    let list = items.slice(-capacity);
    const current = items.find((i) => i.current);
    if (current && !list.includes(current)) list = [...list.slice(1), current];
    return list;
  });
  const hidden = $derived(items.filter((i) => !shown.includes(i)));

  function open(item: Item): void {
    more = false;
    void app.goTo(item.tab.projectId, item.tab.id);
  }

  function close(e: MouseEvent, item: Item): void {
    e.stopPropagation();
    app.closeTab(item.tab.projectId, item.tab.id);
  }

  const label = (i: Item) => `${i.title}${i.away ? `  ·  ${i.away}` : ''}`;
</script>

{#snippet mark(i: Item)}
  {#if i.progress === null}
    <span class="dmark" class:retired={i.retired} aria-hidden="true">{i.retired ? '○' : '●'}</span>
  {:else}
    <StatusIcon progress={i.progress} size={13} />
  {/if}
{/snippet}

<!-- Always here, so the pane's width is known before the first tab arrives. -->
<div class="dock" bind:this={el} style:right="{right}px">
  {#if items.length}
    {#if hidden.length}
      <span class="anchor">
        <button class="more mono" use:tip={`${hidden.length} more`} onclick={() => (more = !more)}>+{hidden.length}</button>
        {#if more}
          <div class="catch" role="presentation" onmousedown={() => (more = false)}></div>
          <div class="menu">
            {#each [...hidden].reverse() as i (i.tab.projectId + i.tab.id)}
              <div class="item" role="button" tabindex="0" onclick={() => open(i)} onkeydown={(e) => e.key === 'Enter' && open(i)}>
                {@render mark(i)}
                <span class="tt">{i.title}</span>
                {#if i.run}
                  <span class="sig"><Working run={i.run} rotate={false} /></span>
                {:else if i.away}
                  <span class="sig mono away">{i.away}</span>
                {/if}
                <button class="x" aria-label="Close tab" onclick={(e) => close(e, i)}><Icon name="close" size={10} /></button>
              </div>
            {/each}
          </div>
        {/if}
      </span>
    {/if}
    {#each shown as i (i.tab.projectId + i.tab.id)}
      <div
        class="tab"
        class:current={i.current}
        class:waiting={i.run?.state === 'waiting'}
        role="button"
        tabindex="0"
        style:width="{TAB_W}px"
        use:tip={label(i)}
        onclick={() => open(i)}
        onkeydown={(e) => e.key === 'Enter' && open(i)}
      >
        {@render mark(i)}
        <span class="tt">{i.title}</span>
        {#if i.run}
          <span class="sig"><Working run={i.run} rotate={false} /></span>
        {:else if i.away}
          <span class="sig mono away">{i.away}</span>
        {/if}
        <button class="x" aria-label="Close tab" onclick={(e) => close(e, i)}><Icon name="close" size={10} /></button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .dock {
    position: absolute;
    z-index: var(--z-band);
    bottom: var(--s3);
    display: flex;
    align-items: center;
    gap: 6px;
    transition: right var(--d-move) var(--ease);
  }

  /* A tab is the chat key's sibling: the same plane, edge and halo. */
  .tab {
    height: 32px;
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 4px 0 10px;
    border-radius: var(--r-card);
    background: var(--raised);
    box-shadow:
      var(--top-light),
      inset 0 0 0 var(--hairline) var(--line),
      0 0 28px 10px color-mix(in oklch, var(--canvas) 80%, transparent);
    cursor: default;
    transition: background var(--d-press) var(--ease);
  }

  .tab:hover {
    background: var(--pressed);
  }

  .tab.current {
    background: var(--pop);
  }

  .tt {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--ink-2);
  }

  .tab.current .tt,
  .tab:hover .tt {
    color: var(--ink);
  }

  .sig {
    flex: none;
    display: inline-flex;
  }

  .away {
    color: var(--ink-4);
  }

  .dmark {
    width: 13px;
    flex: none;
    text-align: center;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }

  /* Close waits for the hand, in space kept for it. */
  .x {
    width: 18px;
    height: 18px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-chip);
    color: var(--ink-4);
    opacity: 0;
    transition: opacity var(--d-press) var(--ease);
  }

  .tab:hover .x,
  .item:hover .x {
    opacity: 1;
  }

  .x:hover {
    background: var(--fill-active);
    color: var(--ink);
  }

  .anchor {
    position: relative;
    display: inline-flex;
  }

  .more {
    height: 32px;
    padding: 0 var(--s2);
    border-radius: var(--r-card);
    color: var(--ink-3);
  }

  .more:hover {
    background: var(--fill-hover);
    color: var(--ink);
  }

  .catch {
    position: fixed;
    inset: 0;
    z-index: var(--z-catch);
  }

  .menu {
    position: absolute;
    z-index: var(--z-menu);
    right: 0;
    bottom: calc(100% + 6px);
    width: 300px;
    padding: var(--s1);
    border-radius: var(--r-card);
    background: var(--pop);
    box-shadow: var(--top-light), var(--shadow-float);
  }

  .item {
    height: 32px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 4px 0 var(--s2);
    border-radius: var(--r-control);
  }

  .item:hover {
    background: var(--fill-hover);
  }
</style>
