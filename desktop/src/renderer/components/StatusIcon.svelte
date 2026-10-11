<script lang="ts">
  import { statusColor } from '../lib/format';

  /** -1 = backlog, 0 = not started, 1 = done; anything between draws as a pie. */
  let { progress = 0, size = 14 }: { progress?: number; size?: number } = $props();

  const color = $derived(statusColor(progress));
  const r = 3.5;
  const circumference = 2 * Math.PI * r;
</script>

<svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
  {#if progress < 0}
    <circle cx="7" cy="7" r="5.5" stroke={color} stroke-width="1.5" stroke-dasharray="1.6 2.2" />
  {:else if progress >= 1}
    <circle cx="7" cy="7" r="6" fill={color} />
    <path d="M4.4 7.2 6.2 9l3.4-3.8" stroke="var(--pane)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  {:else}
    <circle cx="7" cy="7" r="5.5" stroke={color} stroke-width="1.5" />
    {#if progress > 0}
      <circle
        cx="7"
        cy="7"
        {r}
        stroke={color}
        stroke-width={r * 2}
        stroke-dasharray={`${circumference * progress} ${circumference}`}
        transform="rotate(-90 7 7)"
      />
    {/if}
  {/if}
</svg>
