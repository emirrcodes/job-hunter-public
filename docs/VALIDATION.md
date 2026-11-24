# Verification

```sh
npm ci
npm run check
npm run profile:check
npm run plan -- --slot 0
npm run db:plan
npm run db:test
npm run release:check
```

`check` tests search planning across occupations, scope and target setup, and data normalization. `db:test` creates and tears down its own PostgreSQL instance on a Unix socket. Install Python 3 and PostgreSQL server tools. Use `PGBIN` to select a PostgreSQL version. `release:check` reviews Git-visible file paths and common credential formats. Review the set of files in any release for user data.

A new project must still pass `npm run gateway:smoke`. Run a real pilot only on the user’s selected accounts after reviewing the cost and plan. Confirm per-source results and the first real claim/save/shortlist round trip. Report local checks, provisioning checks and real collection separately.
