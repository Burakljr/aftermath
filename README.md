# Aftermath

**Herkes savaşı izler. Sen, savaştan sonrasını temizlersin.**

Dev canavarlar şehre saldırır, savunma robotları onları yere serer. Geriye enkaz, yangın ve sokağın ortasında yatan dev bir canavar kalır. Sen, bu enkazı temizleyen şirketi yönetirsin.

## Oyun döngüsü

1. **Saldırı:** Canavar şehre düşer. Bölgeler hasar görür, yangınlar çıkar.
2. **İhale:** Belediye temizlik ihalesi açar. Fiyat ve teslim süresi teklif edip rakip firma Süpürge Holding ile yarışırsın.
3. **Temizlik:** İtfaiye, enkaz ve parçalama ekiplerini bölgelere atarsın. Yangın varken ekipler yavaş çalışır, süre geçtikçe halkın öfkesi artar.
4. **Ganimet:** Canavarın pulu, kanı, kemiği ve gözü depona girer.
5. **Fabrika:** Ham parçaları zırh, enerji hücresi, kemik beton ve müze eserine dönüştürürsün.
6. **Piyasa:** Fiyatlar arz ve talebe göre değişir. Fiyat patlamalarını yakalarsın.
7. **Büyüme:** Ekip kiralarsın, ekipman alırsın, bölgelerdeki bakım sözleşmelerine yatırım yapıp pasif gelir kazanırsın.
8. **Seçimler:** Gizli alıcılar canavar DNA'sı için servet teklif eder. Satarsan sıradaki canavar mutant olarak gelebilir.

## Teknik

- Saf HTML, CSS ve JavaScript (ES modülleri). Derleme adımı ya da bağımlılık yok.
- Telefonda tarayıcıdan oynanır, ana ekrana eklenebilir (PWA).
- Kayıt telefonun tarayıcısında tutulur (localStorage). Sen yokken pasif gelir birikir.

```
index.html            sayfa iskeleti
css/style.css         görünüm
js/data.js            oyun verileri ve denge ayarları (yeni canavar, ürün, ekip buraya eklenir)
js/sim.js             simülasyon: ekonomi, saldırı, ihale, temizlik
js/render.js          şehir, canavar ve efekt çizimleri (Canvas)
js/ui.js              paneller, pencereler, bildirimler
js/state.js           oyun durumu ve kayıt
js/main.js            oyun döngüsü
tools/serve.mjs       bilgisayarda test için yerel sunucu
```

## Bilgisayarda çalıştırma

```bash
node tools/serve.mjs
```

Ardından tarayıcıda `http://localhost:5173` adresini aç.

Test için tarayıcı konsolunda `aftermath.step(10)` oyunu 10 saniye ileri sarar.

## Yol haritası

- Yeni canavar türleri: buz, deniz, uzaylı istilası, böcek sürüsü
- Yeni şehirler ve şehirler arası genişleme
- Ses ve müzik
- İngilizce ve diğer diller
- Haftalık küresel saldırı etkinlikleri
- Play Store / App Store paketi
