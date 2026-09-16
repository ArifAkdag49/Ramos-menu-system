import { Clock, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSetLocale, useSetOnDuty } from '../../data/orders';
import { useAuth } from '../../lib/auth';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';

/** Profil: ad + rol, dil (TR/DE), mesai anahtarı, çıkış. Bildirim bölümü Görev 25'te eklenir. */
export function ProfilePage() {
  const { t } = useTranslation();
  const profile = useAuth((s) => s.profile);
  const signOut = useAuth((s) => s.signOut);
  const setLocale = useSetLocale();
  const setOnDuty = useSetOnDuty();

  if (!profile) return null;
  const onDuty = !!profile.on_duty_since;

  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      <div>
        <p className="text-xl font-semibold">{profile.display_name}</p>
        <p className="text-sm text-muted">{t(`roles.${profile.role}`)}</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted" id="profile-language-label">
          {t('waiter.profile.language')}
        </span>
        <div className="inline-flex gap-2" role="group" aria-labelledby="profile-language-label">
          <Chip selected={profile.locale === 'tr'} onClick={() => setLocale.mutate('tr')}>
            TR
          </Chip>
          <Chip selected={profile.locale === 'de'} onClick={() => setLocale.mutate('de')}>
            DE
          </Chip>
        </div>
      </div>

      <Button
        variant={onDuty ? 'secondary' : 'primary'}
        icon={<Clock aria-hidden size={20} />}
        loading={setOnDuty.isPending}
        onClick={() => setOnDuty.mutate(!onDuty)}
      >
        {onDuty ? t('waiter.duty.stop') : t('waiter.duty.start')}
      </Button>

      <Button variant="ghost" icon={<LogOut aria-hidden size={20} />} onClick={() => void signOut()}>
        {t('common.logout')}
      </Button>
    </div>
  );
}
