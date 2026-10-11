<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Item {
    value: T;
    label: string;
    hint?: string;
  }

  let {
    x,
    y,
    items,
    selected,
    placeholder = 'Filter…',
    icon,
    onpick,
    onclose,
    allowCreate = false,
  }: {
    x: number;
    y: number;
    items: Item[];
    selected?: T;
    placeholder?: string;
    icon?: Snippet<[Item]>;
    onpick: (value: T | string) => void;
    onclose: () => void;
    /** Offer the typed text as a new value when nothing matches it exactly. */
    allowCreate?: boolean;
  } = $props();

  let query = $state('');
  let active = $state(0);
  let input: HTMLInputElement;
  let el: HTMLDivElement;

  const filtered = $derived(items.filter((i) => i.label.toLowerCase().includes(query.trim().toLowerCase())));
  const creating = $derived(
    allowCreate && query.trim() !== '' && !items.some((i) => i.label.toLowerCase() === query.trim().toLowerCase())
  );
  const total = $derived(filtered.length + (creating ? 1 : 0));

  // Keep the menu on screen.
  let left = $state(0);
  let top = $state(0);
  $effect(() => {
    const rect = el.getBoundingClientRect();
    left = Math.min(x, window.innerWidth - rect.width - 8);
    top = y + rect.height > window.innerHeight - 8 ? Math.max(8, y - rect.height - 36) : y;
  });

  $effect(() => {
    input?.focus();
  });

  $effect(() => {
    void query;
    active = 0;
  });

  function pick(index: number): void {
    if (index < filtered.length) onpick(filtered[index].value);
    else if (creating) onpick(query.trim());
    onclose();
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      active = (active + 1) % Math.max(total, 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      active = (active - 1 + total) % Math.max(total, 1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      pick(active);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      onclose();
      e.preventDefault();
    } else if (/^[0-9]$/.test(e.key) && query === '') {
      const n = Number(e.key);
      if (n < filtered.length) pick(n);
      e.preventDefault();
    }
    e.stopPropagation();
  }
</script>

<div class="catch" role="presentation" onmousedown={onclose}></div>
<div class="menu" bind:this={el} style:left="{left}px" style:top="{top}px" role="listbox" tabindex="-1">
  <div class="filter">
    <input bind:this={input} bind:value={query} {placeholder} {onkeydown} spellcheck="false" />
  </div>
  <div class="items">
    {#each filtered as item, i (item.label)}
      <button
        class="item"
        class:active={i === active}
        role="option"
        aria-selected={item.value === selected}
        onmouseenter={() => (active = i)}
        onclick={() => pick(i)}
      >
        {#if icon}<span class="icon">{@render icon(item)}</span>{/if}
        <span class="label">{item.label}</span>
        {#if item.value === selected}<span class="tick"><Icon name="check" size={14} /></span>{/if}
        {#if query === '' && i < 10}<span class="num">{i}</span>{/if}
      </button>
    {/each}
    {#if creating}
      <button
        class="item"
        class:active={active === filtered.length}
        onmouseenter={() => (active = filtered.length)}
        onclick={() => pick(filtered.length)}
      >
        <span class="icon"><Icon name="plus" size={14} /></span>
        <span class="label">Use “{query.trim()}”</span>
      </button>
    {/if}
    {#if total === 0}
      <div class="empty">No matches</div>
    {/if}
  </div>
</div>

<style>
  .catch {
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .menu {
    position: fixed;
    z-index: 41;
    width: 240px;
    max-height: 340px;
    display: flex;
    flex-direction: column;
    border-radius: var(--r-card);
    background: var(--pop);
    box-shadow: var(--shadow-float);
    overflow: hidden;
    animation: pop var(--d-open) var(--ease);
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(-2px) scale(0.98);
    }
  }

  .filter {
    border-bottom: 0.5px solid var(--line-strong);
  }

  .filter input {
    width: 100%;
    height: 36px;
    padding: 0 var(--s3);
    background: transparent;
    border: 0;
    font-size: var(--t-md);
  }

  .filter input::placeholder {
    color: var(--ink-3);
  }

  .items {
    padding: var(--s1);
    overflow-y: auto;
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
    color: var(--ink);
  }

  .item.active {
    background: var(--fill-active);
  }

  .icon {
    width: 16px;
    display: inline-flex;
    justify-content: center;
    color: var(--ink-2);
  }

  .label {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .tick {
    display: inline-flex;
    color: var(--ink-2);
  }

  .num {
    width: 14px;
    text-align: right;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }

  .empty {
    padding: var(--s2) var(--s3);
    color: var(--ink-3);
  }
</style>
