<script lang="ts">
  import { app, CHAT } from '../lib/state.svelte';
  import { tip } from '../lib/tooltip';
  import Icon from './Icon.svelte';
  import Working from './Working.svelte';
  import AskLine from './AskLine.svelte';
  import { renderMarkdown } from '../lib/markdown';
  import { dayTime, relativeTime, tookWords } from '../lib/format';
  import { linkRefs, refsOf } from '../lib/refs';
  import type { AgentId } from '../../shared/api';
  import { expoOut } from 'svelte/easing';

  /**
   * The dispatcher's small chat (design.md, Dispatch): a muted key in the
   * board's bottom-right corner that grows into a short popover in its place,
   * for small things,
   * asking about the board or having it managed. Not a chat app: one thread
   * per board, replies that land whole, and anything long belongs in Hotline.
   */
  let { projectName }: { projectName: string } = $props();

  /** The key's size: the popover grows out of it and shrinks back into it. */
  const KEY = 32;

  let pop = $state<HTMLElement>();
  let sizing = $state<'left' | 'top' | 'corner' | null>(null);

  /**
   * Sized from the edges that face the board, left and top, since the right
   * and bottom are held by the corner. The pane caps it; the size is kept.
   */
  function resize(e: PointerEvent, edge: 'left' | 'top' | 'corner'): void {
    if (!pop?.offsetParent) return;
    e.preventDefault();
    const pane = pop.offsetParent.getBoundingClientRect();
    const band = parseFloat(getComputedStyle(pop).getPropertyValue('--band-h')) || 44;
    const maxW = pane.width - 24;
    const maxH = pane.height - band - 24;
    const start = { x: e.clientX, y: e.clientY, w: pop.offsetWidth, h: pop.offsetHeight };
    sizing = edge;
    const move = (ev: PointerEvent) => {
      if (edge !== 'top') app.layout.chat.w = Math.round(Math.min(maxW, Math.max(CHAT.minW, start.w + start.x - ev.clientX)));
      if (edge !== 'left') app.layout.chat.h = Math.round(Math.min(maxH, Math.max(CHAT.minH, start.h + start.y - ev.clientY)));
    };
    const up = () => {
      sizing = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      app.saveLayout();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function resetSize(): void {
    app.layout.chat = { w: CHAT.w, h: CHAT.h };
    app.saveLayout();
  }

  /**
   * The key becomes the popover: a clip from the key's square in the corner
   * out to the whole panel, its contents coming up once there is room for
   * them. Closing runs it back into the key. Reduced motion just shows it.
   */
  function grow(node: HTMLElement) {
    const { width, height } = node.getBoundingClientRect();
    // Not laid out yet, or reduced motion: just show it, never a stuck square.
    if (width <= KEY || height <= KEY || matchMedia('(prefers-reduced-motion: reduce)').matches) return { duration: 0 };
    return {
      duration: 220,
      easing: expoOut,
      css: (t: number) => {
        const inset = (size: number) => ((1 - t) * (size - KEY)).toFixed(1);
        const reveal = Math.max(0, (t - 0.4) / 0.6).toFixed(3);
        return `clip-path: inset(${inset(height)}px 0 0 ${inset(width)}px round ${8 + 2 * t}px); --reveal: ${reveal};`;
      },
    };
  }

  let text = $state('');
  /** An old thread reopened keeps its own agent; otherwise the project's last used. */
  let agentId = $state<AgentId | null>(null);
  let picking = $state<'agent' | 'model' | null>(null);
  let view = $state<'chat' | 'history'>('chat');
  let field = $state<HTMLTextAreaElement>();
  let list = $state<HTMLDivElement>();

  const agent = $derived(agentId ?? app.defaultAgent);
  const lines = $derived(app.currentThread?.lines ?? []);
  const history = $derived(app.activeId ? (app.threads[app.activeId] ?? []) : []);
  const modelName = $derived.by(() => {
    if (!agent) return '';
    const chosen = app.modelFor(agent);
    if (!chosen) return 'default';
    return app.modelLabel(agent, chosen);
  });

  $effect(() => {
    if (!app.chatOpen) view = 'chat';
  });

  // Another board, another agent: each project keeps its own.
  $effect(() => {
    void app.activeId;
    agentId = null;
  });

  function openThread(id: string): void {
    if (app.activeId) app.thread[app.activeId] = id;
    const thread = history.find((t) => t.id === id);
    agentId = thread && app.agents.some((a) => a.id === thread.agentId && a.available) ? thread.agentId : null;
    view = 'chat';
  }

  function newChat(): void {
    agentId = null;
    if (app.activeId && !live) app.thread[app.activeId] = null;
    view = 'chat';
    field?.focus();
  }

  function titleOf(lines: { who: string; text: string }[]): string {
    return lines.find((l) => l.who === 'you')?.text ?? 'Untitled';
  }
  const live = $derived(app.liveAsk);
  /** The IDs a reply can link to: everything the board in front can open. */
  const refs = $derived(refsOf(app.board));
  /** Which replies have their steps unfolded. */
  let unfolded = $state<Record<string, boolean>>({});
  let copied = $state<string | null>(null);

  /** A tool as people read it: `mcp__brainfile__get_task` and `mcp.brainfile.get_task` both say `brainfile · get_task`. */
  function toolTitle(title: string): string {
    return title.replace(/^mcp(?:__|\.)([\w-]+?)(?:__|\.)/, '$1 · ');
  }

  /** A board reference in a reply opens in the pane. */
  function openRef(e: MouseEvent): void {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-ref]')?.dataset.ref;
    if (!id) return;
    app.selectedTaskId = id;
    app.openTaskId = id;
  }

  async function copy(key: string, text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    copied = key;
    setTimeout(() => {
      if (copied === key) copied = null;
    }, 1200);
  }

  $effect(() => {
    if (app.chatOpen) field?.focus();
  });

  $effect(() => {
    void lines.length;
    void live;
    list?.scrollTo({ top: list.scrollHeight });
  });

  function send(): void {
    if (!agent || !text.trim() || live) return;
    void app.askBoard(text, agent);
    text = '';
    if (field) field.style.height = '';
  }

  function fit(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }
</script>

{#if !app.chatOpen}
  <button class="key" use:tip={'Ask the board  ⌘J'} aria-label="Ask the board" onclick={() => app.openChat()}>
    <Icon name="ask" size={15} />
  </button>
{/if}

{#if app.chatOpen}
  <section
    class="pop"
    class:sizing
    aria-label="Ask the board"
    bind:this={pop}
    style:--w="{app.layout.chat.w}px"
    style:--h="{app.layout.chat.h}px"
    transition:grow
  >
    <!-- The edges that face the board size it; double-click puts it back. -->
    <div class="edge left" class:on={sizing === 'left'} role="presentation" onpointerdown={(e) => resize(e, 'left')} ondblclick={resetSize}></div>
    <div class="edge top" class:on={sizing === 'top'} role="presentation" onpointerdown={(e) => resize(e, 'top')} ondblclick={resetSize}></div>
    <div class="edge corner" role="presentation" onpointerdown={(e) => resize(e, 'corner')} ondblclick={resetSize}></div>
    <header>
      <button class="icon-btn" class:on={view === 'history'} use:tip={'Recent chats'} onclick={() => (view = view === 'history' ? 'chat' : 'history')}>
        <Icon name="history" size={13} />
      </button>
      <span class="where">{view === 'history' ? 'Recent' : app.currentThread ? titleOf(lines) : projectName}</span>
      <span class="anchor">
        <button
          class="pick mono"
          onclick={() => {
            picking = picking === 'agent' ? null : 'agent';
            if (picking === 'agent') void app.refreshAgents();
          }}
          disabled={!app.defaultAgent}
        >
          <span class="label">{agent ? app.agentName(agent) : 'no agent installed'}</span><Icon name="chevron" size={10} />
        </button>
        {#if picking === 'agent'}
          <div class="catch" role="presentation" onmousedown={() => (picking = null)}></div>
          <div class="menu">
            {#each app.agents as a (a.id)}
              <button
                class="item"
                disabled={!a.available}
                onclick={() => {
                  agentId = a.id;
                  app.remember(a.id);
                  picking = null;
                }}
              >
                <span>{a.name}</span><span class="mono note">{a.note}</span>
              </button>
            {/each}
          </div>
        {/if}
      </span>
      {#if agent}
        <span class="anchor">
          <button
            class="pick mono"
            onclick={() => {
              picking = picking === 'model' ? null : 'model';
              if (picking === 'model') void app.loadModels(agent);
            }}
          >
            <span class="label">{modelName}</span><Icon name="chevron" size={10} />
          </button>
          {#if picking === 'model'}
            <div class="catch" role="presentation" onmousedown={() => (picking = null)}></div>
            <div class="menu">
              {#if !(app.models[agent] ?? []).some((m) => /default/i.test(m.value) || /default/i.test(m.name))}
                <button
                  class="item"
                  onclick={() => {
                    app.chooseModel(agent, null);
                    picking = null;
                  }}
                >
                  <span>Default</span><span class="mono note">the agent’s own</span>
                </button>
              {/if}
              {#if !app.models[agent]}
                <p class="loading mono">asking {app.agentName(agent)}…</p>
              {:else}
                {#each app.models[agent] ?? [] as m (m.value)}
                  <button
                    class="item"
                    onclick={() => {
                      app.chooseModel(agent, m.value);
                      picking = null;
                    }}
                  >
                    <span>{m.name}</span>{#if app.modelFor(agent) === m.value}<Icon name="check" size={12} />{/if}
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
        </span>
      {/if}
      {#if app.currentThread && !live}
        <button class="icon-btn" use:tip={'New chat'} onclick={newChat}><Icon name="plus" size={13} /></button>
      {/if}
      <button class="icon-btn" use:tip={'Close  Esc'} onclick={() => (app.chatOpen = false)}><Icon name="close" size={13} /></button>
    </header>

    {#if view === 'history'}
      <div class="history">
        {#each history as t (t.id)}
          <button class="thread" class:current={t.id === app.currentThread?.id} onclick={() => openThread(t.id)}>
            <span class="tt">{titleOf(t.lines)}</span>
            <span class="mono meta">{app.agentName(t.agentId)} · {relativeTime(new Date(t.startedAt).toISOString())} · {t.lines.length}</span>
          </button>
        {:else}
          <p class="empty">No chats on this board yet.</p>
        {/each}
      </div>
    {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="lines" bind:this={list} role="presentation" onclick={openRef}>
      {#if lines.length}
        <p class="when mono">{dayTime(app.currentThread?.startedAt ?? lines[0].at)}</p>
      {/if}
      {#each lines as line (line.key)}
        {#if line.who === 'you'}
          <div class="mine">
            <p class="line you">{line.text}</p>
            {#if line.context?.length}
              <p class="context">
                {#each line.context as id (id)}
                  {@const info = refs.get(id)}
                  <button class="ref" data-ref={id}
                    ><span class="ref-mark" data-kind={info?.kind ?? 'work'} data-done={info?.done ? '' : undefined} aria-hidden="true"
                    ></span>{id}</button
                  >
                {/each}
                in context
              </p>
            {/if}
          </div>
        {:else if line.failed}
          <p class="line failed">{line.text}</p>
        {:else}
          <div class="reply">
            {#if line.steps?.length}
              <button class="worked" onclick={() => (unfolded[line.key] = !unfolded[line.key])} aria-expanded={!!unfolded[line.key]}>
                Worked{#if line.took}{` for ${tookWords(line.took)}`}{/if}
                <span class="chev" class:open={unfolded[line.key]}><Icon name="chevron" size={10} /></span>
              </button>
              {#if unfolded[line.key]}
                <ol class="steps">
                  {#each line.steps as step, i (i)}
                    {#if step.kind === 'tool'}
                      <li class="tool mono" class:failed={step.failed}>{toolTitle(step.title)}</li>
                    {:else}
                      <li class="note">{step.text}</li>
                    {/if}
                  {/each}
                </ol>
              {/if}
            {/if}
            <div class="md">{@html linkRefs(renderMarkdown(line.text), refs)}</div>
            <button class="copy" use:tip={copied === line.key ? 'Copied' : 'Copy'} aria-label="Copy reply" onclick={() => copy(line.key, line.text)}>
              <Icon name={copied === line.key ? 'check' : 'copy'} size={12} />
            </button>
          </div>
        {/if}
      {:else}
        <p class="empty">Ask about this board, or have it managed: “add a task to…”, “sort To Do by priority”, “split epic-3”.</p>
      {/each}
      {#if live}
        <p class="status"><Working run={live} /></p>
        {#each app.asks.filter((a) => a.runId === live?.id) as ask (ask.id)}
          <div class="asking"><AskLine {ask} stacked /></div>
        {/each}
      {/if}
    </div>

    {/if}

    <div class="composer">
      <textarea
        bind:this={field}
        bind:value={text}
        rows="1"
        placeholder="Ask or tell it something"
        oninput={(e) => fit(e.currentTarget)}
        onkeydown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          } else if (e.key === 'Escape') {
            app.chatOpen = false;
          }
          e.stopPropagation();
        }}
      ></textarea>
      {#if live}
        <button class="send" use:tip={'Stop'} onclick={() => app.stopRun(live.id)}><Icon name="stop" size={12} /></button>
      {:else if text.trim()}
        <button class="send go" aria-label="Send" onclick={send}><Icon name="send" size={13} /></button>
      {/if}
    </div>
  </section>
{/if}

<style>
  .key {
    position: absolute;
    z-index: var(--z-band);
    right: var(--s3);
    bottom: var(--s3);
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-card);
    color: var(--ink-4);
    background: var(--canvas);
    box-shadow: inset 0 0 0 var(--hairline) var(--line);
    transition: color var(--d-press) var(--ease), background var(--d-press) var(--ease);
  }

  .key:hover {
    color: var(--ink-2);
    background: var(--raised);
  }

  /* Open, the popover takes the key's corner: same right and bottom edges. */
  .pop {
    position: absolute;
    z-index: var(--z-menu);
    right: var(--s3);
    bottom: var(--s3);
    width: min(var(--w), calc(100% - var(--s3) * 2));
    height: min(var(--h), calc(100% - var(--band-h) - var(--s3) * 2));
    display: flex;
    flex-direction: column;
    border-radius: var(--r-pane);
    background: var(--pop);
    /* The float shadow, and a wide halo in the pane's own colour, so the rows
       behind it fall back rather than run up against its edge. */
    box-shadow:
      var(--top-light),
      var(--shadow-float),
      0 0 48px 20px color-mix(in oklch, var(--canvas) 85%, transparent);
  }

  /* While it is sized, nothing inside takes the pointer or the selection. */
  .pop.sizing {
    user-select: none;
  }

  .pop.sizing > :global(:not(.edge)) {
    pointer-events: none;
  }

  /* The two edges that face the board, and the corner between them. A
     hairline shows under the pointer, as a gutter does. */
  .edge {
    position: absolute;
    z-index: 1;
  }

  .edge.left {
    top: var(--s3);
    bottom: var(--s3);
    left: -3px;
    width: 6px;
    cursor: ew-resize;
  }

  .edge.top {
    left: var(--s3);
    right: var(--s3);
    top: -3px;
    height: 6px;
    cursor: ns-resize;
  }

  .edge.corner {
    top: -3px;
    left: -3px;
    width: 14px;
    height: 14px;
    cursor: nwse-resize;
  }

  .edge.left::after,
  .edge.top::after {
    content: '';
    position: absolute;
    border-radius: 1px;
    background: transparent;
    transition: background var(--d-open) var(--ease);
  }

  .edge.left::after {
    top: 0;
    bottom: 0;
    left: 2px;
    width: 2px;
  }

  .edge.top::after {
    left: 0;
    right: 0;
    top: 2px;
    height: 2px;
  }

  .edge.left:hover::after,
  .edge.top:hover::after,
  .edge.on::after {
    background: var(--line-strong);
  }

  /* While it grows, its contents wait for the room to read them. */
  .pop > :global(*) {
    opacity: var(--reveal, 1);
  }

  header {
    height: 40px;
    flex: none;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--s1);
    padding: 0 var(--s1) 0 var(--s3);
  }

  /* The header holds one line: the title gives way first, then the picks. */
  .where {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 600;
  }


  .anchor {
    position: relative;
    flex: none;
    display: inline-flex;
  }

  .icon-btn {
    width: 24px;
    height: 24px;
  }

  .icon-btn.on {
    background: var(--fill-hover);
    color: var(--ink-2);
  }

  .pick {
    max-width: 136px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
    padding: 0 var(--s2);
    border-radius: var(--r-control);
    color: var(--ink-3);
  }

  .pick .label {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .pick :global(svg) {
    flex: none;
  }

  .pick :global(svg) {
    transform: rotate(90deg);
  }

  .pick:hover {
    background: var(--fill-hover);
    color: var(--ink-2);
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
    top: calc(100% + 4px);
    width: 220px;
    max-height: 300px;
    overflow-y: auto;
    padding: var(--s1);
    border-radius: var(--r-card);
    background: var(--pressed);
    box-shadow: var(--top-light), var(--shadow-float);
  }

  .item {
    width: 100%;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--s2);
    border-radius: var(--r-control);
  }

  .item:not(:disabled):hover {
    background: var(--fill-hover);
  }

  .item:disabled {
    color: var(--ink-4);
  }

  .note {
    color: var(--ink-4);
  }

  .loading {
    margin: 0;
    padding: var(--s2);
    color: var(--ink-3);
  }

  .history {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--s1) var(--s2) var(--s2);
  }

  .thread {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 7px var(--s2) 8px;
    border-radius: var(--r-control);
    text-align: left;
  }

  .thread:hover,
  .thread.current {
    background: var(--fill-hover);
  }

  .tt {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .meta {
    color: var(--ink-3);
  }

  .lines {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--s3);
    padding: var(--s1) var(--s3) var(--s3);
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 10px);
    mask-image: linear-gradient(to bottom, transparent 0, #000 10px);
  }

  /* The thread's start, said once. */
  .when {
    margin: var(--s1) 0 0;
    text-align: center;
    color: var(--ink-4);
  }

  /* Yours sits on the right on a raised plane; the agent's reply is plain
     text on the popover, as Linear sets it. Told apart by side and plane,
     never hue. */
  .mine {
    align-self: flex-end;
    max-width: 86%;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--s1);
  }

  .line {
    margin: 0;
    padding: 6px 10px;
    border-radius: var(--r-card);
    font-size: var(--t-read);
    line-height: var(--lh-read);
    white-space: pre-wrap;
    -webkit-user-select: text;
    user-select: text;
  }

  .line.you {
    background: var(--raised);
    box-shadow: var(--top-light);
  }

  .line.failed {
    max-width: 86%;
    color: var(--danger);
    background: var(--danger-soft);
  }

  .context {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
    font-size: var(--t-xs);
    line-height: var(--lh-xs);
    color: var(--ink-4);
  }

  .reply {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .worked {
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
    font-size: var(--t-sm);
    line-height: var(--lh-sm);
    color: var(--ink-3);
  }

  .worked:hover {
    color: var(--ink-2);
  }

  .worked .chev {
    display: inline-flex;
    transition: transform var(--d-open) var(--ease);
  }

  .worked .chev.open {
    transform: rotate(90deg);
  }

  /* What the agent did: the tools it ran in mono, what it said between in
     sans, all one step down, hung from a hairline. */
  .steps {
    margin: 0;
    padding: 0 0 0 var(--s3);
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-left: var(--hairline) solid var(--line-strong);
    font-size: var(--t-sm);
    line-height: var(--lh-sm);
    color: var(--ink-3);
  }

  .steps .tool {
    font-size: var(--t-xs);
    overflow-wrap: anywhere;
  }

  .steps .tool.failed {
    color: var(--warn);
  }

  .md {
    font-size: var(--t-read);
    line-height: var(--lh-read);
    -webkit-user-select: text;
    user-select: text;
  }

  .md :global(p),
  .md :global(ul),
  .md :global(ol) {
    margin: 0 0 6px;
  }

  .md :global(:last-child) {
    margin-bottom: 0;
  }

  .md :global(ul),
  .md :global(ol) {
    padding-left: 18px;
  }

  .md :global(strong) {
    font-weight: 600;
  }

  .md :global(code) {
    font-family: var(--mono);
    font-size: 12px;
  }

  /* A board reference: a small key with the document's own mark, the
     status box for work, the TUI's dot for a decision. */
  .lines :global(.ref) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 18px;
    padding: 0 5px;
    margin: 0 1px;
    border-radius: var(--r-chip);
    background: var(--fill-code);
    font-family: var(--mono);
    font-size: var(--t-xs);
    letter-spacing: 0.04em;
    color: var(--ink-2);
    vertical-align: 1px;
    transition: background var(--d-press) var(--ease), color var(--d-press) var(--ease);
  }

  .lines :global(.ref:hover) {
    background: var(--fill-active);
    color: var(--ink);
  }

  .lines :global(.ref-mark[data-kind='work']) {
    width: 9px;
    height: 9px;
    border-radius: 2px;
    box-shadow: inset 0 0 0 1.25px var(--ink-3);
  }

  .lines :global(.ref-mark[data-kind='work'][data-done]) {
    background: var(--accent);
    box-shadow: none;
  }

  .lines :global(.ref-mark[data-kind='decision'])::before {
    content: '●';
    font-size: 8px;
    color: var(--ink-3);
  }

  .lines :global(.ref-mark[data-kind='decision'][data-retired])::before {
    content: '○';
  }

  /* Copy waits under the reply for the hand. */
  .copy {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-chip);
    color: var(--ink-4);
    opacity: 0;
    transition: opacity var(--d-press) var(--ease), background var(--d-press) var(--ease);
  }

  .reply:hover .copy,
  .copy:focus-visible {
    opacity: 1;
  }

  .copy:hover {
    background: var(--fill-hover);
    color: var(--ink-2);
  }

  .empty {
    margin: auto 0 0;
    color: var(--ink-3);
    font-size: var(--t-sm);
    line-height: var(--lh-sm);
  }

  .asking {
    padding: var(--s2) var(--s3);
    border-radius: var(--r-card);
    background: var(--raised);
    box-shadow: var(--top-light);
  }

  .status {
    margin: 0;
    padding: 2px 0;
  }

  .composer {
    flex: none;
    display: flex;
    align-items: flex-end;
    gap: var(--s1);
    margin: 0 var(--s2) var(--s2);
    padding: var(--s1) var(--s1) var(--s1) var(--s3);
    border-radius: var(--r-card);
    background: var(--well);
    box-shadow: inset 0 0 0 var(--hairline) var(--line);
  }

  .composer:focus-within {
    box-shadow: inset 0 0 0 var(--hairline) var(--line-strong);
  }

  textarea {
    flex: 1;
    min-height: 26px;
    padding: 3px 0;
    border: 0;
    background: transparent;
    resize: none;
    font-size: var(--t-md);
    line-height: 20px;
  }

  .send {
    width: 26px;
    height: 26px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-control);
    color: var(--ink-3);
  }

  .send:hover {
    background: var(--fill-hover);
    color: var(--ink);
  }

  .send.go {
    color: var(--ink);
    background: var(--fill-active);
  }
</style>
