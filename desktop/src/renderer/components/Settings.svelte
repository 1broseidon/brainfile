<script lang="ts">
  /**
   * The app's settings (design.md, Settings): one quiet column in the pane.
   * Each section is its own component under settings/, gathered here by
   * glob and placed by the `order` it declares, so adding a section touches
   * no shared file (task-64). Their common styles are styles/settings.css.
   */
  import type { Component } from 'svelte';
  import '../styles/settings.css';

  const found = import.meta.glob<{ default: Component; order: number }>('./settings/*.svelte', { eager: true });
  const sections = Object.entries(found)
    .map(([file, mod]) => ({ file, Section: mod.default, order: mod.order }))
    .sort((a, b) => a.order - b.order || a.file.localeCompare(b.file));
</script>

<div class="settings">
  <div class="column">
    {#each sections as { file, Section } (file)}
      <section><Section /></section>
    {/each}
  </div>
</div>

<style>
  .settings {
    height: 100%;
    overflow-y: auto;
  }

  section + section {
    margin-top: var(--s10);
  }

  .column {
    max-width: 560px;
    margin: 0 auto;
    padding: var(--s6) var(--s6) var(--s12);
  }
</style>
