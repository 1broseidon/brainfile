<script lang="ts" module>
  /**
   * Brainfile's interface icons (design.md, Icons): a 16 grid, 1.5 strokes,
   * square ends and mitred corners, drawn like IBM Plex Mono rather than the
   * rounded strokes of Lucide or Linear. Boxes keep the checkbox's corner.
   */
  const PATHS = {
    plus: 'M8 3v10M3 8h10',
    search: 'M3 3h7v7H3zM10 10l3.5 3.5',
    list: 'M2.5 4h2v2h-2zM2.5 10h2v2h-2zM7 5h6.5M7 11h6.5',
    board: 'M2.5 2.5h3v11h-3zM6.5 2.5h3v7h-3zM10.5 2.5h3v4h-3z',
    git: 'M5 2v12M5 10.5c0-3.5 6-2.5 6-6M9.5 1.75h3v3h-3z',
    folder: 'M2.5 3.5h4l1.5 1.5h5.5v7.5h-11z',
    sync: 'M13 7A5 5 0 0 0 4 4.5M3 9a5 5 0 0 0 9 2.5M3.5 2v2.5H6M12.5 14v-2.5H10',
    close: 'M4 4l8 8M12 4l-8 8',
    chevron: 'M6 3.5 10.5 8 6 12.5',
    check: 'M3 8.5 6.5 12 13 4.5',
    trash: 'M3 4.5h10M6 4.5V2.5h4v2M4.5 4.5l.5 9h6l.5-9',
    sidebar: 'M2.5 3h11v10h-11zM6 3v10',
    calendar: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',
    archive: 'M2.5 3h11v3h-11zM3.5 6v7.5h9V6M6.5 9h3',
    reveal: 'M7 3.5H3v9.5h9.5V9M9.5 2.5h4v4M13.5 2.5 8 8',
    contract: 'M3.5 2.5h6l3 3v8h-9zM9.5 2.5v3h3M6 8.5h4M6 11h4',
    user: 'M5.5 3h5v5h-5zM2.5 14c.5-2.5 2.6-4 5.5-4s5 1.5 5.5 4',
    tag: 'M5.5 2.5v11M10.5 2.5v11M2.5 5.5h11M2.5 10.5h11',
    bolt: 'M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z',
    hand: 'M3 8h8.5M8.5 4.5 12 8l-3.5 3.5M3 3v10',
    stop: 'M4.5 4.5h7v7h-7z',
    ask: 'M2.5 3h11v8h-6l-3 2.5V11h-2z',
    send: 'M8 13V3.5M4 7.5 8 3.5l4 4',
    history: 'M3 3h10v10H3zM8 5.5V8l2 1.5',
    settings: 'M2.5 5h11M2.5 11h11M5.5 3v4M10.5 9v4',
  } as const;

  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 16, stroke = 1.5 }: { name: IconName; size?: number; stroke?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="butt"
  stroke-linejoin="miter"
  aria-hidden="true"
>
  <path d={PATHS[name]} />
</svg>
