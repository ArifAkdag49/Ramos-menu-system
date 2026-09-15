# Ramo's — Menü Verisi (Seed Kaynağı)

Bu dosya veritabanı seed'inin **tek kaynağıdır**. Build oturumu buradan `supabase/seed/` altına SQL/JSON üretir; admin sonradan panelden düzenler.

- Kaynak: `docs/menu/source/ramos-menu.pdf` (8 görsel sayfa, metin katmanı yok; 2026-09-15'te elle transkribe edildi)
- Fiyatlar EUR; seed'de **kuruş** (7,50 € → 750).
- Parantez içi kodlar menüdeki alerjen (harf) / katkı maddesi (rakam) kodlarıdır → `products.allergens`.
- ⚠ = doğrulanması gereken nokta (şimdilik gösterildiği gibi seed'lenir).

## 0. Seed kuralları
1. **Ürün adları menüdeki gibi**, doğru Türkçe/Almanca karakterlerle yazılır (menüdeki "Kuzu Sis" → "Kuzu Şiş", "Acik" → "Açık"). Menüde aynı adı taşıyan ürünlerde (Pide, Calzone, Lahmacun Teller) ayırt edici açıklama ada eklenir (ör. "Pide mit Spinat & Käse").
2. Varyantlı ürünlerde `base_price_cents = null`, fiyat varyantlardan gelir. İlk varyant `is_default = true`.
3. Numarasız ürünler (tatlılar, içecekler) `code = null`.
4. Kategori sırası = aşağıdaki sıra (10, 20, 30 …); ürün sırası = tablodaki sıra.
5. Tüm malzeme/seçenek/kategori adları DE (fiş) + TR (garson arayüzü).
6. Seed **idempotent** olmalı (tekrar çalıştırınca çoğaltmamalı) — sabit `slug`/doğal anahtar üzerinden upsert.
7. **Görseller:** Tüm ürünlerde `image_path = null` (görsel alanı boş, arayüz yer tutucu gösterir). Görselleri kullanıcı sonra Admin → Menü → **Toplu görsel yükleme** ile ekler; dosya adı ürün numarasıdır (`05.jpg`, `71a.webp`, `M1.png`). Seed tekrar çalıştırıldığında `image_path` alanına **dokunmaz**.

---

## 1. Kategoriler
| Sıra | name_de | name_tr | is_beverage |
|---|---|---|---|
| 10 | Suppen | Çorbalar | – |
| 20 | Frühstück | Kahvaltı | – |
| 30 | Drehspieß | Döner | – |
| 40 | Vegetarisch & Falafel | Vejetaryen & Falafel | – |
| 50 | Beilagen | Garnitürler | – |
| 60 | Lahmacun | Lahmacun | – |
| 70 | Pide | Pide | – |
| 80 | Pizza | Pizza | – |
| 90 | Calzone | Calzone | – |
| 100 | Salate | Salatalar | – |
| 110 | Grill Gerichte | Izgaralar | – |
| 120 | Grill im Dürüm | Dürüm Izgaralar | – |
| 130 | Burger | Burger | – |
| 140 | Spar Menü | Ekonomik Menüler | – |
| 150 | Dessert | Tatlılar | – |
| 160 | Kalte Getränke | Soğuk İçecekler | ✓ |

## 2. Malzeme kütüphanesi (`ingredients`) — çıkarılabilir, fişte `OHNE:` ile DE adı basılır
| Anahtar | name_de | name_tr |
|---|---|---|
| salat | Salat | Marul |
| tomaten | Tomaten | Domates |
| gurken | Gurken | Salatalık |
| zwiebeln | Zwiebeln | Soğan |
| rotkohl | Rotkohl | Kırmızı lahana |
| weisskohl | Weißkohl | Beyaz lahana |
| gegr_gemuese | Gegrilltes Gemüse | Izgara sebze |
| weichkaese | Weichkäse | Beyaz peynir |
| gegr_tomate | Gegrillte Tomate | Közlenmiş domates |
| gegr_peperoni | Gegrillte Peperoni | Közlenmiş biber |
| joghurt | Joghurt | Yoğurt |
| tomatensosse | Tomatensoße | Domates sosu |
| butter | Butter | Tereyağı |
| knoblauch | Knoblauch | Sarımsak |
| burgersosse | Burgersoße | Burger sosu |
| rindersalami | Rindersalami | Dana salam |
| putenschinken | Putenschinken | Hindi jambon |
| sucuk | Sucuk | Sucuk |
| doenerfleisch | Drehspieß-Fleisch | Döner eti |
| haehnchen | Hähnchenfleisch | Tavuk eti |
| thunfisch | Thunfisch | Ton balığı |
| champignons | Champignons | Mantar |
| paprika | Paprika | Biber |
| mais | Mais | Mısır |
| oliven | Oliven | Zeytin |
| spinat | Spinat | Ispanak |
| ei | Ei | Yumurta |
| mozzarella | Mozzarella | Mozzarella |
| kaese | Käse | Kaşar peyniri |
| jalapenos | Jalapeños | Jalapeño |
| peperoni | Peperoni | Peperoni biberi |

### 2.1 Malzeme setleri (seed kısayolu; admin panelde "toplu atama" ile de kullanılır)
| Set | İçerik |
|---|---|
| **S_DOENER** | Salat, Tomaten, Gurken, Zwiebeln, Rotkohl *(kullanıcı onayladı)* |
| **S_GRILL** | Salat, Zwiebeln, Gegrillte Tomate ⚠, Gegrillte Peperoni ⚠ |
| **S_BURGER** | Salat, Tomaten, Gurken, Zwiebeln, Burgersoße ⚠ |

## 3. Seçim grupları (`option_groups` + `options`)
Fiş biçimi: `label_values` = "Etiket: A + B" · `values_only` = yalnız değer · `plus_each` = her biri "+ değer" satırı.

| Anahtar | admin_label | name_de / name_tr | min–max | Fiş | Seçenekler (DE / TR / fiyat farkı / bayrak) |
|---|---|---|---|---|---|
| **G_BEILAGE** | Beilage (Pommes/Reis) | Beilage / Garnitür | 1–1 | values_only | Pommes / Patates kızartması / 0 / **varsayılan** · Reis / Pilav / 0 |
| **G_SOSSE** | Soße (Döner) | Soße / Sos | 1–3 | label_values | Knoblauch / Sarımsaklı / 0 · Kräuter / Otlu / 0 · Scharfe Soße / Acı sos / 0 · ohne Soße / Sossuz / 0 / **exclusive** |
| **G_SCHARF** | scharf (Chili) | Schärfe / Acı | 0–1 | values_only | scharf (Chili) / Acılı (pul biber) / 0 |
| **G_EXTRA_DOENER** | Extras Döner/Lahmacun | Extras / Ekstralar | 0–2 | plus_each | Extra Weichkäse / Ekstra beyaz peynir / +100 · Extra Fleisch / Ekstra et / +200 |
| **G_EXTRA_PIDE** | Extras Pide | Extras / Ekstralar | 0–3 | plus_each | Extra Ei / Ekstra yumurta / +50 · Extra Käse / Ekstra peynir / +100 · Extra Gemüse / Ekstra sebze / +50 |
| **G_PIZZA_EXTRA** | Pizza: weiterer Belag (+0,70) | Extra Belag / Ekstra malzeme | 0–16 | plus_each | §3.1'deki 16 malzeme, her biri +70 |
| **G_PIZZA_MIX** | Pizza Mix: 5 Beläge | Beläge / Malzemeler | **5–5** | label_values | §3.1'deki 16 malzeme, her biri 0 |
| **G_MENU_GETRAENK** | Menü-Getränk 0,33 l | Getränk / İçecek | 1–1 | label_values | Cola · Cola Light · Fanta · Sprite · Mezzo Mix (TR aynı, 0; varsayılan yok → garson seçmek zorunda) |
| **G_LAHMACUN_ROLLE** | Im Lahmacun gerollt (+1,00) | Im Lahmacun gerollt / Lahmacuna sarılı | 0–1 | plus_each | im Lahmacun gerollt / Lahmacuna sarılı / +100 |

### 3.1 Pizza malzemeleri (G_PIZZA_EXTRA ve G_PIZZA_MIX için aynı liste)
Rindersalami / Dana salam · Putenschinken / Hindi jambon · Sucuk / Sucuk · Drehspieß-Fleisch / Döner eti · Hähnchenfleisch / Tavuk eti · Thunfisch / Ton balığı · Champignons / Mantar · Paprika / Biber · Zwiebeln / Soğan · Mais / Mısır · Oliven / Zeytin · Spinat / Ispanak · Tomaten / Domates · Jalapeños / Jalapeño · Ei / Yumurta · Mozzarella / Mozzarella

### 3.2 Varyant tipleri
| Tip | Seçenekler (DE / TR) |
|---|---|
| **V_FLEISCH** | Hähnchen / Tavuk (**varsayılan**) · Kalb / Dana |
| **V_GROESSE** | klein / Küçük (**varsayılan**) · groß / Büyük |

---

## 4. Ürünler (107)
Sütunlar: **No** · **Ürün adı** · **Açıklama** · **Fiyat** (varyantlıysa H=Hähnchen, K=Kalb) · **Malzemeler (OHNE)** · **Gruplar** · **Kod**

### 4.1 Suppen (10)
| No | Ürün | Açıklama | Fiyat | Malzemeler | Gruplar | Kod |
|---|---|---|---|---|---|---|
| 01 | Linsensuppe / Mercimek Çorbası | | 5,00 | – | – | |
| 02 | Kuttelsuppe / İşkembe Çorbası | | 6,00 | – | – | |
| 03 | Fleischsuppe / Kelle Paça | | 7,00 | – | – | |

### 4.2 Frühstück (20)
| No | Ürün | Açıklama | Fiyat | Malzemeler | Gruplar | Kod |
|---|---|---|---|---|---|---|
| 04 | Sucuk Toast | mit Knoblauchwurst & Goudakäse | 4,50 | – | – | |

### 4.3 Drehspieß (30) — V_FLEISCH
| No | Ürün | Açıklama | Fiyat | Malzemeler | Gruplar | Kod |
|---|---|---|---|---|---|---|
| 05 | Drehspieß Sandwich | im Fladenbrot mit Salat & Soße | H 7,50 / K 8,50 | S_DOENER | G_SOSSE, G_SCHARF, G_EXTRA_DOENER | a,c,g,4,7 |
| 89 | Gemüse Drehspieß Sandwich | im Fladenbrot mit gegr. Gemüse, Salat & Soße | H 8,00 / K 9,00 | S_DOENER + Gegrilltes Gemüse | G_SOSSE, G_SCHARF, G_EXTRA_DOENER | a,c,g,4,7 |
| 06 | Mega Drehspieß Sandwich | im Fladenbrot mit extra Fleisch, Salat & Soße | H 8,50 / K 9,50 | S_DOENER | G_SOSSE, G_SCHARF, G_EXTRA_DOENER | a,c,g,4,7 |
| 07 | Mini Drehspieß Sandwich | im Fladenbrot mit Salat & Soße | H 6,50 / K 7,00 | S_DOENER | G_SOSSE, G_SCHARF, G_EXTRA_DOENER | a,c,g,4,7 |
| 08 | Drehspieß Teller | mit Pommes oder Reis, Salat & Soße | H 12,50 / K 13,50 | S_DOENER | G_BEILAGE, G_SOSSE, G_SCHARF, G_EXTRA_DOENER | a,c,g,4,7 |
| 09 | Kleiner Drehspieß Teller | mit Salat & Soße | H 10,50 / K 11,50 | S_DOENER | G_SOSSE, G_SCHARF, G_EXTRA_DOENER | a,c,g,4,7 |
| 10 | Iskender Drehspieß | auf Fladenbrotwürfeln mit Tomatensoße, Joghurt & zerlassener Butter | 15,00 (varyantsız) | Tomatensoße, Joghurt, Butter | G_EXTRA_DOENER | a,c,g,4,7 |
| 11 | Drehspieß-Box | mit Pommes | H 7,50 / K 8,50 | – | G_SOSSE, G_SCHARF, G_EXTRA_DOENER | a,c,g,4,7 |
| 12 | Drehspieß Dürüm | mit Salat & Soße | H 8,00 / K 9,00 | S_DOENER | G_SOSSE, G_SCHARF, G_EXTRA_DOENER | a,c,g,4,7 |

### 4.4 Vegetarisch & Falafel (40)
| No | Ürün | Açıklama | Fiyat | Malzemeler | Gruplar | Kod |
|---|---|---|---|---|---|---|
| 13 | Vegetar. Sandwich | im Fladenbrot mit Gemüse & Weichkäse | 6,00 | S_DOENER + Weichkäse | G_SOSSE, G_SCHARF | a,c,g |
| 14 | Vegetarisches Dürüm | im Teigbrot mit Gemüse | 6,50 | S_DOENER | G_SOSSE, G_SCHARF | a,c,g |
| 15 | Falafel Sandwich | im Fladenbrot mit Salat & Soße | 6,00 | S_DOENER | G_SOSSE, G_SCHARF | a,c,g |
| 90 | Falafel Box | mit Pommes | 7,00 | – | G_SOSSE, G_SCHARF | a,c,g |
| 16 | Falafel Dürüm | im Teigbrot mit Salat & Soße | 7,00 | S_DOENER | G_SOSSE, G_SCHARF | a,c,g |
| 17 | Falafel Teller | mit Pommes oder Reis, Salat & Soße | 11,00 | S_DOENER | G_BEILAGE, G_SOSSE, G_SCHARF | a,c,g |
| 19 | Ramo's Vegetarischer Teller | mit Pommes oder Reis, Gemüse, Salat & Soße | 11,00 | S_DOENER + Gegrilltes Gemüse | G_BEILAGE, G_SOSSE, G_SCHARF | a,c,g |

### 4.5 Beilagen (50) — V_GROESSE
| No | Ürün | Açıklama | Fiyat | Malzemeler | Gruplar | Kod |
|---|---|---|---|---|---|---|
| 18 | Pommes | klein / groß | klein 3,50 / groß 4,50 | – | – | |
| 100 | Reis | klein / groß | klein 3,50 / groß 4,50 | – | – | |

### 4.6 Lahmacun (60)
| No | Ürün | Açıklama | Fiyat | Malzemeler | Gruplar | Kod |
|---|---|---|---|---|---|---|
| 92 | Açık Lahmacun | ohne alles | 5,00 | – | – | a,c,g |
| 20 | Lahmacun | mit Salat & Soße | 6,50 | S_DOENER | G_SOSSE, G_SCHARF, G_EXTRA_DOENER | a,c,g |
| 21 | Lahmacun mit Drehspieß | mit Drehspieß, Salat & Soße | H 9,00 / K 9,50 (V_FLEISCH) | S_DOENER | G_SOSSE, G_SCHARF, G_EXTRA_DOENER | a,c,g,4,7 |
| 22 | Lahmacun Teller mit Drehspieß | 1 Stück mit Drehspieß, Salat & Soße | 10,00 ⚠ (et seçimi yok mu?) | S_DOENER | G_SOSSE, G_SCHARF, G_EXTRA_DOENER | |
| 93 | Lahmacun Teller | 1 Stück mit Salat & Soße | 7,00 | S_DOENER | G_SOSSE, G_SCHARF, G_EXTRA_DOENER | |

### 4.7 Pide (70) — hepsinde G_EXTRA_PIDE
| No | Ürün | Açıklama | Fiyat | Malzemeler | Gruplar | Kod |
|---|---|---|---|---|---|---|
| 23 | Pide mit Gouda & Käse | Teigschiffchen | 8,00 | – | G_EXTRA_PIDE | a,c,g,2 |
| 24 | Pide mit Spinat & Käse | Teigschiffchen | 9,00 | – | G_EXTRA_PIDE | a,c,g,2 |
| 25 | Pide mit Hackfleisch & Käse | Teigschiffchen | 10,00 | – | G_EXTRA_PIDE | a,c,g,2 |
| 26 | Pide mit Hackfleisch | Teigschiffchen | 9,00 | – | G_EXTRA_PIDE | a,c,g |
| 27 | Pide mit Sucuk | Teigschiffchen | 9,00 | – | G_EXTRA_PIDE | a,c,g,1,2,3,5 |
| 28 | Pide mit Thunfisch | Teigschiffchen | 9,00 | – | G_EXTRA_PIDE | a,c,g,2,4,7 |
| 29 | Pide mit frischem Gemüse | Teigschiffchen | 10,00 | – | G_EXTRA_PIDE | a,c,g,2 |

### 4.8 Pizza (80) — hepsinde G_PIZZA_EXTRA
| No | Ürün | Açıklama | Fiyat | Malzemeler | Ek grup | Kod |
|---|---|---|---|---|---|---|
| 30 | Pizza Margherita | | 7,00 | – | | a,e,g |
| 31 | Pizza Rindersalami | | 9,00 | Rindersalami | | a,c,g,2,3,4 |
| 32 | Pizza Putenschinken | (Formfleischschinken) | 9,00 | Putenschinken | | a,c,g,2,3,4,6 |
| 33 | Pizza Mista | mit Rindersalami & Putenschinken | 9,00 | Rindersalami, Putenschinken | | a,c,g,2,3,4,6 |
| 34 | Pizza Sucuk | mit türk. Knoblauchwurst | 9,00 | Sucuk | | a,c,g,1,2,3,5 |
| 35 | Pizza Special | mit Spinat & Ei | 9,00 | Spinat, Ei | | a,e,g,2 |
| 36 | Pizza Mozzarella | mit Mozzarella & Tomaten | 9,00 | Mozzarella, Tomaten | | a,e,g,2 |
| 37 | Pizza Funghi | mit frischen Champignons | 8,50 | Champignons | | a,e,g,2 |
| 38 | Pizza Thunfisch | mit Zwiebeln | 9,00 | Thunfisch, Zwiebeln | | a,c,d,g,2 |
| 39 | Pizza Drehspieß | mit Fleisch & Zwiebeln | 9,50 | Drehspieß-Fleisch, Zwiebeln | | a,c,g,2,4,7 |
| 40 | Pizza Fitness | mit Hähnchenfleisch & Champignons | 9,50 | Hähnchenfleisch, Champignons | | a,c,g,2,4,7 |
| 41 | Pizza Hähnchen | mit gegrilltem Hähnchenfleisch | 10,50 | Hähnchenfleisch | | a,c,g,2 |
| 42 | Pizza Lahmacun | mit Paprika, Champignons, Spinat & Mais | 9,50 | Paprika, Champignons, Spinat, Mais | | a,c,g,2 |
| 43 | Pizza Spezial | mit Salami, Zwiebeln, Paprika, Spinat, Putenschinken & Champignons ⚠ (menüde "Spinat (Formfleischschinken), Champign. & Paprika" diye tekrarlı yazılmış) | 10,00 | Rindersalami, Zwiebeln, Paprika, Spinat, Putenschinken, Champignons | | a,c,g,2,3,4,5 |
| 44 | Pizza Vitamino | mit Champignons, Paprika, Spinat & Ei | 10,00 | Champignons, Paprika, Spinat, Ei | | a,c,g,2 |
| 45 | Pizza Vegetari | mit Mais, Tomaten, Oliven, Paprika, Zwiebeln & Champignons | 10,00 | Mais, Tomaten, Oliven, Paprika, Zwiebeln, Champignons | | a,c,g,2 |
| 46 | Pizza Chef | mit Salami, Champignons, Putenschinken (Formfleischschinken), Jalapeños & Ei | 10,00 | Rindersalami, Champignons, Putenschinken, Jalapeños, Ei | | a,e,g,2,3,4,6 |
| 47 | Pizza Mix | mit 5 Belägen nach Wahl | 11,50 | – | **G_PIZZA_MIX** | a,c,g,4,7 |
| 102 | Pizza Ramos | mit Ei | 8,00 | Ei | | a,c,g,4,7 |
| 103 | Pizza Brot | | 6,00 | – | | a,c,g,4,7 |

Menü notu: "Jeder weitere Belag 0,70 €" → G_PIZZA_EXTRA.

### 4.9 Calzone (90) — hepsinde G_PIZZA_EXTRA ⚠ (pizzadaki ek malzeme kuralı calzone için de geçerli mi?)
| No | Ürün | Açıklama | Fiyat | Malzemeler | Kod |
|---|---|---|---|---|---|
| 53 | Calzone mit Drehspieß & Zwiebeln | | 10,00 | Drehspieß-Fleisch, Zwiebeln | a,c,g,2,4,7 |
| 54 | Calzone mit Spinat & Käse | | 10,00 | Spinat, Käse | a,c,g,2 |
| 55 | Calzone mit Sucuk & Käse | | 10,00 | Sucuk, Käse | a,c,g,1,2,3,5 |
| 56 | Calzone mit Thunfisch & Zwiebeln | | 10,00 | Thunfisch, Zwiebeln | a,c,d,g,2 |

### 4.10 Salate (100)
| No | Ürün | Açıklama | Fiyat | Malzemeler | Kod |
|---|---|---|---|---|---|
| 94 | Beilagensalat | | 3,50 | – | |
| 48 | Frühlingssalat | mit grünem Salat, Tomaten, Gurken, Zwiebeln & Mais ⚠ (görselde kısmen kapalı) | 7,00 | Salat, Tomaten, Gurken, Zwiebeln, Mais | |
| 49 | Thunfisch Salat | mit grünem Salat, Tomaten, Zwiebeln, Oliven & Peperoni ⚠ | 8,00 | Salat, Tomaten, Zwiebeln, Oliven, Peperoni | |
| 50 | Fitness Salat | mit grünem Salat, Tomaten, Gurken, Mais, Paprika & Dönerfleisch | 9,00 | Salat, Tomaten, Gurken, Mais, Paprika | |
| 51 | Mix Salat | mit grünem Salat, Tomaten, Gurken, Kraut, Weichkäse & Oliven | 7,50 | Salat, Tomaten, Gurken, Weißkohl, Weichkäse, Oliven | c,g,2 ⚠ |
| 52 | Hähnchen Salat | gemischter Salat mit gegrilltem Hähnchenfleisch | 10,00 | Salat, Tomaten, Gurken, Zwiebeln ⚠ | |

### 4.11 Grill Gerichte (110) — kodların hepsi a,c,g
| No | Ürün | Açıklama | Fiyat | Malzemeler | Gruplar |
|---|---|---|---|---|---|
| 57 | Adana Kebap | Hackfleischspieß, mit Pommes oder Reis & Salat | 13,50 | S_GRILL | G_BEILAGE |
| 58 | Adana Kebap | Hackfleischspieß, mit Pommes oder Reis & Salat ⚠ (57 ile farkı?) | 16,00 | S_GRILL | G_BEILAGE |
| 59 | Kuzu Şiş | Lammspieß, mit Pommes oder Reis & Salat | 15,00 | S_GRILL | G_BEILAGE |
| 60 | Kuzu Şiş | Lammspieß, mit Pommes oder Reis & Salat ⚠ | 17,50 | S_GRILL | G_BEILAGE |
| 61 | Tavuk Şiş | Hähnchenbrust-Spieß, mit Pommes oder Reis & Salat | 12,50 | S_GRILL | G_BEILAGE |
| 62 | Tavuk Şiş | Hähnchenbrust-Spieß, mit Pommes oder Reis & Salat ⚠ | 14,50 | S_GRILL | G_BEILAGE |
| 64 | Adana-Tavuk Şiş | 1x Hackfleischspieß + 1x Hähnchenspieß, mit Pommes oder Reis & Salat | 16,00 | S_GRILL | G_BEILAGE |
| 66 | Tavuk Kanat | Hähnchenflügel, mit Pommes oder Reis & Salat | 14,00 | S_GRILL | G_BEILAGE |
| 67 | Yoğurtlu Adana | Hackfleischspieß mit Joghurt | 17,00 | Joghurt | – |
| 68 | Beyti Sarma | Hackfleischspieß gerollt mit Tomatensoße, Joghurt & Beilage | 17,00 | Tomatensoße, Joghurt | G_BEILAGE ⚠ |
| 69 | Ali Nazik | Hackfleischspieß mit Joghurt, Aubergine & Knoblauch | 17,00 | Joghurt, Knoblauch | – |
| 70 | Cevapcici | 8 Stück, mit Pommes oder Reis & Salat | 16,00 | S_GRILL | G_BEILAGE |
| 71 | Köfte Teller | Gegrillte Frikadellen, mit Pommes oder Reis & Salat | 16,00 | S_GRILL | G_BEILAGE |
| 71a | Köfte Sandwich | Gegrillte Frikadellen, mit Salat & Soße | 9,00 | S_DOENER | G_SOSSE, G_SCHARF |
| 72 | Pirzola | Lammkotelett(s), mit Pommes oder Reis & Salat | 19,50 | S_GRILL | G_BEILAGE |
| 74 | Karışık Izgara (1 Person) | Gemischter Grillteller mit Pommes oder Reis & Salat | 23,00 | S_GRILL | G_BEILAGE |
| 75 | Karışık Izgara (2 Personen) | Gemischter Grillteller mit Pommes oder Reis & Salat | 44,00 | S_GRILL | G_BEILAGE |
| 76 | Karışık Izgara (3 Personen) | Gemischter Grillteller mit Pommes oder Reis & Salat | 63,00 | S_GRILL | G_BEILAGE |

### 4.12 Grill im Dürüm (120) — "auf Wunsch im Lahmacun gerollt, Aufpreis +1,00 €"
| No | Ürün | Açıklama | Fiyat | Malzemeler | Gruplar | Kod |
|---|---|---|---|---|---|---|
| 77 | Adana Dürüm | mit Salat & Soße | 9,50 | S_DOENER | G_SOSSE, G_SCHARF, G_LAHMACUN_ROLLE | a,c,g |
| 78 | Tavuk Şiş Dürüm | mit Salat & Soße ⚠ (menüde açıklama yok) | 9,00 | S_DOENER | G_SOSSE, G_SCHARF, G_LAHMACUN_ROLLE | a,c,g |
| 79 | Kuzu Şiş Dürüm | mit Salat & Soße | 10,50 | S_DOENER | G_SOSSE, G_SCHARF, G_LAHMACUN_ROLLE | a,c,g |

### 4.13 Burger (130) — başlık menüde "Burger & Calamaris" ⚠ (Calamari ürünü yok)
| No | Ürün | Açıklama | Fiyat | Malzemeler | Gruplar | Kod |
|---|---|---|---|---|---|---|
| 80 | Hamburger | | 6,50 | S_BURGER | – | a,c,g,k |
| 81 | Hamburger Menü | mit Pommes + 1 Softdrink 0,33 l | 11,00 | S_BURGER | G_MENU_GETRAENK | a,c,g,k |
| 82 | Cheeseburger | | 7,00 | S_BURGER | – | a,c,g,k,2 |
| 83 | Cheeseburger Menü | mit Pommes + 1 Softdrink 0,33 l | 11,50 | S_BURGER | G_MENU_GETRAENK | a,c,g,k,2 |
| 84 | Chickenburger | | 6,50 | S_BURGER | – | a,c,g |
| 85 | Chickenburger Menü | mit Pommes + 1 Softdrink 0,33 l | 11,00 | S_BURGER | G_MENU_GETRAENK | a,c,g |
| 87 | Chicken Nuggets | mit Pommes | 8,50 | – | – | a,c,g |

### 4.14 Spar Menü (140) — hepsi "mit Pommes & 1 Softgetränk 0,33 l"
| No | Ürün | Fiyat | Malzemeler | Gruplar |
|---|---|---|---|---|
| M1 | Drehspieß Sandwich Menü | H 11,00 / K 12,00 (V_FLEISCH — kullanıcı onayladı) | S_DOENER | G_SOSSE, G_SCHARF, G_MENU_GETRAENK |
| M2 | Drehspieß Dürüm Menü | H 11,50 / K 12,50 (V_FLEISCH) | S_DOENER | G_SOSSE, G_SCHARF, G_MENU_GETRAENK |
| M3 | Lahmacun Menü mit Drehspießfleisch | H 12,00 / K 13,50 (V_FLEISCH) | S_DOENER | G_SOSSE, G_SCHARF, G_MENU_GETRAENK |
| M4 | Falafel Sandwich Menü | 10,50 | S_DOENER | G_SOSSE, G_SCHARF, G_MENU_GETRAENK |
| M5 | Falafel Dürüm Menü | 11,00 | S_DOENER | G_SOSSE, G_SCHARF, G_MENU_GETRAENK |

### 4.15 Dessert (150)
| No | Ürün | Fiyat | Kod |
|---|---|---|---|
| – | Baklava | 4,50 | a,h |
| – | Halka Tatlı | 2,00 | |

### 4.16 Kalte Getränke (160) — `is_beverage`
| No | Ürün | Fiyat | Kod |
|---|---|---|---|
| – | Cola 0,33 l | 2,50 | 1,3,9 |
| – | Cola Light 0,33 l | 2,50 | 1,3,9,12 |
| – | Fanta 0,33 l | 2,50 | 1,3 |
| – | Sprite 0,33 l | 2,50 | 1 |
| – | Mezzo Mix 0,33 l | 2,50 | 1,3,9 |
| – | Mineralwasser 0,5 l | 2,50 | |
| – | Stilles Wasser 0,5 l | 2,50 | |
| – | Ayran 0,25 l | 2,00 | |

**Sayım:** 3 + 1 + 9 + 7 + 2 + 5 + 7 + 20 + 4 + 6 + 18 + 3 + 7 + 5 + 2 + 8 = **107 ürün**. Seed testi bu sayıyı ve örnek fiyatları doğrulamalı (ör. 05 Kalb = 850, 47 Pizza Mix = 1150 + G_PIZZA_MIX min=max=5, M3 Kalb = 1350).

---

## 5. Diğer seed verileri

### 5.1 Masalar
`Tisch 1` … `Tisch 12` (sort 1–12, aktif). Gerçek sayı kullanıcıdan gelince güncellenir.

### 5.2 Ayarlar (`settings`, id = 1)
| Alan | Değer |
|---|---|
| restaurant_name | Ramo's Döner & Grill House |
| ticket_header | RAMO'S · KÜCHE |
| ticket_footer | *(boş)* |
| business_day_start | 05:00 |
| printer_host | *(boş — kurulumda girilir)* |
| printer_port | 9100 |
| printer_codepage / number | cp857 / 61 |
| printer_transliterate | false |

### 5.3 Hızlı notlar (`quick_notes`, DE / TR)
Soße separat / Sos ayrı · wenig Soße / Az sos · extra Soße / Bol sos · gut durch / İyi pişmiş · extra knusprig / Ekstra çıtır

### 5.4 İptal sebepleri (`cancel_reasons`, DE / TR)
Gast hat storniert / Müşteri vazgeçti · Falsch eingegeben / Yanlış giriş · Nicht lieferbar / Ürün kalmadı · Sonstiges / Diğer *(seçilirse serbest metin zorunlu)*

### 5.5 Alerjen lejantı (`allergen_legend`) — ⚠ TASLAK, işletmeyle teyit edilecek
Menüdeki harfler sıralı a–n kullanımıyla uyumlu görünüyor (ör. burger ekmeği = k Sesam, baklava = h Schalenfrüchte):

| Kod | DE | TR |
|---|---|---|
| a | Glutenhaltiges Getreide | Glutenli tahıl |
| b | Krebstiere | Kabuklu deniz ürünleri |
| c | Eier | Yumurta |
| d | Fisch | Balık |
| e | Erdnüsse | Yer fıstığı |
| f | Soja | Soya |
| g | Milch/Laktose | Süt/Laktoz |
| h | Schalenfrüchte | Sert kabuklu yemişler |
| i | Sellerie | Kereviz |
| j | Senf | Hardal |
| k | Sesam | Susam |
| l | Schwefeldioxid/Sulfite | Kükürt dioksit/Sülfit |
| m | Lupinen | Acı bakla |
| n | Weichtiere | Yumuşakçalar |
| 1 | mit Farbstoff | Renklendirici |
| 2 | mit Konservierungsstoff | Koruyucu |
| 3 | mit Antioxidationsmittel | Antioksidan |
| 4 | mit Geschmacksverstärker | Lezzet artırıcı |
| 5 | geschwefelt | Kükürtlenmiş |
| 6 | geschwärzt | Karartılmış |
| 7 | mit Phosphat | Fosfat |
| 8 | mit Milcheiweiß | Süt proteini |
| 9 | koffeinhaltig | Kafeinli |
| 10 | chininhaltig | Kininli |
| 11 | mit Süßungsmittel | Tatlandırıcı |
| 12 | enthält eine Phenylalaninquelle | Fenilalanin kaynağı içerir |
| 13 | gewachst | Mumlanmış |

---

## 6. Açık noktalar (seed'i engellemez; admin panelden düzeltilir)
1. 57/58 Adana, 59/60 Kuzu Şiş, 61/62 Tavuk Şiş: aynı ad + açıklama, farklı fiyat → fark nedir (1/2 şiş? porsiyon?) — **kullanıcı: "olduğu gibi girilsin"**.
2. 22 Lahmacun Teller mit Drehspieß: tek fiyat — et seçimi var mı?
3. "Burger & Calamaris" başlığı — Calamari ürünü var mı?
4. 48/49 salata açıklamaları görselde kısmen kapalı; 52 Hähnchen Salat malzemeleri.
5. 43 Pizza Spezial açıklaması tekrarlı yazılmış.
6. S_GRILL (közlenmiş domates/biber) ve S_BURGER (Burgersoße) içerikleri tahmin.
7. Calzone'da "Jeder weitere Belag +0,70" geçerli mi?
8. Sıcak içecek (Çay, Kaffee) menüde yok.
9. Alerjen lejantı (§5.5) işletmenin kendi lejantıyla teyit edilmeli.
10. Menü numaraları mevcut kasadaki numaralarla aynı mı (garsonlar numarayla sipariş söylüyor mu)?
