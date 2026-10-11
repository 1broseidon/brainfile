<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { columnProgress, shortDate, tagHue } from '../lib/format';
  import type { ColumnView, TaskView } from '../../shared/api';
  import StatusIcon from './StatusIcon.svelte';
  import PriorityIcon from './PriorityIcon.svelte';
  import Avatar from './Avatar.svelte';

  let { task, columns, done = false }: { task: TaskView; columns: ColumnView[]; done?: boolean } = $props();

  const selected = $derived(app.selectedTaskId === task.id);
  const subtaskDone = $derived(task.subtasks?.filter((s) => s.completed).length ?? 0);
  const progress = $derived(done ? 1 : columnProgress(columns, task.column));

  function stop(e: Event): void {
    e.stopPropagation();
  }
</script>

<div
  class="row"
  class:selected
  class:done
  role="row"
  tabindex="-1"
  data-task={task.id}
  draggable={!done}
  ondragstart={(e) => e.dataTransfer?.setData('text/brainfile-task', task.id)}
  onmouseenter={() => (app.selectedTaskId = task.id)}
  onclick={() => (app.openTaskId = task.id)}
  onkeydown={() => {}}
>
  <button
    class="cell priority"
    title="Priority (P)"
    disabled={done}
    onclick={(e) => {
      stop(e);
      app.openMenu('priority', task.id, e.currentTarget);
    }}
  >
    <PriorityIcon priority={task.priority} />
  </button>
  <span class="id tabular">{task.id}</span>
  <button
    class="cell status"
    title="Status (S)"
    disabled={done}
    onclick={(e) => {
      stop(e);
      app.openMenu('status', task.id, e.currentTarget);
    }}
  >
    <StatusIcon {progress} />
  </button>
  <span class="title">
    {#if task.type && task.type !== 'task'}<span class="type">{task.type}</span>{/if}
    <span class="text">{task.title}</span>
    {#if task.subtasks?.length}
      <span class="sub tabular">{subtaskDone}/{task.subtasks.length}</span>
    {/if}
  </span>
  <span class="tags">
    {#each (task.tags ?? []).slice(0, 3) as tag (tag)}
      <span class="tag" style:--hue={tagHue(tag)}><i></i>{tag}</span>
    {/each}
    {#if (task.tags?.length ?? 0) > 3}<span class="tag more">+{task.tags!.length - 3}</span>{/if}
  </span>
  {#if task.contractStatus}
    <span class="contract" data-status={task.contractStatus}>{task.contractStatus.replace('_', ' ')}</span>
  {/if}
  <span class="date tabular" class:due={!done && !!task.dueDate}>{done ? shortDate(task.completedAt) : shortDate(task.dueDate)}</span>
  <button
    class="cell assignee"
    title={task.assignee ?? 'Assign (A)'}
    disabled={done}
    onclick={(e) => {
      stop(e);
      app.openMenu('assignee', task.id, e.currentTarget);
    }}
  >
    <Avatar name={task.assignee} />
  </button>
</div>

<style>
  .row {
    height: var(--row-h);
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s6) 0 var(--s4);
    border-bottom: 0.5px solid var(--line);
    transition: background var(--fast) var(--ease);
  }

  .row.selected {
    background: var(--hover);
  }

  .row.done .text {
    color: var(--ink-2);
  }

  .cell {
    width: 24px;
    height: 24px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-sm);
  }

  .cell:not(:disabled):hover {
    background: var(--hover-strong);
  }

  .id {
    width: 64px;
    flex: none;
    font-size: var(--text-sm);
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding-left: 2px;
  }

  .text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 450;
  }

  .type {
    flex: none;
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-3);
  }

  .sub {
    flex: none;
    font-size: var(--text-xs);
    color: var(--ink-3);
  }

  .tags {
    display: flex;
    gap: var(--s1);
    flex: none;
  }

  .tag {
    height: 22px;
    padding: 0 var(--s2);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 11px;
    font-size: var(--text-sm);
    color: var(--ink-2);
    box-shadow: inset 0 0 0 0.5px var(--line-strong);
  }

  .tag i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: hsl(var(--hue) 65% 60%);
  }

  .tag.more {
    padding: 0 6px;
  }

  .contract {
    flex: none;
    height: 20px;
    padding: 0 6px;
    display: inline-flex;
    align-items: center;
    border-radius: var(--r-sm);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--ink-2);
    background: rgba(255, 255, 255, 0.05);
  }

  .contract[data-status='in_progress'],
  .contract[data-status='reworking'],
  .contract[data-status='ready'] {
    color: var(--status-progress);
    background: rgba(240, 191, 76, 0.1);
  }

  .contract[data-status='delivered'] {
    color: var(--status-review);
    background: rgba(76, 183, 130, 0.1);
  }

  .contract[data-status='failed'] {
    color: var(--danger);
    background: rgba(235, 87, 87, 0.1);
  }

  .date:empty {
    display: none;
  }

  .date.due {
    color: var(--ink-2);
  }

  .date {
    width: 56px;
    flex: none;
    text-align: right;
    font-size: var(--text-sm);
    color: var(--ink-3);
  }
</style>
