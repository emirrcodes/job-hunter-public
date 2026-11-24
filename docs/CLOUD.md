# Connect your evaluator agent

Use a coding agent with Node.js 22+, terminal access and HTTPS access to your Supabase project. Supply `SUPABASE_URL` and `RADAR_EVALUATOR_TOKEN` through its environment or secret store. The evaluator needs the client scripts and [review instructions](../prompts/review.md). Keep management and collector credentials in the setup environment. `npm run cloud:package` optionally creates a client ZIP under `local/` with your project URL, scripts and prompts. The agent reads the live profile at run time.

## Gateway contract

Send `POST /functions/v1/job-radar` with `Authorization: Bearer <scope token>` and JSON `{"action":"...","params":{...}}`. This is an HTTP JSON gateway. An agent that only talks to MCP servers needs an adapter.

| Scope | Actions |
|---|---|
| Reader | `status`, `shortlist`, `profile`, `search_plan` |
| Evaluator | Reader actions, `claim`, `save_evaluation`, `briefing_window`, `save_briefing`, `deliver_briefing` |
| Collector | `collect`, `poll` |

`claim` returns the job, content hash and a 20-minute lease. Match its `profile_version` against the live profile’s `evaluation_version`. `save-evaluations.mjs` reads the lease and content hash from the claims file.

```sh
mkdir -p local
node scripts/radar.mjs status
node scripts/radar.mjs profile
node scripts/radar.mjs claim --limit 1 --out local/claims.json
# Write local/evaluations.json with the real evaluation in the format below.
node scripts/save-evaluations.mjs local/claims.json local/evaluations.json
node scripts/radar.mjs shortlist
```

Use this shape for the JSON array. Replace all example values with actual evidence before saving.

```json
[
  {
    "job_id": "<job.id from the active claim>",
    "score": 65,
    "priority": "medium",
    "eligibility": "uncertain",
    "summary": "Short decision based on responsibilities and profile evidence",
    "reasons": ["Specific match"],
    "gaps": ["Missing requirement or question to verify"],
    "evidence": [{"url": "https://example.com/job", "quote": "Brief listing evidence", "profile_evidence": "Relevant verified experience"}]
  }
]
```

Scores from 0 to 100 rank listings. `eligibility` uses `eligible`, `ineligible` or `uncertain` for country, residence and work authorization. `priority` uses `high`, `medium` or `low` based on the user’s stated goals. Keep unknown facts visible.

`briefing_window` returns assessments since the last delivered briefing and a `through` boundary. `save_briefing` accepts `through` and `body`. After a real delivery receipt, call `deliver_briefing` with the saved `id`. Keep the briefing `ready` until then.
