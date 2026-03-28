# Fix CI: Add Postgres Service and DB Host

## Summary
This PR fixes the `sqlalchemy.exc.OperationalError` encountered in the CI pipeline by ensuring a PostgreSQL database service is available and reachable during tests.

## Problem
The tests were failing with:
```
sqlalchemy.exc.OperationalError: (psycopg2.OperationalError) could not translate host name "db" to address: Temporary failure in name resolution
```
This was caused by the absence of a running PostgreSQL service in the GitHub Actions workflow and the application trying to connect to a host named "db" which was not resolvable.

## Solution
1.  **Added Postgres Service:** Configured a `postgres:15` service container in the `build-and-test` job.
2.  **Set Environment Variable:** Added `DATABASE_HOST=localhost` to the environment variables so the tests connect to the service container.

## Changes
*   `.github/workflows/deployment.yml`: Added `services.postgres` configuration and `DATABASE_HOST` env var.

## Verification
The CI pipeline should now successfully spin up the database and run the tests without connection errors.
