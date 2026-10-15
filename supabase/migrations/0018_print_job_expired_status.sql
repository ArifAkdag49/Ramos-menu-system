-- Fiş işine yeni son durum: 'expired' (0019 kullanır) — 3 saatten uzun süre basılamayan iş otomatik iptal edilir.
--
-- Ayrı dosya, çünkü `alter type ... add value` ile eklenen değer AYNI işlemde kullanılamaz ve
-- scripts/db.mjs her migration dosyasını tek bir işlemde uygular.
alter type public.print_job_status add value if not exists 'expired';
