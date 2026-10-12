<script lang="ts">
  import { api, app } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';
  import PathTip from './PathTip.svelte';
  import ListView from './ListView.svelte';
  import BoardView from './BoardView.svelte';

  const project = $derived(app.active);
  const board = $derived(app.board);
  let initializing = $state(false);

  const storageLabel = $derived(
    (board?.storage === 'linked'
      ? "On the 'brainfile' branch"
      : board?.storage === 'standalone'
        ? 'Its own git repository'
        : 'Plain files, not in git') + (board?.sync.remote ? `, shared through ${board.sync.remote}` : ', on this machine only')
  );

  async function init(): Promise<void> {
    if (!project) return;
    initializing = true;
    const result = await api.initBoard(project.id);
    initializing = false;
    if (result.ok) await app.select(project.id);
    else app.notify(result.error, 'warn');
  }

  async function sync(): Promise<void> {
    if (!board) return;
    const result = await api.syncNow(board.projectId);
    if (!result.ok) app.notify(result.error, 'warn');
    else if (result.value.warning) app.notify(result.value.warning, 'warn');
  }
</script>

<main class="pane" class:keyed={!app.layout.railOpen}>
  <!-- With the rail closed, its key leads the pane, before the title. -->
  {#if !app.layout.railOpen}
    <button class="icon-btn railkey" title="Show projects  ⌘B" onclick={() => app.toggleRail()}>
      <Icon name="sidebar" size={14} />
    </button>
  {/if}
  {#if !app.loaded}
    <div class="center"></div>
  {:else if !project}
    <div class="center">
      <div class="empty">
        <div class="art"><Mark size={64} /></div>
        <h1>Add your first project</h1>
        <p>
          A project is a repository, or any folder, with a Brainfile board. Brainfile finds the board in
          <code>.brainfile/</code> or on the repository's <code>brainfile</code> branch, exactly as the CLI does.
        </p>
        <button class="btn primary" onclick={() => app.addProject()}>
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
            <button class="btn primary" disabled={initializing} onclick={init}>
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
      <div class="segmented" role="tablist" title="List or board  V">
        <button role="tab" aria-selected={app.view === 'list'} class:on={app.view === 'list'} onclick={() => app.setView('list')}>
          <Icon name="list" size={14} />List
        </button>
        <button role="tab" aria-selected={app.view === 'board'} class:on={app.view === 'board'} onclick={() => app.setView('board')}>
          <Icon name="board" size={14} />Board
        </button>
      </div>
      <span class="spacer"></span>
      {#if app.problem}
        <button class="problem" title="Dismiss" onclick={() => (app.problem = null)}>
          <Icon name="close" size={12} />{app.problem}
        </button>
      {/if}
      <button
        class="sync"
        class:busy={board.sync.busy}
        class:warn={!!board.sync.warning}
        title={board.sync.warning ?? (board.sync.remote ? `Sync with ${board.sync.remote} now` : 'Kept on this machine only')}
        disabled={!board.sync.remote || board.sync.busy}
        onclick={sync}
      >
        <span class="dot" class:shared={!!board.sync.remote}></span>
        <span class="mono">{board.sync.busy ? 'syncing…' : (board.sync.label ?? 'plain files')}</span>
        {#if board.sync.pending > 0}<span class="pending mono tabular">↑{board.sync.pending}</span>{/if}
      </button>
      <button class="btn primary" onclick={() => (app.composer = {})}>
        New task<span class="keys">C</span>
      </button>
    </header>
    <div class="content">
      {#if board.tasks.length === 0 && board.completed.length === 0}
        <div class="center">
          <div class="empty">
            <h1>Nothing on the board</h1>
            <p>Tasks you, the CLI or your agents add appear here as soon as their files change.</p>
            <button class="btn primary" onclick={() => (app.composer = {})}>
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
    z-index: 3;
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
    z-index: 2;
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
    height: 24px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 var(--s2);
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

  .sync {
    height: var(--control-h);
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2);
    border-radius: var(--r-control);
    color: var(--ink-3);
  }

  .sync:not(:disabled):hover {
    background: var(--fill-hover);
    color: var(--ink-2);
  }

  .sync.warn {
    color: var(--warn);
  }

  /* Every state is a glyph and a colour: a ring is local, a dot is shared. */
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--ink-4);
  }

  .dot.shared {
    background: var(--ok);
    box-shadow: none;
  }

  .sync.warn .dot {
    background: var(--warn);
  }

  .sync.busy .dot {
    background: var(--accent);
    animation: breathe 1800ms var(--ease) infinite alternate;
  }

  @keyframes breathe {
    to {
      opacity: 0.35;
    }
  }

  .pending {
    color: var(--ink-2);
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
