#!/usr/bin/env bash
# Ramo's — gecelik Supabase veritabanı yedeği (Plesk sunucusu, cron: /etc/cron.d/ramos-backup)
#
# Üretir (klasör /opt/backups/ramos, izin 600):
#   ramos-YYYY-MM-DD.dump       public + internal şemaları (şema + veri), pg_dump -Fc
#   ramos-auth-YYYY-MM-DD.sql   auth.users + auth.identities satırları (personel girişleri)
# 30 günden eski yedekler silinir. Başarıda "<zaman> ok <boyut> …" yazar; hatada sıfırdan farklı kodla çıkar.
#
# Bağlantı: /opt/backups/ramos/.env (chmod 600), tırnaksız KEY=value satırları:
#   PGHOST=aws-0-eu-central-1.pooler.supabase.com   (session pooler, IPv4)
#   PGPORT=5432
#   PGUSER=postgres.<project-ref>
#   PGPASSWORD=…
#   PGDATABASE=postgres
# Dosya kabukta çalıştırılmaz; yalnız bu beş anahtar okunur. Parola docker komut satırına düşmez (-e PGPASSWORD).
# Geri yükleme: deploy/backup/RESTORE.md
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

dir=/opt/backups/ramos
env_file="$dir/.env"
image=postgres:17-alpine
keep_days=30

fail() { echo "$(date -Is) HATA: $*" >&2; exit 1; }
trap 'echo "$(date -Is) HATA: yedek başarısız (satır $LINENO)" >&2' ERR

[[ -r "$env_file" ]] || fail "$env_file okunamadı"
while IFS= read -r line || [[ -n "$line" ]]; do
  line=${line%$'\r'}
  case "$line" in '' | '#'*) continue ;; esac
  key=${line%%=*}
  val=${line#*=}
  case "$key" in
    PGHOST | PGPORT | PGUSER | PGPASSWORD | PGDATABASE) export "$key=$val" ;;
  esac
done < "$env_file"
[[ -n "${PGHOST:-}" && -n "${PGUSER:-}" && -n "${PGPASSWORD:-}" ]] || fail "$env_file içinde PGHOST, PGUSER ve PGPASSWORD dolu olmalı"
export PGPORT="${PGPORT:-5432}" PGDATABASE="${PGDATABASE:-postgres}"

# pg araçları konteynerde çalışır (sunucuda PostgreSQL 17 istemcisi yok); bağlantı bilgisi ortamdan aktarılır.
pg() {
  docker run --rm -i --network host \
    -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE \
    "$image" "$@"
}

d=$(date +%F)
dump="$dir/ramos-$d.dump"
auth="$dir/ramos-auth-$d.sql"
tmp_dump="$dump.partial"
tmp_auth="$auth.partial"
trap 'rm -f "$tmp_dump" "$tmp_auth"' EXIT

pg pg_dump -Fc --no-owner --no-privileges -n public -n internal < /dev/null > "$tmp_dump"
pg pg_dump --data-only -t auth.users -t auth.identities < /dev/null > "$tmp_auth"

# Doğrulama: arşiv okunabiliyor ve tablo verisi içeriyor; auth dosyasında kullanıcı verisi var.
[[ -s "$tmp_dump" ]] || fail "dump dosyası boş"
tables=$(pg pg_restore --list < "$tmp_dump" | grep -c ' TABLE DATA ' || true)
[[ "$tables" =~ ^[0-9]+$ && "$tables" -gt 0 ]] || fail "dump okunamadı ya da tablo verisi yok"
grep -q '^COPY auth\.users ' "$tmp_auth" || fail "auth dosyasında auth.users verisi yok"

mv -f "$tmp_dump" "$dump"
mv -f "$tmp_auth" "$auth"

find "$dir" -maxdepth 1 -type f \( -name 'ramos-*.dump' -o -name 'ramos-auth-*.sql' \) -mtime +"$keep_days" -delete

echo "$(date -Is) ok $(du -h "$dump" | cut -f1) (tablo_verisi=$tables, auth=$(du -h "$auth" | cut -f1))"
