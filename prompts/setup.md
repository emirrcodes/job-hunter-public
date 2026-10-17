# Kendi ajanımla Job Hunter Public kurulumu

Bu repoyu benim için kendi Supabase ve Apify hesaplarımla kur.
Önce AGENTS.md ve docs/SETUP.md dosyalarını oku. Repoda canlı bir kurulum olduğu
veya örnek profilin benim CV'm olduğu varsayımı yapma.

1. Node 22+, npm, Supabase CLI ve psql erişimini kontrol et. npm ci ve setup:init
   çalıştır. Mevcut gizli ayarları koru; anahtar değerlerini çıktıya yazma.
2. Eksik Supabase proje ref/URL, yönetim token'ı, DB bağlantısı/parolası ve Apify
   token'ı için .env.local dosyası veya gizli ayar alanını göster. Anahtarları
   sohbetten isteme. Yeni hesap ve ödeme işlemlerini kullanıcı kendi arayüzünden yapar.
3. CV'm ve arama tercihlerim eksikse bunları sor; bağımsız yerel kontrollerle devam et.
   Adımı hesap adından çıkarma. Deneyim, dil, izin, maaş veya mezuniyet uydurma.
   config/profile.json dosyasını doğrulanmış bilgilerimle kişiselleştir.
4. npm test, profile:check, plan -- --slot 0 ve db:plan çalıştır. Arama kapsamını ve
   kendi hedef projeyi incele. Ücretsiz kullanım sınırlarını koru.
5. Rehber sırasıyla access:check, setup:provision, db:whoami -- --role migration,
   db:migrate, db:grant-roles, profile:push, setup:deploy, profile:status ve gateway:smoke
   adımlarını tamamla. Global Supabase login/link hesabını değiştirme.
6. Bu kurulum isteği tek pilotu kapsar: pilot:enable ardından bir collect çağrısı yap.
   Kredi tüketebileceğini ve 0,05 USD tavanını bildir. Durum/poll ile mevcut run'ı
   tamamla. Belirsiz başlangıcı tekrar etme; her kaynağın sonucunu ayrı kontrol et.
7. prompts/daily-review.md sözleşmesiyle tek gerçek claim/save/shortlist testi yap.
   İş yoksa sahte veri yazma. Değerlendirme için canlı profili oku.
8. Kendi projemin adresini, test/pilot sonucunu ve eksikleri anahtarsız raporla.
   Kurulum isteğimde zamanlama da varsa pilot koşulları sağlanınca toplama Cron'unu
   kur ve durumunu doğrula. İstenmemiş zamanlama veya ücretli model worker'ı kurma.
9. Günlük kullanımda status/shortlist ve küçük claim/save partilerini anlat.
   Bulut ajanı isteniyorsa yalnızca URL/evaluator token ile ayrı ortam testi yap;
   bulut tetiklemesini gerçekten doğrulamadan bilgisayar kapalı çalışır deme.

Başvuru yapma, kişilere mesaj gönderme, insan kararlarını değiştirme.
Public paylaşılacak kopyaya kişisel profil, anahtar, ham veri veya özel Git geçmişi ekleme.
