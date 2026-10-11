<script lang="ts">
  /**
   * A pane's edge is the gutter beside it: drag to size it, double-click to
   * put it back, arrows to step it.
   */
  let {
    value,
    min,
    max,
    initial,
    side,
    onchange,
    oncommit,
  }: {
    value: number;
    min: number;
    max: number;
    initial: number;
    /** Which side of the gutter the sized pane is on. */
    side: 'left' | 'right';
    onchange: (width: number) => void;
    oncommit: () => void;
  } = $props();

  let dragging = $state(false);

  function down(e: PointerEvent): void {
    const startX = e.clientX;
    const startW = value;
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      onchange(Math.round(Math.min(max, Math.max(min, startW + (side === 'left' ? dx : -dx)))));
    };
    const up = () => {
      dragging = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      oncommit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function key(e: KeyboardEvent): void {
    const step = e.shiftKey ? 40 : 10;
    const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
    if (e.key === grow) onchange(Math.min(max, value + step));
    else if (e.key === shrink) onchange(Math.max(min, value - step));
    else return;
    e.preventDefault();
    e.stopPropagation();
    oncommit();
  }
</script>

<!-- A focusable separator is the ARIA pattern for a resizable splitter. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="gutter"
  class:dragging
  role="separator"
  aria-orientation="vertical"
  aria-valuenow={value}
  aria-valuemin={min}
  aria-valuemax={max}
  tabindex="0"
  onpointerdown={down}
  ondblclick={() => {
    onchange(initial);
    oncommit();
  }}
  onkeydown={key}
></div>

<style>
  .gutter {
    width: var(--gap);
    flex: none;
    cursor: col-resize;
    position: relative;
  }

  .gutter::after {
    content: '';
    position: absolute;
    top: var(--s3);
    bottom: var(--s3);
    left: 50%;
    width: 2px;
    margin-left: -1px;
    border-radius: 1px;
    background: transparent;
    transition: background var(--d-open) var(--ease);
  }

  .gutter:hover::after,
  .gutter:focus-visible::after,
  .gutter.dragging::after {
    background: var(--line-strong);
  }
</style>
