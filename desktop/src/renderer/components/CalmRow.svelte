<script lang="ts">
  import { tip } from '../lib/tooltip';
  import { app } from '../lib/state.svelte';
  import { columnProgress, restingSignal } from '../lib/format';
  import type { ColumnView, TaskView } from '../../shared/api';
  import StatusIcon from './StatusIcon.svelte';
  import PriorityIcon from './PriorityIcon.svelte';
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
  const progress = $derived(done ? 1 : columnProgress(columns, task.column));
  /** The box says where the task is, which under a parent may not be the group it is drawn in. */
  const where = $derived(done ? 'Done' : (columns.find((c) => c.id === task.column)?.title ?? task.column));
  const run = $derived(app.runFor(task.id));
  const signal = $derived(restingSignal(task, done, !!run));
</script>

<!-- The calm row (design.md, Calm list), after brainfile-mobile's: the
     status box, the title on one line, and at most one signal, the loudest
     it has. The ID, tags, assignee and the rest wait for the task pane, not
     for the pointer; S, P, A and L still reach them from the keyboard. -->
<div
  class="row"
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
  <button
    class="box"
    use:tip={done ? where : `${where}  S`}
    onclick={(e) => {
      e.stopPropagation();
      if (!done) app.openMenu('status', task.id, e.currentTarget as Element);
    }}
  >
    <StatusIcon {progress} />
  </button>
  {#if children > 0}
    <!-- Only a collapsed parent says so at rest: an open one is plain to see. -->
    <button
      class="toggle"
      class:shut={collapsed}
      use:tip={collapsed ? 'Show children' : 'Hide children'}
      onclick={(e) => {
        e.stopPropagation();
        ontoggle?.();
      }}>{collapsed ? '▸' : '▾'}</button
    >
  {/if}
  {#if task.glyph && children === 0}
    <span class="kind">{task.glyph}</span>
  {/if}
  <!-- The ID is the one thing the hand brings: faint, after the title, in space kept for it. -->
  <span class="name">
    <span class="title">{task.title}</span>
    <span class="id mono">{task.id}</span>
  </span>
  {#if signal}
    <span class="signal">
      {#if signal.kind === 'run'}
        <Working {run} rotate={false} />
      {:else if signal.kind === 'changed'}
        <span class="mono" use:tip={'Decision replaced'}>decision changed</span>
      {:else if signal.kind === 'blocked'}
        <span class="mono" use:tip={`Waits on ${signal.on.join(', ')}`}>blocked</span>
      {:else if signal.kind === 'contract'}
        <span class="contract" data-status={signal.status}>{signal.status}</span>
      {:else if signal.kind === 'priority'}
        <span class="pri" use:tip={signal.priority === 'critical' ? 'Urgent' : 'High'}><PriorityIcon priority={signal.priority} /></span>
      {:else}
        <span class="mono">{signal.count}</span>
      {/if}
    </span>
  {/if}
</div>

<style>
  .row {
    position: relative;
    height: var(--row-calm-h);
    display: flex;
    align-items: center;
    gap: var(--s2);
    /* A child steps in by the box's cell and its gap: its box sits under its parent's title. */
    padding: 0 var(--s5) 0 calc(var(--s4) + var(--depth, 0) * var(--indent-calm));
    transition: background var(--d-press) var(--ease);
  }

  .row:hover {
    background: var(--fill-hover);
  }

  .row.selected {
    background: var(--fill-selected);
  }

  .box {
    width: var(--control-h);
    height: var(--control-h);
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-chip);
  }

  .row:not(.done) .box:hover {
    background: var(--fill-active);
  }

  /* The parent's ▾ / ▸ hangs in the gutter, so its title stays on the line of its siblings. */
  .toggle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--depth, 0) * var(--indent-calm));
    width: var(--s4);
    font-size: var(--t-xs);
    color: var(--ink-4);
    text-align: center;
    opacity: 0;
    transition: opacity var(--d-press) var(--ease);
  }

  .toggle.shut,
  .row:hover .toggle,
  .row.selected .toggle {
    opacity: 1;
  }

  .toggle:hover {
    color: var(--ink);
  }

  .kind {
    flex: none;
    margin-right: calc(-1 * var(--s1));
    font-size: var(--t-xs);
    color: var(--ink-4);
  }

  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: var(--s2);
  }

  .title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: var(--t-read);
    line-height: var(--lh-md);
  }

  .row.done .title {
    color: var(--ink-3);
  }

  .id {
    flex: none;
    font-size: var(--t-xs);
    color: var(--ink-4);
    opacity: 0;
    transition: opacity var(--d-press) var(--ease);
  }

  .row:hover .id,
  .row.selected .id {
    opacity: 1;
  }

  .signal {
    flex: none;
    display: inline-flex;
    align-items: center;
    margin-left: var(--s4);
    color: var(--ink-3);
  }

  .pri {
    display: inline-flex;
  }
</style>
