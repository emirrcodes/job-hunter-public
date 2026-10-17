# Değerlendirici ajan ortamı

Mevcut, kullanıcının kendi Supabase kurulumuna yalnızca değerlendirici olarak bağlan.
AGENTS.md ve prompts/review.md dosyalarını oku.

- Node 22+ ve HTTPS erişimi gerekir. SUPABASE_URL kullanıcının kendi projesidir.
- Gerekli tek anahtar RADAR_EVALUATOR_TOKEN'dır; secret ayarından alınır ve yazdırılmaz.
- Yönetim/DB/service_role/collector/Apify anahtarı isteme. Migration, deploy,
  provision, collect ve poll çalıştırma. Toplamanın kurulduğunu ayrıca status'tan doğrula.
- Önce status ve profile çağrılarını test et. Profil kopyası yerine canlı profili kullan.
- local/ oluştur. Bir gerçek işi claim --limit 1 --out local/claims.json ile al;
  değerlendirme sözleşmesiyle değerlendirip local/evaluations.json yaz ve save-evaluations.mjs ile kaydet.
- shortlist ile sonucu kontrol et. İş yoksa yazma kısmını doğrulanmadı olarak bildir.
- Başvuru/mesaj/rapor teslim sınırını ilerletme işlemi yapma.
- Ortamın runtime/ağ/status/profile/claim/save sonucunu anahtarsız raporla.
- Bu ortam yalnızca kullanıcı istediğinde değerlendirme içindir. Günlük otomatik
  ajan kontrolü iptal edilmiştir; zamanlanmış ajan görevi oluşturma.

Gateway JSON HTTP API'sidir; yalnızca MCP destekleyen ajan için ayrıca uyumlu
bağlantı gerekir. Yerel .env.local buluta otomatik aktarılmaz. Ayrıntı docs/CLOUD.md.
