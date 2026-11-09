# Aftermath

**Herkes savaşı izler. Temizlik bize kalır.**

Körfezkent'e kaiju saldırır, belediyenin robotu KALKAN-07 canavarı yere serer. Geriye yangın, enkaz ve sokağın ortasında yatan dev bir Magmadon kalır. Sen bu işi üstlenen temizlik şirketini yönetirsin.

Telefonda, tarayıcıda oynanır. Ana ekrana eklenebilir (PWA), kurulum ya da hesap gerekmez.

## Nasıl oynanır

Her iş dört adımdır: **söndür, enkazı kaldır, kes, sat.**

1. **Söndür.** Bölgeye dokun, "İtfaiye gönder". Yangın sönmeden kepçe giremez.
2. **Enkazı kaldır.** Enkaz ekibi yolu açar. Yol açılmadan kesim ekibi giremez.
3. **Kes.** Kesim ekibi canavarı parçalar. Pul, kemik, magma özü ve göz depoya girer.
4. **Sat.** Depoda Hurdacı Rıza her şeyi alır ama ucuza. Daha iyi alıcılar ve fabrika ileride açılır.

Parayla yeni araç alırsın; araç çoğaldıkça işler hızlanır. İş süresini erken bitirirsen prim alırsın, geç kalırsan ödeme kesilir.

İlk işi Nevin Aksoy (Belediye Afet Koordinatörü) adım adım gösterir. Sonra ekranın üstündeki **Hedef** çubuğu bir sonraki işi söyler. Depo, Şirket, Fabrika, ihaleler ve bakım sözleşmeleri sırayla açılır. Fabrikada ilk ürünü çıkarınca işler ihaleyle gelmeye başlar: rakibin Süpürge Holding'dir. Tablodaki kazanma şansları gerçektir.

Kayıt telefonun tarayıcısında tutulur. Bakım sözleşmesi aldıktan sonra sen yokken de gelir birikir.

## Bilgisayarda çalıştırma

Derleme adımı ya da bağımlılık yok. Node 18 veya üstü yeterli:

```bash
node tools/serve.mjs              # http://localhost:5173
PORT=8080 node tools/serve.mjs    # başka port
```

Tarayıcıda telefon görünümünü aç (390 × 844). Konsolda `aftermath.step(10)` oyunu 10 saniye ileri sarar, `aftermath.scenario('tender')` hazır bir durumu yükler.

## Testler

```bash
node tests/logic/run.mjs          # oyun kuralları (Node)
node tests/e2e/ftue.cjs           # ilk oturum, sadece vurgulanan öğeye dokunarak (Playwright, iPhone 13)
node tests/e2e/smoke.cjs          # açılış, 2. ve 3. iş, kayıt/yükleme, ayarlar, kalite
node tests/e2e/run.cjs            # hepsi
node tests/shots.cjs              # inceleme ekran görüntüleri
```

## Dosyalar

```
index.html, js/main.js     kabuk ve yapıştırıcı: açılış, döngü, dokunma, kayıt, kalite
js/game/                   oyun kuralları (DOM ve 3B yok, Node'da çalışır)
js/scene/                  3B şehir, araçlar, Magmadon, KALKAN-07 (three.js)
js/ui/                     arayüz ("Saha" sistemi), css/ ve assets/ui/
js/audio.js                tüm sesler ve müzik, Web Audio ile anında üretilir
docs/DESIGN.md, docs/ARCH.md   tasarım ve mimari
```

## Lisanslar

Kod, sesler, 3B modeller ve oyun ikonları bu projeye özgüdür. Dışarıdan alınanlar (three.js MIT, Archivo ve Big Shoulders OFL, Tabler Icons MIT) ve lisans metinlerinin yerleri [LICENSES.md](LICENSES.md) dosyasındadır. Atıf gerektiren (CC-BY) hiçbir malzeme kullanılmaz.
