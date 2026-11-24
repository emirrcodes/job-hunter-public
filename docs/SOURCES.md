# Job sources

| Source | Collection | Coverage |
|---|---|---|
| [Himalayas](https://himalayas.app/api) | Public JSON search | Remote jobs. Searches by role, country and employment type. |
| [Remotive](https://remotive.com/remote-jobs/api) | Public JSON feed | Remote jobs. Optional category filter. Their public API may include a delay. |
| [We Work Remotely](https://weworkremotely.com/remote-job-rss-feed) | RSS | Bounded sample of the remote feed, filtered locally. |
| [LinkedIn through Apify](https://apify.com/bebity/linkedin-jobs-scraper) | Optional Actor using your Apify account | Geography and work mode from the verified LinkedIn search URL. Account and run caps apply. |

Review source terms and preserve attribution and original links. Results are a bounded snapshot and depend on the role, geography and source availability. To cover other markets or providers, adapt an adapter in your own copy and add tests for its input, provenance and normalization. Unimplemented catalog entries in `config/sources.json` do not run.

## Optional Apify sources you can add

These community Actors are examples for a coding agent to evaluate and integrate into your local copy. LinkedIn can stay disabled when you add another source.

| Platform | Apify Store example | Useful for |
|---|---|---|
| Kariyer.net | [Kariyer.net Jobs Scraper](https://apify.com/scrapeai/kariyer-jobs-scraper) | Jobs in Türkiye |
| Indeed and Glassdoor | [Jobs Scraper](https://apify.com/utils/jobs-scraper) | General job searches in countries the Actor supports |
| Google Jobs | [Google Jobs Scraper](https://apify.com/steadyscrape/google-jobs-scraper) | Finding listings aggregated from job boards and employer sites |
| Wellfound | [Wellfound Jobs Scraper](https://apify.com/webdatatools/wellfound-jobs-scraper) | Startup roles |
| Upwork | [Upwork Jobs Scraper](https://apify.com/accountable_eel/upwork-jobs-lookup) | Freelance projects |

Ask the user which market and sources they want. Check the chosen Actor’s country coverage, input schema, sample output, current price and maximum spend before using it. Adapt the collector and field mapping in the local copy, preserve source attribution, and verify a small sample before enabling scheduled runs.
