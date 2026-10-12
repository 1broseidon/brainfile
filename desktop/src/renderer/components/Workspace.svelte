<script lang="ts">
  import { tip } from '../lib/tooltip';
  import { api, app } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';
  import PathTip from './PathTip.svelte';
  import ChatPop from './ChatPop.svelte';
  import Dock from './Dock.svelte';
  import Settings from './Settings.svelte';
  import AskLine from './AskLine.svelte';
  import TwoBoardsLine from './TwoBoardsLine.svelte';
  import ListView from './ListView.svelte';
  import BoardView from './BoardView.svelte';
  import DecisionsView from './DecisionsView.svelte';

  const project = $derived(app.active);
  const board = $derived(app.board);
  let initializing = $state(false);

  const storageLabel = $derived(
    (board?.storage === 'linked' ? 'brainfile branch' : board?.storage === 'standalone' ? 'own repo' : 'plain files') +
      (board?.sync.remote ? ` · ${board.sync.remote}` : ' · this Mac')
  );

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
      <span class="title">{board.title}</span>
      <PathTip path={project.path} line={storageLabel} projectId={project.id} />
      <div class="segmented" role="tablist">
        <button role="tab" aria-label="List" use:tip={'List  V'} aria-selected={app.view === 'list'} class:on={app.view === 'list'} onclick={() => app.setView('list')}>
          <Icon name="list" size={14} />
        </button>
        <button role="tab" aria-label="Board" use:tip={'Board  V'} aria-selected={app.view === 'board'} class:on={app.view === 'board'} onclick={() => app.setView('board')}>
          <Icon name="board" size={14} />
        </button>
        <button
          role="tab"
          aria-label="Decisions"
          use:tip={'Decisions  D'}
          aria-selected={app.view === 'decisions'}
          class:on={app.view === 'decisions'}
          onclick={() => app.setView('decisions')}
        >
          <Icon name="decision" size={14} />
        </button>
      </div>
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
      {:else if app.view === 'board'}
        <BoardView {board} />
      {:else}
        <ListView {board} />
      {/if}
    </div>
    <Dock />
    <ChatPop projectName={project.name} />
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
    /* The folder key belongs to the name; sit it close. */
    margin-right: calc(-1 * var(--s2));
  }

  .spacer {
    flex: 1;
  }

  .segmented {
    height: var(--field-h);
    display: flex;
    padding: 2px;
    gap: 2px;
    margin-left: var(--s1);
    border-radius: var(--r-control);
    background: var(--well);
    box-shadow: inset 0 0 0 var(--hairline) var(--line);
  }

  .segmented button {
    width: 28px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-chip);
    font-weight: 500;
    color: var(--ink-3);
    transition: background var(--d-press) var(--ease), color var(--d-press) var(--ease);
  }

  .segmented button:hover {
    color: var(--ink);
  }

  .segmented button.on {
    color: var(--ink);
    background: var(--pop);
    box-shadow: var(--top-light), inset 0 0 0 var(--hairline) var(--line);
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
