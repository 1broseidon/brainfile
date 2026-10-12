<script lang="ts">
  import { tip } from '../lib/tooltip';
  import { app } from '../lib/state.svelte';
  import { columnProgress, shortDate } from '../lib/format';
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
        <span class="count mono tabular">{tasks.length}</span>
        <span class="spacer"></span>
        <button class="icon-btn small" use:tip={`New task in ${column.title}`} onclick={() => (app.composer = { column: column.id })}>
          <Icon name="plus" size={14} />
        </button>
      </header>

      <div class="cards">
        {#each tasks as task (task.id)}
          {@const subDone = task.subtasks?.filter((s) => s.completed).length ?? 0}
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
            <div class="top">
              {#if task.glyph}<span class="glyph">{task.glyph}</span>{/if}
              <span class="id mono">{task.id}</span>
              <span class="spacer"></span>
              {#if task.assignee}<Avatar name={task.assignee} size={18} />{/if}
            </div>
            <div class="title">{task.title}</div>
            {#if task.priority || task.contractStatus || task.subtasks?.length || task.tags?.length || task.dueDate}
              <div class="meta">
                {#if task.priority}<PriorityIcon priority={task.priority} size={13} />{/if}
                {#if task.contractStatus}
                  <span class="contract" data-status={task.contractStatus}>{task.contractStatus.replace('_', ' ')}</span>
                {/if}
                {#if task.subtasks?.length}
                  <span class="mono sub tabular" class:complete={subDone === task.subtasks.length}>
                    {subDone}/{task.subtasks.length}
                  </span>
                {/if}
                {#each (task.tags ?? []).slice(0, 2) as tag (tag)}
                  <span class="tag">{tag}</span>
                {/each}
                {#if task.dueDate}<span class="mono due">{shortDate(task.dueDate)}</span>{/if}
              </div>
            {/if}
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
    padding: var(--s2) var(--s4) 0;
    overflow-x: auto;
  }

  .column {
    width: 304px;
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-radius: var(--r-card);
    transition: background var(--d-press) var(--ease);
  }

  .column.drop {
    background: var(--fill-selected);
  }

  .head {
    height: 40px;
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 2px 0 var(--s2);
  }

  .name {
    font-weight: 600;
    margin-left: 2px;
  }

  .count {
    color: var(--ink-4);
  }

  .spacer {
    flex: 1;
  }

  .icon-btn.small {
    width: 26px;
    height: 26px;
  }

  .cards {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    padding: 2px 2px var(--s6);
    overflow-y: auto;
  }

  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    padding: var(--s3);
    border-radius: var(--r-card);
    background: var(--raised);
    box-shadow: var(--top-light), inset 0 0 0 var(--hairline) var(--line);
    text-align: left;
    transition: background var(--d-press) var(--ease), box-shadow var(--d-press) var(--ease);
  }

  .card:hover {
    background: var(--pop);
  }

  .card.selected {
    box-shadow: var(--top-light), inset 0 0 0 var(--hairline) var(--line-strong);
  }

  .card.dragging {
    opacity: 0.4;
  }

  .top {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 18px;
  }

  .glyph {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }

  .id {
    color: var(--ink-4);
  }

  .title {
    font-weight: 500;
    line-height: var(--lh-md);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s1) var(--s3);
  }

  .sub,
  .due {
    color: var(--ink-3);
  }

  .sub.complete {
    color: var(--accent-ink);
  }

  .empty {
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-card);
    color: var(--ink-4);
    box-shadow: inset 0 0 0 1px var(--line);
    transition: color var(--d-press) var(--ease), background var(--d-press) var(--ease);
  }

  .empty:hover {
    color: var(--ink-2);
    background: var(--fill-hover);
  }
</style>
