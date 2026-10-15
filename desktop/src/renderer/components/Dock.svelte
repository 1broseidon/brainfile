<script lang="ts">
  /**
   * The dock (design.md, Dock): the agent sessions on the board in front, at
   * the right of the window's bottom strip, under the chat's key (decision-8).
   * A tab is a chat, a discussion of a task, or a hand-off: its mark, its
   * title, and its agent with where it stands (at work, Needs you, a reply
   * waiting, how a hand-off ended). It opens the session where it was left.
   * As many tabs show as the width allows, up to four; the rest wait under +N.
   */
  import { onMount } from 'svelte';
  import { app, isLive } from '../lib/state.svelte';
  import { columnProgress } from '../lib/format';
  import { handoffRun, restingWord, type Session } from '../lib/sessions';
  import { tip } from '../lib/tooltip';
  import type { AgentId, AgentRun } from '../../shared/api';
  import Icon from './Icon.svelte';
  import StatusIcon from './StatusIcon.svelte';
  import Working from './Working.svelte';

  const TAB_W = 216;
  const GAP = 6;
  const MAX_SHOWN = 4;
  /** The dock keeps to the strip's right, under the panes beside the board. */
  const SHARE = 0.72;

  interface Item {
    session: Session;
    key: string;
    title: string;
    /** What the tip says: the title, and what kind of session it is. */
    label: string;
    /** The task's status box for a hand-off; null for a decision; undefined for a thread, which shows the chat's mark. */
    progress?: number | null;
    retired: boolean;
    agent: string;
    /** A turn or a hand-off at work: its Working line is the signal. */
    live?: AgentRun;
    rest: { word: string; tone?: 'warn' } | null;
    current: boolean;
  }

  let el = $state<HTMLElement>();
  let stripW = $state(0);
  let more = $state(false);

  onMount(() => {
    const strip = el?.parentElement;
    if (!strip) return;
    const observer = new ResizeObserver(() => (stripW = strip.clientWidth));
    observer.observe(strip);
    stripW = strip.clientWidth;
    return () => observer.disconnect();
  });

  /** A document on the board, open or done, with its status box. */
  function docOn(projectId: string, id: string): { title: string; progress: number | null; retired: boolean } | null {
    const board = app.boards[projectId];
    if (!board) return null;
    const open = board.tasks.find((t) => t.id === id);
    if (open) return { title: open.title, progress: columnProgress(board.columns, open.column), retired: false };
    const done = board.completed.find((t) => t.id === id);
    if (done) return { title: done.title, progress: 1, retired: false };
    const decision = board.decisions.find((d) => d.id === id);
    if (decision) return { title: decision.title, progress: null, retired: decision.status !== 'current' && decision.status !== 'proposed' };
    return null;
  }

  /** A session as it reads now; null when its thread or its task has gone. */
  function describe(session: Session): Item | null {
    const { projectId, id } = session;
    const runs = Object.values(app.runs);
    const base = { session, key: `${session.kind}:${projectId}:${id}`, current: app.isCurrent(session) };
    if (session.kind === 'chat') {
      const thread = app.threads[projectId]?.find((t) => t.id === id);
      if (!thread) return null;
      const live = runs.find((r) => r.kind === 'ask' && r.threadId === id && r.projectId === projectId && isLive(r));
      const rest = restingWord(session, { unread: app.unread[projectId] });
      const agent = live?.agentId ?? thread.agentId;
      if (thread.taskId) {
        const doc = docOn(projectId, thread.taskId);
        const title = doc?.title ?? thread.taskId;
        return { ...base, title, label: `Discuss ${thread.taskId}: ${title}`, retired: false, agent, live, rest };
      }
      const title = thread.lines.find((l) => l.who === 'you')?.text.split('\n')[0] ?? 'New chat';
      return { ...base, title, label: title, retired: false, agent, live, rest };
    }
    const doc = docOn(projectId, id);
    if (!doc) return null;
    const run = handoffRun(runs, projectId, id);
    const ready = app.mergeable[projectId]?.find((r) => r.taskId === id);
    const lead = app.leadFor(id, projectId);
    const assignee = [...(app.boards[projectId]?.tasks ?? []), ...(app.boards[projectId]?.completed ?? [])].find((t) => t.id === id)?.assignee;
    return {
      ...base,
      ...doc,
      label: lead ? `Leading: ${doc.title}` : `Handed off: ${doc.title}`,
      agent: lead?.agentId ?? run?.agentId ?? assignee ?? '',
      live: isLive(run) ? run : undefined,
      rest: restingWord(session, { run, ready, lead }),
    };
  }

  const items = $derived(app.boardSessions.map(describe).filter((i): i is Item => i !== null));

  /** As many tabs as the width allows, up to four, keeping room for +N. */
  const capacity = $derived(Math.max(0, Math.min(MAX_SHOWN, Math.floor((stripW * SHARE - 44 + GAP) / (TAB_W + GAP)))));

  /** The newest tabs at the right end; the one in front always among them. */
  const shown = $derived.by(() => {
    if (capacity === 0) return [] as Item[];
    let list = items.slice(-capacity);
    const current = items.find((i) => i.current);
    if (current && !list.includes(current)) list = [...list.slice(1), current];
    return list;
  });
  const hidden = $derived(items.filter((i) => !shown.includes(i)));

  /** A known agent by its ID, as the strip says it (`codex`); one of the person's own by its name. */
  function shortAgent(agent: string): string {
    return agent.startsWith('custom:') ? app.agentName(agent as AgentId) : agent;
  }

  function open(item: Item): void {
    more = false;
    app.openSession(item.session);
  }

  function close(e: MouseEvent, item: Item): void {
    e.stopPropagation();
    app.closeSession(item.session);
  }
