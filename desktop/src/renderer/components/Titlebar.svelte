<script lang="ts">
  import { app } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';
</script>

<!-- The window's strip is the well itself: the lights, the rail's key, then
     the lockup (the mark and the written name) in the left corner, the
     search at the right. -->
<header class="strip drag">
  <div class="left">
    <button
      class="icon-btn no-drag"
      title={app.layout.railOpen ? 'Hide projects  ⌘B' : 'Show projects  ⌘B'}
      aria-pressed={app.layout.railOpen}
      onclick={() => app.toggleRail()}
    >
      <Icon name="sidebar" size={15} />
    </button>
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

  .left .icon-btn {
    width: 26px;
    height: 24px;
  }

  .lockup {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: var(--s2);
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
