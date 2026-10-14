<script module lang="ts">
  /** Where each thread was left, unless at its end: hiding the chat keeps it. */
  const left = new Map<string, number>();
</script>

<script lang="ts">
  import { api, app } from '../lib/state.svelte';
  import { tip, tipWithin } from '../lib/tooltip';
  import Icon from './Icon.svelte';
  import Working from './Working.svelte';
  import AskLine from './AskLine.svelte';
  import { renderMarkdown } from '../lib/markdown';
  import { dayTime, relativeTime, tookWords } from '../lib/format';
  import { linkRefs, refsOf } from '../lib/refs';
  import type { AgentId, ModelOption } from '../../shared/api';
  import { effortToSet } from '../../agents/effort';
  import type { ChatLine, Thread } from '../lib/state.svelte';
  import { untrack } from 'svelte';

  /**
   * The dispatcher's chat (design.md, Dispatch): a pane at the window's right
   * edge, beside the task pane (decision-8), for asking about the board or
   * having it managed. Not a chat app: replies that land whole, and anything
   * long belongs in Hotline. A task's Discuss key opens a thread about that
   * task here, the task beside it (task-35). Hiding it keeps the thread, where
   * it was scrolled to and what you were typing; the key brings it back.
   */
  let { projectName }: { projectName: string } = $props();


  /** What you are typing is the thread's draft, kept while the chat is hidden. */
  const draftKey = $derived(`${app.activeId}\n${app.currentThread?.id ?? ''}`);
  const text = $derived(app.drafts[draftKey] ?? '');
  function setText(value: string): void {
    app.drafts[draftKey] = value;
  }
  /** An old thread reopened keeps its own agent; otherwise the project's last used. */
  let agentId = $state<AgentId | null>(null);
  let picking = $state<'agent' | 'model' | null>(null);
  /** The model whose effort submenu is open, and where that submenu sits. */
  let effortOpen = $state<string | null>(null);
  let effortBox = $state<{ top: number; left: number } | null>(null);
  let effortHide: ReturnType<typeof setTimeout> | undefined;
  let view = $state<'chat' | 'history'>('chat');
  let field = $state<HTMLTextAreaElement>();
  let list = $state<HTMLDivElement>();

  const agent = $derived(agentId ?? app.defaultAgent);
  const lines = $derived(app.currentThread?.lines ?? []);
  const history = $derived(app.activeId ? (app.threads[app.activeId] ?? []) : []);
  const modelName = $derived(agent ? app.modelNote(agent) || 'default' : '');

  /** A model's effort levels open beside its row under the pointer (task-50). */
  function showEffort(model: ModelOption, row: HTMLElement): void {
    clearTimeout(effortHide);
    if (!model.efforts?.length) {
      effortOpen = null;
      return;
    }
    const rect = row.getBoundingClientRect();
    const width = 168;
    const left = rect.right + 6 + width > window.innerWidth - 8 ? Math.max(8, rect.left - width - 6) : rect.right + 6;
    effortOpen = model.value;
    effortBox = { top: rect.top, left };
  }

  function hideEffort(): void {
    clearTimeout(effortHide);
    effortHide = setTimeout(() => {
      effortOpen = null;
    }, 120);
  }

  function holdEffort(): void {
    clearTimeout(effortHide);
  }

  function pickModel(model: string | null, effort?: string): void {
    if (!agent) return;
    app.chooseModel(agent, model, effort ?? null);
    picking = null;
    effortOpen = null;
  }

  $effect(() => {
    if (!app.chatOpen) view = 'chat';
  });

  // Another board, another agent: each project keeps its own.
  $effect(() => {
    void app.activeId;
    agentId = null;
  });

  // A task's discussion opened from its pane keeps the agent it began with, as one picked from history does.
  const threadId = $derived(app.currentThread?.id);
  $effect(() => {
    if (!threadId) return;
    untrack(() => {
      const thread = app.currentThread;
      if (thread?.taskId && app.agents.some((a) => a.id === thread.agentId && a.available)) agentId = thread.agentId;
    });
  });

  function openThread(id: string): void {
    if (app.activeId) app.showThread(app.activeId, id);
    const thread = history.find((t) => t.id === id);
    agentId = thread && app.agents.some((a) => a.id === thread.agentId && a.available) ? thread.agentId : null;
    // A discussion comes back with its task beside it.
    if (thread?.taskId) {
      app.selectedTaskId = thread.taskId;
      app.openTaskId = thread.taskId;
    }
    view = 'chat';
  }

  function newChat(): void {
    agentId = null;
    if (app.activeId && !live) app.showThread(app.activeId, null);
    view = 'chat';
    field?.focus();
  }

  /** A chat is titled by the first line of its first question; a discussion by its task. */
  function titleOf(thread: Pick<Thread, 'lines' | 'taskId'>): string {
    if (thread.taskId) return `Discuss ${thread.taskId}`;
    return thread.lines.find((l) => l.who === 'you')?.text.split('\n')[0] ?? 'Untitled';
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

  /** A board reference in a reply opens in the pane; a file opens in your editor. */
  function openRef(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const file = target.closest<HTMLElement>('[data-path]');
    if (file) {
      void app.openFile(file.dataset.path!, file.dataset.line ? Number(file.dataset.line) : undefined);
      return;
    }
    const id = target.closest<HTMLElement>('[data-ref]')?.dataset.ref;
    if (!id) return;
    app.selectedTaskId = id;
    app.openTaskId = id;
  }

  /** `core/src/linter.ts:74-85`, `MANUAL.md`: a path, and the line it starts at. */
  const FILE = /^(?:\.\/)?((?:[\w@.-]+\/)*[\w@-][\w@.-]*\.[A-Za-z0-9]+)(?::(\d+)(?:[-–]\d+)?)?$/;
  /** What the project has been asked about already: path → is a file in it. */
  const known = new Map<string, boolean>();

  /**
   * Inline code in a reply that names a file in the project becomes a link to
   * it in your editor. The project is asked once per path; anything that is
   * not a file there stays plain code.
   */
  $effect(() => {
    void lines;
    const projectId = app.activeId;
    const box = list;
    if (!projectId || !box) return;
    const codes = [...box.querySelectorAll<HTMLElement>('.md code')].filter((c) => !c.closest('pre') && !c.dataset.path);
    const found = codes
      .map((code) => ({ code, match: FILE.exec(code.textContent?.trim() ?? '') }))
      .filter((c): c is { code: HTMLElement; match: RegExpExecArray } => !!c.match);
    if (found.length === 0) return;
    const mark = () => {
      for (const { code, match } of found) {
        if (!known.get(match[1])) continue;
        code.dataset.path = match[1];
        if (match[2]) code.dataset.line = match[2];
        code.classList.add('file');
      }
    };
    const ask = [...new Set(found.map((f) => f.match[1]))].filter((p) => !known.has(p));
    if (ask.length === 0) return mark();
    void api.existingFiles(projectId, ask).then((files) => {
      for (const p of ask) known.set(p, files.includes(p));
      mark();
    });
  });

  async function copy(key: string, text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    copied = key;
    setTimeout(() => {
      if (copied === key) copied = null;
    }, 1200);
  }

  $effect(() => {
    void threadId;
    field?.focus();
  });

  $effect(() => {
    if (app.chatOpen && app.editors.length === 0) void app.refreshEditors();
  });

  /** How long after it lands a reply still comes in, rather than simply being there. */
  const ARRIVING_MS = 1500;
  const arriving = (line: ChatLine) => line.who === 'agent' && !line.failed && Date.now() - line.at < ARRIVING_MS;

  /**
   * A reply that has just landed comes in from the top: a soft edge passes
   * down it a line at a time, and the thread follows the edge. Replies
   * already there, or read again later, are simply shown, as they are with
   * reduced motion.
   */
  function unveil(node: HTMLElement, line: ChatLine) {
    if (!arriving(line) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = node.closest<HTMLElement>('.lines');
    const EDGE = 32;
    const height = node.offsetHeight;
    // About 70ms a line of reading text, and never long.
    const duration = Math.min(1600, Math.max(320, (height / 22) * 70));
    const mask = (y: number) => {
      const value = y < 0 ? '' : `linear-gradient(to bottom, #000 ${y - EDGE}px, transparent ${y}px)`;
      node.style.setProperty('mask-image', value);
      node.style.setProperty('-webkit-mask-image', value);
    };
    mask(0);
    // Its first line in view, then the thread keeps the edge in view as it comes down.
    if (box) box.scrollTop = Math.min(box.scrollHeight - box.clientHeight, node.offsetTop - 12);
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const y = t * (height + EDGE);
      mask(y);
      if (box) {
        const over = node.getBoundingClientRect().top + y - EDGE - (box.getBoundingClientRect().bottom - 16);
        if (over > 0) box.scrollTop += over;
      }
      if (t < 1) frame = requestAnimationFrame(step);
      else mask(-1);
    });
    return { destroy: () => cancelAnimationFrame(frame) };
  }

  /**
   * A thread comes back where it was left; one left at its end, or one that
   * has just grown a line or a turn at work, shows its end, unless a reply is
   * coming in, which places itself.
   */
  let shown = '';
  $effect(() => {
    const id = threadId ?? '';
    void lines.length;
    void live;
    const box = list;
    if (!box) {
      shown = '';
      return;
    }
    untrack(() => {
      const kept = left.get(id);
      const last = lines[lines.length - 1];
      if (shown !== id && kept !== undefined) box.scrollTop = kept;
      else if (!(last && arriving(last))) box.scrollTo({ top: box.scrollHeight });
      shown = id;
    });
  });

  function keepScroll(): void {
    const box = list;
    if (!box) return;
    const id = threadId ?? '';
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 24) left.delete(id);
    else left.set(id, box.scrollTop);
  }

  function send(): void {
    if (!agent || !text.trim() || live) return;
    void app.askBoard(text, agent);
    setText('');
    if (field) field.style.height = '';
  }

  function fit(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }
