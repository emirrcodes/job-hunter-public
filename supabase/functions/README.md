# job-radar

Canlı tek Edge Function: sabit kaynak collector'ları ve kapsamlı token ile korunan
JSON HTTP API. `verify_jwt=false`; kimlik doğrulaması fonksiyon içinde yapılır.

| Scope | Eylemler |
|---|---|
| collector | collect, poll |
| reader | status, shortlist, profile, search_plan |
| evaluator | reader eylemleri + claim, save_evaluation, briefing_window, save_briefing, deliver_briefing |

Sırlar: APIFY_TOKEN ve üç ayrı RADAR_*_TOKEN. DB erişimi Supabase'in otomatik sağladığı
SUPABASE_SERVICE_ROLE_KEY ile yalnızca sunucuda. Collector/evaluator token'ları SQL
anahtarı değildir; izin listesi dışındaki eylemler 403 döner. Parametreyle SQL, kaynak URL
veya actor adı kabul edilmez.

LinkedIn asenkron başlar; dış run id kaydedilir ve istek biter. Poll mevcut run sonucunu
alır. Ücretli başlangıç POST'u otomatik tekrar edilmez. Belirsiz başlangıç `unknown`
olur; yeni LinkedIn run'ını bloklar. Normalleştirme ve tüm batch ingestion tek DB
transaction'ında çalışır; aynı run yeniden teslim edilince önceki receipt döner.

Supabase Cron toplama çağrısını günde iki kez yapar. Poll görevi DB'de aktif run yoksa
Edge Function çağrısı dahi yapmaz. Arama kelimeleri, konumlar, filtreler ve kaynak limitleri canlı tek profilden derlenir.
Kodda yalnızca provider protokolü ve ücretsiz kullanım güvenlik tavanları sabittir.
Ayar değişikliği profile:push ile yapılır; yeniden deploy gerekmez.

Deploy: `node scripts/deploy.mjs`. İstemci: `node scripts/radar.mjs <action>`.
Bulut değerlendirici bağlantısı ve JSON sözleşmesi: `docs/CLOUD.md`.
