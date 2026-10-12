<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app, RAIL, TASK_PANE } from './lib/state.svelte';
  import Titlebar from './components/Titlebar.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Gutter from './components/Gutter.svelte';
  import Workspace from './components/Workspace.svelte';
  import TaskDetail from './components/TaskDetail.svelte';
  import Palette from './components/Palette.svelte';
  import Composer from './components/Composer.svelte';
  import TaskMenus from './components/TaskMenus.svelte';

  let width = $state(window.innerWidth);

  /** The task pane lies over the board, on the float shadow, when the board would be left too narrow beside it. */
  const overlay = $derived(width - (app.layout.railOpen ? app.layout.rail : 0) - app.layout.pane - 32 < 520);

  onMount(() => {
    void app.init();
  });

  // Whatever opens in the pane is kept at hand in the dock.
  $effect(() => {
    const id = app.openTaskId;
    const projectId = app.activeId;
    if (id && projectId) untrack(() => app.touchTab(projectId, id));
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
    if (app.openTaskId) app.openTaskId = tasks[next].id;
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
    if (meta && e.key === 'j' && app.board && !app.settingsOpen) {
      if (app.chatOpen) app.chatOpen = false;
      else app.openChat();
      e.preventDefault();
      return;
    }
    if (meta && e.shiftKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      void app.cycleTab(e.code === 'BracketLeft' ? -1 : 1);
      e.preventDefault();
      return;
    }
    if (meta && e.key === ',') {
      app.settingsOpen = !app.settingsOpen;
      e.preventDefault();
      return;
    }
    if (meta && e.key === 'b') {
      app.toggleRail();
      e.preventDefault();
      return;
    }
    if (meta && /^[1-9]$/.test(e.key)) {
      const project = app.projects[Number(e.key) - 1];
      if (project) void app.select(project.id);
      e.preventDefault();
      return;
    }
    if (app.paletteOpen || app.composer || app.menu || typing(e.target) || meta || e.altKey) return;

    if (app.settingsOpen) {
      if (e.key === 'Escape') {
        app.settingsOpen = false;
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Escape' && app.openTaskId) {
      app.openTaskId = null;
      e.preventDefault();
      return;
    }
    if (!app.board) return;

    const focused = app.selectedTaskId ?? app.openTaskId;
    switch (e.key) {
      case 'c':
        if (app.view !== 'decisions') app.composer = {};
        break;
      case 'v':
        app.toggleView();
        break;
      case 'd':
        app.setView(app.view === 'decisions' ? 'list' : 'decisions');
        break;
      case 'i':
        if (app.activeId && app.forges[app.activeId]) app.setView(app.view === 'issues' ? 'list' : 'issues');
        break;
      case 'j':
      case 'ArrowDown':
        moveSelection(1);
        break;
      case 'k':
      case 'ArrowUp':
        moveSelection(-1);
        break;
      case 'Enter':
        if (app.selectedTaskId) app.openTaskId = app.selectedTaskId;
        break;
      case 's':
        if (focused) app.openMenu('status', focused, anchorFor(focused));
        break;
      case 'p':
        if (focused) app.openMenu('priority', focused, anchorFor(focused));
        break;
      case 'a':
        if (focused) app.openMenu('assignee', focused, anchorFor(focused));
        break;
      case 'l':
        if (focused) app.openMenu('labels', focused, anchorFor(focused));
        break;
      default:
        return;
    }
    e.preventDefault();
  }
</script>

<svelte:window {onkeydown} bind:innerWidth={width} />

<div class="window">
  <Titlebar />
  <div class="desk">
    {#if app.layout.railOpen}
      <Sidebar />
      <Gutter
        side="left"
        value={app.layout.rail}
        min={RAIL.min}
        max={RAIL.max}
        initial={RAIL.initial}
        onchange={(w) => (app.layout.rail = w)}
        oncommit={() => app.saveLayout()}
      />
    {:else}
      <div class="edge"></div>
    {/if}
    <Workspace />
    {#if app.openTaskId && app.board && !app.settingsOpen}
      {#if overlay}
        <div class="float" style:width="{app.layout.pane}px">
          <TaskDetail board={app.board} taskId={app.openTaskId} />
        </div>
      {:else}
        <Gutter
          side="right"
          value={app.layout.pane}
          min={TASK_PANE.min}
          max={TASK_PANE.max}
          initial={TASK_PANE.initial}
          onchange={(w) => (app.layout.pane = w)}
          oncommit={() => app.saveLayout()}
        />
        <div class="side" style:width="{app.layout.pane}px">
          <TaskDetail board={app.board} taskId={app.openTaskId} />
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if app.paletteOpen}<Palette />{/if}
{#if app.composer && app.board}<Composer board={app.board} column={app.composer.column} />{/if}
<TaskMenus />

<style>
  .window {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .desk {
    flex: 1;
    min-height: 0;
    display: flex;
    padding-right: var(--gap);
    position: relative;
  }

  .edge {
    width: var(--gap);
    flex: none;
  }

  .side {
    flex: none;
    display: flex;
    padding-bottom: var(--gap);
  }

  .float {
    position: absolute;
    top: 0;
    right: var(--gap);
    bottom: var(--gap);
    display: flex;
    z-index: var(--z-float);
    border-radius: var(--r-pane);
    box-shadow: var(--shadow-float);
    animation: slide var(--d-move) var(--ease);
  }

  @keyframes slide {
    from {
      opacity: 0;
      transform: translateX(12px);
    }
  }
</style>