</script>

{#snippet mark(i: Item)}
  {#if i.progress === undefined}
    <span class="kind" aria-hidden="true"><Icon name="ask" size={12} /></span>
  {:else if i.progress === null}
    <span class="dmark" class:retired={i.retired} aria-hidden="true">{i.retired ? '○' : '●'}</span>
  {:else}
    <StatusIcon progress={i.progress} size={13} />
  {/if}
{/snippet}

{#snippet signal(i: Item)}
  {#if i.live}
    <span class="sig"><Working run={i.live} rotate={false} /></span>
  {:else if i.agent}
    <span class="sig mono rest"
      >{shortAgent(i.agent)}{#if i.rest}<span class="sep">·</span><span class:warn={i.rest.tone === 'warn'}>{i.rest.word}</span>{/if}</span
    >
  {/if}
{/snippet}

<!-- Always here, so the strip's width is known before the first tab arrives. -->
<div class="dock" bind:this={el}>
  {#if items.length}
    {#if hidden.length}
      <span class="anchor">
        <button class="more mono" use:tip={`${hidden.length} more`} onclick={() => (more = !more)}>+{hidden.length}</button>
        {#if more}
          <div class="catch" role="presentation" onmousedown={() => (more = false)}></div>
          <div class="menu">
            {#each [...hidden].reverse() as i (i.key)}
              <div class="item" role="button" tabindex="0" onclick={() => open(i)} onkeydown={(e) => e.key === 'Enter' && open(i)}>
                {@render mark(i)}
                <span class="tt">{i.title}</span>
                {@render signal(i)}
                <button class="x" aria-label="Close tab" onclick={(e) => close(e, i)}><Icon name="close" size={10} /></button>
              </div>
            {/each}
          </div>
        {/if}
      </span>
    {/if}
    {#each shown as i (i.key)}
      <div
        class="tab"
        class:current={i.current}
        role="button"
        tabindex="0"
        style:width="{TAB_W}px"
        use:tip={i.label}
        onclick={() => open(i)}
        onkeydown={(e) => e.key === 'Enter' && open(i)}
      >
        {@render mark(i)}
        <span class="tt">{i.title}</span>
        {@render signal(i)}
        <button class="x" aria-label="Close tab" onclick={(e) => close(e, i)}><Icon name="close" size={10} /></button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .dock {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* A tab is a chip in the well: the raised plane and a hairline, no halo, since nothing lies under it. */
  .tab {
    height: 26px;
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 3px 0 var(--s2);
    border-radius: var(--r-control);
    background: var(--raised);
    box-shadow: var(--top-light), inset 0 0 0 var(--hairline) var(--line);
    cursor: default;
    transition: background var(--d-press) var(--ease);
  }

  .tab:hover {
    background: var(--pressed);
  }

  .tab.current {
    background: var(--pop);
  }

  .tt {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--ink-2);
  }

  .tab.current .tt,
  .tab:hover .tt {
    color: var(--ink);
  }

  .sig {
    flex: none;
    display: inline-flex;
  }

  /* The agent, and where it stands, muted: only Needs you and a conflict or a failure take the warn colour. */
  .rest {
    display: block;
    max-width: 50%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    flex-shrink: 1;
    color: var(--ink-4);
  }

  .rest .sep {
    margin: 0 6px;
  }

  .rest .warn {
    color: var(--warn);
  }

  .kind {
    width: 13px;
    flex: none;
    display: inline-flex;
    justify-content: center;
    color: var(--ink-3);
  }

  .dmark {
    width: 13px;
    flex: none;
    text-align: center;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }

  /* Close waits for the hand, in space kept for it. */
  .x {
    width: 18px;
    height: 18px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-chip);
    color: var(--ink-4);
    opacity: 0;
    transition: opacity var(--d-press) var(--ease);
  }

  .tab:hover .x,
  .item:hover .x {
    opacity: 1;
  }

  .x:hover {
    background: var(--fill-active);
    color: var(--ink);
  }

  .anchor {
    position: relative;
    display: inline-flex;
  }

  .more {
    height: 26px;
    padding: 0 var(--s2);
    border-radius: var(--r-control);
    color: var(--ink-3);
  }

  .more:hover {
    background: var(--fill-hover);
    color: var(--ink);
  }

  .catch {
    position: fixed;
    inset: 0;
    z-index: var(--z-catch);
  }

  .menu {
    position: absolute;
    z-index: var(--z-menu);
    right: 0;
    bottom: calc(100% + 6px);
    width: 300px;
    padding: var(--s1);
    border-radius: var(--r-card);
    background: var(--pop);
    box-shadow: var(--top-light), var(--shadow-float);
  }

  .item {
    height: 32px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 4px 0 var(--s2);
    border-radius: var(--r-control);
  }

  .item:hover {
    background: var(--fill-hover);
  }
</style>
