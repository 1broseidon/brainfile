<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { PRIORITIES, columnProgress } from '../lib/format';
  import Menu from './Menu.svelte';
  import StatusIcon from './StatusIcon.svelte';
  import PriorityIcon from './PriorityIcon.svelte';
  import Avatar from './Avatar.svelte';
  import type { Priority } from '../../shared/api';

  const menu = $derived(app.menu);
  const board = $derived(app.board);
  const task = $derived(menu && board ? board.tasks.find((t) => t.id === menu.taskId) : undefined);

  const assignees = $derived.by(() => {
    const names = new Set<string>();
    for (const t of board?.tasks ?? []) if (t.assignee) names.add(t.assignee);
    for (const t of board?.completed ?? []) if (t.assignee) names.add(t.assignee);
    return [...names].sort();
  });

  const tags = $derived.by(() => {
    const names = new Set<string>();
    for (const t of board?.tasks ?? []) for (const tag of t.tags ?? []) names.add(tag);
    return [...names].sort();
  });

  function close(): void {
    app.menu = null;
  }
</script>

{#if menu && board && task}
  {#if menu.kind === 'status'}
    <Menu
      x={menu.x}
      y={menu.y}
      placeholder="Change status…"
      items={board.columns.map((c) => ({ value: c.id, label: c.title }))}
      selected={task.column}
      onpick={(v) => app.moveTask(task.id, String(v))}
      onclose={close}
    >
      {#snippet icon(item)}
        <StatusIcon progress={columnProgress(board.columns, String(item.value))} />
      {/snippet}
    </Menu>
  {:else if menu.kind === 'priority'}
    <Menu
      x={menu.x}
      y={menu.y}
      placeholder="Set priority…"
      items={PRIORITIES.map((p) => ({ value: p.id, label: p.label }))}
      selected={task.priority ?? null}
      onpick={(v) => app.patch(task.id, { priority: (v as Priority | null) ?? null })}
      onclose={close}
    >
      {#snippet icon(item)}
        <PriorityIcon priority={item.value as Priority | null} placeholder />
      {/snippet}
    </Menu>
  {:else if menu.kind === 'assignee'}
    <Menu
      x={menu.x}
      y={menu.y}
      placeholder="Assign to…"
      allowCreate
      items={[{ value: null, label: 'No assignee' }, ...assignees.map((a) => ({ value: a as string | null, label: a }))]}
      selected={task.assignee ?? null}
      onpick={(v) => app.patch(task.id, { assignee: v ? String(v) : null })}
      onclose={close}
    >
      {#snippet icon(item)}
        <Avatar name={item.value ?? undefined} size={16} />
      {/snippet}
    </Menu>
  {:else if menu.kind === 'labels'}
    <Menu
      x={menu.x}
      y={menu.y}
      placeholder="Toggle label…"
      allowCreate
      items={tags.map((t) => ({ value: t, label: t, hint: task.tags?.includes(t) ? 'on' : undefined }))}
      onpick={(v) => {
        const tag = String(v);
        const current = task.tags ?? [];
        const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
        void app.patch(task.id, { tags: next.length ? next : null });
      }}
      onclose={close}
    >
      {#snippet icon(item)}
        <span class="tagbox" class:on={task.tags?.includes(String(item.value))}></span>
      {/snippet}
    </Menu>
  {/if}
{/if}

<style>
  .tagbox {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1.5px var(--ink-4);
  }

  .tagbox.on {
    background: var(--accent);
    box-shadow: none;
  }
</style>
