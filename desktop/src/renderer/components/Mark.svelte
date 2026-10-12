<script lang="ts" module>
  /**
   * Brainfile's mark, the b (design.md, The mark): the Markdown bracket's
   * stem runs down into the box and is its left wall, the bracket's serif is
   * the b's hook, and the bowl is a filled checkbox with the tick cut out.
   * One shape, one 8-unit weight on a 64 grid. The source is assets/mark.svg.
   */
  const B =
    'M15 4H31a4 4 0 0 1 0 8H19V19a1 1 0 0 0 1 1H42a11 11 0 0 1 11 11V48a11 11 0 0 1-11 11H15a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z';
  /** The tick, and a heavier one for 20px and under, where 6.2 units falls below two pixels. */
  const TICK = 'M24 40l6 6 11.5-12.5';
</script>

<script lang="ts">
  let { size = 18 }: { size?: number } = $props();

  const small = $derived(size <= 20);
  const id = `b-${Math.random().toString(36).slice(2, 8)}`;
</script>

<svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
  <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
    <rect width="64" height="64" fill="#fff" />
    <path d={TICK} fill="none" stroke="#000" stroke-width={small ? 8 : 6.2} stroke-linecap="round" stroke-linejoin="round" />
  </mask>
  <path d={B} mask="url(#{id})" />
</svg>
