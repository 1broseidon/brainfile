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
  const glyph = $derived(children > 0 ? (collapsed ? '▸' : '▾') : kindGlyph(task.type));

  // The TUI's signal chips: contract state, then sub-tasks, then tags; three at most.
  const chips = $derived.by(() => {
    const out: { kind: 'contract' | 'subtasks' | 'tag'; text: string }[] = [];
    if (task.contractStatus) out.push({ kind: 'contract', text: task.contractStatus.replace('_', ' ') });
    if (task.subtasks?.length) out.push({ kind: 'subtasks', text: `${subDone}/${task.subtasks.length}` });
    for (const tag of task.tags ?? []) out.push({ kind: 'tag', text: tag });
    return out.slice(0, 3);
  });

  function pick(kind: 'status' | 'priority' | 'assignee', e: MouseEvent): void {
    e.stopPropagation();
    if (!done) app.openMenu(kind, task.id, e.currentTarget as Element);
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
  <button class="cell" title="Status  S" onclick={(e) => pick('status', e)}>
    <StatusIcon {progress} />
  </button>
  <button class="cell" title="Priority  P" onclick={(e) => pick('priority', e)}>
    <PriorityIcon priority={task.priority} />
  </button>
  <span class="lead" style:padding-left="{depth * 20}px">
    {#if children > 0}
      <button
        class="glyph toggle"
        title={collapsed ? 'Show children' : 'Hide children'}
        onclick={(e) => {
          e.stopPropagation();
          ontoggle?.();
        }}>{glyph}</button
      >
    {:else}
      <span class="glyph">{glyph}</span>
    {/if}
    <span class="id mono">{task.id}</span>
  </span>
  <span class="title">{task.title}</span>
  <span class="chips">
    {#each chips as chip (chip.kind + chip.text)}
      {#if chip.kind === 'contract'}
        <span class="contract" data-status={task.contractStatus}>{chip.text}</span>
      {:else if chip.kind === 'subtasks'}
        <span class="mono sub tabular" class:complete={subDone === task.subtasks?.length}>{chip.text}</span>
      {:else}
        <span class="tag">{chip.text}</span>
      {/if}
    {/each}
  </span>
  {#if done || task.dueDate}
    <span class="date mono tabular">{done ? shortDate(task.completedAt) : shortDate(task.dueDate)}</span>
  {/if}
  <button class="cell" class:unassigned={!task.assignee} title={task.assignee ?? 'Assign  A'} onclick={(e) => pick('assignee', e)}>
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
    padding: 0 var(--s5) 0 var(--s4);
    transition: background var(--d-press) var(--ease);
  }

  .row:hover {
    background: var(--fill-hover);
  }

  .row.selected {
    background: var(--fill-selected);
  }

  /* The TUI's ▌ cursor. */
  .row.selected::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 2px;
    border-radius: 0 1px 1px 0;
    background: var(--accent);
  }

  .row.done .title {
    color: var(--ink-3);
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

  /* An empty assignee says nothing until you reach for it. */
  .cell.unassigned {
    opacity: 0;
  }

  .row:hover .cell.unassigned,
  .row.selected .cell.unassigned {
    opacity: 1;
  }

  .lead {
    flex: none;
    display: inline-flex;
    align-items: center;
    margin-left: var(--s1);
  }

  .glyph {
    width: 16px;
    flex: none;
    font-size: 11px;
    line-height: 16px;
    color: var(--ink-3);
    text-align: left;
  }

  .glyph.toggle:hover {
    color: var(--ink);
  }

  .id {
    width: var(--id-w);
    flex: none;
    color: var(--ink-4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 450;
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
    width: 52px;
    flex: none;
    text-align: right;
    color: var(--ink-3);
    margin-right: var(--s2);
  }
</style>
