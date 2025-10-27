import React from 'react';
import Layout from '@theme/Layout';
import HomepageFeatures from '../components/HomepageFeatures';

function Homepage() {
  return (
    <Layout
      title="Welcome to MPFS"
      description="Description of MPFS documentation site">
      <header className="hero hero--primary">
        <div className="container">
          <h1 className="hero__title">MPFS Documentation</h1>
          <p className="hero__subtitle">Documentation for the MPFS project</p>
        </div>
      </header>
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}

export default Homepage;