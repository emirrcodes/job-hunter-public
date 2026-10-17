begin;
insert into public.radar_sources(id,label,method,stage,enabled,config) values
('himalayas','Himalayas','public_json','planned',false,'{"endpoint":"https://himalayas.app/jobs/api/search","attribution_required":true}'),
('remotive','Remotive','public_json','planned',false,'{"endpoint":"https://remotive.com/api/remote-jobs","min_interval_hours":12,"delay_hours":24,"attribution_required":true}'),
('wwr','We Work Remotely','rss','planned',false,'{"endpoint":"https://weworkremotely.com/remote-jobs.rss","attribution_required":true}'),
('apify_bebity','LinkedIn via Apify / Bebity','async_actor','benchmark_pending',false,'{"actor":"bebity/linkedin-jobs-scraper","trial_verified":false}'),
('brightdata','LinkedIn via Bright Data discovery','async_discovery','benchmark_pending',false,'{"dataset_id":"gd_lpfll7v5hcqtkxl6l","trial_verified":false}'),
('greenhouse','Greenhouse company boards','company_board_json','planned',false,'{"companies":[]}'),
('lever','Lever company boards','company_board_json','planned',false,'{"companies":[]}'),
('ashby','Ashby company boards','company_board_json','planned',false,'{"companies":[]}'),
('wellfound','Wellfound','actor_candidate','research',false,'{"actor_candidate":"radeance/wellfound-job-listings-scraper","live_tested":false}'),
('eu_remote_jobs','EU Remote Jobs','undecided','research',false,'{"url":"https://euremotejobs.com/jobs/","ingestion_method_verified":false}');
commit;
