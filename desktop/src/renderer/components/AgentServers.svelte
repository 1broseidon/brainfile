<script lang="ts">
  /**
   * The person's own agents (task-47), in Settings under Agents: any ACP
   * server on this Mac, by a name, a command, its arguments and its
   * environment, as Zed's agent_servers has them. Added, edited and removed
   * here, or pasted whole from Zed's settings; kept in dispatch.json.
   */
  import { app } from '../lib/state.svelte';
  import { argsFrom, argsText, cleanName, commandName, customId, envFrom, envText, pastedServers } from '../../shared/agentServers';
  import type { AgentServer } from '../../shared/api';

  /** The entry being edited by its name, a new one (''), or pasting from Zed; null is the list at rest. */
  let editing = $state<string | null>(null);
  let pasting = $state(false);
  let name = $state('');
  let command = $state('');
  let args = $state('');
  let env = $state('');
  let pasted = $state('');
  let error = $state<string | null>(null);

  const entries = $derived(Object.entries(app.settings.agentServers));

  function edit(entry: string | null, server?: AgentServer): void {
    editing = entry;
    pasting = false;
    error = null;
    name = entry ?? '';
    command = server?.command ?? '';
    args = argsText(server?.args ?? []);
    env = envText(server?.env ?? {});
  }

  function paste(): void {
    editing = null;
    pasting = true;
    pasted = '';
    error = null;
  }

  function cancel(): void {
    editing = null;
    pasting = false;
    error = null;
  }

  async function save(): Promise<void> {
    if (editing === null) return;
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
      <button class="btn quiet" onclick={cancel}>Cancel</button>
      <button class="btn" onclick={save}>{editing ? 'Save' : 'Add'}</button>
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
