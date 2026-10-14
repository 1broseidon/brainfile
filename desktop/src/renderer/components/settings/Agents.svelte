<script module lang="ts">
  /** Where the section stands in Settings: lower comes first. */
  export const order = 20;
</script>

<script lang="ts">
  /**
   * How the agents you hand work to may act: one switch for the whole desk,
   * and under it each agent's own permission modes, named as the agent
   * itself reports them, and the person's own agents (task-47).
   */
  import { app } from '../../lib/state.svelte';
  import AgentServers from '../AgentServers.svelte';
  import Icon from '../Icon.svelte';
  import Switch from '../Switch.svelte';
  import { isCustom } from '../../../shared/agentServers';
  import type { AgentId } from '../../../shared/api';

  let picking = $state<AgentId | null>(null);

  const installed = $derived(app.agents.filter((a) => a.available));
  /** A custom agent whose command is not found says so in its own list, below. */
  const missing = $derived(app.agents.filter((a) => !a.available && !isCustom(a.id)));

  $effect(() => {
    void app.refreshAgents();
  });

  $effect(() => {
    for (const a of installed) void app.loadModes(a.id);
  });

  function nameOf(agentId: AgentId, mode: string | null | undefined): string {
    return app.modes[agentId]?.options.find((m) => m.id === mode)?.name ?? mode ?? '';
  }

  function choose(agentId: AgentId, mode: string): void {
    // Picking the agent's own default clears the choice, so it follows the agent if that changes.
    app.chooseMode(agentId, mode === app.modes[agentId]?.initial ? null : mode);
    picking = null;
  }
</script>

<h2>Agents</h2>
<p class="lede">How the agents you hand work to may act on this Mac.</p>

<div class="group">
  <div class="row toggle">
    <span class="label">
      <span class="name">Work without asking</span>
      <span class="sub">
        {#if app.settings.bypass}
          Every agent runs in its bypass mode: any command, any file, no questions.
        {:else}
          Each agent asks the way it does in its own app.
        {/if}
      </span>
    </span>
    <span class="own"><Switch on={app.settings.bypass} label="Work without asking" onchange={(on) => app.setSettings({ bypass: on })} /></span>
  </div>
</div>

<h3>Each agent</h3>
<div class="group">
  {#each installed as a (a.id)}
    {@const modes = app.modes[a.id]}
    {@const chosen = app.settings.modes[a.id]}
    <div class="row">
      <span class="name">{a.name}</span>
      {#if modes === undefined}
        <span class="mono note">asking {a.name}…</span>
      {:else if modes === null}
        <span class="mono note">no modes to choose</span>
      {:else if app.settings.bypass}
        <span class="note mode">{modes.bypass ? nameOf(a.id, modes.bypass) : 'Allows every ask'}</span>
      {:else}
        <span class="anchor">
          <button class="pick" onclick={() => (picking = picking === a.id ? null : a.id)}>
            {nameOf(a.id, chosen ?? modes.initial)}
            {#if !chosen}<span class="mono dflt">default</span>{/if}
            <Icon name="chevron" size={10} />
          </button>
          {#if picking === a.id}
            <div class="catch" role="presentation" onmousedown={() => (picking = null)}></div>
            <div class="menu">
              {#each modes.options as m (m.id)}
                <button class="item" onclick={() => choose(a.id, m.id)}>
                  <span class="line">
                    <span>{m.name}</span>
                    {#if m.id === modes.initial}<span class="mono dflt">default</span>{/if}
                    <span class="spacer"></span>
                    {#if m.id === (chosen ?? modes.initial)}<Icon name="check" size={12} />{/if}
                  </span>
                  {#if m.description}<span class="desc">{m.description}</span>{/if}
                </button>
              {/each}
            </div>
          {/if}
        </span>
      {/if}
    </div>
  {/each}
  {#each missing as a (a.id)}
    <div class="row off">
      <span class="name">{a.name}</span>
      <span class="mono note">{a.note}</span>
    </div>
  {/each}
</div>
<p class="foot">Brainfile’s own board tools never ask: each change they make is a commit on the board.</p>

<h3>Custom agents</h3>
<div class="own"><AgentServers /></div>
<p class="foot">
  Any ACP server on this Mac, started as given, in the repository or a hand-off’s worktree, with the board’s tools. Each is an entry of
  Zed’s agent_servers, kept in dispatch.json, so one pastes across either way.
</p>
