<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { projectHue } from '../lib/format';
  import Icon from './Icon.svelte';
  import type { Project } from '../../shared/api';

  function count(project: Project): number | null {
    const board = app.boards[project.id];
    return board ? board.tasks.length : null;
  }

  function stateHint(project: Project): string | null {
    switch (project.state.status) {
      case 'no-board':
        return 'No board';
      case 'legacy':
        return 'v1';
      case 'missing':
        return 'Missing';
      case 'error':
        return 'Error';
      default:
        return null;
    }
  }
</script>

<aside class="sidebar">
  <div class="top drag"></div>

  <div class="brand">
    <span class="mark">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="16" height="16" rx="4.5" fill="var(--accent)" />
        <path d="M5.5 6.5h7M5.5 9h7M5.5 11.5h4" stroke="white" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </span>
    <span class="name">Brainfile</span>
  </div>

  <button class="search no-drag" onclick={() => (app.paletteOpen = true)}>
    <Icon name="search" size={14} />
    <span>Search or jump to…</span>
    <kbd>⌘K</kbd>
  </button>

  <div class="section">
    <div class="section-head">
      <span>Projects</span>
      <button class="icon-btn small" title="Add project (⌘O)" onclick={() => app.addProject()}>
        <Icon name="plus" size={14} />
      </button>
    </div>

    <nav class="projects">
      {#each app.projects as project, i (project.id)}
        {@const active = project.id === app.activeId}
        {@const hint = stateHint(project)}
        {@const n = count(project)}
        <button
          class="project"
          class:active
          class:dim={hint !== null}
          title={project.path}
          onclick={() => app.select(project.id)}
        >
          <span class="glyph" style:--hue={projectHue(project.name)}>{project.name.slice(0, 1).toUpperCase()}</span>
          <span class="label">{project.name}</span>
          {#if hint}
            <span class="meta hint">{hint}</span>
          {:else if n !== null}
            <span class="meta tabular">{n}</span>
          {:else if i < 9}
            <span class="meta shortcut">⌘{i + 1}</span>
          {/if}
        </button>
      {/each}
    </nav>

    {#if app.loaded && app.projects.length === 0}
      <button class="add-first" onclick={() => app.addProject()}>
        <Icon name="plus" size={14} />
        Add a project
      </button>
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    width: var(--sidebar-w);
    flex: none;
    display: flex;
    flex-direction: column;
    padding: 0 var(--s3) var(--s3);
    gap: var(--s1);
  }

  .top {
    height: 40px;
    flex: none;
    margin: 0 calc(-1 * var(--s3));
  }

  .brand {
    height: 32px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2);
    margin-bottom: var(--s1);
  }

  .mark {
    display: inline-flex;
  }

  .name {
    font-weight: 600;
    font-size: var(--text-md);
    letter-spacing: -0.01em;
  }

  .search {
    height: 30px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2);
    border-radius: var(--r-md);
    color: var(--ink-3);
    font-size: var(--text-md);
    background: rgba(255, 255, 255, 0.035);
    box-shadow: inset 0 0 0 0.5px var(--line);
    transition: background var(--fast) var(--ease);
  }

  .search:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--ink-2);
  }

  .search span {
    flex: 1;
    text-align: left;
  }

  .section {
    margin-top: var(--s4);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .section-head {
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--s1) 0 var(--s2);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--ink-3);
  }

  .icon-btn.small {
    width: 22px;
    height: 22px;
  }

  .projects {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow-y: auto;
  }

  .project {
    height: 30px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2);
    border-radius: var(--r-md);
    color: var(--ink-2);
    text-align: left;
    transition: background var(--fast) var(--ease), color var(--fast) var(--ease);
  }

  .project:hover {
    background: var(--hover-strong);
    color: var(--ink);
  }

  .project.active {
    background: rgba(255, 255, 255, 0.08);
    color: var(--ink);
  }

  .project.dim .label {
    color: var(--ink-3);
  }

  .glyph {
    width: 18px;
    height: 18px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 650;
    color: hsl(var(--hue) 80% 90%);
    background: hsl(var(--hue) 45% 36%);
    box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.14);
  }

  .label {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .meta {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }

  .meta.shortcut {
    opacity: 0;
    transition: opacity var(--fast) var(--ease);
  }

  .project:hover .meta.shortcut {
    opacity: 1;
  }

  .add-first {
    height: 30px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2);
    border-radius: var(--r-md);
    color: var(--ink-3);
  }

  .add-first:hover {
    background: var(--hover-strong);
    color: var(--ink);
  }
</style>
