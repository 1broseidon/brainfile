<script lang="ts">
  /**
   * A pairing code as one SVG path (design.md, Phone): the modules in
   * `--qr-ink` on a `--qr-plate` with the four-module quiet zone a scanner
   * needs. Each run of dark modules in a row is one rectangle, so the path
   * stays short and the edges stay crisp.
   */
  import { create } from 'qrcode';

  let { text, size = 184 }: { text: string; size?: number } = $props();

  const QUIET = 4;

  const drawn = $derived.by(() => {
    const { modules } = create(text, { errorCorrectionLevel: 'M' });
    const n = modules.size;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; ) {
        if (!modules.data[y * n + x]) {
          x++;
          continue;
        }
        const start = x;
        while (x < n && modules.data[y * n + x]) x++;
        d += `M${start + QUIET} ${y + QUIET}h${x - start}v1h${start - x}z`;
      }
    }
    return { d, side: n + QUIET * 2 };
  });
</script>

<svg class="qr" width={size} height={size} viewBox="0 0 {drawn.side} {drawn.side}" shape-rendering="crispEdges" role="img" aria-label="Pairing code">
  <rect width={drawn.side} height={drawn.side} fill="var(--qr-plate)" />
  <path d={drawn.d} fill="var(--qr-ink)" />
</svg>

<style>
  .qr {
    display: block;
    flex: none;
    border-radius: var(--r-card);
  }
</style>
