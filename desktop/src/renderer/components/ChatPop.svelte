<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { tip } from '../lib/tooltip';
  import Icon from './Icon.svelte';
  import Working from './Working.svelte';
  import AskLine from './AskLine.svelte';
  import { renderMarkdown } from '../lib/markdown';
  import { relativeTime } from '../lib/format';
  import type { AgentId } from '../../shared/api';

  /**
   * The dispatcher's small chat (design.md, Dispatch): a muted key in the
   * board's bottom-right corner that opens a short popover for small things,
   * asking about the board or having it managed. Not a chat app: one thread
   * per board, replies that land whole, and anything long belongs in Hotline.
   */
  let { projectName }: { projectName: string } = $props();

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
    return app.models[agent]?.find((m) => m.value === chosen)?.name ?? chosen;
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

<button
  class="key"
  class:on={app.chatOpen}
  use:tip={'Ask the board  ⌘J'}
  aria-label="Ask the board"
  onclick={() => (app.chatOpen ? (app.chatOpen = false) : app.openChat())}
>
  <Icon name="ask" size={15} />
</button>

{#if app.chatOpen}
  <section class="pop" aria-label="Ask the board">
    <header>
      <button class="icon-btn" class:on={view === 'history'} use:tip={'Recent chats'} onclick={() => (view = view === 'history' ? 'chat' : 'history')}>
        <Icon name="history" size={13} />
      </button>
      <span class="where">{view === 'history' ? 'Recent' : projectName}</span>
      <span class="spacer"></span>
      <span class="anchor">
        <button class="pick mono" onclick={() => (picking = picking === 'agent' ? null : 'agent')} disabled={!app.defaultAgent}>
          {agent ? app.agentName(agent) : 'no agent installed'}<Icon name="chevron" size={10} />
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
            {modelName}<Icon name="chevron" size={10} />
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
    <div class="lines" bind:this={list}>
      {#each lines as line (line.key)}
        {#if line.who === 'agent' && !line.failed}
          <div class="line md">{@html renderMarkdown(line.text)}</div>
        {:else}
          <p class="line" class:you={line.who === 'you'} class:failed={line.failed}>{line.text}</p>
        {/if}
      {:else}
        <p class="empty">Ask about this board, or have it managed: “add a task to…”, “sort To Do by priority”, “split epic-3”.</p>
      {/each}
      {#if live}
        <p class="status"><Working agent={live.agentId} activity={live.activity} waiting={live.state === 'waiting'} /></p>
        {#each app.asks.filter((a) => a.runId === live.id) as ask (ask.id)}
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

  .key:hover,
  .key.on {
    color: var(--ink-2);
    background: var(--raised);
  }

  .pop {
    position: absolute;
    z-index: var(--z-menu);
    right: var(--s3);
    bottom: calc(var(--s3) + 32px + var(--s2));
    width: 360px;
    height: min(440px, calc(100% - 96px));
    display: flex;
    flex-direction: column;
    border-radius: var(--r-pane);
    background: var(--pop);
    box-shadow: var(--top-light), var(--shadow-float);
    animation: rise var(--d-open) var(--ease);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  header {
    height: 40px;
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--s1);
    padding: 0 var(--s1) 0 var(--s3);
  }

  .where {
    font-weight: 600;
  }

  .spacer {
    flex: 1;
  }

  .anchor {
    position: relative;
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
    height: 24px;
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
    padding: 0 var(--s2);
    border-radius: var(--r-control);
    color: var(--ink-3);
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
    gap: var(--s2);
    padding: var(--s1) var(--s3) var(--s3);
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 10px);
    mask-image: linear-gradient(to bottom, transparent 0, #000 10px);
  }

  /* Speech on two sides, told apart by side and plane, never hue. */
  .line {
    max-width: 86%;
    margin: 0;
    padding: 6px 10px;
    border-radius: var(--r-card);
    background: var(--raised);
    font-size: var(--t-read);
    line-height: var(--lh-read);
    white-space: pre-wrap;
    -webkit-user-select: text;
    user-select: text;
  }

  .line.md {
    white-space: normal;
  }

  .line.md :global(p),
  .line.md :global(ul),
  .line.md :global(ol) {
    margin: 0 0 6px;
  }

  .line.md :global(:last-child) {
    margin-bottom: 0;
  }

  .line.md :global(ul),
  .line.md :global(ol) {
    padding-left: 18px;
  }

  .line.md :global(strong) {
    font-weight: 600;
  }

  .line.md :global(code) {
    font-family: var(--mono);
    font-size: 12px;
  }

  .line.you {
    align-self: flex-end;
    background: var(--fill-active);
  }

  .line.failed {
    color: var(--danger);
    background: var(--danger-soft);
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
