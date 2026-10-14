<script module lang="ts">
  /** Where the section stands in Settings: lower comes first. */
  export const order = 50;
</script>

<script lang="ts">
  /** The phone link (task-40): on or off, a phone to link, the phones linked. */
  import { app } from '../../lib/state.svelte';
  import { relativeTime } from '../../lib/format';
  import Icon from '../Icon.svelte';
  import LinkPhone from '../LinkPhone.svelte';
  import Switch from '../Switch.svelte';

  $effect(() => {
    void app.loadLink();
  });

  /** Link a phone's code is open under the switch. */
  let pairing = $state(false);
  /** Forget asks once, in place, for a few seconds: the phone has to scan again to come back. */
  let forgetting = $state<string | null>(null);
  let forgetTimer: ReturnType<typeof setTimeout> | null = null;

  function forget(key: string): void {
    if (forgetTimer) clearTimeout(forgetTimer);
    if (forgetting !== key) {
      forgetting = key;
      forgetTimer = setTimeout(() => (forgetting = null), 4000);
      return;
    }
    forgetting = null;
    void app.forgetPhone(key);
  }

  /** Newest first. */
  const phones = $derived([...(app.link?.phones ?? [])].sort((a, b) => b.pairedAt - a.pairedAt));
</script>

<h2>Phone</h2>
<p class="lede">Boards and agents, on your phone.</p>
<div class="group">
  <div class="row toggle">
    <span class="label">
      <span class="name">Phone link</span>
      {#if app.link?.on && app.link.error}<span class="sub warn">{app.link.error}</span>{/if}
    </span>
    <span class="own"><Switch on={!!app.link?.on} label="Phone link" onchange={(on) => app.setLink(on)} /></span>
  </div>
  {#if pairing}
    <div class="own"><LinkPhone onclose={() => (pairing = false)} /></div>
  {:else}
    <button class="row add" onclick={() => (pairing = true)}>
      <Icon name="plus" size={14} />Link a phone
    </button>
  {/if}
</div>

{#if phones.length}
  <h3>Linked phones</h3>
  <div class="group">
    {#each phones as phone (phone.key)}
      <div class="row phone" class:asking={forgetting === phone.key}>
        <span class="name">{phone.name}</span>
        <span class="mono note">{phone.connected ? 'connected' : `seen ${relativeTime(new Date(phone.lastSeen).toISOString())}`}</span>
        <button class="btn danger forget" onclick={() => forget(phone.key)}>{forgetting === phone.key ? 'Forget phone?' : 'Forget'}</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Forget waits for the hand, in space already kept for it. */
  .forget {
    opacity: 0;
    transition: opacity var(--d-press) var(--ease);
  }

  .phone:hover .forget,
  .phone:focus-within .forget,
  .phone.asking .forget {
    opacity: 1;
  }
</style>
