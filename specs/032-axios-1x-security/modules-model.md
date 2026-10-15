# HTTP dependency ownership

The signingless client imports Axios for token/fact queries and unsigned-transaction submission calls. Its package manifest must own that runtime import directly. Mesh and older Cardano SDK packages retain their own declared dependency constraints. The service test harness and GitHub CI exercise the ordinary client; coordinator-owned preprod qualification observes the real provider and ledger boundary. No module direction changes are intended.
