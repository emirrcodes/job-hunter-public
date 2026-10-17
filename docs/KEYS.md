# Anahtar ve veri ayrımı

Gerçek değerler Git dışında `.env.local` veya ortamın secret ayarında saklanır.
`npm run setup:init` dosya modunu 0600 yapar. Değerleri çıktıya, sohbete, shell
argümanına, URL'ye veya issue'ya koymayın.

| Değer | Yetki / kime verilir |
|---|---|
| SUPABASE_PROJECT_REF / URL | Kendi proje hedefiniz; gizli değildir |
| SUPABASE_ACCESS_TOKEN | Yönetim, SQL, deploy; yalnızca kurulum ortamı |
| RADAR_MIGRATION_DATABASE_URL / PASSWORD | DDL/kurulum; yalnızca kurulum ortamı |
| APIFY_TOKEN | Scraper hesabı; kurulum ortamı + Function Secrets |
| RADAR_COLLECTOR_TOKEN | collect/poll; kurulum + Function Secrets + Cron Vault |
| RADAR_EVALUATOR_TOKEN | Claim/save/okuma; yalnızca değerlendirici için yeterli |
| RADAR_READER_TOKEN | Okuma; listeleme ajanı/istemcisi |
| SUPABASE_SERVICE_ROLE_KEY | Supabase otomatik server runtime sırrı; ajana verilmez |

Üç RADAR token'ı birbirinden ayrı, yüksek entropili gateway anahtarlarıdır; JWT veya
Supabase anon key değildir. Gateway bunları scope izin listesiyle doğrular.
Opsiyonel doğrudan DB erişimi için evaluator/reader URL ve parolaları kullanılabilir;
varsayılan kurulum bu rolleri NOLOGIN oluşturur ve HTTP istemcisini kullanır.
Runtime rolleri tablo sahibi/admin/service_role üyeliği almaz; sınırlı RPC izni alır.

Kişisel CV, yerel profil, raw ilan, claim, rapor ve paketler de özel veridir. Anahtar
olmadıkları için public paylaşılabilir sanmayın. `local/` Git dışındadır. Örnek
`config/profile.json` özelleştirilince kişisel veri içerir; yalnızca private kopyaya kaydedin.

`npm run release:check` yaygın anahtar biçimlerini ve yanlış eklenen yerel dosyaları
kontrol eder; kapsamlı veri gizliliği incelemesinin yerine geçmez.
