# Kendi hesabınızla sıfırdan kurulum

Her kullanıcı için ayrı Supabase projesi ve Apify hesabı kullanın. İş ilanları, profil
ve değerlendirmeler o kişinin projesinde kalır. Public repo yalnızca kod ve örnek ayar içerir.

## 1. Gerekenler

- Node.js 22+ ve npm (`node --version`).
- Supabase CLI (`supabase --version`), deploy script'i bunu kullanır.
- PostgreSQL `psql` istemcisi (`psql --version`). `db:test` için ayrıca `initdb` ve `pg_ctl` gerekir.
- Kendi Supabase hesabınızda **yeni, boş bir proje**; DB parolasını özel olarak saklayın.
- Kendi Apify hesabınız ve API token'ınız. Kod FREE/5 USD plan bilgisini ve en fazla
  5 USD hesap kullanım tavanını kabul eder; hesabınız bu koşulları karşılamıyorsa
  ücretli plana geçmeyin veya kontrolleri kaldırmayın. LinkedIn adımı atlanır.
- İleride değerlendirmek için terminal ve HTTPS erişimi olan bir AI ajanı.

Kurulum hesabı açmayı veya ödeme planını değiştirmeyi otomatik yapmaz.

```sh
git clone https://github.com/emirrcodes/job-hunter-public.git
cd job-hunter-public
npm ci
npm run setup:init
```

`setup:init`, `.env.example` dosyasından `.env.local` oluşturur, dosya iznini 0600
yapar ve üç ayrı scope token'ı üretir. Tekrar çalışınca mevcut değerleri korur.
Bu noktada hiçbir bulut isteği yapılmaz.

## 2. Gizli ayarları doldurun

`.env.local` dosyasını özel bir editörde açın. Değerleri sohbete, Git'e veya shell
geçmişine yazmayın. Dosyadaki şu alanları **kendi** hesabınızdan doldurun:

| Alan | Nereden / neden |
|---|---|
| SUPABASE_PROJECT_REF | Yeni projenizin referansı (20 küçük harf) |
| SUPABASE_URL | Tam olarak `https://<kendi-project-ref>.supabase.co` |
| SUPABASE_ACCESS_TOKEN | Projeye erişen hesabın personal access token'ı; yönetim/deploy |
| RADAR_MIGRATION_DATABASE_URL | Dashboard → Connect → Direct veya Session pooler bağlantısı; parola hariç |
| RADAR_MIGRATION_DATABASE_PASSWORD | Yeni projenizin DB parolası; URL'den ayrı tutulabilir |
| APIFY_TOKEN | Apify Console → API token |
| RADAR_COLLECTOR_TOKEN / EVALUATOR_TOKEN / READER_TOKEN | `setup:init` oluşturdu; değiştirmek gerekmez |

İlk kurulumda migration bağlantısı yeni projenizin `postgres` sahibi olabilir; bu
hesap günlük ajana verilmez. Örnek URL biçimleri, gerçek host'u Dashboard'dan kopyalayın:

```text
postgresql://postgres@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
postgresql://postgres.<project-ref>@<dashboard-session-pooler-host>:5432/postgres?sslmode=require
```

