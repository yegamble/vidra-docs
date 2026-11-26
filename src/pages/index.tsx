import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

const areas = [
  {
    title: 'Start here',
    to: '/start/what-is-vidra',
    body: 'What Vidra is, what it needs, and the three steps to a running instance.',
  },
  {
    title: 'Concepts',
    to: '/concepts/architecture',
    body: 'Architecture, the video pipeline, federation, storage, and search.',
  },
  {
    title: 'Install and deploy',
    to: '/install/one-line-install',
    body: 'The installer, the compose services, production, storage and upgrades.',
  },
  {
    title: 'Operate',
    to: '/operate/cli',
    body: 'The vidra CLI, health and metrics, moderation and instance settings.',
  },
  {
    title: 'Migrate from PeerTube',
    to: '/migration/overview',
    body: 'A one-way importer that carries your instance across, passwords included.',
  },
  {
    title: 'Reference',
    to: '/reference/ports',
    body: 'Ports, configuration, the OpenAPI contract, and every command-line flag.',
  },
];

const proofPoints = [
  {
    title: 'Low egress at scale',
    body: 'HLS from your own box, a CDN in front of it, or IPFS gateways carrying public media.',
  },
  {
    title: 'Federated by default',
    body: 'ActivityPub per channel and ATProto identity — two protocols, independently switchable.',
  },
  {
    title: 'Yours to run',
    body: 'AGPL v3, one compose file, no vendor between you and your viewers.',
  },
];

function Hero() {
  return (
    <header className={styles.hero}>
      <div className="container">
        <img
          className={styles.heroMark}
          src={useBaseUrl('/img/logo.svg')}
          alt=""
          width={72}
          height={72}
        />
        <Heading as="h1" className={styles.heroTitle}>
          Vidra docs
        </Heading>
        <p className={styles.heroSubtitle}>Run your own video platform.</p>
        <div className={styles.heroButtons}>
          <Link
            className="button button--primary button--lg"
            to="/start/quickstart">
            Quickstart
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="/migration/overview">
            Migrate from PeerTube
          </Link>
        </div>
      </div>
    </header>
  );
}

function BrowseByArea() {
  return (
    <section className={styles.section}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          Browse by area
        </Heading>
        <div className={styles.cardGrid}>
          {areas.map((area) => (
            <Link key={area.title} className={styles.card} to={area.to}>
              <Heading as="h3" className={styles.cardTitle}>
                {area.title}
              </Heading>
              <p className={styles.cardBody}>{area.body}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatIsVidra() {
  return (
    <section className={styles.strip}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          What is Vidra?
        </Heading>
        <p className={styles.stripLede}>
          Vidra is a federated video platform you install yourself, the way you
          would install WordPress. One low-cost server serves your viewers
          because distribution is designed to be offloaded. It federates over
          ActivityPub and ATProto, stores media on anything S3-compatible if you
          want it to, and it is free software under AGPL v3.
        </p>
        <div className={styles.proofGrid}>
          {proofPoints.map((point) => (
            <div key={point.title} className={styles.proof}>
              <Heading as="h3" className={styles.proofTitle}>
                {point.title}
              </Heading>
              <p className={styles.proofBody}>{point.body}</p>
            </div>
          ))}
        </div>
        <p className={styles.stripFooter}>
          It is a clean-room, PeerTube-inspired implementation — not a fork, and
          not API-compatible with PeerTube.{' '}
          <Link to="/start/what-is-vidra">Read the whole picture</Link>.
        </p>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Documentation"
      description="Documentation for Vidra — a federated video platform you install yourself, under AGPL v3.">
      <Hero />
      <main>
        <BrowseByArea />
        <WhatIsVidra />
      </main>
    </Layout>
  );
}