</script>

<section class="pane" aria-label="Chat">
  <header class="band">
    <button class="icon-btn" class:on={view === 'history'} use:tip={'Recent chats'} onclick={() => (view = view === 'history' ? 'chat' : 'history')}>
      <Icon name="history" size={13} />
    </button>
    <span class="where">{view === 'history' ? 'Recent' : app.currentThread ? titleOf(app.currentThread) : projectName}</span>
    {#if app.currentThread && !live}
      <button class="icon-btn" use:tip={'New chat'} onclick={newChat}><Icon name="plus" size={13} /></button>
    {/if}
    <!-- Hiding keeps everything as it is; the key brings it back. -->
    <button class="icon-btn hide" use:tip={'Hide  ⌘J'} aria-label="Hide the chat" onclick={() => (app.chatOpen = false)}><Icon name="sidebar" size={14} /></button>
  </header>

  {#if view === 'history'}
    <div class="history">
      {#each history as t (t.id)}
        <button class="thread" class:current={t.id === app.currentThread?.id} onclick={() => openThread(t.id)}>
          <span class="tt">{titleOf(t)}</span>
          <span class="mono meta">{app.agentName(t.agentId)} · {relativeTime(new Date(t.startedAt).toISOString())} · {t.lines.length}</span>
        </button>
      {:else}
        <p class="empty">No chats on this board yet.</p>
      {/each}
    </div>
  {:else}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="lines"
    bind:this={list}
    role="presentation"
    onscroll={keepScroll}
    onclick={openRef}
    use:tipWithin={{
      selector: '[data-ref], [data-path]',
      text: (el) => (el.dataset.path ? `Open in ${app.editorName}` : refs.get(el.dataset.ref ?? '')?.title),
    }}
  >
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
        <div class="reply" use:unveil={line}>
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
          {#if line.changes?.length}
            <!-- What the turn changed, read from the board, not from the reply. -->
            <ul class="changes">
              {#each line.changes as c (c.id + c.what)}
                {@const info = refs.get(c.id)}
                <li>
                  <button class="ref" data-ref={c.id}
                    ><span
                      class="ref-mark"
                      data-kind={info?.kind ?? 'work'}
                      data-done={info?.done ? '' : undefined}
                      data-retired={info?.retired ? '' : undefined}
                      aria-hidden="true"
                    ></span>{c.id}</button
                  >
                  <span class="what">{c.what}</span>
                </li>
              {/each}
            </ul>
          {/if}
          <button class="copy" use:tip={copied === line.key ? 'Copied' : 'Copy'} aria-label="Copy reply" onclick={() => copy(line.key, line.text)}>
            <Icon name={copied === line.key ? 'check' : 'copy'} size={12} />
          </button>
        </div>
      {/if}
    {:else}
      <p class="empty">Ask about this board, or have it managed: “add a task to…”, “split epic-3”, “hand task-3 to Codex”.</p>
    {/each}
  </div>

  {/if}

  <!-- A turn at work says so just above where you type, with what it asks of you above that. -->
  {#if live}
    <div class="live">
      {#each app.asks.filter((a) => a.runId === live?.id) as ask (ask.id)}
        <div class="asking"><AskLine {ask} stacked /></div>
      {/each}
      <p class="status"><Working run={live} /></p>
    </div>
  {/if}

  <div class="composer">
    <textarea
      bind:this={field}
      bind:value={() => text, setText}
      rows="2"
      placeholder={app.currentThread ? 'Reply…' : 'Ask or tell it something'}
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
    <!-- Who answers, and with what, sits where you type; then the one action. -->
    <div class="foot">
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
            {@const hovered = (app.models[agent] ?? []).find((m) => m.value === effortOpen)}
            <div class="catch" role="presentation" onmousedown={() => (picking = null)}></div>
            <div class="menu" onscroll={() => (effortOpen = null)}>
              {#if !(app.models[agent] ?? []).some((m) => /default/i.test(m.value) || /default/i.test(m.name))}
                <button class="item" onclick={() => pickModel(null)}>
                  <span>Default</span><span class="mono note">the agent’s own</span>
                </button>
              {/if}
              {#if !app.models[agent]}
                <p class="loading mono">asking {app.agentName(agent)}…</p>
              {:else}
                {#each app.models[agent] ?? [] as m (m.value)}
                  <button
                    class="item"
                    onmouseenter={(e) => showEffort(m, e.currentTarget as HTMLElement)}
                    onmouseleave={hideEffort}
                    onclick={() => pickModel(m.value, m.efforts?.length ? effortToSet(m.efforts, app.rememberedEffort(agent, m.value)) : undefined)}
                  >
                    <span>{m.name}</span>
                    <span class="marks">
                      {#if app.modelFor(agent) === m.value}<Icon name="check" size={12} />{/if}
                      {#if m.efforts?.length}<Icon name="chevron" size={12} />{/if}
                    </span>
                  </button>
                {/each}
              {/if}
            </div>
            {#if hovered?.efforts?.length && effortBox}
              <div
                class="submenu"
                role="menu"
                aria-label="Effort"
                tabindex="-1"
                style:top="{effortBox.top}px"
                style:left="{effortBox.left}px"
                onmouseenter={holdEffort}
                onmouseleave={hideEffort}
              >
                <p class="effort-label mono">Effort</p>
                {#each hovered.efforts as level (level.value)}
                  <button class="item" onclick={() => pickModel(hovered.value, level.value)}>
                    <span>{level.name}</span>
                    {#if app.modelFor(agent) === hovered.value && app.effortFor(agent) === level.value}<Icon name="check" size={12} />{/if}
                  </button>
                {/each}
              </div>
            {/if}
          {/if}
        </span>
      {/if}
      <span class="grow"></span>
      {#if live}
        <button class="send" use:tip={'Stop'} aria-label="Stop" onclick={() => app.stopRun(live.id)}><Icon name="stop" size={12} /></button>
      {:else}
        <button class="send" class:go={!!text.trim() && !!agent} use:tip={'Send  ↵'} aria-label="Send" disabled={!text.trim() || !agent} onclick={send}>
          <Icon name="send" size={13} />
        </button>
      {/if}
    </div>
  </div>
</section>

<style>
  .pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-radius: var(--r-pane);
    background: var(--canvas);
    box-shadow: var(--top-light), 0 0 0 var(--hairline) var(--line);
    overflow: hidden;
  }

  /* A pane's band, as the task pane's: 44px, no line under it. */
  .band {
    height: var(--band-h);
    flex: none;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--s1);
    padding: 0 var(--s2) 0 var(--s3);
  }

  /* The rail's key, mirrored: this pane sits at the other edge. */
  .hide :global(svg) {
    transform: scaleX(-1);
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
    max-width: 168px;
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

  .marks {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
    color: var(--ink-3);
  }

  /* A model's effort levels, beside the row under the pointer. */
  .submenu {
    position: fixed;
    z-index: var(--z-menu);
    width: 168px;
    padding: var(--s1);
    border-radius: var(--r-card);
    background: var(--pressed);
    box-shadow: var(--top-light), var(--shadow-float);
  }

  .effort-label {
    margin: 0;
    padding: 4px var(--s2) 2px;
    color: var(--ink-4);
    font-size: var(--t-xs);
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
    /* A reply coming in is placed from its own top. */
    position: relative;
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
     text on the pane, as Linear sets it. Told apart by side and plane,
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

  /* A file the project has: inline code that opens in your editor. */
  .md :global(code.file) {
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 3px;
    transition: color var(--d-press) var(--ease), text-decoration-color var(--d-press) var(--ease);
  }

  .md :global(code.file:hover) {
    color: var(--ink);
    text-decoration-color: var(--ink-3);
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

  .live {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    padding: var(--s1) var(--s2) var(--s2);
  }

  /* On the composer's text edge, so it reads as the line about what you sent. */
  .status {
    margin: 0;
    padding: 0 0 0 var(--s3);
  }

  /* A well you type into, with a foot: who answers and with what, then send. */
  .composer {
    flex: none;
    display: flex;
    flex-direction: column;
    margin: 0 var(--s2) var(--s2);
    padding: var(--s2) var(--s1) var(--s1) var(--s3);
    border-radius: var(--r-card);
    background: var(--well);
    box-shadow: inset 0 0 0 var(--hairline) var(--line);
  }

  .foot {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: calc(-1 * var(--s2));
  }

  .grow {
    flex: 1;
  }

  /* From the foot, a pick's menu opens upward, over the thread. */
  .foot .menu {
    top: auto;
    bottom: calc(100% + 4px);
    left: 0;
    right: auto;
  }

  .composer:focus-within {
    box-shadow: inset 0 0 0 var(--hairline) var(--line-strong);
  }

  textarea {
    min-height: 40px;
    padding: 0 var(--s2) var(--s1) 0;
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

  .send:disabled {
    color: var(--ink-4);
    background: none;
  }

  /* Ready to go: the composer's one action takes the accent. */
  .send.go {
    color: var(--on-accent);
    background: var(--accent);
  }

  .send.go:hover {
    background: var(--accent-hover);
  }

  .changes {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .changes li {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-sm);
    line-height: var(--lh-sm);
    color: var(--ink-3);
  }

  .changes .ref {
    margin: 0;
  }
</style>
