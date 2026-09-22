#!/usr/bin/env bash
# Ramo's — Supabase projesini uyanık tutar (Plesk sunucusu, cron: /etc/cron.d/ramos-ping).
#
# Neden: ücretsiz planda projeye 7 gün boyunca hiç istek gelmezse Supabase projeyi uyutur
# (docs/KURULUM.md §10). Restoran kapalıyken bile günde iki kez gerçek bir API isteği atılır:
# herkese açık QR menü RPC'si (`public_menu`) — anon anahtarıyla, tam olarak bir müşterinin
# telefonunun yaptığı istek. Böylece hem PostgREST hem veritabanı çalışmış olur.
#
# Bağlantı: /opt/backups/ramos/ping.env (chmod 600), tırnaksız KEY=value satırları:
#   SUPABASE_URL=https://<project-ref>.supabase.co
#   SUPABASE_ANON_KEY=…        (tarayıcıya da giden herkese açık anahtar; sır değildir)
# Dosya kabukta çalıştırılmaz; yalnız bu iki anahtar okunur.
#
# Çıktı: "<zaman> ok <http-kodu> <bayt>" ya da hata satırı + sıfırdan farklı çıkış kodu.
# Günlük: /var/log/ramos-ping.log (cron yönlendirir), 30 günden eskisi logrotate'e bırakılmıştır.
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

env_file=/opt/backups/ramos/ping.env
timeout_s=20

fail() { echo "$(date -Is) HATA: $*" >&2; exit 1; }

[[ -r "$env_file" ]] || fail "$env_file okunamadı"
url=''; key=''
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    SUPABASE_URL=*) url="${line#SUPABASE_URL=}" ;;
    SUPABASE_ANON_KEY=*) key="${line#SUPABASE_ANON_KEY=}" ;;
  esac
done < "$env_file"
[[ -n "$url" && -n "$key" ]] || fail "SUPABASE_URL / SUPABASE_ANON_KEY eksik"

# Anahtar komut satırında (ps çıktısında) görünmesin diye başlıklar geçici bir dosyadan okunur.
# `-H @-` kullanılamaz: --data ile aynı anda stdin okunamıyor.
hdr="$(mktemp)"
trap 'rm -f "$hdr"' EXIT
printf 'apikey: %s
Authorization: Bearer %s
Content-Type: application/json
' "$key" "$key" > "$hdr"

# -o: gövde atılır (menü ~45 kB), -w: durum kodu + indirilen bayt.
read -r code bytes < <(
  # Satır sonu şart: `read` satırsız çıktıda başarısız sayılır (kabuk tuzağı).
  curl -sS --max-time "$timeout_s" -o /dev/null -w '%{http_code} %{size_download}
'        -X POST "$url/rest/v1/rpc/public_menu" -H @"$hdr" --data '{}'
) || fail "istek gönderilemedi"

[[ "$code" == 200 ]] || fail "beklenmeyen yanıt: $code"
echo "$(date -Is) ok $code $bytes"
