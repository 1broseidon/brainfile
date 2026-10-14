<script module lang="ts">
  /** Where the section stands in Settings: first, where the settings key's badge leads. */
  export const order = 5;
</script>

<script lang="ts">
  /**
   * Updates (task-71), after Hotline's Settings › Updates: this version, a
   * later one and what it brings, and installing it in place. The restart
   * waits while agents are at work, unless the person says now.
   */
  import { api, app } from '../../lib/state.svelte';
  import { relativeTime } from '../../lib/format';
  import { renderMarkdown } from '../../lib/markdown';

  const u = $derived(app.update);
  const next = $derived(u?.available ?? null);
  const percent = $derived(u?.total ? Math.min(100, Math.round((u.downloaded / u.total) * 100)) : 0);

  async function check(): Promise<void> {
    app.update = await api.checkUpdate();
  }

  async function install(): Promise<void> {
    if (next) app.update = await api.installUpdate(next.version);
  }
</script>

<h2>Updates</h2>
<p class="lede">Brainfile {u?.current ?? ''}{next ? `, and ${next.version} is out.` : '.'}</p>
<div class="group">
  {#if !u}
    <div class="row"><span class="name">This version</span><span class="mono note">asking…</span></div>
  {:else if next}
    <div class="row">
      <span class="label">
        <span class="name">Brainfile {next.version}</span>
        <span class="sub" class:warn={!!u.error}>
          {#if u.phase === 'downloading'}
            Downloading, {percent}%
          {:else if u.phase === 'installing'}
            Checking the download
          {:else if u.phase === 'waiting'}
            Restarts when {u.waitingFor === 1 ? 'the agent at work finishes' : `the ${u.waitingFor} agents at work finish`}
          {:else if u.phase === 'restarting'}
            Restarting
          {:else if u.error}
            {u.error}
          {:else if u.disabledReason}
            {u.disabledReason}
          {:else}
            Installs in place, then Brainfile restarts.
          {/if}
        </span>
      </span>
      {#if u.phase === 'downloading' || u.phase === 'installing'}
        <button class="btn quiet" onclick={() => api.cancelUpdate()}>Cancel</button>
      {:else if u.phase === 'waiting'}
        <button class="btn quiet" onclick={() => api.cancelUpdate()}>Cancel</button>
        <button class="btn" onclick={() => api.restartToUpdate()}>Restart now</button>
      {:else if u.phase === 'idle' && !u.disabledReason}
        <button class="btn primary" onclick={install}>Update to {next.version}</button>
      {/if}
    </div>
    {#if u.phase === 'downloading'}
      <div class="bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style:width="{percent}%"></span></div>
    {/if}
  {:else}
    <div class="row">
      <span class="label">
        <span class="name">Up to date</span>
        <span class="sub" class:warn={!!u.error}>
          {#if u.error}
            {u.error}
          {:else if u.disabledReason}
            {u.disabledReason}
          {:else if u.checkedAt}
            Checked {relativeTime(new Date(u.checkedAt).toISOString())}
          {:else}
            Not checked yet
          {/if}
        </span>
      </span>
      {#if !u.disabledReason}
        <button class="btn quiet" disabled={u.phase === 'checking'} onclick={check}>{u.phase === 'checking' ? 'Checking…' : 'Check now'}</button>
      {/if}
    </div>
  {/if}
</div>
{#if next?.notes}
  <h3>What's new in {next.version}</h3>
  <div class="notes md">{@html renderMarkdown(next.notes)}</div>
{/if}
<p class="foot">Checked a little after Brainfile starts and every six hours, from its GitHub releases. Each update is signed, and checked before it is installed.</p>

<style>
  .bar {
    height: 3px;
    margin: 0 var(--s4) var(--s3);
    border-radius: 2px;
    background: var(--fill-hover);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width var(--d-press) var(--ease);
  }

  .notes {
    margin-top: var(--s2);
    padding: 0 var(--s4);
    color: var(--ink-2);
    font-size: var(--t-sm);
    line-height: var(--lh-sm);
  }
</style>
