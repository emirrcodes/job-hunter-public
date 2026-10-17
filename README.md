# Job Hunter Public

Kendi CV'nize göre iş ilanlarını toplayın, kendi AI ajanınızla değerlendirin.
Her kullanıcı kendi **Supabase projesini**, **Apify hesabını** ve **ajanını** kullanır.
Sistem Node.js + Supabase üzerinde çalışır.

LinkedIn ilanları Apify üzerinden, uzak işler Himalayas, Remotive ve We Work Remotely
üzerinden gelir. İlanlar tekilleştirilir, profil filtresinden geçer ve değerlendirme
kuyruğuna girer. Ajanınız CV kanıtına göre puan, gerekçe, eksik ve ülke uygunluğu yazar.
Sonuçları terminalden veya ajanınıza sorarak okuyabilirsiniz.

## Başlamak

1. GitHub'da **Use this template → Create a new repository** ile kendi private
   reponuzu oluşturun veya bu repoyu klonlayın. Kişisel profilinizi private tutun.
2. [Sıfırdan kurulum rehberini](docs/SETUP.md) izleyin: kendi Supabase projeniz ve Apify
   API token'ınız gerekir. Node 22+, npm, Supabase CLI ve PostgreSQL `psql` kullanılır.
3. `config/profile.json` içindeki örnek arama ayarlarını ve boş CV alanlarını kendinize göre doldurun.
4. [Ajan kurulum talimatını](prompts/setup.md) kendi kodlama ajanınıza verin.
5. Kurulumdan sonra [istek üzerine değerlendirme talimatını](prompts/review.md) kullanın.

Ajanınıza şu mesajı gönderebilirsiniz:

> Bu repodaki AGENTS.md, docs/SETUP.md ve prompts/setup.md dosyalarını oku.
> Kendi Supabase ve Apify hesaplarımla benim için kur. CV bilgilerimi iste,
> anahtarları sohbete yazdırmadan yerel gizli ayarlardan kullan.
> Önce testleri ve arama planını göster, ardından kurulum ve tek pilotu tamamla.

```sh
git clone https://github.com/emirrcodes/job-hunter-public.git
cd job-hunter-public
npm ci
npm run setup:init
# .env.local dosyasını kendi hesap bilgilerinizle gizlice doldurun.
# config/profile.json dosyasını kendi CV'nizle düzenleyin.
npm run profile:check
npm run plan -- --slot 0
```

Bu komutlar tek başına bulut kurulumunu yapmaz. Migration, deploy, profil yayımlama
ve pilot için [rehberin devamını](docs/SETUP.md) tamamlayın.

## Nasıl çalışır?

- **Toplama:** Supabase Edge Function kaynaklardan örneklem alır. Başarılı pilot
  sonrasında isteğe bağlı Supabase Cron ile 07.00/19.00 Türkiye saati kurulabilir.
- **Değerlendirme:** Terminal ve HTTPS erişimi olan kendi ajanınız canlı profili okur,
  küçük iş partileri sahiplenir ve kanıtlı sonuçları kaydeder.
- **Liste:** `npm run radar -- shortlist` değerlendirilmiş işleri getirir;
  `npm run radar -- status` kaynak sağlığını ve kuyruğu gösterir.
- **Kontrol:** İnsan kararları ayrı tutulur. Sistem başvuru göndermez ve kişilere mesaj atmaz.

AI değerlendirmesi yalnızca kullanıcı istediğinde yapılır; günlük otomatik ajan
kontrolü kapsamdan çıkarılmıştır. Supabase'in ilan toplama Cron'u ayrı çalışır.
İstek üzerine kullanılacak bir bulut ajanı için aynı ortamda kod, ağ erişimi ve
evaluator secret bulunmalıdır. [Ajan bağlantı rehberi](docs/CLOUD.md) ayrıntıları açıklar.

## Kapsam ve maliyet

Örnek profil Türkiye'den junior/graduate yazılım işleri ve stajlar içindir.
Tam zamanlı + staj sorguları doğrulayıcıda zorunludur; yalnızca kıdemli işler veya
stajsız arama için doğrulayıcı ve testlerin ayrıca uyarlanması gerekir.
Başka konum kullanırken doğrulanmış LinkedIn geoId gerekir.

LinkedIn başlangıcında collector kendi hesabınızın FREE planını, 5 USD aylık kredi
bilgisini ve en fazla 5 USD hesap kullanım tavanını kontrol eder. Çalışma başına
üst sınır 0,05 USD, son 31 gün rezervasyonu 3,50 USD'dir. Bunlar mevcut kodun
kabul şartlarıdır; sağlayıcı planı değişirse LinkedIn atlanır. Krediler sınırsız
veya kalıcı ücretsiz çalışma garantisi değildir. Ücretli pakete otomatik geçiş yoktur.
Apify'nin [kullanım ve maliyet belgelerini](https://docs.apify.com/account/billing)
ve kendi Supabase hesabınızın limitlerini kontrol edin. Mevcut ajan aboneliğinizin
kullanım koşulları geçerlidir; bu repo ek model API anahtarı istemez.

Kapsam sınırlı ve dönüşümlü bir aramadır; tüm ilanları bulma iddiası yoktur.
Kaynak linklerini/atıflarını koruyun; sağlayıcı kullanım koşullarını takip edin.

## Geliştirme

```sh
npm test
npm run profile:check
npm run db:test        # Yerel PostgreSQL server araçları gerekir; geçici DB açar.
npm run gateway:smoke  # Kendi deploy'unuzdan sonra; scrape başlatmaz.
```

[Profil alanları](docs/SEARCH_PROFILE.md) · [Anahtarlar](docs/KEYS.md) ·
[Test kapsamı](docs/VALIDATION.md) · [Kaynaklar](docs/SOURCES.md) · [MIT lisansı](LICENSE)
