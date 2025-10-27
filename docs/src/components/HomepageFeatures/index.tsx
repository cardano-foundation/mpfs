import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'What is MPFS?',
    Svg: require('@site/static/img/logo.svg').default,
    description: (
      <>
        MPFS is an HTTP service providing access to Merkle Patricia Forestries (MPFs) on the Cardano blockchain.
      </>
    ),
  },
  {
    title: 'Why use MPFS?',
    Svg: require('@site/static/img/logo.svg').default,
    description: (
        <>
            MPFS offers
            <ul>
                <li> A smart contract supervising operations over MPF data structures</li>
                <li> An off-chain HTTP service
                    <ul>
                        <li> to compute Cardano transactions to change MPF state</li>
                        <li> to store and serve MPF facts as indexed from the blockchain</li>
                    </ul>
                </li>
            </ul>
            enabling developers to easily build decentralized applications storing their state on-chain
      </>
    ),
  },
  {
    title: 'How it Works',
    Svg: require('@site/static/img/logo.svg').default,
    description: (
      <>
            Anyone can deploy MPFS locally or access a public MPFS instance.
            Using the MPFS HTTP API, two roles interact with the MPFS:
            <ol>
                <li> Oracles create MPF tokens via boot transaction </li>
                <li> Users submit request to change token facts via insert, delete and modify transactions</li>
                <li> Oracles include the changes via update transactions</li>
                <li> Anyone can observe token facts </li>
            </ol>
      </>
    ),
  },
];

function Feature({title, Svg, description, imageLeft = true}: FeatureItem & {imageLeft?: boolean}) {
  return (
    <div className={clsx('col col--12')}>
      <div className="row" style={{alignItems: 'center', marginBottom: '2rem'}}>
        {imageLeft ? (
          <>
            <div className="col col--3">
              <div className="text--center">
                <Svg className={styles.featureSvg} role="img" />
              </div>
            </div>
            <div className="col col--9">
              <Heading as="h3">{title}</Heading>
              <p>{description}</p>
            </div>
          </>
        ) : (
          <>
            <div className="col col--9">
              <Heading as="h3">{title}</Heading>
              <p>{description}</p>
            </div>
            <div className="col col--3">
              <div className="text--center">
                <Svg className={styles.featureSvg} role="img" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} imageLeft={idx % 2 === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}
