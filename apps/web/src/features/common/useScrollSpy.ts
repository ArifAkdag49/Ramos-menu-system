import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Kategori çipi + bölüm kalıbı (sipariş girişi ve müşteri menüsü): kaydırırken ekranın üst
 * bandındaki bölüm "aktif" olur, çipe dokununca o bölüme kaydırılır.
 *
 * `rootMargin` yapışkan başlığın yüksekliğine göre verilir; `watch` bölümler yeniden çizildiğinde
 * (veri geldi, arama değişti) gözlemcinin yeniden kurulması içindir.
 */
export function useScrollSpy({
  rootMargin,
  watch,
  enabled = true,
}: {
  rootMargin: string;
  watch?: unknown;
  enabled?: boolean;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sections = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return;
    const idOf = new Map([...sections.current].map(([id, el]) => [el, id]));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const id = visible ? idOf.get(visible.target as HTMLElement) : undefined;
        if (id) setActiveId(id);
      },
      { rootMargin },
    );
    for (const el of idOf.keys()) observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, rootMargin, watch]);

  /** Bölüm öğesine `ref={register(id)}` olarak verilir. */
  const register = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) sections.current.set(id, el);
    },
    [],
  );

  const scrollTo = useCallback((id: string) => {
    setActiveId(id);
    sections.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return { activeId, register, scrollTo };
}
