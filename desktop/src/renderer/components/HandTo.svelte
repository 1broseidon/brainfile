<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { tip } from '../lib/tooltip';
  import { portal } from '../lib/portal';
  import Icon from './Icon.svelte';
  import Working from './Working.svelte';
  import type { AgentId } from '../../shared/api';

  /** Dispatch, the muted way: one key on a task, a short list of the person's own agents. */
  /** `waitsOn`: its dependencies still open on this board; it is handed off once they are done (decision-15). */
  /** `small`: the key under a chat reply, a step quieter than the task pane's. */
  /** `leads`: the task has open children, so the agent picked leads them (decision-15) instead of working it. */
  let { taskId, waitsOn = [], small = false, leads = false }: { taskId: string; waitsOn?: string[]; small?: boolean; leads?: boolean } = $props();

  let open = $state(false);
  let key = $state<HTMLButtonElement>();
  /** Where the menu opens: under the key, its right edge on the key's, always on screen. */
  let place = $state({ top: 0, left: 0 });
  const MENU_W = 280;
  let active = $state(0);
  const offered = $derived(app.agents);
  const run = $derived(app.runFor(taskId));

  /**
   * Where the hand-off lands (decision-16): the task's own landsOn, else what
   * it inherits, else the trunk. Picking another writes it to the task, so it
   * outlives the run.
   */
  let picking = $state(false);
  const task = $derived(app.board?.tasks.find((t) => t.id === taskId));
  const known = $derived(app.activeId ? app.branches[app.activeId] : undefined);
  const lands = $derived(task?.target?.branch ?? null);
  const landsName = $derived(lands ?? known?.trunk ?? 'the trunk');
  /** Why it lands there, when it is not its own choice. */
  const landsWhy = $derived(
    !task?.target ? 'the trunk' : task.target.epicBranch ? `${task.target.from}'s branch` : task.target.from !== taskId ? `from ${task.target.from}` : ''
  );
  /** The trunk, the branch it would land on now, recent targets, local branches, then origin's. */
  const choices = $derived.by(() => {
    const out: { branch: string | null; name: string; note: string }[] = [];
    const seen = new Set<string>();
    const add = (branch: string | null, note: string) => {
      const name = branch ?? known?.trunk ?? 'the trunk';
      if (seen.has(name)) return;
      seen.add(name);
      out.push({ branch, name, note });
    };
    add(null, 'the trunk');
    if (task?.target?.epicBranch) add(task.target.branch, `${task.target.from}'s branch`);
    const onBoard = (app.board?.tasks ?? []).map((t) => t.landsOn).filter((b): b is string => !!b);
    for (const b of [...(known?.recent ?? []), ...onBoard]) add(b, 'recent');
    for (const b of known?.local ?? []) add(b, '');
    for (const b of known?.remote ?? []) add(b, 'on origin');
    return out;
  });

  function pickBranch(branch: string | null): void {
    picking = false;
    void app.setLandsOn(taskId, branch);
  }

  function toggle(): void {
    open = !open;
    if (open && key) {
      const r = key.getBoundingClientRect();
      place = { top: r.bottom + 4, left: Math.min(Math.max(8, r.right - MENU_W), window.innerWidth - MENU_W - 8) };
    }
    picking = false;
    if (open) {
      active = Math.max(0, offered.findIndex((a) => a.id === app.defaultAgent));
      void app.refreshAgents();
      void app.refreshBranches();
    }
  }

  function pick(id: AgentId): void {
    open = false;
    void app.dispatch(taskId, id);
  }

  function onkeydown(e: KeyboardEvent): void {
    if (!open) return;
    if (picking) {
      if (e.key !== 'Escape') return;
      picking = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const step = (d: number) => {
      let i = active;
      for (let n = 0; n < offered.length; n++) {
        i = (i + d + offered.length) % offered.length;
        if (offered[i].available) break;
      }
      active = i;
    };
    if (e.key === 'ArrowDown') step(1);
    else if (e.key === 'ArrowUp') step(-1);
    else if (e.key === 'Enter' && offered[active]?.available) pick(offered[active].id);
    else if (e.key === 'Escape') open = false;
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<svelte:window onkeydown={onkeydown} />

{#if run}
  <span class="running"><Working {run} /></span>
  {#if app.runNote(run)}<span class="note mono">{app.runNote(run)}</span>{/if}
  <button class="icon-btn" use:tip={'Stop'} onclick={() => app.stopRun(run.id)}><Icon name="stop" size={13} /></button>
{:else}
  <span class="anchor">
    <button
      class="btn quiet"
      class:small
      class:on={open}
      bind:this={key}
      disabled={waitsOn.length > 0}
      use:tip={waitsOn.length ? `Waits on ${waitsOn.join(', ')}` : leads ? 'An agent leads it: checks the plan, then hands the children off in order' : ''}
      onclick={toggle}><Icon name="hand" size={13} />Hand to…</button
    >
    {#if open}
      <div class="catch" role="presentation" use:portal onmousedown={() => (open = false)}></div>
      <div class="menu" role="listbox" use:portal style:top="{place.top}px" style:left="{place.left}px" style:width="{MENU_W}px">
        {#if picking}
          <button class="head mono back" onclick={() => (picking = false)}><Icon name="back" size={12} />Lands on</button>
          <div class="branches">
            {#each choices as c (c.name)}
              <button class="item" role="option" aria-selected={c.name === landsName} onclick={() => pickBranch(c.branch)}>
                <span class="name mono clip">{c.name}</span>
                {#if c.name === landsName}<Icon name="check" size={13} />{:else}<span class="note mono">{c.note}</span>{/if}
              </button>
            {/each}
          </div>
        {:else}
          <div class="head mono">{leads ? 'Lead with' : 'Hand to'}</div>
          {#each offered as agent, i (agent.id)}
            <button
              class="item"
              class:active={i === active}
              disabled={!agent.available}
              role="option"
              aria-selected={i === active}
              onmouseenter={() => agent.available && (active = i)}
              onclick={() => pick(agent.id)}
            >
              <span class="name">{agent.name}</span>
              <span class="note mono">{agent.available && app.modelFor(agent.id) ? app.modelNote(agent.id) : agent.note}</span>
            </button>
          {/each}
          <!-- Where its work lands (decision-16): the trunk unless the task, or what it is under, names a branch. -->
          <button class="item lands" use:tip={'Where the hand-off forks from and merges into; kept on the task'} onclick={() => (picking = true)}>
            <span class="label">Lands on</span>
            <span class="name mono clip">{landsName}</span>
            {#if landsWhy}<span class="note mono">{landsWhy}</span>{/if}
            <Icon name="chevron" size={12} />
          </button>
        {/if}
      </div>
    {/if}
  </span>
{/if}

<style>
  .running {
    color: var(--ink-3);
    margin-right: var(--s1);
  }

  .running + .note {
    margin-right: var(--s1);
  }

  .btn.small {
    height: 22px;
    padding: 0 var(--s2);
    gap: 4px;
    font-size: var(--t-sm);
  }

  .btn.on {
    background: var(--fill-hover);
    color: var(--ink);
  }

  .anchor {
    position: relative;
    display: inline-flex;
  }

  .catch {
    position: fixed;
    inset: 0;
    z-index: var(--z-catch);
  }

  /* Lifted to the body, so no pane clips it. */
  .menu {
    position: fixed;
    z-index: var(--z-menu);
    padding: var(--s1);
    border-radius: var(--r-card);
    background: var(--pop);
    box-shadow: var(--top-light), var(--shadow-float);
    animation: open var(--d-open) var(--ease);
  }

  @keyframes open {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }

  .head {
    padding: var(--s2) var(--s2) var(--s1);
    color: var(--ink-3);
  }

  .item {
    width: 100%;
    height: 32px;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: 0 var(--s2);
    border-radius: var(--r-control);
    text-align: left;
  }

  .item.active:not(:disabled) {
    background: var(--fill-hover);
  }

  .item:disabled {
    color: var(--ink-4);
  }

  .name {
    flex: 1;
    font-weight: 500;
  }

  .item:disabled .name {
    font-weight: 400;
  }

  .note {
    color: var(--ink-4);
  }

  .lands {
    margin-top: var(--s1);
    box-shadow: inset 0 var(--hairline) 0 var(--line);
    border-radius: 0 0 var(--r-control) var(--r-control);
    color: var(--ink-2);
  }

  .lands:hover,
  .branches .item:hover {
    background: var(--fill-hover);
  }

  .label {
    flex: none;
    color: var(--ink-3);
  }

  .lands .name {
    font-weight: 400;
  }

  .branches {
    max-height: 280px;
    overflow-y: auto;
  }

  .branches .name {
    font-weight: 400;
  }

  .back {
    display: flex;
    align-items: center;
    gap: var(--s1);
    width: 100%;
    text-align: left;
  }

  .back:hover {
    color: var(--ink);
  }

  .clip {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
