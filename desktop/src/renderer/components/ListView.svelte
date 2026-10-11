<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { columnProgress } from '../lib/format';
  import type { BoardSnapshot } from '../../shared/api';
  import StatusIcon from './StatusIcon.svelte';
  import TaskRow from './TaskRow.svelte';
  import Icon from './Icon.svelte';

  let { board }: { board: BoardSnapshot } = $props();

  let collapsed = $state<Record<string, boolean>>({});
  let dropTarget = $state<string | null>(null);

  const groups = $derived(
    board.columns.map((column) => ({
      column,
      tasks: board.tasks.filter((t) => t.column === column.id),
    }))
  );

  function drop(e: DragEvent, column: string): void {
    const id = e.dataTransfer?.getData('text/brainfile-task');
    dropTarget = null;
    if (id) void app.moveTask(id, column);
  }
</script>

<div class="list" role="table">
  {#each groups as { column, tasks } (column.id)}
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
      <header class="group-head">
        <button class="toggle" onclick={() => (collapsed[column.id] = !collapsed[column.id])}>
          <span class="chev" class:open={!collapsed[column.id]}><Icon name="chevron" size={12} stroke={1.8} /></span>
          <StatusIcon progress={columnProgress(board.columns, column.id)} />
          <span class="name">{column.title}</span>
          <span class="count tabular">{tasks.length}</span>
        </button>
        <button class="icon-btn add" title="New task in {column.title}" onclick={() => (app.composer = { column: column.id })}>
          <Icon name="plus" size={14} />
        </button>
      </header>
      {#if !collapsed[column.id]}
        {#each tasks as task (task.id)}
          <TaskRow {task} columns={board.columns} />
        {/each}
      {/if}
    </section>
  {/each}

  {#if board.completed.length}
    <section class="group">
      <header class="group-head">
        <button class="toggle" onclick={() => (app.showCompleted = !app.showCompleted)}>
          <span class="chev" class:open={app.showCompleted}><Icon name="chevron" size={12} stroke={1.8} /></span>
          <StatusIcon progress={1} />
          <span class="name">Completed</span>
          <span class="count tabular">{board.completed.length}</span>
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
    padding-bottom: var(--s10);
  }

  .group.drop .group-head {
    background: var(--selected);
  }

  .group-head {
    position: sticky;
    top: 0;
    z-index: 1;
    height: 36px;
    display: flex;
    align-items: center;
    padding: 0 var(--s4) 0 var(--s2);
    background: #121316;
    border-bottom: 0.5px solid var(--line);
    transition: background var(--fast) var(--ease);
  }

  .toggle {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    gap: var(--s2);
    text-align: left;
  }

  .chev {
    width: 16px;
    display: inline-flex;
    justify-content: center;
    color: var(--ink-3);
    transition: transform var(--base) var(--ease);
  }

  .chev.open {
    transform: rotate(90deg);
  }

  .name {
    font-weight: 550;
  }

  .count {
    color: var(--ink-3);
    font-size: var(--text-sm);
  }

  .add {
    width: 24px;
    height: 24px;
    opacity: 0;
  }

  .group-head:hover .add {
    opacity: 1;
  }
</style>
