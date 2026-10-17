# Kendi ajanınızı bağlayın

Bu repo bir model veya abonelik sağlamaz. Shell/Node 22+ ve HTTPS erişimi olan
ajanınız `scripts/radar.mjs` ile kendi Supabase gateway'inizi kullanır.

| Ortam ayarı | Değer |
|---|---|
| SUPABASE_URL | Kendi projenizin `https://<project-ref>.supabase.co` adresi |
| RADAR_EVALUATOR_TOKEN | setup:init ile oluşan evaluator token; ortamın gizli ayarında |
| Ağ | Kendi Supabase alan adınıza HTTPS/443 |
| Talimat | prompts/cloud-setup.md, ardından prompts/daily-review.md |

Günlük ajanınıza yönetim, DB, service_role, collector veya Apify anahtarı vermeyin.
Yerel `.env.local` buluta otomatik aktarılmaz. Repo fork/clone edilebilir; isterseniz
`npm run cloud:package` yalnızca istemci/talimat/profil içeren özel bir ZIP üretir.
ZIP anahtarsızdır ama kişisel profil içerir: public dosya olarak paylaşmayın.

Önce aynı ortamda status/profile, sonra bir gerçek claim/save/shortlist testi yapın.
Bu, ajan bağlantısını doğrular. Günlük tetikleyici ayrıca kurulup aynı ortam ve secret
ile gerçek çalışması doğrulanır. Repo veya ortam oluşturulması tek başına zamanlama
kurmaz. Bulut veya yerel yürütme durumunu açıkça raporlayın; ürün özelliklerini tek
bir aracın sınırından çıkarmayın. Bu repo ek ücretli model API worker'ı etkinleştirmez.

## HTTP sözleşmesi

POST `/functions/v1/job-radar`, `Authorization: Bearer <scope token>` ve JSON
`{"action":"...","params":{...}}`. Anahtarı URL'ye yazmayın. Bu bir JSON HTTP
API'sidir; MCP sunucusu değildir. Yalnızca MCP destekleyen ortam için uyumlu bir
connector/adapter ayrıca gerekir.

| Scope | Eylemler |
|---|---|
| reader | status, shortlist, profile, search_plan |
| evaluator | reader eylemleri + claim, save_evaluation, briefing_window, save_briefing, deliver_briefing |
| collector | collect, poll |

`claim` iş, hash ve 20 dakikalık lease döndürür. `profile_version`, canlı profilin
`evaluation_version` değeriyle eşleşmelidir. Profil veya ilan değiştiyse eski sonuç
zorlanmaz. `save-evaluations.mjs` hash/lease'i claim dosyasından ekler.

```sh
mkdir -p local
node scripts/radar.mjs status
node scripts/radar.mjs profile
node scripts/radar.mjs claim --limit 1 --out local/claims.json
# Ajan aşağıdaki şemayla GERÇEK değerlendirme dizisini yazar:
node scripts/save-evaluations.mjs local/claims.json local/evaluations.json
node scripts/radar.mjs shortlist
```

Değerlendirme dosyası bir JSON dizisidir. Şema örneği (örnek puanı DB'ye kaydetmeyin):

```json
[
  {
    "job_id": "<claim içindeki gerçek job.id>",
    "score": 65,
    "priority": "medium",
    "eligibility": "uncertain",
    "summary": "Gerçek sorumluluklar ve CV kanıtına dayanan kısa gerekçe",
    "reasons": ["Somut eşleşme"],
    "gaps": ["Eksik zorunlu şart veya doğrulanacak soru"],
    "evidence": [{"url": "https://example.com/job", "quote": "Kısa ilan kanıtı", "profile_evidence": "Canlı profildeki gerçek kanıt"}]
  }
]
```

`score`: 0–100 sıralama; kabul ihtimali değildir. `priority`: high/medium/low.
`eligibility`: eligible/ineligible/uncertain, konum/ikamet/çalışma izni uygunluğunu
anlatır; teknik uyumdan ayrı tutulur. Bilinmeyen koşullar uydurulmaz.

`briefing_window` son teslim edilen rapordan sonraki değerlendirmeleri ve `through`
sınırını verir. `save_briefing` için `through,body`; `deliver_briefing` için `id`
gerekir. Gerçek teslim receipt'i yoksa raporu `ready` bırakın; final cevap henüz
ulaşmadan teslim sınırını ilerletmeyin. Başvuru veya kişilere mesaj gönderme yoktur.
