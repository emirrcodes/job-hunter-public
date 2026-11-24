# Job Hunter

Job Hunter collects job listings in your Supabase project and lets your own coding agent review them against your experience and search preferences. It gives you a shortlist with source links, fit scores, reasons and requirements to verify.

## Give this repo to your coding agent

Copy this message into a coding agent with Git and terminal access.

> Clone https://github.com/emirrcodes/job-hunter-public and read `AGENTS.md`, `prompts/setup.md` and `docs/SETUP.md`. Ask me what work I’m looking for and where I can work. Replace the sample profile with my answers in `local/profile.json`. Help me connect my own Supabase project and, if I want LinkedIn, my own Apify account. Tell me where to enter secrets privately. Show me the search plan and test results before any real collection run.

Your agent can adapt the profile or code in your local clone. If you want a remote copy for your own changes, use GitHub’s **Use this template** option to create a private repository. The job list and candidate profile stay in the Supabase project you connect. Keep the local profile and credentials private.

## Preview the kit locally

```sh
git clone https://github.com/emirrcodes/job-hunter-public.git
cd job-hunter-public
npm ci
npm run setup:init
# Replace the example values in local/profile.json with your own search and experience.
npm run check
npm run profile:check
npm run plan -- --slot 0
```

These steps create local files and show an offline search plan. [Continue to the setup guide](docs/SETUP.md).

## What you control

- **Search.** Choose roles, keywords, countries, work arrangements, seniority, employment types and sources. The starter’s customer-support profile is fictional. [Profile fields](docs/SEARCH_PROFILE.md).
- **Collection.** Start with Himalayas, Remotive or We Work Remotely for remote roles. Optionally connect LinkedIn through your Apify account after checking your chosen location and current Actor price. Source coverage varies by market. [Source guide](docs/SOURCES.md).
- **Review.** Run the agent when you want a shortlist. It uses a scoped token, compares listings to your profile and records reasons and gaps. Collection can be scheduled separately with Supabase Cron. [Review instructions](prompts/review.md).

Node.js 22+, npm, Git, the Supabase CLI, PostgreSQL `psql` and an agent with terminal and HTTPS access are used for setup. The kit has no separate model API requirement. Supabase, Apify and your agent have their own usage limits and terms. [MIT license](LICENSE).
