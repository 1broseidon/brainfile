<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { tip } from '../lib/tooltip';
  import { portal } from '../lib/portal';
  import Icon from './Icon.svelte';
  import Working from './Working.svelte';
  import type { AgentId } from '../../shared/api';

  /** Dispatch, the muted way: one key on a task, a short list of the person's own agents. */
  let { taskId }: { taskId: string } = $props();

  let open = $state(false);
  let key = $state<HTMLButtonElement>();
  /** Where the menu opens: under the key, its right edge on the key's, always on screen. */
  let place = $state({ top: 0, left: 0 });
  const MENU_W = 280;
  let active = $state(0);
  const offered = $derived(app.agents);
  const run = $derived(app.runFor(taskId));

  function toggle(): void {
    open = !open;
    if (open && key) {
      const r = key.getBoundingClientRect();
      place = { top: r.bottom + 4, left: Math.min(Math.max(8, r.right - MENU_W), window.innerWidth - MENU_W - 8) };
    }
    if (open) {
      active = Math.max(0, offered.findIndex((a) => a.id === app.defaultAgent));
      void app.refreshAgents();
    }
  }

  function pick(id: AgentId): void {
    open = false;
    void app.dispatch(taskId, id);
  }

  function onkeydown(e: KeyboardEvent): void {
    if (!open) return;
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
  <button class="icon-btn" use:tip={'Stop'} onclick={() => app.stopRun(run.id)}><Icon name="stop" size={13} /></button>
{:else}
  <span class="anchor">
    <button class="btn quiet" class:on={open} bind:this={key} onclick={toggle}><Icon name="hand" size={13} />Hand to…</button>
    {#if open}
      <div class="catch" role="presentation" use:portal onmousedown={() => (open = false)}></div>
      <div class="menu" role="listbox" use:portal style:top="{place.top}px" style:left="{place.left}px" style:width="{MENU_W}px">
        <div class="head mono">Hand to</div>
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
      </div>
    {/if}
  </span>
{/if}

<style>
  .running {
    color: var(--ink-3);
    margin-right: var(--s1);
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
</style>
