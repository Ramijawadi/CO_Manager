import type { TFunction } from 'i18next';

const planLabels: Record<string, string> = {
  journalier: 'Journalier',
  quotidien: 'Quotidien',
  hebdomadaire: 'Hebdomadaire',
  mensuel: 'Mensuel',
  bimensuel: 'Bimensuel',
  bimestriel: 'Bimestriel',
  trimestriel: 'Trimestriel',
  trimestre: 'Trimestre',
  semestriel: 'Semestriel',
  annuel: 'Annuel',
  an: 'an',
  ans: 'an',
};

export const translatePlanName = (name: string, t: TFunction): string => {
  const normalized = name.trim().toLocaleLowerCase('fr');
  return t(Object.hasOwn(planLabels, normalized) ? planLabels[normalized] : name, { defaultValue: name });
};
