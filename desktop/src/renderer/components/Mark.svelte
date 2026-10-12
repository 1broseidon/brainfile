<script lang="ts" module>
  /**
   * Brainfile's mark, the box (design.md, The mark): a filled checkbox with
   * the tick cut out, square on the left like a bracket and rounded on the
   * right like the bowl of a b. One shape on a 64 grid; the source is
   * assets/mark.svg.
   */
  const BOX = 'M14 10H36a18 18 0 0 1 18 18V36a18 18 0 0 1-18 18H14a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4Z';
  const TICK = 'M21.5 32.5l7 7 14-15.5';
</script>

<script lang="ts">
  let { size = 18 }: { size?: number } = $props();

  /** At 20px and under the tick is cut heavier so it stays over two pixels wide. */
  const small = $derived(size <= 20);
  const id = `box-${Math.random().toString(36).slice(2, 8)}`;
</script>

<svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
  <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
    <rect width="64" height="64" fill="#fff" />
    <path d={TICK} fill="none" stroke="#000" stroke-width={small ? 8 : 6.2} stroke-linecap="round" stroke-linejoin="round" />
  </mask>
  <path d={BOX} mask="url(#{id})" />
</svg>
