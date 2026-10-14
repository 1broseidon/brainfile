<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { tip } from '../lib/tooltip';
  import Icon from './Icon.svelte';
  import Working from './Working.svelte';

  /**
   * The chat's key (design.md, Dispatch), at the strip's right end above the
   * chat pane: it shows and hides the chat (⌘J), which comes back as it was
   * left (decision-8). While a turn runs with the chat hidden, it widens into
   * its Working line; a reply that lands meanwhile leaves a muted badge on it
   * (task-23).
   */

  const live = $derived(app.liveAsk);
  /** A reply that came while the chat was hidden on this board, waiting to be read. */
  const waiting = $derived(!!app.activeId && !!app.unread[app.activeId] && !app.chatOpen);
  const working = $derived(!!live && !app.chatOpen);
  const label = $derived(app.chatOpen ? 'Hide chat' : waiting && !working ? 'Reply waiting' : 'Ask the board');
</script>

<button
  class="key no-drag"
  class:open={app.chatOpen}
  use:tip={`${label}  ⌘J`}
  aria-label={label}
  aria-pressed={app.chatOpen}
  onclick={() => (app.chatOpen ? (app.chatOpen = false) : app.openChat())}
>
  <!-- A turn at work with the chat hidden widens the key into its line, held still; the glyph stays at the end. -->
  {#if working && live}
    <span class="at-work"><Working run={live} rotate={false} /></span>
  {/if}
  <span class="glyph"><Icon name="ask" size={13} /></span>
  {#if waiting && !working}
    <span class="badge" aria-hidden="true"></span>
  {/if}
</button>

<style>
  /* Drawn as the strip's other keys are: square at rest, a fill while the chat shows. */
  .key {
    position: relative;
    height: 24px;
    min-width: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    border-radius: var(--r-control);
    color: var(--ink-4);
    transition: background var(--d-press) var(--ease), color var(--d-press) var(--ease);
  }

  .key:hover,
  .open {
    background: var(--fill-hover);
    color: var(--ink-2);
  }

  .at-work {
    flex: none;
    display: inline-flex;
    padding: 0 2px 0 var(--s2);
    color: var(--ink-3);
  }

  .glyph {
    flex: none;
    width: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* The one indicator at rest (design.md, Calm): a reply you have not read. Muted ink, never the accent. */
  .badge {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink-3);
  }
</style>
