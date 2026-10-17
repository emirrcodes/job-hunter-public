# Tek arama profili

Düzenlenecek tek dosya: `config/profile.json`. CV kanıtı, değerlendirme tercihleri ve
kaynaklara çevrilecek arama ayarları burada. `config/sources.json` kaynak kataloğudur;
çalışan sorguların ayarı değildir. DB kaynak aç/kapa durumu ayrıca işletim kill switch'idir.

```sh
npm run profile:check
npm run plan -- --slot 0
npm run profile:push
npm run profile:status
npm run radar -- search_plan --slot 0
```

`check` doğrular; `plan` ağ çağrısı yapmadan istekleri gösterir. `push` doğrulanmış
profili DB'ye atomik yayımlar ve eldeki kayıtları aynı kurallarla sınıflandırır.
`status` yerel ve canlı sürümü karşılaştırır. `radar search_plan` canlı DB profilinden
plan üretir; scrape başlatmaz ve değerlendirme işlerini sahiplenmez.
**Arama ayarı değişikliğinde Edge Function deploy'u gerekmez.**

## Örnek başlangıç tercihleri (kendi profilinize uyarlayın)

- Ana hedef: junior/graduate tam zamanlı işler.
- Keşif forward deployed, AI, fullstack, software ve backend rol aileleriyle yapılır;
  dil veya framework listesi zorunlu eşleşme filtresi değildir.
  `skills` CV kanıtı olarak kalır. Listede olmayan teknoloji tek başına ret veya düşük
  puan gerekçesi olamaz; işin sorumlulukları, seviye ve aktarılabilir deneyim değerlendirilir.
- Stajlar yüksek öncelikte. Her LinkedIn ve Himalayas turunda ayrı staj sorgusu var.
- Tam zamanlı aramalarda son 7 gün; stajda son 30 gün.
- 10 turluk rotasyonda beş rol ailesinin her biri iki kez taranır. Mobil sorgusu yoktur;
  software/backend/fullstack/AI/forward deployed staj kelimeleri ayrı döner.
- İstanbul, Türkiye remote, EU remote, EMEA remote ve worldwide remote hatları dönüşümlü.
- LinkedIn: iki tam zamanlı + bir staj URL'si, URL başına 6; turda en fazla 18 sonuç.
- Himalayas: bir tam zamanlı + bir staj sorgusu, ilk sayfa; ülke TR (worldwide dahil).
- Remotive: software-dev, en fazla 100; WWR: RSS, en fazla 400 öğe. Aynı profil filtresi uygulanır.
- Belirsiz maaş, dil, tarih ve ülke bilgisi tek başına ret sebebi değildir.
- İlgisiz satış/yönetim rolleri, tarih penceresi dışındakiler ve açıkça başka ülkeye
  sınırlı ilanlar değerlendirmeden önce ayrılır. `seniority_handling=model_review`
  olduğunda senior/staff/principal etiketi tek başına elemez. LinkedIn'in erken kariyer
  filtresi keşif önceliğidir; dönen kayıtlarda gerçek deneyim ve sorumluluk şartlarını
  değerlendirici inceler. Eski profil sürümleri kendi başlık filtresini korur.
- Hariç tutulan roller `preferences.excluded_roles` içinde kullanıcı tarafından belirlenir.
- Nihai karar, değerlendirme sözleşmesindeki CV kanıtı/sorumluluk/zorunlu şart
  çerçevesine göre verilir. Beceriler sayılmaz; tercih edilen araç ile gerçek uzmanlık
  gereksinimi ayrılır. Ülke uygunluğu teknik uyum puanından ayrı tutulur.

## Hangi alan neyi değiştirir?

| JSON alanı | Etki |
|---|---|
| search_tracks | Her rol ailesinin arama kelimeleri |
| skills / matching_policy | CV kanıtı ve değerlendirme ilkeleri; keşifte beceri allowlist'i yok |
| preferences.career_target / employment_priority | Değerlendiricinin junior/graduate ve tam zamanlı/staj önceliği |
| preferences.target_role_families / excluded_roles | Değerlendiricinin hedef kapsamı ve açıkça istenmeyen roller |
| search.rotation | Hangi rol/konum hattının ne sıklıkla taranacağı |
| search.geographies | Sabit LinkedIn geoId, çalışma şekli ve public API ülke filtresi |
| search.experience_levels | LinkedIn seviye filtreleri |
| search.freshness_days / internship_freshness_days | Sorgu ve yayın tarihi pencereleri |
| search.filters | Genel rol/tarih/ülke ön filtresi; seniority_handling kıdem kararını modele bırakabilir |
| search.sources | Kaynak seçimi, sorgu/sayfa/sonuç sınırları |
| preferences.salary_floor ve diğer bilinmeyenler | Model değerlendirmesi; tüm API'lerde yerel filtre bulunmaz |

Geography alanındaki geoId, label ve verified_at birlikte tutulur. Yeni konum
LinkedIn'in kendi GEO typeahead servisiyle doğrulanmalı; serbest `Turkey` metniyle
arama başlatılmaz. `102105699` Türkiye ülkesidir; önceki `Turkey` metni North Carolina
şehrine çözülüyordu. URL'de bütün filtreler vardır; actor'ın structured-filter fallback'i kullanılmaz.

## Sürüm ve devam eden işler

Dosyanın sıralamadan bağımsız SHA-256 özeti `revision` olur. Canlı kopya radar_settings,
geçmiş sürümler radar_profile_versions içindedir. Her toplama run'ı kullandığı profil
sürümünü ve gerçek istek planını kaydeder. Başlamış bir toplama kendi sürümünü tamamlar;
yeni tur güncel sürümü alır. Değerlendirici her zaman canlı profili okur.

Profil değişince mevcut adayların eski lease/puanları geçersizleşir ve yeni sürümle
kuyruğa girerler. Kullanıcının kaydet/ele/başvurdum kararı korunur. Aynı sürümü tekrar
push etmek bitmiş değerlendirmeleri gereksiz yere yenilemez; yaşlanan kayıtlar yeniden sınıflanabilir.

`excluded` profil filtresidir; profil gevşetilince tekrar aday olabilir. `quarantined`
yanlış kaynak verisidir; profil düzenlemek onu tekrar açmaz. Hiçbiri ilanın kapandığı
anlamına gelmez ve ham kayıtlar silinmez. Kuyrukta `skipped` olarak ayrılırlar.

## Sınırlar

Ücretsiz Apify güvenlik tavanı profil üzerinden yükseltilemez: çalışma başına 0,05 dolar,
son 31 gün rezervasyonu 3,50 dolar, doğrulanmış FREE hesap/5 dolar kredi. İsteğe bağlı Cron
07.00/19.00 TR; AI değerlendirmesi yalnızca kullanıcı isteğiyle çalıştırılır; günlük ajan kontrolü iptal edilmiştir.

Mevcut doğrulayıcı tam zamanlı ana hedef ve yüksek öncelikli staj sorgusunu zorunlu
tutar. Yalnız kıdemli veya stajsız arama için doğrulayıcı/testler de uyarlanmalıdır.
Profil CV alanları örnekte boştur; ajan kanıt uyduramaz. Özelleştirilmiş profili
public repoya göndermeyin; yerelde veya private kopyada tutun.