IPv4 ağı kullanıyorsanız Session pooler seçin; transaction pooler (6543) migration
runner için uygun değildir. Bölge adından host üretmeyin. Ayrıntı:
[Supabase bağlantı rehberi](https://supabase.com/docs/guides/database/connecting-to-postgres).
CLI'ın global hesabını değiştirmek gerekmez; deploy ortamınızdaki access token kullanılır.

`RADAR_*_TOKEN` Supabase anon/service_role anahtarı değildir. Edge Function DB erişimi
kendi Supabase runtime'ındaki service_role sırrını kullanır; onu ajanınıza vermeyin.

## 3. CV ve arama profilinizi hazırlayın

`config/profile.json` örneği Türkiye'den junior/graduate yazılım işleri ve stajlar
arar; CV alanları boştur. Kendi konumunuzu, eğitiminizi, mezuniyet tarihinizi,
deneyim/projelerinizi, becerilerinizi ve tercihlerinizi yazın. Bilinmeyeni `null`,
`unknown` veya boş dizi bırakın. `version` için kendi sürüm adınızı kullanın.

`search_tracks`, `search.rotation`, `search.filters` ve `search.geographies` alanlarını
birlikte düşünün. Konumu değiştirirken LinkedIn geoId'sini doğrulayın ve API ülke
kodunu güncelleyin; serbest konum metni fallback'i yoktur. Örnek rotasyon ülke/EMEA
hatları içerir, bu bölgelerin tamamı çalışma izniniz olduğu anlamına gelmez.
Mevcut doğrulayıcı tam zamanlı ana hedef + yüksek öncelikli staj araması gerektirir.
[Profil rehberinde](SEARCH_PROFILE.md) alanlar ve sınırlar açıklanır.

Kişisel CV dosyanızı `local/` altında tutun. Özelleştirilmiş `config/profile.json`
kişisel veri içerir: public fork'a göndermeyin; değişiklikleri yerelde veya private repoda saklayın.

```sh
npm test
npm run profile:check
npm run plan -- --slot 0
npm run db:plan
```

`plan` ve `db:plan` ağ çağrısı yapmaz. Çıkan arama kelimelerini/konumları inceleyin.

## 4. Kendi Supabase projenize kurun

Aşağıdaki adımlar projenize rol, şema, fonksiyon ve secret yazar; scrape başlatmaz.
Hedefi `.env.local` içinden kendi yeni projeniz olarak doğrulayın.

```sh
npm run access:check
npm run setup:provision
npm run db:whoami -- --role migration
npm run db:migrate
npm run db:grant-roles
npm run profile:push
npm run setup:deploy
npm run profile:status
npm run gateway:smoke
npm run radar -- status
npm run radar -- profile
npm run radar -- search_plan --slot 0
```

`access:check` yalnızca hesap/plan/actor durumunu okur, sonuçları Git dışındaki
`local/access-report.json` içine yazar. HTTP hata kodlarını kontrol edin.
`setup:provision` iki NOLOGIN runtime rolü oluşturur; HTTP ajanı için DB parolası gerekmez.
Migration runner advisory lock ve checksum ledger kullanır. Uygulanmış dosyaları
sonradan değiştirmeyin; Supabase CLI migration ledger'ıyla karıştırmayın.

`setup:deploy` Apify ve üç scope secret'ını yalnızca seçtiğiniz projeye yükler ve
`job-radar` Edge Function'ını deploy eder. Platform JWT kontrolü kapalıdır, fonksiyon
kendi scope token'larını doğrular. Anahtarsız istek 401, yanlış kapsam 403 dönmelidir.
Bu kontrol `gateway:smoke` içinde yapılır; gerçek ilan toplamaz.

## 5. Tek gerçek pilot

Bu adım Apify kredisi tüketebilir (run üst sınırı 0,05 USD). Kaynaklar ve collection
başlangıçta kapalıdır. Aşağıdaki işlemden sonra manuel çağrı yapılabilir; Cron henüz yoktur.

```sh
npm run pilot:enable
npm run radar -- collect
npm run radar -- status
# LinkedIn running ise actor bitince:
npm run radar -- poll
npm run radar -- status
```

`collect` birden fazla kaynaktan toplar; HTTP 200 tek başına hepsinin başarılı olduğu
anlamına gelmez. Sonuçtaki her kaynak durumunu okuyun. LinkedIn asenkrondur;
`poll` yalnızca mevcut run'ı alır. `unknown` başlangıç varsa yeni scrape başlatmayın;
Apify Console'daki gerçek run ile uzlaştırın. Plan/kredi doğrulanmazsa LinkedIn atlanır.

Aynı 12 saatlik slotta tekrar collect yeni çalışma açmaz. Başarısız pilotu yeniden
başlatmak için yapay slotlar veya bütçe kontrollerini aşan müdahaleler kullanmayın.
Kaynak sonucu yoksa/bozuksa bunu açıkça raporlayın. Sahte ilan/değerlendirme üretmeyin.

## 6. Kendi ajanınızı bağlayın

Kurulum yapan ajan için `prompts/setup.md`; yalnızca değerlendirme yapacak ajan için
`prompts/cloud-setup.md` ve `prompts/daily-review.md` dosyalarını kullanın.
Değerlendiriciye sadece **SUPABASE_URL + RADAR_EVALUATOR_TOKEN** verin.
Ajanın shell/Node ve HTTPS erişimi olmalıdır; gateway doğrudan MCP sunucusu değildir.

```sh
mkdir -p local
node scripts/radar.mjs status
node scripts/radar.mjs profile
node scripts/radar.mjs claim --limit 1 --out local/claims.json
# Ajan tam ilanı ve canlı profili okuyup local/evaluations.json oluşturur.
node scripts/save-evaluations.mjs local/claims.json local/evaluations.json
node scripts/radar.mjs shortlist
```

`claim` gerçek işi 20 dakika sahiplenir; sıradan listeleme için kullanmayın.
JSON değerlendirme örneği/sözleşmesi [bulut rehberindedir](CLOUD.md).
Bekleyen iş yoksa yazma testi doğrulanmış sayılmaz.

## 7. İsteğe bağlı toplama zamanlaması

Dört kaynağın her biri **en az bir kabul edilmiş ilanla** başarılı/kısmi pilotu
bitirmeden schedule script'i Cron kurmaz. Kaynak boşsa veya LinkedIn atlandıysa
bu koşulu gizlemeyin. Önce kaynağın erişimini/profili inceleyin.

```sh
node scripts/schedule.mjs on
npm run schedule:status
# Kurulmuş zamanlamayı durdurmak için:
npm run schedule:off
```

Cron 04.00/16.00 UTC = 07.00/19.00 Türkiye saati çalışır. Ayrı 5 dakikalık poll
görevi sadece mevcut LinkedIn run'ı varsa gateway'i çağırır. Vault secret'ları
script tarafından oluşturulur. `schedule:status` kurulumdan önce pg_cron yoksa hata verebilir.
Başka saat dilimi isterseniz `supabase/setup/schedule.sql` ve ilgili belgeleri güncelleyin.

**AI ajan değerlendirmesi ayrıca tetiklenir.** Kullanıcının seçtiği ajan/zamanlayıcının
repo, token ve ağ erişimini gerçekten kullandığını test etmeden günlük görevi
kuruldu saymayın. Bir yerel zamanlayıcı bilgisayar kapalıyken çalışma garantisi vermez.
Ek model API maliyeti veya bulut aboneliği otomatik etkinleştirilmez.

## Sorun giderme

- `Unexpected/mismatched project`: ref ve URL aynı kendi projenize ait olmalı; boş placeholder bırakmayın.
- `psql` bulunamadı: PostgreSQL istemcisini kurup PATH'e ekleyin.
- `initdb` yok: DB testleri için PostgreSQL server araçlarını kurun; gerekirse `PGBIN` verin.
- DB bağlantısı yok: Dashboard host/username değerlerini ve ağınıza uygun Direct/Session seçimini kontrol edin.
- 401/403: doğru scope token'ı kullanın; tüm token'ları aynı yapmayın. Deploy'daki secret ile eşleşmeli.
- `free_budget_not_verified`: hesabınız kodun FREE/kredi/limit koşullarını karşılamıyor; ücretli fallback yok.
- `All four sources...`: schedule öncesi gerçek pilot sonuçları yetersiz; başarılıymış gibi değiştirmeyin.
- Gateway `request_failed`: deployment/migration/profil sırasını ve Supabase Function loglarını anahtarsız inceleyin.

Resmî referanslar: [Edge Function deploy](https://supabase.com/docs/guides/functions/deploy),
[Function secrets](https://supabase.com/docs/guides/functions/secrets),
[Apify kullanım](https://docs.apify.com/account/billing).
