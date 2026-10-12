<script lang="ts">
  import { api, app } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';

  const board = $derived(app.board);
  let lockupWidth = $state(0);

  /**
   * The view keys stand over the board: on the line of the board's title
   * while the rail is open, and just past the lockup once it is closed.
   */
  const LIGHTS = 80;
  const viewsLeft = $derived(
    Math.max(app.layout.railOpen ? app.layout.rail + 24 : 0, LIGHTS + lockupWidth + 24)
  );

  async function sync(): Promise<void> {
    if (!board) return;
    const result = await api.syncNow(board.projectId);
    if (!result.ok) app.notify(result.error, 'warn');
    else if (result.value.warning) app.notify(result.value.warning, 'warn');
  }
</script>

<!-- The window's strip is the well itself: the lights, then the lockup (the
     mark and the written name), always leftmost; the view keys over the
     board; the board's sync, New task and the search at the right. The
     rail's key lives with the rail (see Sidebar, Workspace). -->
<header class="strip drag">
  <span class="lockup" aria-label="Brainfile" bind:clientWidth={lockupWidth}>
    <span class="mark"><Mark size={16} /></span>
    <span class="name">brainfile</span>
  </span>

  {#if board}
    <div class="segmented no-drag" role="tablist" title="List or board  V" style:left="{viewsLeft}px">
      <button role="tab" aria-selected={app.view === 'list'} class:on={app.view === 'list'} onclick={() => app.setView('list')}>
        <Icon name="list" size={13} />List
      </button>
      <button role="tab" aria-selected={app.view === 'board'} class:on={app.view === 'board'} onclick={() => app.setView('board')}>
        <Icon name="board" size={13} />Board
      </button>
    </div>
  {/if}

  <div class="right">
    {#if board}
      <button
        class="sync no-drag"
        class:busy={board.sync.busy}
        class:warn={!!board.sync.warning}
        title={board.sync.warning ?? (board.sync.remote ? `Sync with ${board.sync.remote} now` : 'Kept on this machine only')}
        disabled={!board.sync.remote || board.sync.busy}
        onclick={sync}
      >
        <span class="dot" class:shared={!!board.sync.remote}></span>
        <span class="mono">{board.sync.busy ? 'syncing…' : (board.sync.label ?? 'plain files')}</span>
        {#if board.sync.pending > 0}<span class="pending mono">↑{board.sync.pending}</span>{/if}
      </button>
      <button class="btn primary no-drag" onclick={() => (app.composer = {})}>
        New task<span class="keys">C</span>
      </button>
    {/if}
    <button class="search field no-drag" onclick={() => (app.paletteOpen = true)}>
      <Icon name="search" size={13} />
      <span>Search</span>
      <kbd>⌘K</kbd>
    </button>
  </div>
</header>

<style>
  .strip {
    position: relative;
    height: var(--strip-h);
    flex: none;
    display: flex;
    align-items: center;
    /* Room for the traffic lights. */
    padding: 0 var(--gap) 0 80px;
  }

  .lockup {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .mark {
    display: inline-flex;
    color: var(--ink-3);
  }

  /* The written name, lowercase, in the mark's colour: the lockup is one
     piece of furniture, not a heading. */
  .name {
    font-size: var(--t-md);
    line-height: var(--lh-md);
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--ink-3);
  }

  .segmented {
    position: absolute;
    top: 4px;
    height: 24px;
    display: flex;
    padding: 2px;
    gap: 2px;
    border-radius: var(--r-control);
    background: var(--canvas);
    box-shadow: inset 0 0 0 var(--hairline) var(--line);
    transition: left var(--d-move) var(--ease);
  }

  .segmented button {
    height: 20px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 var(--s2);
    border-radius: var(--r-chip);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-3);
    transition: background var(--d-press) var(--ease), color var(--d-press) var(--ease);
  }

  .segmented button:hover {
    color: var(--ink);
  }

  .segmented button.on {
    color: var(--ink);
    background: var(--pop);
    box-shadow: var(--top-light), inset 0 0 0 var(--hairline) var(--line);
  }

  .right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--s2);
  }

  .sync {
    height: 24px;
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2);
    border-radius: var(--r-control);
    color: var(--ink-3);
  }

  .sync:not(:disabled):hover {
    background: var(--fill-hover);
    color: var(--ink-2);
  }

  .sync.warn {
    color: var(--warn);
  }

  /* Every state is a glyph and a colour: a ring is local, a dot is shared. */
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--ink-4);
  }

  .dot.shared {
    background: var(--ok);
    box-shadow: none;
  }

  .sync.warn .dot {
    background: var(--warn);
  }

  .sync.busy .dot {
    background: var(--accent);
    animation: breathe 1800ms var(--ease) infinite alternate;
  }

  @keyframes breathe {
    to {
      opacity: 0.35;
    }
  }

  .pending {
    color: var(--ink-2);
  }

  .btn.primary {
    height: 24px;
  }

  .search {
    width: 200px;
    height: 24px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 3px 0 var(--s2);
    color: var(--ink-4);
    text-align: left;
  }

  .search:hover {
    box-shadow: inset 0 0 0 var(--hairline) var(--line-strong);
    color: var(--ink-3);
  }

  .search span {
    flex: 1;
  }

  .search kbd {
    height: 16px;
  }
</style>
