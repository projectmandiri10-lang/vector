import { INPUT_MODE_RETOUCH } from './modes.js';

export const CREDIT_PER_IDR = 1;
export const READY_TRACE_PRICE_IDR = 1000;
export const IMAGE_RETOUCH_PRICE_IDR = 5000;
export const SEPARATION_FILM_PRICE_IDR = 1000;

export function calculateJobPrice({ inputMode = 'ready_trace', separationFilmCount = 0, retouchAlreadyCharged = false } = {}) {
  const basePrice =
    inputMode === INPUT_MODE_RETOUCH
      ? retouchAlreadyCharged
        ? 0
        : IMAGE_RETOUCH_PRICE_IDR
      : READY_TRACE_PRICE_IDR;
  return basePrice + Math.max(0, Number(separationFilmCount) || 0) * SEPARATION_FILM_PRICE_IDR;
}

export function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(value || 0);
}
