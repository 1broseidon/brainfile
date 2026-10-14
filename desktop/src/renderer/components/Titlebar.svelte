<script lang="ts">
  import { tip } from '../lib/tooltip';
  import { api, app } from '../lib/state.svelte';
  import { relativeTime } from '../lib/format';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';
  import ChatKey from './ChatKey.svelte';

  let opened = $state<'health' | 'feed' | null>(null);
  /** A Mac's traffic lights and menu bar name the app; elsewhere the lockup does. */
  const mac = /mac/i.test(navigator.platform);

  /**
   * Sync says nothing while it works, which is almost always: autosync sends
   * a change in seconds. The strip shows one quiet sync key only when a
   * board needs a look, or changes have waited longer than a push takes;
   * its tip says what, in words a person uses.
   */
  const needsSaying = $derived(app.health.warn > 0 || app.health.pending > 0 || app.health.behind > 0);
  const tone = $derived(app.health.warn ? 'warn' : 'pending');
  const unsentBoards = $derived(app.projects.filter((p) => ['pending', 'behind', 'warn'].includes(app.quietHealth(app.boards[p.id]) ?? '')));

  const healthTipText = $derived.by(() => {
    const boards = unsentBoards;
    if (boards.length === 1) return `${projectName(boards[0].id)}: ${healthMeta(boards[0].id)}`;
    return app.health.warn ? `${boards.length} board issues` : `${boards.length} boards to sync`;
  });

  /** A board's state in a few words for the health list, worst first. */
  function healthMeta(projectId: string): string {
    const board = app.boards[projectId];
    const project = app.projects.find((p) => p.id === projectId);
    if (!board) return project?.state.status === 'ready' ? '…' : 'no board';
    if (board.integrity.short) return board.integrity.short;
    if (board.sync.warning) return 'sync failed';
    if (board.sync.busy) return 'syncing…';
    if (board.sync.pending > 0) return `${board.sync.pending} unsent`;
    if (board.sync.behind > 0) return `${board.sync.behind} incoming`;
    return board.sync.remote ? (board.sync.label ?? 'shared') : 'this Mac only';
  }

  /** A board with something to send or bring in can be synced from the list. */
  const canSync = (projectId: string) => {
    const b = app.boards[projectId];
    return !!b?.sync.remote && !b.sync.busy && (b.sync.pending > 0 || b.sync.behind > 0 || !!b.sync.warning);
  };

  async function syncNow(projectId: string): Promise<void> {
    const result = await api.syncNow(projectId);
    if (!result.ok) app.notify(result.error, 'warn');
  }

  /**
   * A board's problem in one plain sentence, under its name: where it lives
   * (two copies, an old copy in main…) or why it could not sync. The list
   * says it; tips stay a few words.
   */
  function healthLine(projectId: string): string | null {
    const board = app.boards[projectId];
    if (!board) return null;
    if (board.integrity.short) return board.integrity.line;
    return board.sync.warning ?? null;
  }

  /** Who Ask agent hands a problem to: the project's own agent, by name. */
  const askTip = (projectId: string): string => {
    const agent = app.agentFor(projectId);
    return agent ? `Ask ${app.agentName(agent)}` : 'Ask agent';
  };

  const projectName = (id: string) => app.projects.find((p) => p.id === id)?.name ?? id;

  function toggle(which: 'health' | 'feed'): void {
    opened = opened === which ? null : which;
    if (opened === 'feed') app.markFeedSeen();
  }

  /** The feed key's tip: what waits on you first, then what changed. */
  const feedTip = $derived.by(() => {
    const changes = app.unseen > 0 ? `${app.unseen} outside ${app.unseen === 1 ? 'change' : 'changes'}` : '';
    if (!app.readyCount) return changes || 'Outside changes';
    const ready = `${app.readyCount} ready to merge`;
    return changes ? `${ready} · ${changes}` : ready;
  });

  let merging = $state<string | null>(null);

  async function merge(projectId: string, taskId: string): Promise<void> {
    merging = projectId + taskId;
    await app.settleReview(taskId, 'merge', projectId);
    merging = null;
  }

  function goTo(projectId: string, taskId: string): void {
    opened = null;
    void app.goTo(projectId, taskId);
  }
</script>

