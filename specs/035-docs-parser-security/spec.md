# Patched documentation parsers and build tools

A documentation contributor needs the existing Docusaurus site, diagrams and static assets to build correctly with patched dependencies. A maintainer needs exact lock paths, supported parent ranges, executable security/ordinary-input evidence and an honest account of unresolved rows.

The original 39-high parser/build allocation is split: this slice targets 35 high rows plus shell-quote critical across 13 families (@babel/plugin-transform-modules-systemjs, brace-expansion, browserslist, fast-uri, joi, js-yaml 3/4, lodash/lodash-es, nanoid 3, postcss, shell-quote, source-map-js, svgo 3). Four minimatch/picomatch rows remain required work in #44 because qualification found an incomplete hardening case and a normal-result compatibility change. Their original versions and unchanged failing expectations remain visible; they are not accepted as remediated.

Keep the Docusaurus 3.7.0 parent set, content, routes and separate MkDocs publisher fixed. #36 owns HTTP/dev-server updates. Acceptance requires frozen Yarn/build, all accepted-scope regressions with no skips/TODOs, actual loader/assets, retained typecheck baseline, advisory delta, Aiken identity and exact-final-head hosted checks. Local range reconciliation is not scanner closure. No service/on-chain source or production deployment changes are authorized here.
