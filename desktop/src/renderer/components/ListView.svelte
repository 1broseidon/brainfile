<script lang="ts">
  import { untrack } from 'svelte';
  import { tip } from '../lib/tooltip';
  import { app, MORE, READY_GROUP } from '../lib/state.svelte';
  import { columnProgress, type OutlineRow } from '../lib/format';
  import type { BoardSnapshot } from '../../shared/api';
  import StatusIcon from './StatusIcon.svelte';
  import TaskRow from './TaskRow.svelte';
  import CalmRow from './CalmRow.svelte';
  import Icon from './Icon.svelte';

  let { board }: { board: BoardSnapshot } = $props();

  let dropTarget = $state<string | null>(null);

  const collapsed = (id: string) => app.folded('parents', id);

  // Turning the list calm or full moves its rows; the selected one is kept in view.
  $effect(() => {
    void app.calm;
    untrack(() => {
      const id = app.selectedTaskId;
      if (id) document.querySelector(`[data-task="${id}"]`)?.scrollIntoView({ block: 'nearest' });
    });
  });

  function drop(e: DragEvent, column: string): void {
    const id = e.dataTransfer?.getData('text/brainfile-task');
    dropTarget = null;
    if (id) void app.moveTask(id, column);
  }
</script>

{#snippet outlineRow(row: OutlineRow)}
  {@const Row = app.calm ? CalmRow : TaskRow}
  <Row
    task={row.task}
    columns={board.columns}
    done={row.done}
    depth={row.depth}
    children={row.children}
    collapsed={collapsed(row.task.id)}
    ontoggle={() => app.toggleFold('parents', row.task.id)}
  />
{/snippet}

<!-- A group counts what it holds: its own roots and everything under them,
     children from other columns and completed ones included, folded or not.
     The calm list starts nearest done, rests the backlog and Done folded, and
     shows an open group at a glance, the rest under `N more`. A task an
     agent is working stays drawn, with its family. -->
<div class="list" class:calm={app.calm} role="table">
  {#each app.listGroups as group (group.key)}
    {@const column = group.column}
    {@const more = MORE + group.key}
    <section
      class="group"
      class:open={!group.folded}
      class:drop={!!column && dropTarget === column.id}
      role="rowgroup"
      ondragover={(e) => {
        if (!column) return;
        e.preventDefault();
        dropTarget = column.id;
      }}
      ondragleave={() => (dropTarget = null)}
      ondrop={(e) => column && drop(e, column.id)}
    >
      <header class="head">
        <button class="fold" onclick={() => app.toggleGroup(group.key)}>
          {#if !app.calm}
            {#if group.key === READY_GROUP}
              <span class="ready-mark"><Icon name="git" size={14} /></span>
            {:else}
              <StatusIcon progress={column ? columnProgress(board.columns, column.id) : 1} />
            {/if}
          {/if}
          <span class="name">{group.title}</span>
          <span class="count mono tabular">{group.count}</span>
          <span class="chev" class:open={!group.folded}><Icon name="chevron" size={12} stroke={1.8} /></span>
        </button>
        {#if column}
          <button class="icon-btn add" use:tip={`New task`} onclick={() => (app.composer = { column: column.id })}>
            <Icon name="plus" size={14} />
          </button>
        {/if}
      </header>
      {#each group.rows as row (row.task.id)}
        {@render outlineRow(row)}
      {/each}
      {#if group.more}
        <button
          class="more"
          class:selected={app.selectedTaskId === more}
          data-task={more}
          onmouseenter={() => (app.selectedTaskId = more)}
          onclick={() => app.showWhole(group.key)}>{group.more} more</button
        >
      {/if}
    </section>
  {/each}
</div>

<style>
  .ready-mark {
    display: inline-flex;
    color: var(--ink-3);
  }

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

  .group.drop .head {
    background: color-mix(in oklch, var(--canvas), var(--accent) 8%);
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

  .count {
    color: var(--ink-4);
  }

  .chev {
    display: inline-flex;
    color: var(--ink-4);
    opacity: 0;
    transition: transform var(--d-open) var(--ease), opacity var(--d-press) var(--ease);
  }

  .chev.open {
    transform: rotate(90deg);
  }

  .head:hover .chev,
  .chev:not(.open) {
    opacity: 1;
  }

  .add {
    width: 26px;
    height: 26px;
    opacity: 0;
  }

  .head:hover .add,
  .head:focus-within .add {
    opacity: 1;
  }

  /* The calm list: a group's head is quieter than its rows, a name and a
     count with no box (each row carries its own), its name on the boxes' edge.
     Open groups breathe apart; folded ones sit together, a quiet list of what
     waits. */
  .calm .group + .group {
    margin-top: 0;
  }

  .calm .group.open + .group {
    margin-top: var(--s5);
  }

  .calm .head {
    height: 36px;
  }

  .calm .name {
    margin-left: 0;
    font-weight: 500;
    color: var(--ink-3);
  }

  .more {
    width: 100%;
    height: 32px;
    display: flex;
    align-items: center;
    /* On the titles' edge. */
    padding-left: calc(var(--s4) + var(--indent-calm));
    font-size: var(--t-sm);
    color: var(--ink-4);
    text-align: left;
    transition:
      background var(--d-press) var(--ease),
      color var(--d-press) var(--ease);
  }

  .more:hover {
    color: var(--ink-2);
    background: var(--fill-hover);
  }

  .more.selected {
    color: var(--ink-2);
    background: var(--fill-selected);
  }
</style>
