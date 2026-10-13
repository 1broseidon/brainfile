<script lang="ts">
  import { api, app } from '../lib/state.svelte';
  import { columnProgress, tildify } from '../lib/format';
  import Icon, { type IconName } from './Icon.svelte';
  import StatusIcon from './StatusIcon.svelte';

  interface Entry {
    key: string;
    section: string;
    label: string;
    hint?: string;
    icon?: IconName;
    detail?: string;
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
        key: 'calm',
        section: 'Actions',
        label: app.calm ? 'Show every signal in the list' : 'Calm the list',
        hint: '⇧V',
        icon: 'list',
        run: () => {
          app.setCalm(!app.calm);
          app.setView('list');
        },
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
      icon: 'git',
      detail: tildify(p.path),
      run: () => app.select(p.id),
    }));
    // Every open board, the one in front first.
    const tasks: Entry[] = [];
    if (q) {
      const ids = Object.keys(app.boards).sort((a, b) => (a === app.activeId ? -1 : b === app.activeId ? 1 : 0));
      for (const id of ids) {
        const board = app.boards[id];
        const name = app.projects.find((p) => p.id === id)?.name ?? '';
        const here = id === app.activeId;
        for (const t of [...board.tasks, ...board.completed]) {
          if (!(match(t.title) || match(t.id) || (t.tags ?? []).some(match) || match(t.assignee ?? ''))) continue;
          tasks.push({
            key: `t:${id}:${t.id}`,
            section: here ? 'Tasks' : 'In other projects',
            label: t.title,
            detail: here ? t.id : `${name} · ${t.id}`,
            progress: t.completedAt ? 1 : columnProgress(board.columns, t.column),
            run: () => app.goTo(id, t.id),
          });
        }
      }
    }
    return [...tasks.slice(0, 40), ...actions.filter((a) => !q || match(a.label)), ...projects.filter((p) => !q || match(p.label))];
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
  <!-- One row: the search mark in the entries' icon column, the query on
       their labels' edge, and the scope at the end where their keys sit. -->
  <div class="query">
    <span class="lead"><Icon name="search" size={15} /></span>
    <input
      bind:this={input}
      bind:value={query}
      {onkeydown}
      placeholder="Type a command or search tasks…"
      aria-label="Command or search"
      spellcheck="false"
      autocomplete="off"
    />
    {#if app.active}<span class="scope mono">every project</span>{/if}
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
          {:else if entry.progress !== undefined}
            <StatusIcon progress={entry.progress} />
          {/if}
        </span>
        <span class="label">{entry.label}</span>
        {#if entry.detail}<span class="detail mono">{entry.detail}</span>{/if}
        {#if entry.hint}<kbd class="hint">{entry.hint}</kbd>{/if}
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
    z-index: var(--z-scrim);
    background: var(--scrim);
    animation: fade var(--d-open) var(--ease);
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  .palette {
    position: fixed;
    z-index: var(--z-menu);
    top: 16vh;
    left: 50%;
    width: min(640px, calc(100vw - var(--s8) * 2));
    max-height: 60vh;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    border-radius: var(--r-pane);
    background: var(--pop);
    box-shadow: var(--shadow-float);
    overflow: hidden;
    animation: rise var(--d-open) var(--ease);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(4px) scale(0.985);
    }
  }

  /* The query row is the pop itself, not a field sunk into it: no well, no
     rim, only the hairline that ends it. Its insets are the entries' own
     (the results' 8 plus an entry's 12), so the mark stands in their icon
     column, the text starts on their labels' edge and the scope ends where
     their keys do. */
  .query {
    flex: none;
    height: var(--s12);
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: 0 var(--s5);
    border-bottom: var(--hairline) solid var(--line-strong);
  }

  .query .lead {
    color: var(--ink-3);
  }

  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    font-size: var(--t-read);
    line-height: var(--lh-read);
  }

  input::placeholder {
    color: var(--ink-3);
  }

  /* Says the search reaches past the board in front. A quiet tint, not a
     key's raised rim, since it is not pressed. */
  .scope {
    flex: none;
    height: 20px;
    padding: 0 var(--s2);
    display: inline-flex;
    align-items: center;
    border-radius: var(--r-chip);
    color: var(--ink-3);
    background: var(--fill-hover);
    white-space: nowrap;
  }

  .results {
    padding: var(--s2);
    overflow-y: auto;
  }

  /* Set on the ink of the icons beneath it (a glyph sits 3 units into its
     16 grid); the first stands 16 below the hairline. */
  .section {
    padding: var(--s2) var(--s4) var(--s1);
    font-size: var(--t-xs);
    line-height: var(--lh-xs);
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
    border-radius: var(--r-control);
    text-align: left;
  }

  .entry.active {
    background: var(--fill-active);
  }

  .lead {
    width: 18px;
    display: inline-flex;
    justify-content: center;
    color: var(--ink-2);
  }

  .label {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .detail {
    color: var(--ink-4);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 40%;
  }

  .hint {
    font-size: var(--t-sm);
    color: var(--ink-3);
  }

  .empty {
    padding: var(--s6);
    text-align: center;
    text-wrap: balance;
    color: var(--ink-3);
  }
</style>
