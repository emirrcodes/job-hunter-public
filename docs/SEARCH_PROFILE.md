# Search profile

`config/profile.example.json` is a fictional customer-support search. `npm run setup:init` copies it to `local/profile.json`, which Git ignores. Customize that copy and give the profile a new `version`. `npm run profile:check` validates it, `npm run plan -- --slot 0` prints one request plan, `npm run profile:push` publishes it to your project and `npm run profile:status` compares local and live revisions.

| Field | What to set |
|---|---|
| `experience`, `education`, `skills` | Verified evidence you want your agent to use. Leave personal contact details out. |
| `preferences.work_country_aliases` | The codes and common names for countries where you can work, independent of where a source is searched. For example `DE`, `Germany` and `Deutschland`. |
| `preferences.notes` | Explicit constraints, priorities and other context for evaluation. |
| `preferences.report_language`, `preferences.timezone` | The report language and IANA timezone to use for briefing dates. Timezone defaults to UTC. |
| `search_tracks` | Name each group of related roles and add the keywords employers actually use. |
| `search.rotation` | Assign a track and geography to each slot. Preview every pair you configure. |
| `search.geographies` | Location label, ISO alpha-2 country, and `work_types` (`remote`, `hybrid`, `on_site`). Set a verified `geo_id`, `verified_at` and `quality_markers` for LinkedIn. |
| `search.employment_types` | `full_time`, `part_time`, `contract`, `temporary`, `internship`, `volunteer`, `other`, or `[]` to search without an employment filter. |
| `search.experience_levels` | LinkedIn seniority filter. Accepts `internship`, `entry_level`, `associate`, `mid_senior`, `director`, `executive`, or `[]`. |
| `search.freshness_days` | Date cutoff applied when publication date is available. |
| `search.filters` | Case- and accent-insensitive title terms. An empty `title_terms` accepts all normalized titles. Keep exclusions narrow and use the review agent for unclear seniority. |
| `search.sources` | Enable sources by ID. An empty Remotive category admits its general remote feed. |

Remote-only sources skip slots that request only hybrid or on-site work. For LinkedIn, use a real search URL from LinkedIn that has the desired `geoId`. Check the place in the URL and the query shown in the preview. A free-text location can resolve to the wrong place and is insufficient. `quality_markers` optionally check returned locations, while provenance always checks the submitted URL. Keep budget bounds even if you change providers.

For example, to search for hybrid accounting work in Germany, replace the support keywords and title terms with your accounting terms (such as `Buchhalter` and `Accountant`), choose a verified German LinkedIn location, set `work_types` to `['hybrid']` and enable Apify only after the account checks. Use `[]` for seniority or employment types where you have no preference. A region label like “Europe” does not by itself establish the candidate’s eligibility.

The live revision is shared by the collector and reviewer. Re-publishing can reclassify jobs for a changed search and requeue older evaluations, while user decisions and quarantined jobs are retained. The kits’ v1 profiles continue to run with their original planning behavior. To switch to v2, fill in a copy of the current example with your own choices and publish the new revision.
