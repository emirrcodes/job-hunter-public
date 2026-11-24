# Set up this Job Hunter copy for me

Clone the repository into my workspace. Read `AGENTS.md`, `docs/SETUP.md` and `docs/SEARCH_PROFILE.md`. Ask me for the roles I want, locations, eligibility or sponsorship constraints, employment types, work arrangements, seniority, preferred languages, report language, and the experience I want the reviewer to use. Ask which sources I want. Use my answers to replace the fictional example in `local/profile.json`, including the title filters, geography and search rotation. Keep private CV and other working files under `local/`.

Adapt the configuration or code in my local copy when a source cannot represent the requested search. Tell me which part of my search each enabled source covers. Do not invent a LinkedIn location ID. If I want LinkedIn, ask me for a verified geography and help me check the current Apify account and Actor costs. Use the default cost limits. If I choose not to use LinkedIn, disable its source and leave Apify unconfigured.

Prepare the local profile and run tests. Show me the search plan and ask me to enter my own project credentials in `.env.local` using a private editor. Keep actual secrets out of chat and shell output. Verify the Supabase target before writing. Follow the migration, deploy and smoke steps. Confirm before starting a real collection run that may use Apify credit. Only set up the collection schedule if I ask for it.

Once a real candidate exists, use my live profile and the scoped evaluator token to complete one claim, save and shortlist round trip. Tell me which checks passed, which sources actually ran and what is still pending. Keep the review available when I request it.
