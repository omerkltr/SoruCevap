# ProjeApp Backend

Gerçek zamanlı soru-cevap oyunları için Express, MongoDB ve Socket.IO tabanlı
bir Node.js uygulamasıdır. Sunucu REST API, web arayüzü ve oyun odalarının
gerçek zamanlı iletişimini birlikte sağlar.

## Özellikler

- Kullanıcı kaydı ve JWT ile oturum doğrulama
- Oyun ve soru oluşturma, düzenleme ve silme
- Çoktan seçmeli ve açık uçlu soru desteği
- Socket.IO ile canlı oyun akışı
- Puan tablosu ve soru bazlı cevap sonuçları
- Görsel yükleme
- `public/index.html` üzerinden sunulan web arayüzü

## Proje Yapısı

```text
.
├── app.js                 # Express uygulaması ve route bağlantıları
├── server.js              # MongoDB, HTTP ve Socket.IO başlangıcı
├── middleware/
│   └── auth.js            # JWT doğrulama middleware'i
├── models/                # Mongoose veri modelleri
├── routes/
│   ├── auth.js            # Kullanıcı işlemleri
│   ├── game.js            # Oyun, soru ve sonuç API'leri
│   └── upload.js          # Görsel yükleme API'si
├── sockets/
│   └── gameSocket.js      # Gerçek zamanlı oyun olayları
├── utils/
│   └── network.js         # Yerel ağ adresi yardımcıları
└── public/
    └── index.html         # Web istemcisi
```

## Kurulum

1. Bağımlılıkları yükleyin:

   ```bash
   npm install
   ```

2. Ortam dosyasını oluşturun:

   ```bash
   cp .env.example .env
   ```

   Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

3. `.env` içindeki MongoDB bağlantısını, JWT anahtarını ve yönetici parolasını
   kendi ortamınıza göre değiştirin.

4. Geliştirme sunucusunu başlatın:

   ```bash
   npm run dev
   ```

Uygulama varsayılan olarak `http://localhost:5000` adresinde çalışır.

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm start` | Sunucuyu normal modda başlatır |
| `npm run dev` | Nodemon ile geliştirme sunucusunu başlatır |

## Temel API Grupları

- `/api/auth`: kayıt, giriş ve kullanıcı bilgisi
- `/api/games`: oyunlar, sorular, sonuçlar ve puan tabloları
- `/api/upload`: görsel yükleme
- `/api/info`: yerel sunucu ve web yöneticisi bilgisi

## Güvenlik

Gerçek `.env` dosyası Git tarafından izlenmez. `JWT_SECRET`,
`MONGODB_URI` ve `ADMIN_PASSWORD` gibi değerleri hiçbir zaman kaynak koduna
veya GitHub deposuna eklemeyin.
