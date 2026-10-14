<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { app, CHAT_PANE, isMore, MORE, RAIL, TASK_PANE } from './lib/state.svelte';
  import Titlebar from './components/Titlebar.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Gutter from './components/Gutter.svelte';
  import Workspace from './components/Workspace.svelte';
  import TaskDetail from './components/TaskDetail.svelte';
  import ChatPane from './components/ChatPane.svelte';
  import Palette from './components/Palette.svelte';
  import Composer from './components/Composer.svelte';
  import TaskMenus from './components/TaskMenus.svelte';
  import Dock from './components/Dock.svelte';
  import Icon from './components/Icon.svelte';
  import { tip } from './lib/tooltip';

  let width = $state(window.innerWidth);

  const GAP = 8;
  const taskOpen = $derived(!!app.openTaskId && !!app.board && !app.settingsOpen);
  const chatShown = $derived(app.chatOpen && !!app.board && !app.settingsOpen);
  /** With the chat open, a task opens in the list's place, at every width, and goes back to the list. */
  const taskFull = $derived(taskOpen && chatShown);
  /** What sits beside the board: the task pane, then the chat pane at the window's edge (decision-8). */
  const beside = $derived((taskOpen && !taskFull ? app.layout.pane : 0) + (chatShown ? app.layout.chat + (taskOpen && !taskFull ? GAP : 0) : 0));
  /** The panes beside the board lie over it together, on the float shadow, when it would be left too narrow beside them; a task in the list's place never lies under the chat. */
  const overlay = $derived(beside > 0 && !taskFull && width - (app.layout.railOpen ? app.layout.rail : 0) - beside - 32 < 520);
  /** Lying over, the task pane gives way to the chat before the window runs out. */
  const floatTaskW = $derived(Math.max(TASK_PANE.min, Math.min(app.layout.pane, width - (chatShown ? app.layout.chat + GAP : 0) - 3 * GAP - 48)));

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
    // A calm group's `N more` is a stop in the walk, not a task to open.
    if (app.openTaskId && !isMore(tasks[next].id)) app.openTaskId = tasks[next].id;
    document.querySelector(`[data-task="${tasks[next].id}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  /** Open a calm group past its glance and select the first row that was waiting, where `N more` stood. */
  function showMore(stop: string): void {
    const at = app.orderedTasks.findIndex((t) => t.id === stop);
    app.showWhole(stop.slice(MORE.length));
    const next = app.orderedTasks[at];
    if (!next) return;
    app.selectedTaskId = next.id;
    void tick().then(() => document.querySelector(`[data-task="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }));
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
    // With no task open, Esc hides the chat; it comes back as it was.
    if (e.key === 'Escape' && app.chatOpen) {
      app.chatOpen = false;
      e.preventDefault();
      return;
    }
    if (!app.board) return;

    const focused = isMore(app.selectedTaskId) ? app.openTaskId : (app.selectedTaskId ?? app.openTaskId);
    switch (e.key) {
      case 'c':
        if (app.view !== 'decisions') app.composer = {};
        break;
      case 'V':
        // ⇧V turns the list calm or full; from another view it opens the list, calm.
        if (app.view === 'list') app.setCalm(!app.calm);
        else {
          app.setView('list');
          app.setCalm(true);
        }
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
        if (isMore(app.selectedTaskId)) showMore(app.selectedTaskId!);
        else if (app.selectedTaskId) app.openTaskId = app.selectedTaskId;
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
    <!-- Kept while a task stands in its place, so the list comes back where it was. -->
    <div class="main" class:hidden={taskFull}><Workspace /></div>
    {#if taskFull && app.board && app.openTaskId}
      <div class="main task"><TaskDetail board={app.board} taskId={app.openTaskId} full /></div>
    {/if}
    {#if overlay}
      <div class="float">
        {#if taskOpen && !taskFull && app.board && app.openTaskId}
          <div class="floating" style:width="{floatTaskW}px">
            <TaskDetail board={app.board} taskId={app.openTaskId} />
          </div>
        {/if}
        {#if chatShown && app.active}
          <div class="floating" style:width="{app.layout.chat}px">
            <ChatPane projectName={app.active.name} />
          </div>
        {/if}
      </div>
    {:else}
      {#if taskOpen && !taskFull && app.board && app.openTaskId}
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
      {#if chatShown && app.active}
        <Gutter
          side="right"
          value={app.layout.chat}
          min={CHAT_PANE.min}
          max={CHAT_PANE.max}
          initial={CHAT_PANE.initial}
          onchange={(w) => (app.layout.chat = w)}
          oncommit={() => app.saveLayout()}
        />
        <div class="side" style:width="{app.layout.chat}px">
          <ChatPane projectName={app.active.name} />
        </div>
      {/if}
    {/if}
  </div>
  <!-- The bottom strip, the top one's twin: the well itself; the dock at its right, then the settings key under the chat's. -->
  <footer class="foot">
    <Dock />
    <!-- An update out (task-71) is the key's one badge: a small dot, and its tip says which. -->
    <button
      class="settings-key"
      class:open={app.settingsOpen}
      use:tip={app.settingsOpen ? 'Close settings  Esc' : app.update?.available ? `Update to ${app.update.available.version}` : 'Settings  ⌘,'}
      aria-label={app.update?.available ? `Settings, update to ${app.update.available.version}` : 'Settings'}
      aria-pressed={app.settingsOpen}
      onclick={() => (app.settingsOpen = !app.settingsOpen)}
      ><Icon name="settings" size={13} />{#if app.update?.available}<span class="badge" aria-hidden="true"></span>{/if}</button
    >
  </footer>
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

  .main {
    flex: 1;
    min-width: 0;
    display: flex;
  }

  .main.task {
    padding-bottom: var(--gap);
  }

  .main.hidden {
    display: none;
  }

  .foot {
    height: var(--foot-h);
    flex: none;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
    /* At the right, a pane band's inset, as the top strip's, so the dock ends under the chat's key. */
    padding: 0 calc(var(--gap) + var(--s2)) 0 var(--gap);
    /* It takes the panes' bottom gap, so its chips sit midway between the panes and the window's edge. */
    margin-top: calc(-1 * var(--gap));
  }

  /* Drawn as the top strip's keys are: square at rest, a fill while settings show. */
  .settings-key {
    width: 24px;
    height: 24px;
    flex: none;
    margin-left: var(--s2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-control);
    color: var(--ink-4);
    transition: background var(--d-press) var(--ease), color var(--d-press) var(--ease);
  }

  .settings-key {
    position: relative;
  }

  .settings-key .badge {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--canvas);
  }

  .settings-key:hover,
  .settings-key.open {
    background: var(--fill-hover);
    color: var(--ink-2);
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

  /* Lying over the board, the panes keep their order and their gap, each on the float shadow. */
  .float {
    position: absolute;
    top: 0;
    right: var(--gap);
    bottom: var(--gap);
    display: flex;
    gap: var(--gap);
    z-index: var(--z-float);
  }

  .floating {
    flex: none;
    display: flex;
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
