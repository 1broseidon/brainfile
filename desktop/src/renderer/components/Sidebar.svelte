<script lang="ts">
  import { app } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';
  import type { Project } from '../../shared/api';

  function count(project: Project): number | null {
    const board = app.boards[project.id];
    return board ? board.tasks.length : null;
  }

  function hint(project: Project): string | null {
    switch (project.state.status) {
      case 'no-board':
        return 'no board';
      case 'legacy':
        return 'v1';
      case 'missing':
        return 'missing';
      case 'error':
        return 'error';
      default:
        return null;
    }
  }

  function storageIcon(project: Project): 'git' | 'folder' {
    return project.state.status === 'ready' && project.state.storage !== 'plain' ? 'git' : 'folder';
  }
</script>

<aside class="sidebar">
  <div class="lights drag"></div>

  <div class="brand drag">
    <Mark size={16} />
    <span class="wordmark">brainfile</span>
  </div>

  <button class="search" onclick={() => (app.paletteOpen = true)}>
    <Icon name="search" size={14} />
    <span>Search</span>
    <kbd>⌘K</kbd>
  </button>

  <div class="head">
    <span>Projects</span>
    <button class="icon-btn small" title="Add project  ⌘O" onclick={() => app.addProject()}>
      <Icon name="plus" size={14} />
    </button>
  </div>

  <nav class="projects">
    {#each app.projects as project, i (project.id)}
      {@const active = project.id === app.activeId}
      {@const note = hint(project)}
      {@const n = count(project)}
      <button class="project" class:active class:dim={note !== null} title={project.path} onclick={() => app.select(project.id)}>
        <span class="kind"><Icon name={storageIcon(project)} size={14} /></span>
        <span class="label">{project.name}</span>
        {#if note}
          <span class="meta mono">{note}</span>
        {:else if n !== null}
          <span class="meta mono tabular">{n}</span>
        {:else if i < 9}
          <span class="meta mono key">⌘{i + 1}</span>
        {/if}
      </button>
    {/each}
    {#if app.loaded && app.projects.length === 0}
      <button class="project add" onclick={() => app.addProject()}>
        <span class="kind"><Icon name="plus" size={14} /></span>
        <span class="label">Add a project</span>
      </button>
    {/if}
  </nav>
</aside>

<style>
  .sidebar {
    width: var(--sidebar-w);
    flex: none;
    display: flex;
    flex-direction: column;
    padding: 0 var(--s2) var(--s3) var(--s3);
  }

  .lights {
    height: var(--bar-h);
    flex: none;
    margin-right: calc(-1 * var(--s2));
  }

  .brand {
    height: 28px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 var(--s2);
    margin-bottom: var(--s3);
  }

  .wordmark {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.035em;
    color: var(--ink);
  }

  .search {
    height: 30px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 6px 0 var(--s2);
    border-radius: var(--r-control);
    color: var(--ink-3);
    background: var(--canvas);
    box-shadow: var(--top-light), inset 0 0 0 var(--hairline) var(--line);
    transition: color var(--d-press) var(--ease);
  }

  .search:hover {
    color: var(--ink-2);
  }

  .search span {
    flex: 1;
    text-align: left;
  }

  .head {
    height: 28px;
    margin-top: var(--s5);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0 0 var(--s2);
    font-size: var(--t-meta);
    font-weight: 500;
    color: var(--ink-3);
  }

  .icon-btn.small {
    width: 24px;
    height: 24px;
  }

  .projects {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow-y: auto;
  }

  .project {
    position: relative;
    height: 30px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2);
    border-radius: var(--r-control);
    color: var(--ink-2);
    text-align: left;
    transition: background var(--d-press) var(--ease), color var(--d-press) var(--ease);
  }

  .project:hover {
    background: var(--fill-hover);
    color: var(--ink);
  }

  .project.active {
    background: var(--fill-active);
    color: var(--ink);
  }

  /* The TUI's ▌ cursor. */
  .project.active::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 8px;
    bottom: 8px;
    width: 2px;
    border-radius: 1px;
    background: var(--accent);
  }

  .project.dim .label {
    color: var(--ink-3);
  }

  .kind {
    display: inline-flex;
    color: var(--ink-3);
  }

  .project.active .kind {
    color: var(--ink-2);
  }

  .label {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .meta {
    color: var(--ink-4);
  }

  .meta.key {
    opacity: 0;
    transition: opacity var(--d-press) var(--ease);
  }

  .project:hover .meta.key {
    opacity: 1;
  }

  .project.add {
    color: var(--ink-3);
  }
</style>
