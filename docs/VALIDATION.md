# Public sürüm doğrulaması

Bu sürüm çalışan bir kişisel sistemin kodundan, ayrı ve temiz Git geçmişiyle
hazırlanmıştır. Kişisel CV kanıtı, canlı proje adresi, sırlar, ham veri ve önceki
kurulum raporları bu public kopyaya taşınmamıştır. Mevcut dört migration dosyası
checksum uyumu için değiştirilmemiştir; eski varsayılan profil etiketi kişisel veri
içermez ve `profile:push` sonrasında canlı profil sürümü kullanılır.

Yayın hazırlığında 24 Node testi ve 69 SQL kontrolü geçti; migration runner iki kez
çalıştırıldı. Gateway smoke yeni bir hesap üzerinde bu aşamada çalıştırılmadı.

Yerel kontroller:

- `npm test` / `npm run check`: normalizasyon, kaynak adaptörleri, profil/ülke
  kontrolleri, sorgu rotasyonu, ilk kurulumun tekrarlanabilirliği, hedef doğrulaması.
- `npm run profile:check`, `npm run plan -- --slot 0`: örnek profil ve ağsız plan.
- `npm run db:test`: özel Unix socket'te ayrı geçici PostgreSQL; migration runner'ı
  iki kez çalıştırma, rol izinleri, kuyruk, budget/idempotency ve profil SQL testleri.
  `PGBIN`, `pg_config` veya PATH'ten PostgreSQL server araçları bulunur.
- `npm run release:check`: Git'e dahil edilen dosyalar ve yaygın anahtar kalıpları.
- CI aynı yerel kontrolleri Linux/Node 22 üzerinde çalıştırır.

Bu kontroller arkadaşınızın yeni Supabase/Apify hesabında canlı kurulum testi yerine
geçmez. Yeni hesap oluşturulmamış ve yayın hazırlığında scrape başlatılmamıştır.
Her kullanıcı `docs/SETUP.md` sırasıyla kendi gateway smoke, gerçek kaynak pilotu ve
tek iş claim/save/shortlist testini yapmalıdır. Günlük AI bulut tetiklemesi ayrı
ortam doğrulaması gerektirir; bu repoyu klonlamak onu kurmaz.
