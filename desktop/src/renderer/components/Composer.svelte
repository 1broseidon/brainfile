<script lang="ts">
  import { api, app } from '../lib/state.svelte';
  import { PRIORITIES, columnProgress, priorityLabel } from '../lib/format';
  import type { BoardSnapshot, Priority } from '../../shared/api';
  import Menu from './Menu.svelte';
  import StatusIcon from './StatusIcon.svelte';
  import PriorityIcon from './PriorityIcon.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  let { board, column: initialColumn }: { board: BoardSnapshot; column?: string } = $props();

  let title = $state('');
  let description = $state('');
  // svelte-ignore state_referenced_locally
  let column = $state(
    initialColumn ?? board.columns.find((c) => columnProgress(board.columns, c.id) === 0)?.id ?? board.columns[0]?.id
  );
  let priority = $state<Priority | null>(null);
  let assignee = $state<string | null>(null);
  let type = $state<string | null>(null);
  let more = $state(false);
  let busy = $state(false);
  let picker = $state<{ kind: 'status' | 'priority' | 'assignee' | 'type'; x: number; y: number } | null>(null);
  let titleEl: HTMLInputElement;

  const columnTitle = $derived(board.columns.find((c) => c.id === column)?.title ?? column);
  const assignees = $derived([...new Set(board.tasks.map((t) => t.assignee).filter((a): a is string => !!a))].sort());

  $effect(() => {
    titleEl?.focus();
  });

  function close(): void {
    app.composer = null;
  }

  function open(kind: 'status' | 'priority' | 'assignee' | 'type', e: MouseEvent): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    picker = { kind, x: r.left, y: r.bottom + 4 };
  }

  async function create(): Promise<void> {
    const text = title.trim();
    if (!text || busy) return;
    busy = true;
    const result = await api.addTask(board.projectId, {
      title: text,
      column,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(priority ? { priority } : {}),
      ...(assignee ? { assignee } : {}),
      ...(type ? { type } : {}),
    });
    busy = false;
    if (!result.ok) {
      app.notify(result.error, 'warn');
      return;
    }
    app.notify(`Created ${result.value.id}`);
    if (more) {
      title = '';
      description = '';
      titleEl.focus();
    } else {
      close();
    }
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && !picker) {
      close();
      e.preventDefault();
    } else if (e.key === 'Enter' && e.metaKey) {
      void create();
      e.preventDefault();
    }
    e.stopPropagation();
  }
</script>

