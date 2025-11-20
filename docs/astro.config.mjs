// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://brainfile.md',
	integrations: [
		starlight({
			title: 'Brainfile',
			description: 'A protocol-first task management system for the AI era',
			logo: {
				src: './src/assets/logo.png',
			},
			social: [
				{ icon: 'github', label: 'GitHub Organization', href: 'https://github.com/brainfile' },
			],
			customCss: [
				'./src/styles/custom.css',
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'index' },
						{ label: 'Quick Start', slug: 'getting-started/quick-start' },
					],
				},
				{
					label: 'Protocol',
					items: [
						{ label: 'Specification', slug: 'protocol/specification' },
						{ label: 'AI Agent Integration', slug: 'agents/integration' },
					],
				},
				{
					label: 'Core Library',
					items: [
						{ label: 'Overview', slug: 'core/overview' },
						{ label: 'API Reference', slug: 'core/api-reference' },
						{ label: 'Templates', slug: 'core/templates' },
					],
				},
				{
					label: 'CLI Tool',
					items: [
						{ label: 'Installation', slug: 'cli/installation' },
						{ label: 'Commands', slug: 'cli/commands' },
						{ label: 'Examples', slug: 'cli/examples' },
					],
				},
				{
					label: 'VSCode Extension',
					items: [
						{ label: 'Overview', slug: 'vscode/extension' },
					],
				},
			],
			head: [
				{
					tag: 'link',
					attrs: {
						rel: 'preconnect',
						href: 'https://fonts.googleapis.com',
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'preconnect',
						href: 'https://fonts.gstatic.com',
						crossorigin: 'anonymous',
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'stylesheet',
						href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap',
					},
				},
			],
		}),
	],
});
