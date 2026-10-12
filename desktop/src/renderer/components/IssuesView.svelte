<script lang="ts">
  /**
   * The repository's open issues beside its board (task-26). Issues not yet
   * on the board come first, each with Make task waiting for the hand; those
   * that already became a task are folded away below, each naming its task.
   * A task made here carries the issue's page as `source:`, so the issue is
   * never offered twice, on this Mac or any other that shares the board.
   *
   * GitHub is asked when the view opens, when the window comes back, every
   * few minutes while it is open, and on refresh; the main process keeps that
   * to once a minute, and an unchanged answer costs no rate limit.
   */
  import { tip } from '../lib/tooltip';
  import { app } from '../lib/state.svelte';
  import { relativeTime } from '../lib/format';
  import { linkedTask } from '../../shared/issues';
  import type { BoardSnapshot, ForgeRepo, IssueView } from '../../shared/api';
  import Icon from './Icon.svelte';

  let { board, repo }: { board: BoardSnapshot; repo: ForgeRepo } = $props();

  /** While the view is open, issues are read again this often. */
  const POLL_MS = 5 * 60_000;

  const entry = $derived(app.issues[board.projectId]);
  const issues = $derived(entry?.view?.issues ?? []);
  const offered = $derived(issues.filter((i) => !linkedTask(i, board.sources)));
  const onBoard = $derived(issues.filter((i) => linkedTask(i, board.sources)));
  let showLinked = $state(false);
  let selected = $state<number | null>(null);
  /** A clock for "read 2m ago". */
  let now = $state(Date.now());

  $effect(() => {
    const id = board.projectId;
    if (!app.issues[id]?.view) void app.loadIssues(id);
    const poll = setInterval(() => void app.loadIssues(id), POLL_MS);
    const tick = setInterval(() => (now = Date.now()), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  });

  const authWords: Record<string, string> = {
    gh: 'signed in with gh',
    env: 'token from the environment',
    token: 'token from Settings',
    none: 'not signed in',
  };

  const readWhen = $derived.by(() => {
    const at = entry?.view?.fetchedAt;
    return at ? relativeTime(new Date(Math.min(at, now)).toISOString()) : '';
  });

  function open(issue: IssueView): void {
    const id = linkedTask(issue, board.sources);
    if (id) {
      app.selectedTaskId = id;
      app.openTaskId = id;
    }
  }
</script>

{#snippet row(issue: IssueView)}
  {@const linked = linkedTask(issue, board.sources)}
  <div
    class="row"
    class:selected={selected === issue.number}
    role="row"
    tabindex="-1"
    onmouseenter={() => (selected = issue.number)}
    onclick={() => open(issue)}
    onkeydown={() => {}}
  >
    <span class="num mono tabular">#{issue.number}</span>
    <span class="title-block">
      <span class="title">{issue.title}</span>
      {#each issue.labels.slice(0, 3) as label (label)}<span class="tag reveal">{label}</span>{/each}
    </span>
    <span class="signals">
      <span class="mono quiet" use:tip={'Updated'}>{relativeTime(issue.updatedAt)}</span>
      <a class="icon-btn reveal" href={issue.url} target="_blank" rel="noreferrer" use:tip={'Open on GitHub'} aria-label="Open on GitHub" onclick={(e) => e.stopPropagation()}>
        <Icon name="reveal" size={13} />
      </a>
      {#if linked}
        <button class="btn quiet mono task" use:tip={'Open the task'} onclick={(e) => (e.stopPropagation(), open(issue))}>{linked}</button>
      {:else}
        <button
          class="btn quiet make reveal"
          disabled={!!app.making[issue.url] || !!board.integrity.twoBoards}
          use:tip={'Add it to the board, linked back to the issue'}
          onclick={(e) => (e.stopPropagation(), app.taskFromIssue(issue))}
        >
          {app.making[issue.url] ? 'Making…' : 'Make task'}
        </button>
      {/if}
    </span>
  </div>
{/snippet}

<div class="list" role="table">
  <div class="status mono">
    <a class="repo" href={repo.url + '/issues'} target="_blank" rel="noreferrer" use:tip={'Open on GitHub'}>{repo.owner}/{repo.name}</a>
    {#if entry?.view}
      <span>{issues.length}{entry.view.truncated ? '+' : ''} open</span>
      <span>{authWords[entry.view.auth]}</span>
      <span>read {readWhen}</span>
    {/if}
    <span class="spacer"></span>
    <button
      class="icon-btn"
      class:spin={entry?.loading}
      disabled={entry?.loading}
      use:tip={'Read again'}
      aria-label="Read issues again"
      onclick={() => app.loadIssues(board.projectId, true)}
    >
      <Icon name="sync" size={13} />
    </button>
  </div>

  {#if entry?.error}
    <p class="problem">{entry.error}</p>
  {/if}

  {#if !entry?.view}
    {#if !entry?.error}
      <div class="center"><p class="quiet">Reading {repo.owner}/{repo.name}'s issues…</p></div>
    {/if}
  {:else if issues.length === 0}
    <div class="center">
      <div class="empty">
        <h1>No open issues</h1>
        <p>Issues opened on {repo.owner}/{repo.name} show up here, ready to become tasks.</p>
      </div>
    </div>
  {:else}
    <section class="group" role="rowgroup">
      <header class="head">
        <span class="name">Not on the board</span>
        <span class="count mono tabular">{offered.length}</span>
      </header>
      {#each offered as issue (issue.number)}
        {@render row(issue)}
      {:else}
        <p class="none quiet">Every open issue is on the board.</p>
      {/each}
    </section>

    {#if onBoard.length}
      <section class="group" role="rowgroup">
        <header class="head">
          <button class="fold" onclick={() => (showLinked = !showLinked)}>
            <span class="name">On the board</span>
            <span class="count mono tabular">{onBoard.length}</span>
            <span class="chev" class:open={showLinked}><Icon name="chevron" size={12} stroke={1.8} /></span>
          </button>
        </header>
        {#if showLinked}
          {#each onBoard as issue (issue.number)}
            {@render row(issue)}
          {/each}
        {/if}
      </section>
    {/if}
  {/if}
</div>

<style>
  .list {
    height: 100%;
    overflow-y: auto;
    padding: 0 0 var(--s12);
  }

  /* Where the issues come from and how fresh they are: one quiet mono line, the refresh at its end. */
  .status {
    height: 40px;
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: 0 var(--s4) 0 var(--s5);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }

  .repo {
    color: var(--ink-2);
    text-decoration: none;
  }

  .repo:hover {
    color: var(--ink);
  }

  .spacer {
    flex: 1;
  }

  .spin :global(svg) {
    animation: spin 900ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .problem {
    margin: 0 var(--s5) var(--s2);
    color: var(--warn);
  }

  .group + .group {
    margin-top: var(--s3);
  }

  .head {
    position: sticky;
    top: 0;
    z-index: var(--z-band);
    height: 40px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s5) 0 calc(var(--s4) + 6px);
    background: var(--canvas);
  }

  .fold {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    gap: var(--s2);
    text-align: left;
  }

  .name {
    font-weight: 600;
    margin-left: 2px;
  }

  .count {
    color: var(--ink-4);
  }

  .chev {
    display: inline-flex;
    color: var(--ink-4);
    opacity: 0;
    transition:
      transform var(--d-press) var(--ease),
      opacity var(--d-press) var(--ease);
  }

  .chev.open {
    transform: rotate(90deg);
  }

  .head:hover .chev {
    opacity: 1;
  }

  /* An issue's row keeps a task row's measure, so the views read alike. */
  .row {
    height: var(--row-h);
    display: flex;
    align-items: center;
    gap: var(--s1);
    padding: 0 var(--s4);
    transition: background var(--d-press) var(--ease);
  }

  .row:hover {
    background: var(--fill-hover);
  }

  .row.selected {
    background: var(--fill-selected);
  }

  .num {
    flex: none;
    min-width: 44px;
    padding-left: 6px;
    color: var(--ink-3);
  }

  .title-block {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: var(--s2);
    margin-left: var(--s1);
  }

  .title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .signals {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--s2);
    margin-left: var(--s4);
  }

  .task {
    color: var(--ink-2);
  }

  .quiet {
    color: var(--ink-3);
  }

  .none {
    margin: 0;
    padding: var(--s2) calc(var(--s4) + 8px);
  }

  /* What waits for the hand. Space is kept so nothing shifts when it comes. */
  .reveal {
    opacity: 0;
    transition: opacity var(--d-press) var(--ease);
  }

  .row:hover .reveal,
  .row.selected .reveal,
  .reveal:focus-visible {
    opacity: 1;
  }

  .center {
    height: calc(100% - 40px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--s10);
  }

  .empty {
    max-width: 420px;
    text-align: center;
  }

  .empty h1 {
    margin: 0 0 var(--s2);
    font-size: var(--t-lg);
    line-height: var(--lh-lg);
    font-weight: 600;
  }

  .empty p {
    margin: 0;
    color: var(--ink-3);
  }
</style>
