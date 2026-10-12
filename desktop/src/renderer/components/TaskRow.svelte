<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { columnProgress, kindGlyph, shortDate } from '../lib/format';
  import type { ColumnView, TaskView } from '../../shared/api';
  import StatusIcon from './StatusIcon.svelte';
  import PriorityIcon from './PriorityIcon.svelte';
  import Avatar from './Avatar.svelte';

  let {
    task,
    columns,
    done = false,
    depth = 0,
    children = 0,
    collapsed = false,
    ontoggle,
  }: {
    task: TaskView;
    columns: ColumnView[];
    done?: boolean;
    depth?: number;
    children?: number;
    collapsed?: boolean;
    ontoggle?: () => void;
  } = $props();

  const selected = $derived(app.selectedTaskId === task.id);
  const subDone = $derived(task.subtasks?.filter((s) => s.completed).length ?? 0);
  const progress = $derived(done ? 1 : columnProgress(columns, task.column));
  /** Priorities loud enough to show without the hand. */
  const loud = $derived(task.priority === 'critical' || task.priority === 'high');


  function pick(kind: 'status' | 'priority' | 'assignee', e: MouseEvent): void {
    e.stopPropagation();
    if (!done) app.openMenu(kind, task.id, e.currentTarget as Element);
  }
</script>

<!-- A calm row: the status box, the title, and only what is worth saying
     about it. The box always shows (an open task is still a box); a typed
     document's TUI glyph sits small before its title, and a parent's ▾ / ▸
     takes that place. The ID, tags and an unset priority or assignee wait for
     the hand. Urgent and high priority, contract state, sub-task progress and
     an assignee always show, because they are signals. -->
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
  <button class="cell" title="Status  S" onclick={(e) => pick('status', e)}>
    <StatusIcon {progress} />
  </button>
  <span class="title-block" style:padding-left="{depth * 20}px">
    {#if children > 0}
      <button
        class="toggle"
        title={collapsed ? 'Show children' : 'Hide children'}
        onclick={(e) => {
          e.stopPropagation();
          ontoggle?.();
        }}>{collapsed ? '▸' : '▾'}</button
      >
    {:else if kindGlyph(task.type)}
      <span class="kind" title={task.type}>{kindGlyph(task.type)}</span>
    {/if}
    <span class="title">{task.title}</span>
    <span class="id mono reveal">{task.id}</span>
    {#each (task.tags ?? []).slice(0, 2) as tag (tag)}
      <span class="tag reveal">{tag}</span>
    {/each}
  </span>
  <span class="chips">
    {#if task.contractStatus}
      <span class="contract" data-status={task.contractStatus}>{task.contractStatus.replace('_', ' ')}</span>
    {/if}
    {#if task.subtasks?.length}
      <span class="mono sub" class:complete={subDone === task.subtasks.length}>{subDone}/{task.subtasks.length}</span>
    {/if}
  </span>
  {#if done || task.dueDate}
    <span class="date mono">{done ? shortDate(task.completedAt) : shortDate(task.dueDate)}</span>
  {/if}
  <button
    class="cell"
    class:reveal={!loud}
    title="Priority  P"
    onclick={(e) => pick('priority', e)}
  >
    <PriorityIcon priority={task.priority} placeholder={!task.priority} />
  </button>
  <button class="cell" class:reveal={!task.assignee} title={task.assignee ?? 'Assign  A'} onclick={(e) => pick('assignee', e)}>
    <Avatar name={task.assignee} />
  </button>
</div>

<style>
  .row {
    position: relative;
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

  .row.done .title {
    color: var(--ink-3);
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

  .cell {
    width: 26px;
    height: 26px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-chip);
  }

  .row:not(.done) .cell:hover {
    background: var(--fill-active);
  }

  .kind {
    flex: none;
    font-size: 10px;
    color: var(--ink-4);
  }

  .title-block {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: var(--s2);
    margin-left: var(--s1);
  }

  .toggle {
    width: 12px;
    flex: none;
    font-size: 10px;
    color: var(--ink-3);
    text-align: left;
  }

  .toggle:hover {
    color: var(--ink);
  }

  .title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 450;
  }

  .id,
  .tag {
    flex: none;
  }

  .id {
    color: var(--ink-4);
  }

  .chips {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--s3);
    margin: 0 var(--s2) 0 var(--s4);
  }

  .sub {
    color: var(--ink-3);
  }

  .sub.complete {
    color: var(--accent-ink);
  }

  .date {
    flex: none;
    color: var(--ink-3);
    margin-right: var(--s2);
  }
</style>
