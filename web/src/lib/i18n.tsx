'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Small dictionary-based i18n. Only navigation and the most visible labels are
 * translated - enough to demonstrate multi-language support without turning
 * every screen into a translation exercise.
 */
const STRINGS = {
  en: {
    'nav.home': 'Home',
    'nav.bookings': 'My Bookings',
    'nav.store': 'Spare Parts',
    'nav.cart': 'Cart',
    'nav.orders': 'Orders',
    'nav.profile': 'Profile',
    'nav.dashboard': 'Dashboard',
    'nav.jobs': 'Jobs',
    'nav.earnings': 'Earnings',
    'nav.history': 'History',
    'nav.products': 'Products',
    'nav.inventory': 'Inventory',
    'nav.users': 'Users',
    'nav.reports': 'Reports',
    'nav.complaints': 'Complaints',
    'nav.logout': 'Log out',
    'sos.title': 'Emergency Breakdown',
    'sos.button': 'SOS',
    'sos.hint': 'Press and hold for 2 seconds to send an emergency request',
    'common.book': 'Book',
    'common.cancel': 'Cancel',
    'common.search': 'Search',
    'common.loading': 'Loading…',
    'common.total': 'Total',
    'greeting': 'Hello',
  },
  hi: {
    'nav.home': 'होम',
    'nav.bookings': 'मेरी बुकिंग',
    'nav.store': 'स्पेयर पार्ट्स',
    'nav.cart': 'कार्ट',
    'nav.orders': 'ऑर्डर',
    'nav.profile': 'प्रोफ़ाइल',
    'nav.dashboard': 'डैशबोर्ड',
    'nav.jobs': 'काम',
    'nav.earnings': 'कमाई',
    'nav.history': 'इतिहास',
    'nav.products': 'उत्पाद',
    'nav.inventory': 'स्टॉक',
    'nav.users': 'उपयोगकर्ता',
    'nav.reports': 'रिपोर्ट',
    'nav.complaints': 'शिकायतें',
    'nav.logout': 'लॉग आउट',
    'sos.title': 'आपातकालीन ब्रेकडाउन',
    'sos.button': 'SOS',
    'sos.hint': 'आपातकालीन अनुरोध भेजने के लिए 2 सेकंड दबाए रखें',
    'common.book': 'बुक करें',
    'common.cancel': 'रद्द करें',
    'common.search': 'खोजें',
    'common.loading': 'लोड हो रहा है…',
    'common.total': 'कुल',
    'greeting': 'नमस्ते',
  },
  te: {
    'nav.home': 'హోమ్',
    'nav.bookings': 'నా బుకింగ్‌లు',
    'nav.store': 'స్పేర్ పార్ట్స్',
    'nav.cart': 'కార్ట్',
    'nav.orders': 'ఆర్డర్లు',
    'nav.profile': 'ప్రొఫైల్',
    'nav.dashboard': 'డాష్‌బోర్డ్',
    'nav.jobs': 'పనులు',
    'nav.earnings': 'ఆదాయం',
    'nav.history': 'చరిత్ర',
    'nav.products': 'ఉత్పత్తులు',
    'nav.inventory': 'స్టాక్',
    'nav.users': 'వినియోగదారులు',
    'nav.reports': 'నివేదికలు',
    'nav.complaints': 'ఫిర్యాదులు',
    'nav.logout': 'లాగ్ అవుట్',
    'sos.title': 'అత్యవసర బ్రేక్‌డౌన్',
    'sos.button': 'SOS',
    'sos.hint': 'అత్యవసర అభ్యర్థన పంపడానికి 2 సెకన్లు నొక్కి ఉంచండి',
    'common.book': 'బుక్ చేయండి',
    'common.cancel': 'రద్దు',
    'common.search': 'వెతకండి',
    'common.loading': 'లోడ్ అవుతోంది…',
    'common.total': 'మొత్తం',
    'greeting': 'నమస్కారం',
  },
} as const;

export type Language = keyof typeof STRINGS;
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'te', label: 'తెలుగు' },
];

type Key = keyof (typeof STRINGS)['en'];

const I18nContext = createContext<{ lang: Language; setLang: (l: Language) => void; t: (k: Key) => string }>({
  lang: 'en',
  setLang: () => {},
  t: (k) => String(k),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
    const saved = localStorage.getItem('riderescue.lang') as Language | null;
    if (saved && saved in STRINGS) setLangState(saved);
  }, []);

  const setLang = (l: Language) => {
    setLangState(l);
    localStorage.setItem('riderescue.lang', l);
  };

  const t = (key: Key) => (STRINGS[lang] as Record<string, string>)[key] ?? STRINGS.en[key] ?? String(key);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
