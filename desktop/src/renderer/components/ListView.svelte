<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { asTree, columnProgress } from '../lib/format';
  import type { BoardSnapshot } from '../../shared/api';
  import StatusIcon from './StatusIcon.svelte';
  import TaskRow from './TaskRow.svelte';
  import Icon from './Icon.svelte';

  let { board }: { board: BoardSnapshot } = $props();

  let folded = $state<Record<string, boolean>>({});
  let hidden = $state<Record<string, boolean>>({});
  let dropTarget = $state<string | null>(null);

  const groups = $derived(
    board.columns.map((column) => {
      const rows = asTree(board.tasks.filter((t) => t.column === column.id));
      // Drop the descendants of a collapsed parent.
      const visible: typeof rows = [];
      let skipBelow = Infinity;
      for (const row of rows) {
        if (row.depth > skipBelow) continue;
        skipBelow = hidden[row.task.id] ? row.depth : Infinity;
        visible.push(row);
      }
      return { column, rows: visible, count: rows.length };
    })
  );

  function drop(e: DragEvent, column: string): void {
    const id = e.dataTransfer?.getData('text/brainfile-task');
    dropTarget = null;
    if (id) void app.moveTask(id, column);
  }
</script>

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
        <button class="fold" onclick={() => (folded[column.id] = !folded[column.id])}>
          <StatusIcon progress={columnProgress(board.columns, column.id)} />
          <span class="name">{column.title}</span>
          <span class="count mono tabular">{count}</span>
          <span class="chev" class:open={!folded[column.id]}><Icon name="chevron" size={12} stroke={1.8} /></span>
        </button>
        <button class="icon-btn add" title="New task in {column.title}" onclick={() => (app.composer = { column: column.id })}>
          <Icon name="plus" size={14} />
        </button>
      </header>
      {#if !folded[column.id]}
        {#each rows as row (row.task.id)}
          <TaskRow
            task={row.task}
            columns={board.columns}
            depth={row.depth}
            children={row.children}
            collapsed={!!hidden[row.task.id]}
            ontoggle={() => (hidden[row.task.id] = !hidden[row.task.id])}
          />
        {/each}
      {/if}
    </section>
  {/each}

  {#if board.completed.length}
    <section class="group">
      <header class="head">
        <button class="fold" onclick={() => (app.showCompleted = !app.showCompleted)}>
          <StatusIcon progress={1} />
          <span class="name">Done</span>
          <span class="count mono tabular">{board.completed.length}</span>
          <span class="chev" class:open={app.showCompleted}><Icon name="chevron" size={12} stroke={1.8} /></span>
        </button>
      </header>
      {#if app.showCompleted}
        {#each board.completed as task (task.id)}
          <TaskRow {task} columns={board.columns} done />
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
    z-index: 1;
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

  .head:hover .add {
    opacity: 1;
  }


</style>
