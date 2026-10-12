<script lang="ts">
  import { app } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';
</script>

<!-- The window's strip is the well itself: the rail's key after the lights,
     the mark at the head of the board, the search at the right. The mark's
     hard left edge stands on the same line as the board's title below it,
     so it is aligned rather than centred; with the rail closed it follows
     the key. -->
<header class="strip drag" style:--lead={app.layout.railOpen ? `${app.layout.rail + 16}px` : 'auto'}>
  <div class="left">
    <button
      class="icon-btn no-drag"
      title={app.layout.railOpen ? 'Hide projects  ⌘B' : 'Show projects  ⌘B'}
      aria-pressed={app.layout.railOpen}
      onclick={() => app.toggleRail()}
    >
      <Icon name="sidebar" size={15} />
    </button>
  </div>

  <div class="mark" class:follows={!app.layout.railOpen} title="Brainfile"><Mark size={18} /></div>

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
    grid-template-columns: var(--lead) auto 1fr;
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

  .mark {
    display: inline-flex;
    color: var(--ink-3);
    /* The box starts 10 units into its 64 grid; pull it back so its hard
       edge, not its viewBox, sits on the title's line. */
    margin-left: -2px;
  }

  .mark.follows {
    margin-left: var(--s3);
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
