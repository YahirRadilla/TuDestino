const LOCALE = 'es-MX';

const syncFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const dayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDayFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });
const monthFormat = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });

const valid = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatSyncTime = (iso) => {
  const date = valid(iso);
  return date ? syncFormat.format(date) : '';
};
export const formatLongDay = (iso) => {
  const date = valid(iso);
  return date ? dayFormat.format(date) : '';
};
export const formatShortDay = (iso) => {
  const date = valid(iso);
  return date ? shortDayFormat.format(date) : '';
};
export const formatTime = (iso) => {
  const date = valid(iso);
  return date ? timeFormat.format(date) : '';
};
export const formatMonth = (date) => monthFormat.format(date);
