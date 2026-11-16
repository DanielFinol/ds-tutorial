import type { Lang } from './i18n';

const base = () => import.meta.env.BASE_URL.replace(/\/$/, '');

/** Prefix an internal path with the site base (e.g. "/ds-tutorial") and, for non-English pages, the language. */
export function url(path = '', lang: Lang = 'en'): string {
  const clean = path.replace(/^\//, '');
  const prefix = lang === 'en' ? base() : `${base()}/${lang}`;
  return clean ? `${prefix}/${clean}` : `${prefix}/`;
}

/** The same page in another language. */
export function switchLang(pathname: string, to: Lang): string {
  const rest = pathname.slice(base().length).replace(/^\/(es)(?=\/|$)/, '');
  return (to === 'en' ? base() : `${base()}/${to}`) + (rest || '/');
}
