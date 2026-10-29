# Script rules

- Security accounting scripts must run through `security/run-accounting-fixture.py`, creating a new socket-only temporary cluster with a cleared environment and explicit local endpoints. Why: negative mutation tests must never reach the managed database.
- Candidate accounting SQL under docs is not an applied migration or a production-approved replacement. Why: local minimal-schema checks do not establish full auth, provider, concurrency or admission correctness.
- Contract confirmation tests use `security/contract-confirmation-fixture.py`, a fresh socket-only cluster and cleared environment. Why: signature mutation tests must not reach shared contracts.