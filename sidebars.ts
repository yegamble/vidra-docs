import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Start here',
      collapsed: false,
      items: [
        'start/what-is-vidra',
        'start/quickstart',
        'start/requirements',
        'start/setup-paths',
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      collapsed: false,
      items: [
        'concepts/architecture',
        'concepts/video-pipeline',
        'concepts/federation',
        'concepts/storage-and-media',
        'concepts/search',
      ],
    },
    {
      type: 'category',
      label: 'Install and deploy',
      items: [
        'install/one-line-install',
        'install/wizard-setup',
        'install/docker-services',
        'install/production',
        'install/storage-backends',
        'install/upgrading',
      ],
    },
    {
      type: 'category',
      label: 'Operate',
      items: ['operate/cli', 'operate/monitoring', 'operate/moderation'],
    },
    {
      type: 'category',
      label: 'Migrate from PeerTube',
      items: [
        'migration/overview',
        'migration/planning',
        'migration/api-migration',
        'migration/manual-migration',
        'migration/storage-migration',
        'migration/cutover',
        'migration/troubleshooting',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'reference/ports',
        'reference/configuration',
        'reference/rest-api',
        'reference/cli',
      ],
    },
    {
      type: 'category',
      label: 'Contribute',
      items: ['contribute/development', 'contribute/repository-layout'],
    },
  ],
};

export default sidebars;
