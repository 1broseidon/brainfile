<script lang="ts">
  import type { Priority } from '../../shared/api';

  /** Bars in the priority's signal colour. No priority draws nothing unless `placeholder`. */
  let { priority, size = 14, placeholder = false }: { priority?: Priority | null; size?: number; placeholder?: boolean } =
    $props();

  const level = $derived(priority === 'critical' ? 3 : priority === 'high' ? 3 : priority === 'medium' ? 2 : priority === 'low' ? 1 : 0);
  const color = $derived(
    priority === 'critical' ? 'var(--p-urgent)' : priority === 'high' ? 'var(--p-high)' : priority === 'medium' ? 'var(--p-medium)' : 'var(--ink-3)'
  );
</script>

{#if priority === 'critical'}
  <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
    <rect x="1" y="1" width="12" height="12" rx="3.5" fill="var(--p-urgent)" />
    <rect x="6.25" y="3.4" width="1.5" height="4.6" rx="0.75" fill="var(--canvas)" />
    <circle cx="7" cy="10.1" r="0.95" fill="var(--canvas)" />
  </svg>
{:else if level > 0 || placeholder}
  <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
    {#each [0, 1, 2] as i (i)}
      <rect
        x={1.5 + i * 4}
        y={11 - (i + 1) * 3}
        width="3"
        height={(i + 1) * 3}
        rx="1"
        fill={i < level ? color : 'var(--line-strong)'}
      />
    {/each}
  </svg>
{:else}
  <span style:width="{size}px" style:height="{size}px" style:display="inline-block"></span>
{/if}
