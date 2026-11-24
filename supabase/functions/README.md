# Job Radar Edge Function

The gateway handles fixed provider adapters and a JSON API. `verify_jwt = false` allows the gateway to check its own scoped tokens. A missing or unknown token returns 401. An action outside the token’s scope returns 403.

Supabase injects `SUPABASE_SECRET_KEYS` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`) into the server runtime. Deploy adds three separate `RADAR_*_TOKEN` scope secrets and `APIFY_TOKEN` if LinkedIn is enabled. Credentials are used server-side. The API accepts neither SQL nor arbitrary provider URLs as inputs.

Collection reads the live profile. Each start has a reserved slot and a budget. The LinkedIn Actor starts asynchronously and poll fetches only existing runs. An ambiguous start blocks further runs until reconciled. Re-ingesting a completed run returns the stored receipt.

Use `npm run setup:deploy` from the repo root. For actions and the evaluation payload, see [the gateway contract](../../docs/CLOUD.md). For provisioning and scheduling, follow [the setup guide](../../docs/SETUP.md).
