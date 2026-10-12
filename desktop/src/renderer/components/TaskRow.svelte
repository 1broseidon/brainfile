<script lang="ts">
  import { tip } from '../lib/tooltip';
  import { app } from '../lib/state.svelte';
  import { columnProgress, shortDate } from '../lib/format';
  import type { ColumnView, TaskView } from '../../shared/api';
  import StatusIcon from './StatusIcon.svelte';
  import PriorityIcon from './PriorityIcon.svelte';
  import Avatar from './Avatar.svelte';
  import Working from './Working.svelte';

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
  class:parent={children > 0}
  style:--depth={depth}
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
  <button class="cell" use:tip={'Status  S'} onclick={(e) => pick('status', e)}>
    <StatusIcon {progress} />
  </button>
  {#if children > 0}
    <!-- The parent's ▾ / ▸ hangs in the gutter, so its title stays on the line of its siblings. -->
    <button
      class="toggle"
      use:tip={collapsed ? 'Show children' : 'Hide children'}
      onclick={(e) => {
        e.stopPropagation();
        ontoggle?.();
      }}>{collapsed ? '▸' : '▾'}</button
    >
  {/if}
  <span class="title-block">
    {#if task.glyph && children === 0}
      <span class="kind" use:tip={task.type ?? task.role}>{task.glyph}</span>
    {/if}
    <span class="title">{task.title}</span>
    <span class="id mono reveal">{task.id}</span>
    {#each (task.tags ?? []).slice(0, 2) as tag (tag)}
      <span class="tag reveal">{tag}</span>
    {/each}
  </span>
  {#if task.blockedOn?.length}
    <span class="run mono" use:tip={`Waiting on ${task.blockedOn.join(', ')}`}>blocked</span>
  {/if}
  {#if task.restsOnRetired?.length}
    <span class="run mono" use:tip={`Rests on ${task.restsOnRetired.join(', ')}, since replaced or retired`}>decision changed</span>
  {/if}
  {#if app.runFor(task.id)}
    <span class="run"><Working run={app.runFor(task.id)} rotate={false} /></span>
  {/if}
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
    use:tip={'Priority  P'}
    onclick={(e) => pick('priority', e)}
  >
    <PriorityIcon priority={task.priority} placeholder={!task.priority} />
  </button>
  <button class="cell" class:reveal={!task.assignee} use:tip={task.assignee ?? 'Assign  A'} onclick={(e) => pick('assignee', e)}>
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
    /* A child steps in by one cell and its gap, so its box sits under its
       parent's title: the outline reads at a glance. */
    padding: 0 var(--s4) 0 calc(var(--s4) + var(--depth, 0) * var(--indent));
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
    font-size: var(--t-xs);
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
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--depth, 0) * var(--indent));
    width: var(--s4);
    font-size: var(--t-xs);
    color: var(--ink-3);
    text-align: center;
  }

  .parent .title {
    font-weight: 500;
  }

  .toggle:hover {
    color: var(--ink);
  }

  .title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 400;
  }

  .id,
  .tag {
    flex: none;
  }

  .id {
    color: var(--ink-4);
  }

  /* Who has it and what kind of work: the only trace of an agent at rest. */
  .run {
    flex: none;
    color: var(--ink-3);
    margin-left: var(--s4);
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
