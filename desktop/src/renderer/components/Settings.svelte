<script lang="ts">
  /**
   * The app's settings (design.md, Settings): one quiet column in the pane.
   * For now, how the agents you hand work to may act: one switch for the
   * whole desk, and under it each agent's own permission modes, named as the
   * agent itself reports them.
   */
  import { app } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
  import Switch from './Switch.svelte';
  import type { AgentId } from '../../shared/api';

  let picking = $state<AgentId | null>(null);

  const installed = $derived(app.agents.filter((a) => a.available));
  const missing = $derived(app.agents.filter((a) => !a.available));

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

<div class="settings">
  <div class="column">
    <section>
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
          <Switch on={app.settings.bypass} label="Work without asking" onchange={(on) => app.setSettings({ bypass: on })} />
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
            <span class="mono note">not installed</span>
          </div>
        {/each}
      </div>
      <p class="foot">Brainfile’s own board tools never ask: each change they make is a commit on the board.</p>
    </section>
  </div>
</div>

<style>
  .settings {
    height: 100%;
    overflow-y: auto;
  }

  .column {
    max-width: 560px;
    margin: 0 auto;
    padding: var(--s6) var(--s6) var(--s12);
  }

  /* One left edge: headings and notes stand on the rows' text, not the group's rim. */
  h2,
  .lede,
  h3,
  .foot {
    padding: 0 var(--s4);
  }

  h2 {
    margin: 0;
    font-size: var(--t-lg);
    line-height: var(--lh-lg);
    font-weight: 600;
  }

  .lede {
    margin: var(--s1) 0 0;
    color: var(--ink-3);
  }

  h3 {
    margin: var(--s6) 0 0;
    font-size: var(--t-md);
    line-height: var(--lh-md);
    font-weight: 500;
    color: var(--ink-2);
  }

  .foot {
    margin: var(--s3) 0 0;
    font-size: var(--t-sm);
    line-height: var(--lh-sm);
    color: var(--ink-4);
  }

  /* A group in a pane column: a surface of its own, set in, radius 14. */
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

  .row.toggle {
    padding-right: var(--s4);
  }

  .label {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row > .name {
    flex: 1;
  }

  .name {
    font-weight: 500;
  }

  .sub {
    color: var(--ink-3);
    font-size: var(--t-sm);
    line-height: var(--lh-sm);
  }

  .note {
    padding-right: var(--s2);
    color: var(--ink-3);
  }

  /* In bypass the mode is said, not offered: the pick's words, where the pick stood. */
  .note.mode {
    color: var(--ink-3);
  }

  .off .name,
  .off .note {
    color: var(--ink-4);
  }

  .anchor {
    position: relative;
  }

  .pick {
    height: var(--control-h);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 var(--s2);
    border-radius: var(--r-control);
    color: var(--ink-2);
    transition: background var(--d-press) var(--ease);
  }

  .pick :global(svg) {
    color: var(--ink-3);
    transform: rotate(90deg);
  }

  .pick:hover {
    background: var(--fill-hover);
    color: var(--ink);
  }

  .dflt {
    color: var(--ink-4);
  }

  .catch {
    position: fixed;
    inset: 0;
    z-index: var(--z-catch);
  }

  .menu {
    position: absolute;
    z-index: var(--z-menu);
    right: 0;
    top: calc(100% + 4px);
    width: 280px;
    padding: var(--s1);
    border-radius: var(--r-card);
    background: var(--pressed);
    box-shadow: var(--top-light), var(--shadow-float);
  }

  .item {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px var(--s2);
    border-radius: var(--r-control);
    text-align: left;
  }

  .item:hover {
    background: var(--fill-hover);
  }

  .line {
    display: flex;
    align-items: center;
    gap: var(--s2);
  }

  .spacer {
    flex: 1;
  }

  .desc {
    color: var(--ink-3);
    font-size: var(--t-sm);
    line-height: var(--lh-sm);
  }
</style>