<div class="overlay" role="presentation" onmousedown={close}></div>
<div class="composer" role="dialog" aria-label="New task" tabindex="-1" {onkeydown}>
  <header>
    <span class="scope mono">{board.title}</span>
    <Icon name="chevron" size={12} />
    <span>New task</span>
    <span class="spacer"></span>
    <button class="icon-btn" onclick={close} aria-label="Close"><Icon name="close" size={14} /></button>
  </header>

  <input
    class="title"
    bind:this={titleEl}
    bind:value={title}
    placeholder="Task title"
    spellcheck="false"
    onkeydown={(e) => {
      if (e.key === 'Enter' && !e.metaKey) {
        e.preventDefault();
        void create();
      }
    }}
  />
  <textarea class="desc" bind:value={description} placeholder="Add description…" rows="4"></textarea>

  <div class="props">
    <button class="chip" onclick={(e) => open('status', e)}>
      <StatusIcon progress={columnProgress(board.columns, column)} size={13} />{columnTitle}
    </button>
    <button class="chip" onclick={(e) => open('priority', e)}>
      <PriorityIcon {priority} size={13} placeholder />{priority ? priorityLabel(priority) : 'Priority'}
    </button>
    <button class="chip" onclick={(e) => open('assignee', e)}>
      <Avatar name={assignee ?? undefined} size={14} />{assignee ?? 'Assignee'}
    </button>
    {#if board.typeNames.length}
      <button class="chip" onclick={(e) => open('type', e)}>
        <Icon name="contract" size={13} />{type ?? 'Task'}
      </button>
    {/if}
  </div>

  <footer>
    <label class="more">
      <input type="checkbox" bind:checked={more} />
      <span class="switch"></span>
      Create more
    </label>
    <button class="btn primary" disabled={!title.trim() || busy} onclick={create}>
      Create task
      <span class="keys">⌘↵</span>
    </button>
  </footer>
</div>

{#if picker?.kind === 'status'}
  <Menu
    x={picker.x}
    y={picker.y}
    items={board.columns.map((c) => ({ value: c.id, label: c.title }))}
    selected={column}
    onpick={(v) => (column = String(v))}
    onclose={() => (picker = null)}
  >
    {#snippet icon(item)}<StatusIcon progress={columnProgress(board.columns, String(item.value))} />{/snippet}
  </Menu>
{:else if picker?.kind === 'priority'}
  <Menu
    x={picker.x}
    y={picker.y}
    items={PRIORITIES.map((p) => ({ value: p.id, label: p.label }))}
    selected={priority}
    onpick={(v) => (priority = v as Priority | null)}
    onclose={() => (picker = null)}
  >
    {#snippet icon(item)}<PriorityIcon priority={item.value as Priority | null} placeholder />{/snippet}
  </Menu>
{:else if picker?.kind === 'assignee'}
  <Menu
    x={picker.x}
    y={picker.y}
    allowCreate
    items={[{ value: null, label: 'No assignee' }, ...assignees.map((a) => ({ value: a as string | null, label: a }))]}
    selected={assignee}
    onpick={(v) => (assignee = v ? String(v) : null)}
    onclose={() => (picker = null)}
  >
    {#snippet icon(item)}<Avatar name={item.value ?? undefined} size={16} />{/snippet}
  </Menu>
{:else if picker?.kind === 'type'}
  <Menu
    x={picker.x}
    y={picker.y}
    items={[{ value: null, label: 'Task' }, ...board.typeNames.map((t) => ({ value: t as string | null, label: t }))]}
    selected={type}
    onpick={(v) => (type = v ? String(v) : null)}
    onclose={() => (picker = null)}
  />
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-scrim);
    background: var(--scrim);
    animation: fade var(--d-open) var(--ease);
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  .composer {
    position: fixed;
    z-index: var(--z-dialog);
    top: 14vh;
    left: 50%;
    width: 720px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    border-radius: var(--r-pane);
    background: var(--pop);
    box-shadow: var(--shadow-float);
    animation: rise var(--d-open) var(--ease);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(6px) scale(0.985);
    }
  }

  header {
    height: 44px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2) 0 var(--s5);
    color: var(--ink-3);
    font-size: var(--t-sm);
  }

  .scope {
    height: 22px;
    padding: 0 var(--s2);
    display: inline-flex;
    align-items: center;
    border-radius: var(--r-chip);
    color: var(--ink-2);
    background: var(--fill-active);
  }

  header span:last-of-type:not(.spacer):not(.scope) {
    color: var(--ink-2);
  }

  .spacer {
    flex: 1;
  }

  .title {
    height: 36px;
    margin: var(--s2) var(--s5) 0;
    border: 0;
    background: transparent;
    font-size: var(--t-xl);
    font-weight: 600;
    letter-spacing: -0.015em;
  }

  .desc {
    margin: var(--s1) var(--s5) 0;
    border: 0;
    background: transparent;
    resize: none;
    font-size: var(--t-read);
    line-height: 1.55;
  }

  .title::placeholder,
  .desc::placeholder {
    color: var(--ink-4);
  }

  .props {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: var(--s3) var(--s5) var(--s4);
  }

  .props .chip {
    height: 26px;
  }

  footer {
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--s4) 0 var(--s5);
    border-top: 0.5px solid var(--line-strong);
  }

  .more {
    display: flex;
    align-items: center;
    gap: var(--s2);
    color: var(--ink-2);
    font-size: var(--t-sm);
  }

  .more input {
    display: none;
  }

  .switch {
    width: 26px;
    height: 16px;
    border-radius: 8px;
    background: var(--line-strong);
    position: relative;
    transition: background var(--d-open) var(--ease);
  }

  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--ink);
    transition: transform var(--d-open) var(--ease);
  }

  .more input:checked + .switch {
    background: var(--accent);
  }

  .more input:checked + .switch::after {
    background: var(--on-accent);
    transform: translateX(10px);
  }

  .keys {
    font-size: var(--t-xs);
    opacity: 0.7;
    margin-left: 2px;
  }
</style>
