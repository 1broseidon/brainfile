<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { columnProgress, shortDate, tagHue } from '../lib/format';
  import type { BoardSnapshot } from '../../shared/api';
  import StatusIcon from './StatusIcon.svelte';
  import PriorityIcon from './PriorityIcon.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  let { board }: { board: BoardSnapshot } = $props();

  let dropTarget = $state<string | null>(null);
  let dragging = $state<string | null>(null);

  function drop(e: DragEvent, column: string): void {
    e.preventDefault();
    const id = e.dataTransfer?.getData('text/brainfile-task');
    dropTarget = null;
    dragging = null;
    if (id) void app.moveTask(id, column);
  }
</script>

<div class="board">
  {#each board.columns as column (column.id)}
    {@const tasks = board.tasks.filter((t) => t.column === column.id)}
    <section
      class="column"
      class:drop={dropTarget === column.id}
      ondragover={(e) => {
        e.preventDefault();
        dropTarget = column.id;
      }}
      ondragleave={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dropTarget = null;
      }}
      ondrop={(e) => drop(e, column.id)}
      aria-label={column.title}
    >
      <header class="head">
        <StatusIcon progress={columnProgress(board.columns, column.id)} />
        <span class="name">{column.title}</span>
        <span class="count tabular">{tasks.length}</span>
        <span class="spacer"></span>
        <button class="icon-btn small" title="New task in {column.title}" onclick={() => (app.composer = { column: column.id })}>
          <Icon name="plus" size={14} />
        </button>
      </header>

      <div class="cards">
        {#each tasks as task (task.id)}
          <button
            class="card"
            class:selected={app.selectedTaskId === task.id}
            class:dragging={dragging === task.id}
            draggable="true"
            data-task={task.id}
            ondragstart={(e) => {
              e.dataTransfer?.setData('text/brainfile-task', task.id);
              dragging = task.id;
            }}
            ondragend={() => (dragging = null)}
            onmouseenter={() => (app.selectedTaskId = task.id)}
            onclick={() => (app.openTaskId = task.id)}
          >
            <div class="card-top">
              <span class="id tabular">{task.id}</span>
              <Avatar name={task.assignee} size={18} />
            </div>
            <div class="title">{task.title}</div>
            <div class="card-meta">
              {#if task.priority}
                <span class="chip-sm"><PriorityIcon priority={task.priority} size={12} /></span>
              {/if}
              {#if task.subtasks?.length}
                <span class="chip-sm tabular">
                  <StatusIcon size={12} progress={task.subtasks.filter((s) => s.completed).length / task.subtasks.length} />
                  {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length}
                </span>
              {/if}
              {#each (task.tags ?? []).slice(0, 2) as tag (tag)}
                <span class="chip-sm"><i style:--hue={tagHue(tag)}></i>{tag}</span>
              {/each}
              {#if task.dueDate}
                <span class="chip-sm"><Icon name="calendar" size={12} />{shortDate(task.dueDate)}</span>
              {/if}
            </div>
          </button>
        {/each}
        {#if tasks.length === 0}
          <button class="empty" onclick={() => (app.composer = { column: column.id })}>
            <Icon name="plus" size={14} />
          </button>
        {/if}
      </div>
    </section>
  {/each}
</div>

<style>
  .board {
    height: 100%;
    display: flex;
    gap: var(--s3);
    padding: var(--s3) var(--s4) 0;
    overflow-x: auto;
  }

  .column {
    width: 312px;
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-radius: var(--r-lg);
    transition: background var(--fast) var(--ease);
  }

  .column.drop {
    background: rgba(122, 132, 230, 0.06);
  }

  .head {
    height: 36px;
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s1) 0 var(--s2);
  }

  .name {
    font-weight: 550;
  }

  .count {
    color: var(--ink-3);
    font-size: var(--text-sm);
  }

  .spacer {
    flex: 1;
  }

  .icon-btn.small {
    width: 24px;
    height: 24px;
  }

  .cards {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 2px var(--s6);
    overflow-y: auto;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px var(--s3) var(--s3);
    border-radius: var(--r-lg);
    background: var(--pane-raised);
    box-shadow: inset 0 0 0 0.5px var(--line-strong), 0 1px 2px rgba(0, 0, 0, 0.25);
    text-align: left;
    transition: background var(--fast) var(--ease), box-shadow var(--fast) var(--ease);
  }

  .card:hover,
  .card.selected {
    background: #18191d;
    box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.14), 0 1px 2px rgba(0, 0, 0, 0.25);
  }

  .card.dragging {
    opacity: 0.4;
  }

  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .id {
    font-size: var(--text-sm);
    color: var(--ink-3);
  }

  .title {
    font-weight: 500;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s1);
    margin-top: 2px;
  }

  .chip-sm {
    height: 22px;
    padding: 0 6px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-radius: var(--r-md);
    font-size: var(--text-xs);
    color: var(--ink-2);
    box-shadow: inset 0 0 0 0.5px var(--line-strong);
  }

  .chip-sm i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: hsl(var(--hue) 65% 60%);
  }

  .empty {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-lg);
    color: var(--ink-4);
    box-shadow: inset 0 0 0 1px var(--line);
    transition: color var(--fast) var(--ease), background var(--fast) var(--ease);
  }

  .empty:hover {
    color: var(--ink-2);
    background: var(--hover);
  }
</style>
