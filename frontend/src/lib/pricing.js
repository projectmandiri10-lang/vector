import { INPUT_MODE_READY, INPUT_MODE_RETOUCH } from './modes.js';

export const CREDIT_PER_IDR = 1;
export const READY_PROCESS_PRICE_IDR = 2000;
export const IMAGE_RETOUCH_PRICE_IDR = 3000;
export const SEPARATION_FILM_PRICE_IDR = 0;

export function calculateJobPrice({ inputMode = INPUT_MODE_READY, separationFilmCount = 0, retouchAlreadyCharged = false } = {}) {
  const basePrice =
    inputMode === INPUT_MODE_RETOUCH
      ? retouchAlreadyCharged
        ? 0
        : IMAGE_RETOUCH_PRICE_IDR
      : READY_PROCESS_PRICE_IDR;
  return basePrice + Math.max(0, Number(separationFilmCount) || 0) * SEPARATION_FILM_PRICE_IDR;
}

export function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(value || 0);
}
