import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Vidra',
  tagline: 'Run your own video platform.',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
    experimental_faster: {
      swcJsLoader: true,
      swcJsMinimizer: true,
      swcHtmlMinimizer: true,
      lightningCssMinimizer: true,
      rspackBundler: true,
      rspackPersistentCache: true,
      mdxCrossCompilerCache: true,
      ssgWorkerThreads: true,
    },
  },

  url: 'https://vidra.yosef.app',
  baseUrl: '/docs/',
  trailingSlash: false,

  organizationName: 'yegamble',
  projectName: 'vidra-docs',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  plugins: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        indexBlog: true,
        docsRouteBasePath: '/',
        blogRouteBasePath: '/blog',
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/yegamble/vidra-docs/tree/main/',
          showLastUpdateTime: true,
          showLastUpdateAuthor: true,
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl: 'https://github.com/yegamble/vidra-docs/tree/main/',
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/vidra-social-card.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Vidra',
      logo: {
        alt: 'Vidra',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/migration/overview',
          label: 'Migrate',
          position: 'left',
        },
        {to: '/blog', label: 'Blog', position: 'left'},
        {
          href: 'https://vidra.yosef.app',
          label: 'vidra.yosef.app',
          position: 'right',
        },
        {
          href: 'https://github.com/yegamble/vidra',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Quickstart', to: '/start/quickstart'},
            {label: 'Requirements', to: '/start/requirements'},
            {label: 'Architecture', to: '/concepts/architecture'},
          ],
        },
        {
          title: 'Project',
          items: [
            {label: 'GitHub', href: 'https://github.com/yegamble/vidra'},
            {
              label: 'Licence AGPL v3',
              href: 'https://github.com/yegamble/vidra/blob/main/LICENSE',
            },
            {label: 'Brand', href: 'https://github.com/yegamble/vidra-branding'},
            {label: 'vidra.yosef.app', href: 'https://vidra.yosef.app'},
          ],
        },
        {
          title: 'More',
          items: [{label: 'Blog', to: '/blog'}],
        },
      ],
      copyright: '© 2026 Vidra. AGPL v3.',
    },
    mermaid: {
      theme: {light: 'base', dark: 'dark'},
      options: {
        themeVariables: {
          primaryColor: '#EEF7FB',
          primaryTextColor: '#0C2136',
          primaryBorderColor: '#0B7EA3',
          lineColor: '#1D466A',
          secondaryColor: '#E3F1F8',
          tertiaryColor: '#F5F5F7',
          actorBkg: '#EEF7FB',
          actorTextColor: '#0C2136',
          actorBorder: '#0B7EA3',
          noteBkgColor: '#F5F5F7',
          noteTextColor: '#0C2136',
          noteBorderColor: '#0B7EA3',
          signalColor: '#1D466A',
          signalTextColor: '#0C2136',
        },
      },
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'go', 'yaml', 'toml', 'sql', 'nginx'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
