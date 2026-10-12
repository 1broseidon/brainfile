<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { tildify } from '../lib/format';
  import Icon from './Icon.svelte';
  import type { Project } from '../../shared/api';

  function line(project: Project): string {
    switch (project.state.status) {
      case 'no-board':
        return 'no board yet';
      case 'legacy':
        return 'v1 board, needs migrate';
      case 'missing':
        return 'folder missing';
      case 'error':
        return 'could not read';
      default: {
        const board = app.boards[project.id];
        if (board) return `${board.tasks.length} open`;
        return project.state.storage === 'linked' ? 'branch' : project.state.storage === 'standalone' ? 'repo' : 'files';
      }
    }
  }

  /** Where the board lives: on the brainfile branch (or its own repo), or in plain files. */
  function storageIcon(project: Project): 'git' | 'folder' {
    return project.state.status === 'ready' && project.state.storage !== 'plain' ? 'git' : 'folder';
  }

  function storageWord(project: Project): string {
    if (project.state.status !== 'ready') return '';
    return project.state.storage === 'linked' ? 'on the brainfile branch' : project.state.storage === 'standalone' ? 'its own repo' : 'plain files';
  }
</script>

<!-- The rail stands directly in the well. -->
<aside class="rail" style:width="{app.layout.rail}px">
  <div class="head">
    <span>Projects</span>
    <span class="keys">
      <button class="icon-btn" title="Add project  ⌘O" onclick={() => app.addProject()}>
        <Icon name="plus" size={14} />
      </button>
      <button class="icon-btn" title="Hide projects  ⌘B" onclick={() => app.toggleRail()}>
        <Icon name="sidebar" size={14} />
      </button>
    </span>
  </div>

  <nav class="projects">
    {#each app.projects as project, i (project.id)}
      {@const active = project.id === app.activeId}
      {@const ready = project.state.status === 'ready'}
      <button class="project" class:active title="{tildify(project.path)} · {storageWord(project) || line(project)}" onclick={() => app.select(project.id)}>
        <span class="where"><Icon name={storageIcon(project)} size={14} /></span>
        <span class="name">{project.name}</span>
        <span class="line mono" class:off={!ready}>{line(project)}</span>
        {#if i < 9}<span class="key mono">⌘{i + 1}</span>{/if}
      </button>
    {/each}

    {#if app.loaded && app.projects.length === 0}
      <!-- The one accent in the rail: adding is what an empty list is for. -->
      <button class="add" onclick={() => app.addProject()}>
        <Icon name="plus" size={14} />
        Add a project
      </button>
    {/if}
  </nav>
</aside>

<style>
  .rail {
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0 0 var(--gap) var(--gap);
  }

  .head {
    height: var(--band-h);
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--s1) 0 var(--s3);
    font-weight: 600;
  }

  .keys {
    display: inline-flex;
    gap: 2px;
  }

  .projects {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
  }

  .project {
    position: relative;
    display: grid;
    grid-template-columns: 16px 1fr auto;
    column-gap: var(--s2);
    row-gap: 2px;
    padding: 7px var(--s3) 8px;
    border-radius: var(--r-card);
    text-align: left;
    transition: background var(--d-press) var(--ease);
  }

  .project:hover,
  .project:focus-visible {
    background: var(--fill-hover);
  }

  .project.active {
    background: var(--fill-selected);
  }

  .where {
    grid-column: 1;
    grid-row: 1;
    display: inline-flex;
    align-items: center;
    color: var(--ink-3);
  }

  .project.active .where {
    color: var(--ink-2);
  }

  .name {
    grid-column: 2;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
    color: var(--ink);
  }

  .line {
    grid-column: 2;
    color: var(--ink-3);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .line.off {
    color: var(--ink-4);
  }

  .key {
    grid-column: 3;
    grid-row: 1;
    align-self: center;
    color: var(--ink-4);
    opacity: 0;
    transition: opacity var(--d-press) var(--ease);
  }

  .project:hover .key {
    opacity: 1;
  }

  .add {
    height: 36px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s3);
    border-radius: var(--r-card);
    color: var(--accent-ink);
    font-weight: 500;
  }

  .add:hover {
    background: var(--fill-hover);
  }
</style>
