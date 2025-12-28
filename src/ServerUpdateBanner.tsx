import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
let serverUpdateBannerSet: ((show: boolean) => void) | null = null;
export function showServerUpdateBanner() {
  if (serverUpdateBannerSet) serverUpdateBannerSet(true);
}
export function ServerUpdateBanner() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  useEffect(() => {
    serverUpdateBannerSet = setShow;
    return () => { if (serverUpdateBannerSet === setShow) serverUpdateBannerSet = null; };
  }, []);
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => setShow(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [show]);
  if (!show) return null;
  return (
    <div className="flex w-full items-center justify-center bg-emerald-50 py-1.5 text-emerald-700 font-bold text-sm tracking-wide border-b border-emerald-200/70 shadow-sm animate-fadein">
      <span className="mr-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="#059669" strokeWidth="1.5" strokeLinecap="round"/>
          <ellipse cx="12" cy="12" rx="6" ry="8" stroke="#059669" strokeWidth="1.5"/>
          <path d="M12 8v4l2 2" stroke="#059669" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </span>
      {t('message.serverUpdateOk')}
    </div>
  );
}
