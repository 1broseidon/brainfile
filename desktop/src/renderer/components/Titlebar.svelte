<script lang="ts">
  import { tip } from '../lib/tooltip';
  import { app } from '../lib/state.svelte';
  import { relativeTime } from '../lib/format';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';

  let opened = $state<'health' | 'feed' | null>(null);

  const healthLine = $derived.by(() => {
    const h = app.health;
    const shared = h.total - h.local;
    // Silent success: the line only speaks when a board needs something.
    if (h.warn) return `${h.warn} ${h.warn === 1 ? 'board needs' : 'boards need'} a look`;
    if (h.busy) return 'syncing';
    if (h.pending) return `${h.pending} waiting to send`;
    void shared;
    return null;
  });

  const tone = $derived(app.health.warn ? 'warn' : app.health.busy ? 'busy' : app.health.pending ? 'pending' : 'ok');

  const projectName = (id: string) => app.projects.find((p) => p.id === id)?.name ?? id;

  function toggle(which: 'health' | 'feed'): void {
    opened = opened === which ? null : which;
    if (opened === 'feed') app.markFeedSeen();
  }
</script>

<!-- The window's strip is the well itself and belongs to the whole desk:
     the lockup, always leftmost; one search across every project in the
     middle; every board's health and the feed of outside changes at the
     right. Anything about one repository lives in its pane. -->
<header class="strip drag">
  <span class="lockup" aria-label="Brainfile">
    <span class="mark"><Mark size={16} /></span>
    <span class="name">brainfile</span>
  </span>

  <button class="command field no-drag" onclick={() => (app.paletteOpen = true)}>
    <Icon name="search" size={13} />
    <span>Search</span>
    <kbd>⌘K</kbd>
  </button>

  <div class="right">
    {#if healthLine}
      <button class="health no-drag" class:open={opened === 'health'} data-tone={tone} onclick={() => toggle('health')}>
        <span class="mono">{healthLine}</span>
      </button>
    {/if}
    <button
      class="feed no-drag"
      class:lit={app.unseen > 0}
      class:open={opened === 'feed'}
      use:tip={'What changed on any board from outside: agents, the CLI, other machines'}
      onclick={() => toggle('feed')}
    >
      <Icon name="bolt" size={13} />
      {#if app.unseen > 0}<span class="mono">{app.unseen} new</span>{/if}
    </button>
  </div>
</header>

{#if opened}
  <div class="catch" role="presentation" onmousedown={() => (opened = null)}></div>
  <div class="pop" class:wide={opened === 'feed'}>
    {#if opened === 'health'}
      {#each app.projects as project (project.id)}
        {@const board = app.boards[project.id]}
        <button
          class="item"
          onclick={() => {
            opened = null;
            void app.select(project.id);
          }}
        >
          <span class="label">{project.name}</span>
          <span class="mono meta">{board ? (board.sync.warning ? 'needs a look' : board.sync.busy ? 'syncing…' : (board.sync.label ?? 'plain files')) : project.state.status === 'ready' ? '…' : 'no board'}</span>
        </button>
      {/each}
    {:else}
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
        <p class="empty">Nothing yet. Changes that agents, the CLI or your other machines make to any board arrive here.</p>
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
    /* Room for the traffic lights. */
    padding: 0 var(--gap) 0 80px;
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

  .command {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: clamp(220px, 26vw, 340px);
    height: 24px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 3px 0 var(--s2);
    color: var(--ink-4);
    text-align: left;
  }

  .command:hover {
    box-shadow: inset 0 0 0 var(--hairline) var(--line-strong);
    color: var(--ink-3);
  }

  .command span {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .command kbd {
    height: 16px;
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

  .health[data-tone='warn'] {
    color: var(--warn);
  }

  /* Something new is waiting: said with a number, not a colour. */
  .feed.lit {
    color: var(--ink-2);
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
    right: var(--gap);
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
