<script lang="ts">
  /** The bracketed `[x]` from the logo: the brand's mark, and the shape of done. */
  let { size = 20 }: { size?: number } = $props();
</script>

<svg width={size * 1.4} height={size} viewBox="0 0 28 20" fill="none" aria-hidden="true">
  <path d="M6.5 2.5H3.5v15h3M21.5 2.5h3v15h-3" stroke="var(--ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M10.5 6.5l7 7M17.5 6.5l-7 7" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" />
</svg>
