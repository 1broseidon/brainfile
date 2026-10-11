<script lang="ts">
  import { api, app } from '../lib/state.svelte';
  import { columnProgress, projectHue } from '../lib/format';
  import Icon, { type IconName } from './Icon.svelte';
  import StatusIcon from './StatusIcon.svelte';

  interface Entry {
    key: string;
    section: string;
    label: string;
    hint?: string;
    icon?: IconName;
    hue?: number;
    progress?: number;
    run: () => void;
  }

  let query = $state('');
  let active = $state(0);
  let input: HTMLInputElement;
  let list = $state<HTMLDivElement>();

  const close = () => (app.paletteOpen = false);

  const actions = $derived.by((): Entry[] => {
    const out: Entry[] = [];
    const board = app.board;
    if (board) {
      out.push({ key: 'new', section: 'Actions', label: 'Create new task', hint: 'C', icon: 'plus', run: () => (app.composer = {}) });
      out.push({
        key: 'view',
        section: 'Actions',
        label: app.view === 'list' ? 'Switch to board view' : 'Switch to list view',
        hint: '⌘B',
        icon: app.view === 'list' ? 'board' : 'list',
        run: () => app.toggleView(),
      });
      if (board.sync.remote) {
        out.push({
          key: 'sync',
          section: 'Actions',
          label: `Sync with ${board.sync.remote}`,
          icon: 'sync',
          run: async () => {
            const r = await api.syncNow(board.projectId);
            if (!r.ok) app.notify(r.error, 'warn');
          },
        });
      }
      out.push({
        key: 'reveal',
        section: 'Actions',
        label: 'Reveal project in Finder',
        icon: 'reveal',
        run: () => api.revealProject(board.projectId),
      });
    }
    out.push({ key: 'add', section: 'Actions', label: 'Add project…', hint: '⌘O', icon: 'folder', run: () => app.addProject() });
    if (app.active) {
      const id = app.active.id;
      out.push({ key: 'remove', section: 'Actions', label: `Remove ${app.active.name} from sidebar`, icon: 'close', run: () => app.removeProject(id) });
    }
    return out;
  });

  const entries = $derived.by((): Entry[] => {
    const q = query.trim().toLowerCase();
    const match = (s: string) => s.toLowerCase().includes(q);
    const projects: Entry[] = app.projects.map((p, i) => ({
      key: `p:${p.id}`,
      section: 'Projects',
      label: p.name,
      hint: i < 9 ? `⌘${i + 1}` : undefined,
      hue: projectHue(p.name),
      run: () => app.select(p.id),
    }));
    const board = app.board;
    const tasks: Entry[] = q && board
      ? [...board.tasks, ...board.completed]
          .filter((t) => match(t.title) || match(t.id) || (t.tags ?? []).some(match) || match(t.assignee ?? ''))
          .slice(0, 30)
          .map((t) => ({
            key: `t:${t.id}`,
            section: 'Tasks',
            label: t.title,
            hint: t.id,
            progress: t.completedAt ? 1 : columnProgress(board.columns, t.column),
            run: () => (app.openTaskId = t.id),
          }))
      : [];
    return [...tasks, ...actions.filter((a) => !q || match(a.label)), ...projects.filter((p) => !q || match(p.label))];
  });

  $effect(() => {
    input?.focus();
  });

  $effect(() => {
    void query;
    active = 0;
  });

  $effect(() => {
    list?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  function run(entry: Entry | undefined): void {
    if (!entry) return;
    close();
    entry.run();
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      active = Math.min(active + 1, entries.length - 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      active = Math.max(active - 1, 0);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      run(entries[active]);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      close();
      e.preventDefault();
    }
    e.stopPropagation();
  }
</script>

<div class="overlay" role="presentation" onmousedown={close}></div>
<div class="palette" role="dialog" aria-label="Command menu">
  <div class="field">
    {#if app.active}<span class="scope">{app.active.name}</span>{/if}
    <input bind:this={input} bind:value={query} {onkeydown} placeholder="Type a command or search tasks…" spellcheck="false" />
  </div>
  <div class="results" bind:this={list}>
    {#each entries as entry, i (entry.key)}
      {#if i === 0 || entries[i - 1].section !== entry.section}
        <div class="section">{entry.section}</div>
      {/if}
      <button class="entry" class:active={i === active} data-index={i} onmouseenter={() => (active = i)} onclick={() => run(entry)}>
        <span class="lead">
          {#if entry.icon}
            <Icon name={entry.icon} size={15} />
          {:else if entry.hue !== undefined}
            <span class="glyph" style:--hue={entry.hue}>{entry.label.slice(0, 1).toUpperCase()}</span>
          {:else if entry.progress !== undefined}
            <StatusIcon progress={entry.progress} />
          {/if}
        </span>
        <span class="label">{entry.label}</span>
        {#if entry.hint}<span class="hint tabular">{entry.hint}</span>{/if}
      </button>
    {/each}
    {#if entries.length === 0}
      <div class="empty">Nothing matches “{query}”</div>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--overlay);
    animation: fade var(--base) var(--ease);
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  .palette {
    position: fixed;
    z-index: 51;
    top: 16vh;
    left: 50%;
    width: 640px;
    max-height: 60vh;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    border-radius: var(--r-xl);
    background: var(--popover);
    box-shadow: var(--shadow-modal);
    overflow: hidden;
    animation: rise var(--base) var(--ease);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(4px) scale(0.985);
    }
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    padding: var(--s3) var(--s4) 0;
    border-bottom: 0.5px solid var(--line-strong);
  }

  .scope {
    align-self: flex-start;
    height: 22px;
    padding: 0 var(--s2);
    display: inline-flex;
    align-items: center;
    border-radius: var(--r-sm);
    font-size: var(--text-xs);
    color: var(--ink-2);
    background: rgba(255, 255, 255, 0.06);
  }

  input {
    height: 44px;
    border: 0;
    background: transparent;
    font-size: var(--text-lg);
  }

  input::placeholder {
    color: var(--ink-3);
  }

  .results {
    padding: var(--s2);
    overflow-y: auto;
  }

  .section {
    padding: var(--s2) var(--s2) var(--s1);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--ink-3);
  }

  .entry {
    width: 100%;
    height: 40px;
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: 0 var(--s3);
    border-radius: var(--r-md);
    text-align: left;
  }

  .entry.active {
    background: var(--hover-strong);
  }

  .lead {
    width: 18px;
    display: inline-flex;
    justify-content: center;
    color: var(--ink-2);
  }

  .glyph {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 650;
    color: hsl(var(--hue) 80% 90%);
    background: hsl(var(--hue) 45% 36%);
  }

  .label {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .hint {
    font-size: var(--text-sm);
    color: var(--ink-3);
  }

  .empty {
    padding: var(--s6);
    text-align: center;
    color: var(--ink-3);
  }
</style>
