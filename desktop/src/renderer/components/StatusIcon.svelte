<script lang="ts">
  /**
   * The checkbox from the mark. -1 backlog (dashed), 0 open, between: a level
   * rising in the box as the task moves right, 1 ticked in the accent.
   */
  let { progress = 0, size = 14 }: { progress?: number; size?: number } = $props();

  const level = $derived(progress <= 0 || progress >= 1 ? 0 : Math.round((2 + progress * 6) * 2) / 2);
</script>

<svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
  {#if progress < 0}
    <rect x="1.75" y="1.75" width="10.5" height="10.5" rx="3" stroke="var(--ink-4)" stroke-width="1.5" stroke-dasharray="2.4 2" />
  {:else if progress >= 1}
    <rect x="1" y="1" width="12" height="12" rx="3.5" fill="var(--accent)" />
    <path d="M4 7.2l2 2 4-4.4" stroke="var(--on-accent)" stroke-width="1.7" />
  {:else}
    <rect x="1.75" y="1.75" width="10.5" height="10.5" rx="3" stroke={level ? 'var(--ink-2)' : 'var(--ink-3)'} stroke-width="1.5" />
    {#if level}
      <rect x="3.5" y={10.5 - level} width="7" height={level} rx="1" fill="var(--ink-2)" />
    {/if}
  {/if}
</svg>
