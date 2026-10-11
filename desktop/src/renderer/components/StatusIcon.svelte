<script lang="ts">
  /**
   * The checkbox from the logo. -1 backlog (dashed), 0 open, between: fills
   * from the bottom as the task moves right, 1 ticked in the accent.
   */
  let { progress = 0, size = 14 }: { progress?: number; size?: number } = $props();

  // Fill reads as a level, so the first step already shows and the last stops short of full.
  const fill = $derived(progress <= 0 ? 0 : Math.min(0.85, 0.2 + progress * 0.9));
  const inner = 9;
  const id = `clip-${Math.random().toString(36).slice(2, 8)}`;
</script>

<svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
  {#if progress < 0}
    <rect x="1.75" y="1.75" width="10.5" height="10.5" rx="3" stroke="var(--ink-4)" stroke-width="1.5" stroke-dasharray="2 2.1" />
  {:else if progress >= 1}
    <rect x="1" y="1" width="12" height="12" rx="3.5" fill="var(--accent)" />
    <path d="M4.3 7.2 6.1 9l3.6-4" stroke="var(--on-accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
  {:else}
    <rect x="1.75" y="1.75" width="10.5" height="10.5" rx="3" stroke={fill > 0 ? 'var(--ink-2)' : 'var(--ink-3)'} stroke-width="1.5" />
    {#if fill > 0}
      <clipPath {id}><rect x="2.5" y="2.5" width={inner} height={inner} rx="2.25" /></clipPath>
      <rect x="2.5" y={2.5 + inner * (1 - fill)} width={inner} height={inner * fill} fill="var(--ink-2)" clip-path="url(#{id})" />
    {/if}
  {/if}
</svg>
