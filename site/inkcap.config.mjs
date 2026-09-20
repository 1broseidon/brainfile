/* Everything inkcap needs to print this site. The rest of the build is
 * github.com/1broseidon/inkcap, shared with the other chain.sh manuals. */
export default {
  name: 'brainfile',
  url: 'https://brainfile.md',
  repo: '1broseidon/brainfile',
  tagline: 'markdown task boards for you and your agents',
  built: 'Built on Markdown and YAML',
  accent: {
    light: { accent: '#5B47A6', soft: '#E9E5F5' },
    dark: { accent: '#A796E3', soft: '#1E1A31' },
    terminal: { prompt: '#9C8AE0', key: '#C6BBEF' },
  },
  ogImage: '/og-banner.jpg',
  llmsExtra: ['- Agent bootstrap: https://brainfile.md/llms-install.txt'],
  notFoundExtra:
    'The JSON Schemas under <a href="/v2/index.json">/v2/</a> and the <a href="/llms-install.txt">llms-install.txt</a> bootstrap file have not moved.',
  /* GitHub Pages has no server-side redirects, so the 404 page carries the map
   * of the VitePress site's URLs. */
  moved: {
    '/quick-start': '/#quickstart',
    '/reference/commands': '/#commands',
    '/cli/contract-commands': '/#contracts',
    '/tools/cli': '/#the-tui',
    '/reference/protocol': '/#the-board-on-disk',
    '/reference/types': '/#the-board-on-disk',
    '/types/base': '/#the-board-on-disk',
    '/types/board': '/#the-board-on-disk',
    '/reference/ledger-schema': '/#the-board-on-disk',
    '/guides/ledger': '/#the-board-on-disk',
    '/types/contract': '/#contracts',
    '/reference/contract-schema': '/#contracts',
    '/guides/contracts': '/#contracts',
    '/guides/getting-started-with-contracts': '/#contracts',
    '/guides/agent-workflows': '/#for-agents',
    '/guides/orchestration': '/#for-agents',
    '/agents/integration': '/#for-agents',
    '/tools/mcp': '/#for-agents',
    '/reference/mcp-tools': '/#for-agents',
    '/core/templates': '/#commands',
    '/tools/core': 'https://github.com/1broseidon/brainfile/tree/main/core',
    '/reference/api': 'https://github.com/1broseidon/brainfile/blob/main/core/README.md',
    '/contributing': 'https://github.com/1broseidon/brainfile/blob/main/CONTRIBUTING.md',
  },
}
