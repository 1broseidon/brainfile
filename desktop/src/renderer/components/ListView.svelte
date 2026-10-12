<script lang="ts">
  import { tip } from '../lib/tooltip';
  import { app } from '../lib/state.svelte';
  import { columnProgress, outline, visibleRows, type OutlineRow } from '../lib/format';
  import type { BoardSnapshot } from '../../shared/api';
  import StatusIcon from './StatusIcon.svelte';
  import TaskRow from './TaskRow.svelte';
  import Icon from './Icon.svelte';

  let { board }: { board: BoardSnapshot } = $props();

  let dropTarget = $state<string | null>(null);

  const collapsed = (id: string) => app.folded('parents', id);

  // A group counts what it holds: its own roots and everything under them,
  // children from other columns and completed ones included, folded or not.
  const tree = $derived(outline(board.columns, board.tasks, board.completed));
  const groups = $derived(
    tree.groups.map(({ column, rows }) => ({ column, rows: visibleRows(rows, collapsed), count: rows.length }))
  );
  const done = $derived(visibleRows(tree.done, collapsed));

  function drop(e: DragEvent, column: string): void {
    const id = e.dataTransfer?.getData('text/brainfile-task');
    dropTarget = null;
    if (id) void app.moveTask(id, column);
  }
</script>

{#snippet outlineRow(row: OutlineRow)}
  <TaskRow
    task={row.task}
    columns={board.columns}
    done={row.done}
    depth={row.depth}
    children={row.children}
    collapsed={collapsed(row.task.id)}
    ontoggle={() => app.toggleFold('parents', row.task.id)}
  />
{/snippet}

<div class="list" role="table">
  {#each groups.filter((g) => g.count > 0) as { column, rows, count } (column.id)}
    <section
      class="group"
      class:drop={dropTarget === column.id}
      role="rowgroup"
      ondragover={(e) => {
        e.preventDefault();
        dropTarget = column.id;
      }}
      ondragleave={() => (dropTarget = null)}
      ondrop={(e) => drop(e, column.id)}
    >
      <header class="head">
        <button class="fold" onclick={() => app.toggleFold('groups', column.id)}>
          <StatusIcon progress={columnProgress(board.columns, column.id)} />
          <span class="name">{column.title}</span>
          <span class="count mono tabular">{count}</span>
          <span class="chev" class:open={!app.folded('groups', column.id)}><Icon name="chevron" size={12} stroke={1.8} /></span>
        </button>
        <button class="icon-btn add" use:tip={`New task in ${column.title}`} onclick={() => (app.composer = { column: column.id })}>
          <Icon name="plus" size={14} />
        </button>
      </header>
      {#if !app.folded('groups', column.id)}
        {#each rows as row (row.task.id)}
          {@render outlineRow(row)}
        {/each}
      {/if}
    </section>
  {/each}

  {#if tree.done.length}
    <section class="group">
      <header class="head">
        <button class="fold" onclick={() => (app.showCompleted = !app.showCompleted)}>
          <StatusIcon progress={1} />
          <span class="name">Done</span>
          <span class="count mono tabular">{tree.done.length}</span>
          <span class="chev" class:open={app.showCompleted}><Icon name="chevron" size={12} stroke={1.8} /></span>
        </button>
      </header>
      {#if app.showCompleted}
        {#each done as row (row.task.id)}
          {@render outlineRow(row)}
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


</style>
