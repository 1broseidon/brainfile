<script setup lang="ts">
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import HomeLayout from './HomeLayout.vue'

const { frontmatter } = useData()
</script>

<template>
  <HomeLayout v-if="frontmatter.layout === 'home'" />
  <DefaultTheme.Layout v-else />
</template>
