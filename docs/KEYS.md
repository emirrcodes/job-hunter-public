# Credentials and private data

Use `.env.local` for local credentials or your agent’s secret store for a hosted evaluator. Keep values out of chat, logs, command arguments and Git.

| Variable | Used by |
|---|---|
| `SUPABASE_PROJECT_REF`, `SUPABASE_URL` | Setup scripts and the project client |
| `SUPABASE_ACCESS_TOKEN` | Management SQL and deployment in the setup environment |
| `RADAR_MIGRATION_DATABASE_URL`, `RADAR_MIGRATION_DATABASE_PASSWORD` | Schema migration in the setup environment |
| `APIFY_TOKEN` | Optional LinkedIn scraper, in setup and Function Secrets |
| `RADAR_COLLECTOR_TOKEN` | `collect` and `poll`, in setup, Function Secrets and the Cron Vault |
| `RADAR_EVALUATOR_TOKEN` | Scoped review and read actions, supplied to the agent |
| `RADAR_READER_TOKEN` | Scoped read actions for a read-only client |
| `SUPABASE_SECRET_KEYS` or `SUPABASE_SERVICE_ROLE_KEY` | Privileged DB key injected into the Edge Function server environment by Supabase |

`npm run setup:init` creates separate scope tokens and restricts local file permissions. Deploy uploads these as secrets to the selected project. The reviewer needs the evaluator token and your project URL. The database roles created by setup have `NOLOGIN` and scoped RPC permissions.

`local/` houses your edited profile, CV notes, claims and reports. Keep Supabase job records private. `npm run release:check` flags common credential formats and some private file paths. Review any release contents before sharing.
