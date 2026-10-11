<script lang="ts" module>
  const PATHS = {
    plus: 'M8 3.5v9M3.5 8h9',
    search: 'M7.2 12.2a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm3.6-1.4 2.9 2.9',
    list: 'M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01',
    board: 'M2.5 3.5h3v9h-3zM6.5 3.5h3v6h-3zM10.5 3.5h3v4h-3z',
    sync: 'M13 6.5A5.2 5.2 0 0 0 3.6 5M3 9.5A5.2 5.2 0 0 0 12.4 11M3.4 2.6V5h2.4M12.6 13.4V11h-2.4',
    folder: 'M2 4.5c0-.6.4-1 1-1h3.2l1.3 1.5H13c.6 0 1 .4 1 1V12c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z',
    chevron: 'M6 4l4 4-4 4',
    'chevron-down': 'M4 6l4 4 4-4',
    close: 'M4 4l8 8M12 4l-8 8',
    check: 'M3.5 8.5 6.5 11.5 12.5 4.5',
    more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
    git: 'M5 3v6.5M5 9.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6-5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 0c0 3-6 2.5-6 5',
    cloud: 'M4.5 12.5a3 3 0 0 1-.4-6 4 4 0 0 1 7.7-.8 3.4 3.4 0 0 1 .2 6.8z',
    'cloud-off': 'M4.5 12.5a3 3 0 0 1-.4-6m2.5-2.3a4 4 0 0 1 5.2 1.5 3.4 3.4 0 0 1 2 5.6M2.5 2.5l11 11',
    tag: 'M2.5 2.5h5l6 6-5 5-6-6zM5.25 5.25h.01',
    user: 'M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm-5 5.5c.6-2.3 2.6-3.5 5-3.5s4.4 1.2 5 3.5',
    calendar: 'M3 4.5h10v8.5H3zM3 7h10M5.5 3v2.5M10.5 3v2.5',
    link: 'M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5L8 4.5M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l1-1',
    contract: 'M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8h4M6 10.5h4',
    trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5',
    reveal: 'M6.5 3.5h-3v9h9v-3M9 3h4v4M13 3 7.5 8.5',
    back: 'M10 4 6 8l4 4',
    sidebar: 'M2.5 3.5h11v9h-11zM6 3.5v9',
    edit: 'M9.5 3.5l3 3L6 13H3v-3z',
    archive: 'M2.5 3.5h11v3h-11zM3.5 6.5v6h9v-6M6.5 9h3',
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
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[name]} />
</svg>
