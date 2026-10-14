<script module lang="ts">
  /** Where the section stands in Settings: lower comes first. */
  export const order = 40;
</script>

<script lang="ts">
  /** How the issues view signs in to GitHub (task-26). */
  import { app } from '../../lib/state.svelte';

  let token = $state('');
  let saving = $state(false);

  const authFrom: Record<string, string> = { gh: 'gh CLI', env: 'GH_TOKEN', token: 'saved token' };

  $effect(() => {
    void app.loadGitHubAuth();
  });

  async function saveToken(value: string | null): Promise<void> {
    saving = true;
    if (await app.setGitHubToken(value)) token = '';
    saving = false;
  }
</script>

<h2>GitHub</h2>
<p class="lede">How a repository's issues are read, where its origin is on GitHub.</p>
<div class="group">
  <div class="row">
    <span class="name">Reading issues as</span>
    {#if !app.githubAuth}
      <span class="mono note">asking…</span>
    {:else if app.githubAuth.source === 'none'}
      <span class="mono note">nobody: public repositories only</span>
    {:else if app.githubAuth.error}
      <span class="mono note warn">{authFrom[app.githubAuth.source]}: {app.githubAuth.error}</span>
    {:else}
      <span class="mono note">@{app.githubAuth.login} · {authFrom[app.githubAuth.source]}</span>
    {/if}
  </div>
  <div class="row">
    <span class="name">Token</span>
    {#if app.githubAuth?.saved}
      <span class="mono note">saved in the Keychain</span>
      <button class="btn quiet" disabled={saving} onclick={() => saveToken(null)}>Remove</button>
    {:else}
      <form
        class="token"
        onsubmit={(e) => {
          e.preventDefault();
          if (token.trim()) void saveToken(token);
        }}
      >
        <input class="field mono" type="password" placeholder="github_pat_…" autocomplete="off" spellcheck="false" bind:value={token} />
        <button class="btn" type="submit" disabled={saving || !token.trim()}>{saving ? 'Checking…' : 'Save'}</button>
      </form>
    {/if}
  </div>
</div>
<p class="foot">
  The gh CLI's login is used when it is signed in; otherwise GH_TOKEN or GITHUB_TOKEN, then the token saved here. A fine-grained
  token needs read access to Issues.
</p>

<style>
  .token {
    display: flex;
    align-items: center;
    gap: var(--s2);
  }

  .token .field {
    width: 220px;
    font-size: var(--t-xs);
  }
</style>
