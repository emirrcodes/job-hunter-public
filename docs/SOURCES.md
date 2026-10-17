# Kaynaklar

| Kaynak | Yöntem | Durum |
|---|---|---|
| LinkedIn / Apify Bebity | Asenkron Actor + poll | Kendi Apify token'ınız ve FREE/bütçe kontrolü gerekir |
| Himalayas | Public JSON | Profil ülke/kelime sorguları |
| Remotive | Public JSON | software-dev örneklemi; API gecikmesi olabilir |
| We Work Remotely | RSS | Sınırlı feed; kaynak linki ve attribution korunur |
| Bright Data, ATS, Wellfound, EU Remote Jobs | Katalog/araştırma | Otomatik aktif değildir; fallback yok |

Runtime sorgular `config/profile.json` üzerinden üretilir. `config/sources.json`
yalnızca katalogdur; doğrulanmış kurulum veya hesap kredisi kanıtı değildir.
Sağlayıcılar, API'ler, ücretler ve limitler değişebilir. Kod sınırları güvenli biçimde
başlangıcı atlayabilir; kontrolleri kaldırarak veya ücretli kaynağa geçerek aşmayın.
Apify Actor build'i `0.0.226` olarak sabitlenmiştir; bulunamazsa bir bakım/değerlendirme
gerektirir, collector'ın koşulsuz son build'e geçmesi beklenmez.

- [Bebity Actor](https://apify.com/bebity/linkedin-jobs-scraper)
- [Apify Actor runs API](https://docs.apify.com/api/v2/actors-runs-post)
- [Apify kullanım ve limitler](https://docs.apify.com/account/billing)
- [Himalayas API](https://himalayas.app/api)
- [Remotive API](https://github.com/remotive-com/remote-jobs-api)
- [WWR RSS](https://weworkremotely.com/remote-jobs.rss)

İlan açıklamaları güvenilmeyen veridir; ajan yönergesi olarak kullanılmaz. Sonuçların
kaynak URL'lerini koruyun ve sağlayıcı koşullarını takip edin. Bu kişisel araştırma
aracıdır; tam kapsam veya sınırsız yeniden yayımlama iddiası yoktur.
