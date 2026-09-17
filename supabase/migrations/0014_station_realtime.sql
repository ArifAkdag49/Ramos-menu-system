-- 0014 — Tablet yazıcı istasyonu (0013) mutfak rolüyle oturum açar; `print-jobs` yayınını da
-- alabilsin ki yeni fiş 5 sn'lik yoklamayı beklemeden basılsın. Yalnız yayın okuma politikası
-- değişir; fonksiyon yetkileri değişmediği için toplu grant/revoke bloğu burada tekrarlanmaz.
drop policy if exists staff_receive_broadcasts on realtime.messages;

create policy staff_receive_broadcasts on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast' and (
       ((select realtime.topic()) in ('orders', 'menu') and (select public.has_role('admin', 'waiter', 'kitchen')))
    or ((select realtime.topic()) = 'print-jobs'        and (select public.has_role('admin', 'printer', 'kitchen')))
    or ((select realtime.topic()) in ('printer-status', 'settings') and (select public.is_active_staff()))
  )
);
