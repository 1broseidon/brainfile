<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/state.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Workspace from './components/Workspace.svelte';
  import Palette from './components/Palette.svelte';
  import Composer from './components/Composer.svelte';
  import TaskMenus from './components/TaskMenus.svelte';

  onMount(() => {
    void app.init();
  });

  function typing(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  function moveSelection(step: number): void {
    const tasks = app.orderedTasks;
    if (!tasks.length) return;
    const at = tasks.findIndex((t) => t.id === app.selectedTaskId);
    const next = at < 0 ? (step > 0 ? 0 : tasks.length - 1) : Math.min(Math.max(at + step, 0), tasks.length - 1);
    app.selectedTaskId = tasks[next].id;
    document.querySelector(`[data-task="${tasks[next].id}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function anchorFor(taskId: string): Element | null {
    return document.querySelector(`[data-task="${taskId}"]`);
  }

  function onkeydown(e: KeyboardEvent): void {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key === 'k') {
      app.paletteOpen = !app.paletteOpen;
      e.preventDefault();
      return;
    }
    if (meta && e.key === 'o') {
      void app.addProject();
      e.preventDefault();
      return;
    }
    if (meta && /^[1-9]$/.test(e.key)) {
      const project = app.projects[Number(e.key) - 1];
      if (project) void app.select(project.id);
      e.preventDefault();
      return;
    }
    if (meta && e.key === 'b' && app.board) {
      app.toggleView();
      e.preventDefault();
      return;
    }
    if (app.paletteOpen || app.composer || app.menu || typing(e.target) || meta || e.altKey) return;

    if (e.key === 'Escape' && app.openTaskId) {
      app.openTaskId = null;
      e.preventDefault();
      return;
    }
    if (!app.board) return;

    const focused = app.openTaskId ?? app.selectedTaskId;
    switch (e.key) {
      case 'c':
        app.composer = {};
        break;
      case 'j':
      case 'ArrowDown':
        if (!app.openTaskId) moveSelection(1);
        break;
      case 'k':
      case 'ArrowUp':
        if (!app.openTaskId) moveSelection(-1);
        break;
      case 'Enter':
        if (app.selectedTaskId && !app.openTaskId) app.openTaskId = app.selectedTaskId;
        break;
      case 's':
        if (focused) app.openMenu('status', focused, app.openTaskId ? null : anchorFor(focused));
        break;
      case 'p':
        if (focused) app.openMenu('priority', focused, app.openTaskId ? null : anchorFor(focused));
        break;
      case 'a':
        if (focused) app.openMenu('assignee', focused, app.openTaskId ? null : anchorFor(focused));
        break;
      case 'l':
        if (focused) app.openMenu('labels', focused, app.openTaskId ? null : anchorFor(focused));
        break;
      default:
        return;
    }
    e.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

<div class="shell">
  <Sidebar />
  <Workspace />
</div>

{#if app.paletteOpen}<Palette />{/if}
{#if app.composer && app.board}<Composer board={app.board} column={app.composer.column} />{/if}
<TaskMenus />

{#if app.toast}
  <div class="toast" class:warn={app.toast.tone === 'warn'} role="status">{app.toast.text}</div>
{/if}

<style>
  .shell {
    height: 100%;
    display: flex;
  }

  .toast {
    position: fixed;
    z-index: 60;
    right: var(--s6);
    bottom: var(--s6);
    max-width: 420px;
    padding: 10px var(--s4);
    border-radius: var(--r-lg);
    background: var(--popover);
    box-shadow: var(--shadow-pop);
    color: var(--ink);
    font-size: var(--text-md);
    animation: in var(--base) var(--ease);
  }

  .toast.warn {
    box-shadow: var(--shadow-pop), inset 3px 0 0 var(--status-progress);
  }

  @keyframes in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
</style>
