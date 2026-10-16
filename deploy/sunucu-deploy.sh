#!/usr/bin/env bash
# Ramos web arayüzü (ramos.arxdigitalsevice.com) — statik siteyi canlıya çıkarır. GitHub Actions (deploy.yml) çağırır:
#
#   git -C /opt/statik/ramos/kaynak show <commit>:deploy/sunucu-deploy.sh | bash -s -- <commit>
#
# Sunucuda elle (root, /opt/statik/ramos/kaynak içinden):
#   bash deploy/sunucu-deploy.sh --liste            çıkmış sürümler
#   bash deploy/sunucu-deploy.sh --geri-al          bir önceki sürüme dön
#   bash deploy/sunucu-deploy.sh --geri-al <sürüm>  o sürüme dön (--liste'deki ad)
#
# Sıra: kodu fast-forward et → Docker'daki Node ile derle (canlıya dokunulmaz) → çıktıyı
# surumler/<kısa-commit>'e kopyala → belge köküne yaz → HTTPS kontrolü. Kontrol tutmazsa
# önceki sürüm geri yazılır. Belge kökünde derlemeye ait olmayan dosyalar SİLİNMEZ.
set -euo pipefail

# Gövde fonksiyonda: script ssh'nin stdin'inden okunuyor; bash onu tamamen okuyup öyle
# çalıştırıyor, komutların stdin'i /dev/null. (Yoksa stdin okuyan bir komut script'in
# geri kalanını yutar ve bash sessizce "başarılı" biter.)
ana() {
  AD=ramos
  ALAN=ramos.arxdigitalsevice.com
  BELGE_KOKU=/var/www/vhosts/arxdigitalsevice.com/ramos.arxdigitalsevice.com
  SISTEM_KULLANICISI=arxdigitalsevice.com_s5mrfezwmec
  NODE_IMAJ=node:22-slim
  DERLE='npm ci --no-audit --no-fund && npm run build -w apps/web'
  CIKTI=apps/web/dist
  ENV_HEDEF=apps/web/.env.production   # sunucudaki .env.production derlemeden önce buraya konur (boşsa yok)

  KOK=/opt/statik/$AD
  KAYNAK=$KOK/kaynak
  SURUMLER=$KOK/surumler
  GECMIS=$KOK/.deploy-gecmisi   # "<tarih> <sürüm-dizini> <commit>"; ilk satır deploy öncesi canlının kopyası ("ilk")
  SAKLA=5

  log() { echo "[$(date +%H:%M:%S)] $*"; }

  # $1 sürüm dizini. "ilk" tam geri yükleme (--delete); diğerleri üstüne yazma.
  yaz() {
    local kaynak=$SURUMLER/$1 sil=()
    [ "$1" = ilk ] && sil=(--delete)
    rsync -a "${sil[@]}" --exclude=.well-known "$kaynak/" "$BELGE_KOKU/"
    chown -R "$SISTEM_KULLANICISI:psacln" "$BELGE_KOKU"
    find "$BELGE_KOKU" -type d -exec chmod 755 {} +
    find "$BELGE_KOKU" -type f -exec chmod 644 {} +
    chown "$SISTEM_KULLANICISI:psaserv" "$BELGE_KOKU"; chmod 750 "$BELGE_KOKU"
  }

  # Cloudflare önbelleğine takılmadan doğrudan bu sunucuya (nginx yalnız dış IP'de dinliyor): ana sayfa ve onun yüklediği ana JS
  saglikli() {
    local i sayfa js
    for i in $(seq 1 10); do
      sayfa=$(curl -fsS --max-time 10 --resolve "$ALAN:443:87.106.47.17" "https://$ALAN/" 2>/dev/null) || { sleep 3; continue; }
      js=$(echo "$sayfa" | grep -oE 'src="/assets/[^"]+\.js"' | head -1 | cut -d'"' -f2)
      [ -z "$js" ] && return 0
      curl -fsS -o /dev/null --max-time 10 --resolve "$ALAN:443:87.106.47.17" "https://$ALAN$js" && return 0
      sleep 3
    done
    return 1
  }

  eski_surumleri_temizle() {
    local tut d
    tut=$(awk '$2 != "ilk" {print $2}' "$GECMIS" | tail -n "$SAKLA")
    for d in "$SURUMLER"/*/; do
      d=$(basename "$d"); [ "$d" = ilk ] && continue
      echo "$tut" | grep -qx "$d" || rm -rf "${SURUMLER:?}/$d"
    done
  }

  cd "$KAYNAK"

  case "${1:-}" in
    --liste)
      awk '{printf "%s  %-8s %s\n", $1, $2, substr($3,1,7)}' "$GECMIS"; exit 0 ;;
    --geri-al)
      local simdiki hedef satir
      simdiki=$(tail -n1 "$GECMIS" | awk '{print $2}')
      if [ -n "${2:-}" ]; then satir=$(awk -v s="$2" '$2 == s' "$GECMIS" | tail -n1)
      else satir=$(awk -v s="$simdiki" '{l[NR]=$0; if ($2 == s) n=NR} END {if (n > 1) print l[n-1]}' "$GECMIS"); fi
      [ -n "$satir" ] || { log "dönülecek sürüm bulunamadı"; exit 1; }
      hedef=$(echo "$satir" | awk '{print $2}')
      [ -d "$SURUMLER/$hedef" ] || { log "$SURUMLER/$hedef yok (silinmiş)"; exit 1; }
      log "geri dönülüyor: $simdiki → $hedef"
      yaz "$hedef"
      git reset -q --keep "$(echo "$satir" | awk '{print $3}')"
      if saglikli; then echo "$(date -Is) $satir" | awk '{print $1, $3, $4}' >> "$GECMIS"; log "tamam"; exit 0; fi
      log "UYARI: kontrol tutmadı — elle bakılmalı"; exit 1 ;;
  esac

  YENI=${1:?commit gerekli}
  SURUM=${YENI:0:7}
  [ "$(git rev-parse --verify -q "gelen^{commit}")" = "$YENI" ] || { log "DUR: 'gelen' dalı $YENI değil"; exit 1; }
  git diff --quiet && git diff --cached --quiet || { log "DUR: kaynakta commit edilmemiş değişiklik var"; exit 1; }

  ONCEKI=$(git rev-parse HEAD)
  mkdir -p "$SURUMLER"
  if [ ! -s "$GECMIS" ]; then
    log "ilk deploy: canlının şu anki hali saklanıyor ($SURUMLER/ilk)"
    rsync -a --delete "$BELGE_KOKU/" "$SURUMLER/ilk/"
    echo "$(date -Is) ilk $ONCEKI" >> "$GECMIS"
  fi
  ONCEKI_SURUM=$(tail -n1 "$GECMIS" | awk '{print $2}')

  git merge --ff-only -q "$YENI" || { log "DUR: fast-forward değil — sunucuda GitHub'da olmayan commit var"; exit 1; }
  geri_kod() { git reset -q --keep "$ONCEKI"; }

  if [ -n "$ENV_HEDEF" ]; then
    [ -f "$KOK/.env.production" ] || { log "DUR: $KOK/.env.production yok"; geri_kod; exit 1; }
    cp "$KOK/.env.production" "$KAYNAK/$ENV_HEDEF"
  fi

  log "derleniyor: $SURUM (canlı $ONCEKI_SURUM ile çalışmaya devam ediyor)"
  rm -rf "${KAYNAK:?}/$CIKTI"
  if ! docker run --rm -v "$KAYNAK:/src" -w /src -e npm_config_cache=/src/.npm-onbellek \
      -e npm_config_update_notifier=false "$NODE_IMAJ" sh -c "$DERLE"; then
    log "DUR: derleme başarısız — canlıya dokunulmadı"; geri_kod; exit 1
  fi
  [ -f "$KAYNAK/$CIKTI/index.html" ] || { log "DUR: $CIKTI/index.html yok"; geri_kod; exit 1; }
  rm -rf "${SURUMLER:?}/$SURUM"; cp -a "$KAYNAK/$CIKTI" "$SURUMLER/$SURUM"
  git checkout -q -- .   # derleme takip edilen bir dosyayı değiştirdiyse sonraki deploy'u engellemesin

  log "yayınlanıyor"
  yaz "$SURUM"
  if saglikli; then
    echo "$(date -Is) $SURUM $YENI" >> "$GECMIS"
    eski_surumleri_temizle
    log "tamam: $SURUM canlıda"
    exit 0
  fi

  log "KONTROL TUTMADI — önceki sürüm ($ONCEKI_SURUM) geri yazılıyor"
  yaz "$ONCEKI_SURUM"
  geri_kod
  if saglikli; then log "önceki sürüm ayakta"; else log "UYARI: önceki sürüm de kontrolü geçmedi — elle bakılmalı"; fi
  exit 1
}

ana "$@" </dev/null
