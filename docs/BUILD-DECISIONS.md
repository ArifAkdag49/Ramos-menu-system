# Build kararları

Faz B'de belirsizlik ya da sapma olduğunda verilen kararlar (BUILD-PROMPT §2.2). Spec ile plan çelişirse spec kazanır.

| Tarih | Görev | Karar | Gerekçe |
|---|---|---|---|
| 2026-09-15 | Faz A | Kurulu olmayan `design:*` skill'leri yerine muadiller: tasarım eleştirisi → `ui-ux-pro-max` (review) + `frontend-design`; erişilebilirlik → `ui-ux-pro-max` a11y kuralları + Playwright'ta `@axe-core/playwright` ile otomatik WCAG AA taraması; UX metinleri → `brand` (ses tonu) + `ui-ux-pro-max` | BUILD-PROMPT §10 "yoksa en yakınını kullan"; kullanıcı Faz A'da onayladı |
| 2026-09-15 | Faz A | Supabase MCP yetkisiz; advisors (`/v1/projects/{ref}/advisors/security` ve `/performance`), TS tipleri ve loglar Management API + PAT ile | BUILD-PROMPT §4: MCP kolaylıktır; uçlar Faz A'da doğrulandı |
| 2026-09-15 | Faz A | Çalışma dalı `build/ramos-v1` (`main`'den); git worktree kullanılmaz | `.env`, Playwright, Docker ve zamanlanmış görev ana klasörde çalışır; commit'ler ayrı dalda kalır |
| 2026-09-15 | Görev 2 | Auth `disable_signup: true` ve `site_url = https://ramos.arxdigitalsevice.com` proje oluşturulur oluşturulmaz ayarlanır; Görev 27 yalnız doğrular | spec §12, §17.1: kayıt kapalı olmalı; açık kaldığı süre sıfırlanır |
| 2026-09-15 | Tümü | Commit son satırı `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` | Oturumun güncel imza yönergesi BUILD-PROMPT §2.3'teki satırın yerine geçer |
