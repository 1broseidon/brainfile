<script lang="ts">
  /**
   * The person's own agents (task-47), in Settings under Agents: any ACP
   * server on this Mac, by a name, a command, its arguments and its
   * environment, as Zed's agent_servers has them. Added, edited and removed
   * here, or pasted whole from Zed's settings; kept in dispatch.json.
   */
  import { app } from '../lib/state.svelte';
  import { argsFrom, argsText, cleanName, commandName, customId, envFrom, envText, pastedServers } from '../../shared/agentServers';
  import type { AgentServer, RegistryView } from '../../shared/api';

  /** The entry being edited by its name, a new one (''), or pasting from Zed; null is the list at rest. */
  let editing = $state<string | null>(null);
  let pasting = $state(false);
  let name = $state('');
  let command = $state('');
  let args = $state('');
  let env = $state('');
  let pasted = $state('');
  let error = $state<string | null>(null);
  let registry = $state<RegistryView | null>(null);
  let loading = $state(false);
  let selected = $state('');
  let adding = $state(false);
  let registryError = $state<string | null>(null);
  const chosen = $derived(registry?.agents.find((agent) => agent.id === selected));
  const duplicate = $derived(!!chosen && chosen.name in app.settings.agentServers);

  async function loadRegistry(): Promise<void> {
    loading = true;
    try {
      registry = await window.brainfile.agentRegistry();
    } catch {
      registry = { agents: [], cached: false, warning: 'Cannot load the ACP registry. Retry or add an agent manually.' };
    } finally { loading = false; }
  }

  async function addRegistry(): Promise<void> {
    if (!chosen || duplicate || adding) return;
    const agent = chosen;
    adding = true;
    registryError = null;
    try {
      const result = await window.brainfile.prepareRegistryAgent(agent.id);
      if (!result.ok) { registryError = result.error; return; }
      // A name added while a binary downloads must not be replaced.
      if (agent.name in app.settings.agentServers) { registryError = `There is already an agent named ${agent.name}`; return; }
      await app.saveAgentServers({ ...$state.snapshot(app.settings.agentServers), [agent.name]: result.value });
      adding = false;
      cancel();
    } catch (err) {
      registryError = err instanceof Error ? err.message : 'Cannot add the agent';
    } finally { adding = false; }
  }

  const entries = $derived(Object.entries(app.settings.agentServers));

  function edit(entry: string | null, server?: AgentServer): void {
    if (adding) return;
    editing = entry;
    pasting = false;
    error = null;
    name = entry ?? '';
    command = server?.command ?? '';
    args = argsText(server?.args ?? []);
    env = envText(server?.env ?? {});
    if (entry === '') {
      selected = '';
      registryError = null;
      void loadRegistry();
    }
  }

  function paste(): void {
    if (adding) return;
    editing = null;
    pasting = true;
    pasted = '';
    error = null;
  }

  function cancel(): void {
    if (adding) return;
    editing = null;
    pasting = false;
    error = null;
  }

  async function save(): Promise<void> {
    if (editing === null || adding) return;
    const named = cleanName(name);
    const parsedEnv = envFrom(env);
    error = !named
      ? 'It needs a name'
      : named !== editing && named in app.settings.agentServers
        ? `There is already an agent named ${named}`
        : !command.trim()
          ? 'It needs a command: the server’s file, or its name on your PATH'
          : !parsedEnv.ok
            ? parsedEnv.error
            : null;
    if (error || !parsedEnv.ok) return;
    const server: AgentServer = { command: command.trim(), args: argsFrom(args), env: parsedEnv.value };
    // A renamed entry keeps its place in the list.
    const next: Record<string, AgentServer> = {};
    for (const [key, value] of entries) {
      if (key === editing) next[named] = server;
      else next[key] = value;
    }
    if (!editing) next[named] = server;
    editing = null;
    await app.saveAgentServers(next);
  }

  async function addPasted(): Promise<void> {
    const result = pastedServers(pasted);
    if (!result.ok) {
      error = result.error;
      return;
    }
    pasting = false;
    error = null;
    await app.saveAgentServers({ ...$state.snapshot(app.settings.agentServers), ...result.value });
  }

  async function remove(entry: string): Promise<void> {
    editing = null;
    await app.removeAgentServer(entry);
  }

  function onkeydown(e: KeyboardEvent, submit: () => void): void {
    if (e.key === 'Escape') cancel();
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  /** The command line as it will run, in mono. */
  const line = (server: AgentServer) => [server.command, ...server.args].join(' ');
</script>

<div class="group">
  {#each entries as [entry, server] (entry)}
    {@const info = app.agents.find((a) => a.id === customId(entry))}
    {#if editing === entry}
      {@render form()}
    {:else}
      <div class="row">
        <span class="label">
          <span class="name">{entry}</span>
          <span class="sub mono">{line(server)}</span>
        </span>
        {#if info && !info.available}<span class="mono note warn">{commandName(server.command)} not found</span>{/if}
        <button class="btn quiet" onclick={() => edit(entry, server)}>Edit</button>
      </div>
    {/if}
  {/each}
  {#if editing === ''}
    <div class="form registry" aria-busy={loading || adding}>
      <label class="field-row">
        <span class="field-name">ACP registry</span>
        <select class="field" bind:value={selected} disabled={loading || adding || !registry?.agents.length}>
          <option value="">{loading ? 'Loading agents…' : 'Choose an agent'}</option>
          {#each registry?.agents ?? [] as agent (agent.id)}
            <option value={agent.id}>{agent.name} · {agent.version}</option>
          {/each}
        </select>
      </label>
      {#if registry?.warning}
        <p class="hint" role="status">{registry.warning}</p>
      {:else if registry?.cached}
        <p class="hint">Using the saved ACP registry.</p>
      {/if}
      {#if chosen}
        <p class="hint">{chosen.description}</p>
        <p class="hint">{chosen.distribution === 'binary' ? 'Add downloads this agent to your computer.' : 'Requires Node.js and npx. The package downloads when the agent starts.'}</p>
      {/if}
      {#if duplicate}<p class="error">There is already an agent named {chosen?.name}.</p>{/if}
      {#if registryError}<p class="error" role="alert">{registryError}</p>{/if}
      <div class="actions">
        {#if registry?.warning}<button class="btn quiet" onclick={loadRegistry} disabled={loading || adding}>Retry registry</button>{/if}
        <span class="spacer"></span>
        <button class="btn" onclick={addRegistry} disabled={!chosen || duplicate || loading || adding}>{adding ? 'Adding…' : 'Add'}</button>
      </div>
    </div>
    <p class="manual">Add an agent manually</p>
    {@render form()}
  {:else if pasting}
    <!-- Esc lets the form go and ⌘↵ adds, from any of its fields. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="form" role="group" onkeydown={(e) => onkeydown(e, addPasted)}>
      <label class="field-row">
        <span class="field-name">From Zed</span>
        <!-- svelte-ignore a11y_autofocus -->
        <textarea
          class="field mono area tall"
          rows="7"
          spellcheck="false"
          autofocus
          placeholder={'"Muse Code": {\n  "command": "muse-acp",\n  "args": [],\n  "env": {}\n}'}
          bind:value={pasted}
        ></textarea>
      </label>
      <p class="hint">An entry from agent_servers in Zed’s settings, or the whole block. One with a name already here replaces it.</p>
      {#if error}<p class="error">{error}</p>{/if}
      <div class="actions">
        <span class="spacer"></span>
        <button class="btn quiet" onclick={cancel}>Cancel</button>
        <button class="btn" disabled={!pasted.trim()} onclick={addPasted}>Add</button>
      </div>
    </div>
  {:else if editing === null}
    <div class="row adds">
      {#if entries.length === 0}<span class="name none">None yet</span>{:else}<span class="spacer"></span>{/if}
      <button class="btn quiet" onclick={paste}>Paste from Zed</button>
      <button class="btn quiet" onclick={() => edit('')}>Add an agent</button>
    </div>
  {/if}
</div>

{#snippet form()}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="form" role="group" onkeydown={(e) => onkeydown(e, save)}>
    <label class="field-row">
      <span class="field-name">Name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="field" placeholder="Muse Code" spellcheck="false" autofocus bind:value={name} />
    </label>
    <label class="field-row">
      <span class="field-name">Command</span>
      <input class="field mono" placeholder="muse-acp" spellcheck="false" autocomplete="off" bind:value={command} />
    </label>
    <label class="field-row">
      <span class="field-name">Arguments</span>
      <textarea class="field mono area" rows="2" spellcheck="false" placeholder="one a line" bind:value={args}></textarea>
    </label>
    <label class="field-row">
      <span class="field-name">Environment</span>
      <textarea class="field mono area" rows="2" spellcheck="false" placeholder="KEY=value, one a line" bind:value={env}></textarea>
    </label>
    {#if error}<p class="error">{error}</p>{/if}
    <div class="actions">
      {#if editing}<button class="btn danger" onclick={() => remove(editing!)}>Remove</button>{/if}
      <span class="spacer"></span>
      <button class="btn quiet" disabled={adding} onclick={cancel}>Cancel</button>
      <button class="btn" disabled={adding} onclick={save}>{editing ? 'Save' : 'Add'}</button>
    </div>
  </div>
{/snippet}

<style>
  /* The group and its rows are Settings' own; only the form is new here. */
  .group {
    margin-top: var(--s3);
    padding: var(--s1) 0;
    border-radius: var(--r-group);
    background: var(--raised);
    box-shadow: var(--top-light);
  }

  .row {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: var(--s4);
    padding: var(--s2) var(--s2) var(--s2) var(--s4);
  }

  .row.adds {
    gap: var(--s1);
  }

  .label {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .name {
    font-weight: 500;
  }

  .none {
    flex: 1;
    font-weight: 400;
    color: var(--ink-4);
  }

  .sub {
    color: var(--ink-3);
    font-size: var(--t-xs);
    line-height: var(--lh-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note {
    padding-right: var(--s2);
    color: var(--ink-3);
  }

  .note.warn {
    color: var(--warn);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    padding: var(--s3) var(--s4);
  }

  .manual {
    margin: 0;
    padding: var(--s3) var(--s4) 0;
    color: var(--ink-3);
    border-top: 1px solid var(--fill-hover);
    font-size: var(--t-sm);
  }

  .field-row {
    display: grid;
    grid-template-columns: 96px 1fr;
    align-items: start;
    gap: var(--s3);
  }

  .field-name {
    line-height: var(--field-h);
    color: var(--ink-2);
  }

  .field.mono {
    font-size: var(--t-xs);
  }

  .area {
    height: auto;
    padding: 6px var(--s2);
    resize: vertical;
    line-height: var(--lh-sm);
  }

  .area.tall {
    min-height: 120px;
  }

  .hint,
  .error {
    margin: 0 0 0 calc(96px + var(--s3));
    font-size: var(--t-sm);
    line-height: var(--lh-sm);
    color: var(--ink-4);
  }

  .error {
    color: var(--warn);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--s1);
    margin-top: var(--s1);
  }

  .spacer {
    flex: 1;
  }
</style>
