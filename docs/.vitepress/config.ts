import { defineConfig } from 'vitepress'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  title: 'Brainfile',
  description: 'A protocol-first task management system for the AI era',

  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', rel: 'stylesheet' }],
  ],

  // Fix EMFILE error on systems with low file watcher limits
  vite: {
    server: {
      watch: {
        usePolling: true,
        interval: 1000,
      },
    },
    plugins: [
      {
        name: 'serve-v1-json',
        configureServer(server) {
          server.middlewares.use('/v1', (req, res) => {
            const jsonPath = path.resolve(__dirname, '../../v1.json')
            const content = fs.readFileSync(jsonPath, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(content)
          })
        },
        generateBundle() {
          const jsonPath = path.resolve(__dirname, '../../v1.json')
          const content = fs.readFileSync(jsonPath, 'utf-8')
          this.emitFile({
            type: 'asset',
            fileName: 'v1',
            source: content,
          })
        },
      },
    ],
  },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started/quick-start' },
      { text: 'Protocol', link: '/protocol/specification' },
      { text: 'API', link: '/core/api-reference' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Quick Start', link: '/getting-started/quick-start' },
        ],
      },
      {
        text: 'Protocol',
        items: [
          { text: 'Specification', link: '/protocol/specification' },
          { text: 'AI Agent Integration', link: '/agents/integration' },
        ],
      },
      {
        text: 'Core Library',
        items: [
          { text: 'Overview', link: '/core/overview' },
          { text: 'API Reference', link: '/core/api-reference' },
          { text: 'Templates', link: '/core/templates' },
        ],
      },
      {
        text: 'CLI Tool',
        items: [
          { text: 'Installation', link: '/cli/installation' },
          { text: 'Commands', link: '/cli/commands' },
          { text: 'Examples', link: '/cli/examples' },
        ],
      },
      {
        text: 'VSCode Extension',
        items: [
          { text: 'Overview', link: '/vscode/extension' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/brainfile' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024 Brainfile',
    },
  },
})
