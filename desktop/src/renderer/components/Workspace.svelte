<script lang="ts">
  import { api, app } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
  import ListView from './ListView.svelte';
  import BoardView from './BoardView.svelte';
  import TaskDetail from './TaskDetail.svelte';

  const project = $derived(app.active);
  const board = $derived(app.board);
  let initializing = $state(false);

  const storageLabel = $derived(
    board?.storage === 'linked'
      ? "On the 'brainfile' branch"
      : board?.storage === 'standalone'
        ? 'Its own git repository'
        : 'Plain files, not in git'
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

<main class="pane">
  {#if !app.loaded}
    <div class="center"></div>
  {:else if !project}
    <div class="drag strip"></div>
    <div class="center">
      <div class="empty">
        <div class="art">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
            <rect x="4" y="10" width="14" height="36" rx="3.5" stroke="var(--ink-4)" stroke-width="1.5" />
            <rect x="21" y="10" width="14" height="26" rx="3.5" stroke="var(--ink-3)" stroke-width="1.5" />
            <rect x="38" y="10" width="14" height="18" rx="3.5" fill="var(--accent)" fill-opacity="0.18" stroke="var(--accent)" stroke-width="1.5" />
          </svg>
        </div>
        <h1>Add your first project</h1>
        <p>
          A project is a repository, or any folder, with a Brainfile board. Brainfile finds the board in
          <code>.brainfile/</code> or on the repository's <code>brainfile</code> branch, exactly as the CLI does.
        </p>
        <button class="btn primary" onclick={() => app.addProject()}>
          <Icon name="folder" size={14} />Add Project<span class="keys">⌘O</span>
        </button>
      </div>
    </div>
  {:else if project.state.status !== 'ready'}
    <div class="drag strip"></div>
    <div class="center">
      <div class="empty">
        {#if project.state.status === 'no-board'}
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
            <button class="btn ghost" onclick={() => app.refreshProject(project.id)}>Check again</button>
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
  {:else if app.openTaskId && board}
    <TaskDetail {board} taskId={app.openTaskId} />
  {:else if board}
    <header class="bar drag">
      <span class="title">{board.title}</span>
      <span class="sep"></span>
      <div class="segmented no-drag" role="tablist">
        <button role="tab" aria-selected={app.view === 'list'} class:on={app.view === 'list'} onclick={() => app.setView('list')}>
          <Icon name="list" size={14} />List
        </button>
        <button role="tab" aria-selected={app.view === 'board'} class:on={app.view === 'board'} onclick={() => app.setView('board')}>
          <Icon name="board" size={14} />Board
        </button>
      </div>
      <span class="spacer"></span>
      <button
        class="sync no-drag"
        class:busy={board.sync.busy}
        class:warn={!!board.sync.warning}
        title={board.sync.warning ?? `${storageLabel}${board.sync.remote ? ` · shared through ${board.sync.remote}` : ''}`}
        disabled={!board.sync.remote || board.sync.busy}
        onclick={sync}
      >
        <span class="spin"><Icon name={board.sync.remote ? 'sync' : board.storage === 'plain' ? 'folder' : 'git'} size={13} /></span>
        {board.sync.busy ? 'Syncing…' : (board.sync.label ?? 'Plain files')}
        {#if board.sync.pending > 0}<span class="pending tabular">{board.sync.pending}</span>{/if}
      </button>
      <button class="btn no-drag" onclick={() => (app.composer = {})}>
        <Icon name="plus" size={14} />New task
      </button>
    </header>
    <div class="content">
      {#if board.tasks.length === 0 && board.completed.length === 0}
        <div class="center">
          <div class="empty">
            <h1>Nothing on the board</h1>
            <p>Tasks you, the CLI or your agents add appear here as soon as their files change.</p>
            <button class="btn primary" onclick={() => (app.composer = {})}>
              <Icon name="plus" size={14} />New task<span class="keys">C</span>
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
    margin: var(--inset) var(--inset) var(--inset) 0;
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    background: var(--pane);
    box-shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.08), 0 1px 3px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    position: relative;
  }

  .strip {
    position: absolute;
    inset: 0 0 auto;
    height: var(--header-h);
  }

  .bar {
    height: var(--header-h);
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: 0 var(--s3) 0 var(--s5);
    border-bottom: 0.5px solid var(--line);
  }

  .title {
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .sep {
    width: 0.5px;
    height: 16px;
    background: var(--line-strong);
  }

  .spacer {
    flex: 1;
  }

  .segmented {
    height: 28px;
    display: flex;
    padding: 2px;
    gap: 2px;
    border-radius: var(--r-md);
    background: rgba(255, 255, 255, 0.04);
    box-shadow: inset 0 0 0 0.5px var(--line);
  }

  .segmented button {
    height: 24px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 var(--s2);
    border-radius: var(--r-sm);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--ink-3);
    transition: background var(--fast) var(--ease), color var(--fast) var(--ease);
  }

  .segmented button:hover {
    color: var(--ink);
  }

  .segmented button.on {
    color: var(--ink);
    background: rgba(255, 255, 255, 0.09);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
  }

  .sync {
    height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 var(--s2);
    border-radius: var(--r-md);
    font-size: var(--text-sm);
    color: var(--ink-3);
  }

  .sync:not(:disabled):hover {
    background: var(--hover-strong);
    color: var(--ink-2);
  }

  .sync.warn {
    color: var(--status-progress);
  }

  .spin {
    display: inline-flex;
  }

  .sync.busy .spin {
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .pending {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
    color: var(--ink);
    background: rgba(255, 255, 255, 0.1);
  }

  .content {
    flex: 1;
    min-height: 0;
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
  }

  h1 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  p {
    margin: var(--s2) 0 var(--s6);
    color: var(--ink-2);
    line-height: 1.6;
  }

  code {
    font-family: var(--mono);
    font-size: 0.88em;
    padding: 1px 5px;
    border-radius: var(--r-sm);
    background: rgba(255, 255, 255, 0.06);
    color: var(--ink);
  }

  .actions {
    display: flex;
    gap: var(--s2);
  }

  .keys {
    font-size: var(--text-xs);
    opacity: 0.7;
    margin-left: 2px;
  }
</style>
