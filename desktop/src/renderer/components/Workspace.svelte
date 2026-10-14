<script lang="ts">
  import { tip } from '../lib/tooltip';
  import { api, app } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';
  import PathTip from './PathTip.svelte';
  import ChatKey from './ChatKey.svelte';
  import Dock from './Dock.svelte';
  import Settings from './Settings.svelte';
  import AskLine from './AskLine.svelte';
  import TwoBoardsLine from './TwoBoardsLine.svelte';
  import ListView from './ListView.svelte';
  import DecisionsView from './DecisionsView.svelte';
  import IssuesView from './IssuesView.svelte';

  const project = $derived(app.active);
  const board = $derived(app.board);
  /** The GitHub repository the origin points at, when it does (task-26). */
  const forge = $derived(project ? app.forges[project.id] : null);
  let initializing = $state(false);

  const storageLabel = $derived(
    (board?.storage === 'linked' ? 'brainfile branch' : board?.storage === 'standalone' ? 'own repo' : 'plain files') +
      (board?.sync.remote ? ` · ${board.sync.remote}` : ' · this Mac')
  );

  /** The views' well, and where its chip sits: under the view in front, measured, so it can slide to the next one. */
  let viewsEl = $state<HTMLElement>();
  let chip = $state<{ x: number; w: number } | null>(null);
  /** The chip is placed before it slides, so it never glides in from the well's edge. */
  let sliding = $state(false);

  $effect(() => {
    const nav = viewsEl;
    if (!nav) return;
    // Placed again when the view changes, and when Issues comes or goes with the forge.
    void app.view;
    void forge;
    const place = () => {
      const on = nav.querySelector<HTMLElement>('[aria-current="page"]');
      chip = on ? { x: on.offsetLeft, w: on.offsetWidth } : null;
    };
    place();
    // A font that arrives late changes the words' widths.
    const watch = new ResizeObserver(place);
    watch.observe(nav);
    const frame = requestAnimationFrame(() => (sliding = true));
    return () => {
      watch.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  async function init(): Promise<void> {
    if (!project) return;
    initializing = true;
    const result = await api.initBoard(project.id);
    initializing = false;
    if (result.ok) await app.select(project.id);
    else app.notify(result.error, 'warn');
  }

</script>

<main class="pane" class:keyed={!app.layout.railOpen}>
  <!-- With the rail closed, its key leads the pane, before the title. -->
  {#if !app.layout.railOpen}
    <button class="icon-btn railkey" use:tip={'Show projects  ⌘B'} onclick={() => app.toggleRail()}>
      <Icon name="sidebar" size={14} />
    </button>
  {/if}
  {#if !app.loaded}
    <div class="center"></div>
  {:else if app.settingsOpen}
    <header class="band">
      <span class="title">Settings</span>
      <span class="spacer"></span>
      <button class="icon-btn" use:tip={'Close  Esc'} aria-label="Close settings" onclick={() => (app.settingsOpen = false)}>
        <Icon name="close" size={14} />
      </button>
    </header>
    <div class="content"><Settings /></div>
  {:else if !project}
    <div class="center">
      <div class="empty">
        <div class="art"><Mark size={64} /></div>
        <h1>Add your first project</h1>
        <p>
          A project is a repository, or any folder, with a Brainfile board. Brainfile finds the board in
          <code>.brainfile/</code> or on the repository's <code>brainfile</code> branch, exactly as the CLI does.
        </p>
        <button class="btn" onclick={() => app.addProject()}>
          Add project<span class="keys">⌘O</span>
        </button>
      </div>
    </div>
  {:else if project.state.status !== 'ready'}
    <div class="center">
      <div class="empty">
        {#if project.state.status === 'no-board'}
          <div class="art"><Mark size={64} /></div>
          <h1>No board in {project.name} yet</h1>
          <p>
            {#if project.state.inRepo}
              It will live on a separate <code>brainfile</code> branch, checked out at <code>.brainfile/</code> and kept out of your
              code and pull requests.
            {:else}
              It will live in <code>.brainfile/</code> in this folder, as plain Markdown files.
            {/if}
          </p>
          <div class="actions">
            <button class="btn" disabled={initializing} onclick={init}>
              {initializing ? 'Creating…' : 'Create board'}
            </button>
            <button class="btn quiet" onclick={() => app.refreshProject(project.id)}>Check again</button>
          </div>
        {:else if project.state.status === 'legacy'}
          <h1>This board uses the old single-file format</h1>
          <p>Run <code>brainfile migrate</code> in {project.name} to move it to one file per task, then check again.</p>
          <button class="btn" onclick={() => app.refreshProject(project.id)}>Check again</button>
        {:else if project.state.status === 'missing'}
          <h1>{project.name} has moved or been deleted</h1>
          <p><code>{project.path}</code> no longer exists.</p>
          <button class="btn" onclick={() => app.removeProject(project.id)}>Remove from sidebar</button>
        {:else if project.state.status === 'error'}
          <h1>Couldn't read {project.name}</h1>
          <p>{project.state.message}</p>
          <button class="btn" onclick={() => app.refreshProject(project.id)}>Try again</button>
        {/if}
      </div>
    </div>
  {:else if board}
    <header class="band">
      <!-- The name is the folder key, its text on the list's edge; the views are words in a well beside it, a raised chip under the one in front. -->
      <PathTip label={board.title} path={project.path} line={storageLabel} projectId={project.id} />
      <nav class="views" aria-label="Views" bind:this={viewsEl}>
        {#if chip}
          <span class="chip-under" class:sliding style:transform="translateX({chip.x}px)" style:width="{chip.w}px" aria-hidden="true"></span>
        {/if}
        <button class="view" class:on={app.view === 'list'} aria-current={app.view === 'list' ? 'page' : undefined} onclick={() => app.setView('list')}>Work</button>
        <button
          class="view"
          class:on={app.view === 'decisions'}
          aria-current={app.view === 'decisions' ? 'page' : undefined}
          use:tip={'Decisions  D'}
          onclick={() => app.setView('decisions')}>Decisions</button
        >
        {#if forge}
          <button
            class="view"
            class:on={app.view === 'issues'}
            aria-current={app.view === 'issues' ? 'page' : undefined}
            use:tip={'Issues  I'}
            onclick={() => app.setView('issues')}>Issues</button
          >
        {/if}
      </nav>
      <span class="spacer"></span>
      {#each app.asks.filter((a) => a.projectId === project.id).slice(0, 1) as ask (ask.id)}
        <AskLine {ask} />
      {:else}
        {#if board.integrity.twoBoards}<TwoBoardsLine two={board.integrity.twoBoards} />{/if}
      {/each}
      {#if app.undo}
        <span class="undo">
          <span class="mono">{app.undo.text}</span>
          <button class="btn quiet" onclick={() => app.runUndo()}>Undo</button>
        </span>
      {/if}
      {#if app.problem}
        <button class="problem" use:tip={'Dismiss'} onclick={() => (app.problem = null)}>
          <Icon name="close" size={12} />{app.problem}
        </button>
      {/if}
      {#if app.view !== 'decisions' && !board.integrity.twoBoards}
        <button class="icon-btn" use:tip={'New task  C'} aria-label="New task" onclick={() => (app.composer = {})}>
          <Icon name="plus" size={15} />
        </button>
      {/if}
    </header>
    <div class="content">
      {#if app.view === 'decisions'}
        <DecisionsView {board} />
      {:else if app.view === 'issues'}
        {#if forge}<IssuesView {board} repo={forge} />{/if}
      {:else if board.tasks.length === 0 && board.completed.length === 0}
        <div class="center">
          <div class="empty">
            <h1>Nothing on the board</h1>
            <p>Tasks you, the CLI or your agents add appear here as soon as their files change.</p>
            <button class="btn" onclick={() => (app.composer = {})}>
              New task<span class="keys">C</span>
            </button>
          </div>
        </div>
      {:else}
        <ListView {board} />
      {/if}
    </div>
    <Dock />
    <ChatKey />
  {:else if app.boardErrors[project.id]}
    <div class="center"><div class="empty"><p>{app.boardErrors[project.id]}</p></div></div>
  {/if}
</main>

<style>
  .pane {
    flex: 1;
    min-width: 0;
    margin-bottom: var(--gap);
    display: flex;
    flex-direction: column;
    border-radius: var(--r-pane);
    background: var(--canvas);
    box-shadow: var(--top-light), 0 0 0 var(--hairline) var(--line);
    overflow: hidden;
    position: relative;
  }

  .railkey {
    position: absolute;
    z-index: var(--z-pane-key);
    top: calc((var(--band-h) - var(--control-h)) / 2);
    left: var(--s2);
  }

  .keyed .band {
    padding-left: calc(var(--s2) + var(--control-h) + var(--s2));
  }

  /* A pane's band has no line under it; what scrolls fades out beneath it. */
  .band {
    height: var(--band-h);
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: 0 var(--s2) 0 var(--s4);
    position: relative;
    z-index: var(--z-band);
  }

  .title {
    font-weight: 600;
  }

  .spacer {
    flex: 1;
  }

  /* The views as words in a well, sunk as a field is: the one in front sits on a raised chip, which slides to the next one pressed. */
  .views {
    position: relative;
    height: var(--field-h);
    display: flex;
    padding: 2px;
    gap: 2px;
    margin-left: var(--s1);
    border-radius: var(--r-control);
    background: var(--well);
    box-shadow: inset 0 0 0 var(--hairline) var(--line);
  }

  .chip-under {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 0;
    border-radius: var(--r-chip);
    background: var(--pop);
    box-shadow: var(--top-light), inset 0 0 0 var(--hairline) var(--line);
  }

  .chip-under.sliding {
    transition:
      transform var(--d-open) var(--ease),
      width var(--d-open) var(--ease);
  }

  .view {
    position: relative;
    height: 100%;
    padding: 0 10px;
    border-radius: var(--r-chip);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-3);
    transition: color var(--d-press) var(--ease);
  }

  .view:hover,
  .view:focus-visible {
    background: none;
    color: var(--ink);
  }

  .view.on {
    color: var(--ink);
  }

  .undo {
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
    color: var(--ink-3);
  }

  .problem {
    min-width: 0;
    max-width: 44%;
    height: var(--control-h);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 var(--s2);
    border-radius: var(--r-control);
    color: var(--danger);
    background: var(--danger-soft);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .content {
    flex: 1;
    min-height: 0;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 12px);
    mask-image: linear-gradient(to bottom, transparent 0, #000 12px);
  }

  .center {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--s10);
  }

  .empty {
    max-width: 420px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .art {
    margin-bottom: var(--s6);
    color: var(--ink-4);
  }

  h1 {
    margin: 0;
    font-size: var(--t-lg);
    line-height: var(--lh-lg);
    font-weight: 600;
  }

  p {
    margin: var(--s2) 0 var(--s6);
    color: var(--ink-2);
    font-size: var(--t-read);
    line-height: var(--lh-read);
  }

  code {
    font-family: var(--mono);
    font-size: 0.86em;
    padding: 1px 5px;
    border-radius: var(--r-chip);
    background: var(--fill-code);
    color: var(--ink);
  }

  .actions {
    display: flex;
    gap: var(--s2);
  }
</style>