<!-- The window's strip is the well itself and belongs to the whole desk:
     the lockup leftmost (off a Mac: there the traffic lights stand alone);
     at the right, every board's health, the
     feed of outside changes with what waits on you pinned above them, and
     the chat's key above the chat pane. Search
     is ⌘K alone: the palette is where it is typed. Anything about one
     repository lives in its pane. -->
<header class="strip drag" class:mac>
  {#if !mac}
    <span class="lockup" aria-label="Brainfile">
      <span class="mark"><Mark size={16} /></span>
      <span class="name">brainfile</span>
    </span>
  {/if}

  <div class="right">
    {#each app.asks.filter((a) => a.projectId !== app.activeId).slice(0, 1) as ask (ask.id)}
      <button class="health no-drag" onclick={() => app.select(ask.projectId)}>
        <span class="mono">{ask.agentId} needs you · {projectName(ask.projectId)}</span>
      </button>
    {/each}
    {#if needsSaying}
      <button
        class="health no-drag"
        class:open={opened === 'health'}
        data-tone={tone}
        aria-label={healthTipText}
        use:tip={healthTipText}
        onclick={() => toggle('health')}
      >
        <Icon name="sync" size={13} />
      </button>
    {/if}
    <!-- What can merge outranks what changed: its count, in the accent, until it merges. -->
    <button
      class="feed no-drag"
      class:lit={app.unseen > 0 || app.readyCount > 0}
      class:waiting={app.readyCount > 0}
      class:open={opened === 'feed'}
      use:tip={feedTip}
      onclick={() => toggle('feed')}
    >
      <Icon name="bolt" size={13} />
      {#if app.readyCount > 0}<span class="mono">{app.readyCount}</span>{:else if app.unseen > 0}<span class="mono">{app.unseen}</span>{/if}
    </button>
    {#if app.board && !app.settingsOpen}
      <ChatKey />
    {/if}
  </div>
</header>

{#if opened}
  <div class="catch" role="presentation" onmousedown={() => (opened = null)}></div>
  <div class="pop" class:wide={opened === 'feed'}>
    {#if opened === 'health'}
      {#each app.projects as project (project.id)}
        {@const board = app.boards[project.id]}
        {@const fix = app.fixes[project.id]}
        {@const line = healthLine(project.id)}
        {@const problem = !!board?.integrity.short}
        <!-- A row is the board's name and state; a problem adds its sentence
             and the keys that settle it: Fix (only when nothing is lost) and
             Ask agent. A fix says what it will do before it runs. -->
        <div class="row" class:stacked={!!line || !!fix}>
          <button
            class="pick"
            onclick={() => {
              opened = null;
              void app.select(project.id);
            }}
          >
            <span class="label">{project.name}</span>
            <span class="mono meta" class:warn={app.quietHealth(board) === 'warn'}>{healthMeta(project.id)}</span>
            {#if fix?.stage === 'confirm'}
              <span class="say ink">{fix.words}.</span>
            {:else if fix?.stage === 'running'}
              <span class="say">{fix.words}</span>
            {:else if fix?.stage === 'done'}
              <span class="say ink">{fix.message}</span>
            {:else if fix?.stage === 'failed'}
              <span class="say warn">{fix.message}</span>
            {:else if line}
              <span class="say">{line}</span>
            {/if}
          </button>
          {#if fix?.stage === 'confirm'}
            <div class="keys">
              <button class="key sure" onclick={() => app.confirmFix(project.id)}>Confirm</button>
              <button class="key" onclick={() => app.cancelFix(project.id)}>Cancel</button>
            </div>
          {:else if fix?.stage === 'done'}
            {#if fix.undo}
              <div class="keys">
                <button class="key" use:tip={'Put it back'} onclick={() => app.undoFix(project.id)}>Undo</button>
              </div>
            {/if}
          {:else if fix?.stage === 'running'}
            <!-- Nothing to press while it runs. -->
          {:else if problem}
            <!-- No Fix and no agent to ask: the sentence stands alone. -->
            {#if board?.integrity.fix || app.agentFor(project.id)}
              <div class="keys">
                {#if board?.integrity.fix}
                  <button class="key" use:tip={'Backs up first'} onclick={() => app.proposeFix(project.id)}>Fix</button>
                {/if}
                {#if app.agentFor(project.id)}
                  <button
                    class="key"
                    use:tip={askTip(project.id)}
                    onclick={() => {
                      opened = null;
                      void app.askAboutBoard(project.id);
                    }}>Ask agent</button
                  >
                {/if}
              </div>
            {/if}
          {:else if canSync(project.id)}
            <div class="keys" class:side={!line}>
              <button class="key" onclick={() => syncNow(project.id)}>Sync now</button>
            </div>
          {/if}
        </div>
      {/each}
    {:else}
      {#if app.waiting.length}
        <!-- Waiting on you: state, not news. A row goes when it merges, never when it is seen. -->
        <div class="section">Waiting on you</div>
        {#each app.waiting as w (w.projectId + w.ready.taskId)}
          {@const elsewhere = w.ready.checkout !== w.ready.into}
          <div class="wait">
            <button class="item two" onclick={() => goTo(w.projectId, w.ready.taskId)}>
              <span class="label">{w.title}</span>
              <span class="mono meta">
                {projectName(w.projectId)} · {w.ready.taskId} ·
                {#if w.ready.conflicts}<span class="warn">conflicts with {w.ready.into}</span>{:else}<span class="add" class:zero={!w.ready.added}>+{w.ready.added}</span>
                  <span class="del" class:zero={!w.ready.removed}>−{w.ready.removed}</span>{/if}
              </span>
            </button>
            {#if w.ready.conflicts}
              <button class="key" use:tip={'Open it to send it back'} onclick={() => goTo(w.projectId, w.ready.taskId)}>Open</button>
            {:else}
              <button
                class="key sure"
                disabled={elsewhere || merging === w.projectId + w.ready.taskId}
                use:tip={elsewhere ? `Check out ${w.ready.into} in ${projectName(w.projectId)} to merge` : `Merge into ${w.ready.into}`}
                onclick={() => merge(w.projectId, w.ready.taskId)}>{merging === w.projectId + w.ready.taskId ? 'Checking…' : 'Merge'}</button
              >
            {/if}
          </div>
        {/each}
        {#if app.feed.length}<div class="section">Changes</div>{/if}
      {/if}
      {#each app.feed as item (item.key)}
        <button
          class="item two"
          onclick={() => {
            opened = null;
            void app.goTo(item.projectId, item.taskId);
          }}
        >
          <span class="label">{item.title}</span>
          <span class="mono meta">{projectName(item.projectId)} · {item.taskId} {item.what} · {relativeTime(new Date(item.at).toISOString())}</span>
        </button>
      {:else}
        {#if !app.waiting.length}<p class="empty">Nothing yet. Changes that agents, the CLI or your other machines make to any board arrive here, and work ready to merge waits at the top.</p>{/if}
      {/each}
    {/if}
  </div>
{/if}

<style>
  .strip {
    position: relative;
    height: var(--strip-h);
    flex: none;
    display: flex;
    align-items: center;
    /* At the right, the pane band's own inset, so the last key stands over the pane's corner
       keys, not its outer edge; off a Mac, past the system's window controls as well. */
    padding: 0 calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + var(--gap) + var(--s2)) 0
      calc(var(--gap) + var(--s3));
  }

  /* Room for the traffic lights. */
  .strip.mac {
    padding-left: 80px;
  }

  .lockup {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .mark {
    display: inline-flex;
    color: var(--ink-3);
  }

  /* The written name, lowercase, in the mark's colour: the lockup is one
     piece of furniture, not a heading. */
  .name {
    font-size: var(--t-md);
    line-height: var(--lh-md);
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--ink-3);
  }

  .right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--s1);
  }

  .feed:not(.lit) {
    width: 24px;
    padding: 0;
    justify-content: center;
    color: var(--ink-4);
  }

  .health,
  .feed {
    height: 24px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 var(--s2);
    border-radius: var(--r-control);
    color: var(--ink-3);
    transition: background var(--d-press) var(--ease), color var(--d-press) var(--ease);
  }

  .health:hover,
  .feed:hover,
  .open {
    background: var(--fill-hover);
    color: var(--ink-2);
  }

  /* The sync key: an icon alone, square like the feed's at rest. */
  .health {
    width: 24px;
    padding: 0;
    justify-content: center;
  }

  .health[data-tone='warn'] {
    color: var(--warn);
  }

  /* Something new: said with a number, not a colour. */
  .feed.lit {
    color: var(--ink-2);
  }

  /* Work waiting on you is the one thing the strip says in the accent. */
  .feed.waiting {
    color: var(--accent-ink);
  }


  .catch {
    position: fixed;
    inset: 0;
    z-index: var(--z-catch);
  }

  .pop {
    position: fixed;
    z-index: var(--z-menu);
    top: calc(var(--strip-h) - 2px);
    right: calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + var(--gap) + var(--s2));
    width: 300px;
    max-height: 420px;
    overflow-y: auto;
    padding: var(--s1);
    border-radius: var(--r-card);
    background: var(--pop);
    box-shadow: var(--top-light), var(--shadow-float);
    animation: open var(--d-open) var(--ease);
  }

  .pop.wide {
    width: 380px;
  }

  @keyframes open {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }

  .item {
    width: 100%;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2);
    border-radius: var(--r-control);
    text-align: left;
  }

  .item:hover {
    background: var(--fill-hover);
  }

  .item.two {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 7px var(--s2) 8px;
  }

  .label {
    flex: 1;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .meta.warn,
  .warn {
    color: var(--warn);
  }

  .add {
    color: var(--ok);
  }

  .del {
    color: var(--danger);
  }

  .zero {
    color: var(--ink-4);
  }

  /* The feed's two parts, named only when there are both. */
  .section {
    padding: var(--s2) var(--s2) var(--s1);
    font-size: var(--t-xs);
    font-weight: 600;
    color: var(--ink-3);
  }

  .wait {
    display: flex;
    align-items: center;
    gap: var(--s1);
    padding-right: 5px;
    border-radius: var(--r-control);
  }

  .wait:hover {
    background: var(--fill-hover);
  }

  .wait .item:hover {
    background: none;
  }

  .wait .item {
    flex: 1;
    min-width: 0;
  }

  .key:disabled {
    opacity: 0.5;
  }

  /* A board in the health list: its name and state, and under them, when
     it has one, its problem in a sentence and the keys that settle it. The
     sentence and the keys share the name's left edge. */
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    border-radius: var(--r-control);
  }

  .row:hover {
    background: var(--fill-hover);
  }

  .pick {
    flex: 1 1 0;
    min-width: 0;
    min-height: 32px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--s2);
    padding: 0 var(--s2);
    text-align: left;
  }

  .stacked .pick {
    padding-top: 7px;
  }

  .stacked .pick:last-child {
    padding-bottom: 8px;
  }

  .say {
    flex-basis: 100%;
    margin-top: 2px;
    text-wrap: pretty;
    font-size: var(--t-sm);
    line-height: var(--lh-sm);
    color: var(--ink-3);
  }

  .say.ink {
    color: var(--ink-2);
  }

  .say.warn {
    color: var(--warn);
  }

  .keys {
    flex-basis: 100%;
    display: flex;
    gap: var(--s1);
    padding: 7px var(--s2) var(--s2);
  }

  /* Sync now, on a row with nothing else to say: at the end of its one line,
     inset as far from the edge as from the top. */
  .keys.side {
    flex-basis: auto;
    padding: 0 5px 0 0;
  }

  /* Quiet keys: a soft fill at rest, the words in ink-2. */
  .key {
    flex: none;
    height: 22px;
    padding: 0 var(--s2);
    display: inline-flex;
    align-items: center;
    border-radius: var(--r-control);
    font-size: var(--t-sm);
    color: var(--ink-2);
    background: var(--fill-hover);
    transition: background var(--d-press) var(--ease), color var(--d-press) var(--ease);
  }

  .key:hover,
  .key:focus-visible {
    background: var(--fill-active);
    color: var(--ink);
  }

  /* The one that does what was just said. */
  .key.sure {
    color: var(--ink);
    font-weight: 500;
  }

  .meta {
    color: var(--ink-3);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .empty {
    margin: 0;
    padding: var(--s3);
    color: var(--ink-3);
    font-size: var(--t-sm);
    line-height: var(--lh-sm);
  }
</style>
