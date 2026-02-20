<script setup lang="ts">
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import HomeLayout from './HomeLayout.vue'
import CopyPageButton from './components/CopyPageButton.vue'

const { frontmatter } = useData()
</script>

<template>
  <HomeLayout v-if="frontmatter.layout === 'home'" />
  <DefaultTheme.Layout v-else>
    <template #doc-before>
      <div class="doc-header-bar">
        <CopyPageButton />
      </div>
    </template>
  </DefaultTheme.Layout>
</template>

<style>
.doc-header-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: -2.75rem;
  padding-top: 0.95rem;
  position: relative;
  z-index: 1;
}
</style>
