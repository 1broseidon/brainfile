<script lang="ts">
  import type { Priority } from '../../shared/api';

  /**
   * Heat, not signal bars: three square pips lit from the left in the
   * priority's colour. Urgent is the one shape no level shares, a warning
   * diamond. No priority draws nothing unless `placeholder` asks for the
   * unlit pips (a picker, the composer).
   */
  let { priority, size = 14, placeholder = false }: { priority?: Priority | null; size?: number; placeholder?: boolean } =
    $props();

  const lit = $derived(priority === 'high' ? 3 : priority === 'medium' ? 2 : priority === 'low' ? 1 : 0);
  const color = $derived(priority === 'high' ? 'var(--p-high)' : priority === 'medium' ? 'var(--p-medium)' : 'var(--ink-3)');
</script>

{#if priority === 'critical'}
  <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
    <path d="M7 .8 13.2 7 7 13.2.8 7z" fill="var(--p-urgent)" />
    <path d="M7 3.8v4" stroke="var(--canvas)" stroke-width="1.6" />
    <rect x="6.2" y="9" width="1.6" height="1.6" fill="var(--canvas)" />
  </svg>
{:else if lit > 0 || placeholder}
  <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
    {#each [0, 1, 2] as i (i)}
      <rect x={0.75 + i * 4.5} y="5.25" width="3.5" height="3.5" rx="0.9" fill={i < lit ? color : 'var(--line-strong)'} />
    {/each}
  </svg>
{:else}
  <span style:width="{size}px" style:height="{size}px" style:display="inline-block"></span>
{/if}
