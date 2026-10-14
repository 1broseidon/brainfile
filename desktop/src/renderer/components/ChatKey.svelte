<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { tip } from '../lib/tooltip';
  import Icon from './Icon.svelte';
  import Working from './Working.svelte';

  /**
   * The chat's key (design.md, Dispatch), at the end of the dock in the
   * board's bottom-right corner: it brings back the chat pane (⌘J) as it was
   * left (decision-8), and steps aside while the chat shows, the dock taking
   * its corner. While a turn runs with the chat hidden, it widens into its
   * Working line; a reply that lands meanwhile leaves a muted badge on it
   * (task-23).
   */

  const KEY = 32;

  const live = $derived(app.liveAsk);
  /** A reply that came while the chat was hidden on this board, waiting to be read. */
  const waiting = $derived(!!app.activeId && !!app.unread[app.activeId]);
  /** The Working line's width in the key; the key is the square without it. */
  let statusW = $state(0);
  const keyW = $derived(live && statusW ? statusW + KEY : KEY);
  // The dock sits beside the key, and in its corner while the chat shows.
  $effect(() => {
    app.chatKeyW = app.chatOpen ? 0 : keyW;
  });
</script>

{#if !app.chatOpen}
  <button
    class="key"
    style:width="{keyW}px"
    use:tip={waiting && !live ? 'Reply waiting' : 'Ask the board  ⌘J'}
    aria-label={waiting && !live ? 'Ask the board: reply waiting' : 'Ask the board'}
    onclick={() => app.openChat()}
  >
    <!-- A turn at work widens the key into its line, held still; the key keeps its glyph at the end. -->
    {#if live}
      <span class="at-work" bind:offsetWidth={statusW}><Working run={live} rotate={false} /></span>
    {/if}
    <span class="glyph"><Icon name="ask" size={15} /></span>
    {#if waiting && !live}
      <span class="badge" aria-hidden="true"></span>
    {/if}
  </button>
{/if}

<style>
  .key {
    position: absolute;
    z-index: var(--z-band);
    right: var(--s3);
    bottom: var(--s3);
    height: 32px;
    display: inline-flex;
    align-items: center;
    /* Widening, the line comes in from the left edge as the key opens out. */
    justify-content: flex-end;
    overflow: hidden;
    border-radius: var(--r-card);
    color: var(--ink-4);
    background: var(--canvas);
    box-shadow: inset 0 0 0 var(--hairline) var(--line);
    transition:
      width var(--d-open) var(--ease),
      color var(--d-press) var(--ease),
      background var(--d-press) var(--ease);
  }

  .at-work {
    flex: none;
    display: inline-flex;
    padding-left: 10px;
  }

  .glyph {
    flex: none;
    width: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* The one indicator at rest (design.md, Calm): a reply you have not read. Muted ink, never the accent. */
  .badge {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink-3);
  }

  .key:hover {
    color: var(--ink-2);
    background: var(--raised);
  }
</style>
