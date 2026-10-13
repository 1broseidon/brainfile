<script lang="ts">
  /**
   * Link a phone (design.md, Phone): a pairing code to scan, the same text
   * to copy, and how long it is good for. A code that runs out is replaced
   * while the panel is open; a phone let in by it is named, and the panel
   * closes.
   */
  import { app } from '../lib/state.svelte';
  import { tip } from '../lib/tooltip';
  import Icon from './Icon.svelte';
  import QrCode from './QrCode.svelte';
  import type { PairingCode } from '../../shared/api';

  let { onclose }: { onclose: () => void } = $props();

  /** How long `Linked · iPhone 16 Pro` stays before the panel closes. */
  const LINKED_MS = 1600;
  const COPIED_MS = 1200;

  const openedAt = Date.now();
  let code = $state<PairingCode | null>(null);
  let error = $state<string | null>(null);
  let now = $state(Date.now());
  let copied = $state(false);

  async function fresh(): Promise<void> {
    const result = await app.linkCode();
    if (result.ok) {
      // The code turned the link on; hear that before the code is shown.
      await app.loadLink();
      now = Date.now();
      code = result.value;
      error = null;
    } else {
      code = null;
      error = result.error;
    }
  }

  $effect(() => {
    void fresh();
    const timer = setInterval(() => (now = Date.now()), 5000);
    return () => clearInterval(timer);
  });

  // A code that has run out is replaced, so what is on screen always works.
  $effect(() => {
    if (code && now >= code.expiresAt) void fresh();
  });

  const minutes = $derived(code ? Math.max(1, Math.ceil((code.expiresAt - now) / 60_000)) : 0);

  /** The phone this code let in, once one has. */
  const linked = $derived(app.link?.paired && app.link.paired.at >= openedAt ? app.link.paired.name : null);

  $effect(() => {
    if (!linked) return;
    const timer = setTimeout(onclose, LINKED_MS);
    return () => clearTimeout(timer);
  });

  // Off retires the code: there is nothing left to scan.
  $effect(() => {
    if (app.link && !app.link.on && code) onclose();
  });

  async function copy(): Promise<void> {
    if (!code) return;
    await navigator.clipboard.writeText(code.link);
    copied = true;
    setTimeout(() => (copied = false), COPIED_MS);
  }
</script>

<div class="panel" class:spent={!!linked}>
  {#if code}
    <QrCode text={code.link} />
  {:else}
    <div class="plate" aria-hidden="true"></div>
  {/if}
  <div class="side">
    {#if linked}
      <span class="linked"><Icon name="check" size={14} />Linked · {linked}</span>
    {:else if error}
      <span class="mono warn">{error}</span>
    {:else}
      <span class="title">Scan on your phone</span>
      <span class="spacer"></span>
      <button class="btn" disabled={!code} onclick={copy}>
        <Icon name="copy" size={13} />{copied ? 'Copied' : 'Copy link'}
      </button>
      <span class="mono valid">{code ? `Valid ${minutes} min` : ' '}</span>
    {/if}
  </div>
  <button class="icon-btn close" use:tip={'Close'} aria-label="Close" onclick={onclose}>
    <Icon name="close" size={14} />
  </button>
</div>

<style>
  /* In the group, under the switch: the code on its plate, and beside it what to do with it. */
  .panel {
    position: relative;
    display: flex;
    gap: var(--s5);
    padding: var(--s3) var(--s4) var(--s4);
  }

  /* A code that has let its phone in is spent: it steps back while the panel says who. */
  .panel :global(.qr) {
    transition: opacity var(--d-move) var(--ease);
  }

  .spent :global(.qr) {
    opacity: 0.2;
  }

  .plate {
    width: 184px;
    height: 184px;
    flex: none;
    border-radius: var(--r-card);
    background: var(--qr-plate);
    opacity: 0.12;
  }

  .side {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--s2);
    padding-top: var(--s1);
  }

  .title {
    font-weight: 500;
  }

  .spacer {
    flex: 1;
  }

  .valid {
    color: var(--ink-4);
  }

  .warn {
    color: var(--warn);
  }

  .linked {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
  }

  .linked :global(svg) {
    color: var(--ok);
  }

  /* On the title's line, its glyph on the switch's right edge above it. */
  .close {
    position: absolute;
    top: var(--s3);
    right: calc(var(--s4) - (var(--control-h) - 14px) / 2);
  }
</style>
