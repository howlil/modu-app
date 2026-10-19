import type { LocalDate } from '../core/types.ts';

/** M0 boundary: browser clock only. Database/storage adapters arrive in M1. */
export function browserLocalDate(date: Date = new Date()): LocalDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}
