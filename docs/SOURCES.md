# Job sources

| Source | Collection | Coverage |
|---|---|---|
| [Himalayas](https://himalayas.app/api) | Public JSON search | Remote jobs. Searches by role, country and employment type. |
| [Remotive](https://remotive.com/remote-jobs/api) | Public JSON feed | Remote jobs. Optional category filter. Their public API may include a delay. |
| [We Work Remotely](https://weworkremotely.com/remote-job-rss-feed) | RSS | Bounded sample of the remote feed, filtered locally. |
| [LinkedIn through Apify](https://apify.com/bebity/linkedin-jobs-scraper) | Optional Actor using your Apify account | Geography and work mode from the verified LinkedIn search URL. Account and run caps apply. |

Review source terms and preserve attribution and original links. Results are a bounded snapshot and depend on the role, geography and source availability. To cover other markets or providers, adapt an adapter in your own copy and add tests for its input, provenance and normalization. Unimplemented catalog entries in `config/sources.json` do not run.
