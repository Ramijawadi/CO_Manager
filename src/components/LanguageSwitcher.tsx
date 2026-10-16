import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'fr';

  return (
    <div className="language-switcher" role="group" aria-label={t('Language')} dir="ltr">
      <button type="button" lang="fr" aria-label="Français" title="Français"
        aria-pressed={language === 'fr'} onClick={() => void i18n.changeLanguage('fr')}>
        FR
      </button>
      <button type="button" aria-label="العربية" title="العربية"
        aria-pressed={language === 'ar'} onClick={() => void i18n.changeLanguage('ar')}>
        AR
      </button>
    </div>
  );
}
