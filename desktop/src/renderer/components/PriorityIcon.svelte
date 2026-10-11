<script lang="ts">
  import type { Priority } from '../../shared/api';

  let { priority, size = 14 }: { priority?: Priority | null; size?: number } = $props();

  const level = $derived(priority === 'high' ? 3 : priority === 'medium' ? 2 : priority === 'low' ? 1 : 0);
</script>

<svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
  {#if priority === 'critical'}
    <rect x="1" y="1" width="12" height="12" rx="3" fill="var(--priority-urgent)" />
    <rect x="6.25" y="3.5" width="1.5" height="4.5" rx="0.75" fill="var(--pane)" />
    <circle cx="7" cy="10" r="0.9" fill="var(--pane)" />
  {:else if level === 0}
    {#each [0, 1, 2] as i (i)}
      <rect x={1.5 + i * 4} y="6.25" width="3" height="1.5" rx="0.75" fill="var(--ink-4)" />
    {/each}
  {:else}
    {#each [0, 1, 2] as i (i)}
      <rect
        x={1.5 + i * 4}
        y={10 - (i + 1) * 3 + 1}
        width="3"
        height={(i + 1) * 3}
        rx="1"
        fill={i < level ? 'var(--ink-2)' : 'var(--ink-4)'}
      />
    {/each}
  {/if}
</svg>
