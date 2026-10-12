<script lang="ts">
  import { app } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';
</script>

<!-- The window's strip is the well itself: the lights, then the lockup (the
     mark and the written name), always leftmost, and the search at the
     right. The rail's key lives with the rail (see Sidebar, Workspace). -->
<header class="strip drag">
  <div class="left">
    <span class="lockup" aria-label="Brainfile">
      <span class="mark"><Mark size={16} /></span>
      <span class="name">brainfile</span>
    </span>
  </div>

  <div class="right">
    <button class="search field no-drag" onclick={() => (app.paletteOpen = true)}>
      <Icon name="search" size={13} />
      <span>Search</span>
      <kbd>⌘K</kbd>
    </button>
  </div>
</header>

<style>
  .strip {
    height: var(--strip-h);
    flex: none;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    padding: 0 var(--gap);
  }

  .left {
    /* Room for the traffic lights. */
    padding-left: 72px;
    display: flex;
    align-items: center;
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

  .right {
    display: flex;
    justify-content: flex-end;
  }

  .search {
    width: 220px;
    height: 24px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 3px 0 var(--s2);
    color: var(--ink-4);
    text-align: left;
  }

  .search:hover {
    box-shadow: inset 0 0 0 var(--hairline) var(--line-strong);
    color: var(--ink-3);
  }

  .search span {
    flex: 1;
  }

  .search kbd {
    height: 16px;
  }
</style>
