import fs from 'node:fs';
import path from 'node:path';

// YALNIZ TEST: sahte TLS yazıcının kendinden imzalı sertifikası ve anahtarı (CN=ramos-test-printer,
// `openssl req -x509 -newkey rsa:2048 -nodes -days 36500` ile bir kez üretildi). Gerçek bir sırrı
// korumaz; üretim kodu (ajan paketi) bu dosyaları hiç okumaz.
export function testTlsCredentials(): { key: string; cert: string } {
  const dir = import.meta.dirname;
  return {
    key: fs.readFileSync(path.join(dir, 'test-printer-key.pem'), 'utf8'),
    cert: fs.readFileSync(path.join(dir, 'test-printer-cert.pem'), 'utf8'),
  };
}
