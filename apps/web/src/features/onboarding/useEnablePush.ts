import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../../lib/toast';
import { usePush } from '../../pwa/pushStore';

/**
 * "Bildirimleri aç" düğmesinin işleyicisi: izni ister, sonucu kısa mesajla söyler.
 * Dönen fonksiyon **doğrudan** `onClick` olarak verilmeli — önüne `await` konursa iOS izin
 * penceresini göstermez (BUILD-PROMPT §6).
 */
export function useEnablePush(): () => void {
  const { t } = useTranslation();
  return useCallback(() => {
    void usePush
      .getState()
      .enable()
      .then((result) => {
        if (result.ok) {
          toast(t('pwa.push.result.enabled'), 'open');
          return;
        }
        if (result.detail) console.warn('[push]', result.reason, result.detail);
        toast(
          t(`pwa.push.result.${result.reason}`),
          result.reason === 'error' ? 'danger' : 'warning',
        );
      });
  }, [t]);
}
