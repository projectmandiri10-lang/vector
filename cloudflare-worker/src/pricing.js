export const READY_TRACE_PRICE_IDR = 2000;
export const AI_REDRAW_PRICE_IDR = 3000;
export const SEPARATION_FILM_PRICE_IDR = 0;
export const SUPERUSER_EMAIL = 'jho.j80@gmail.com';

export function calculateJobPrice({ inputMode = 'ready_trace', separationFilmCount = 0, aiAlreadyCharged = false } = {}) {
  const basePrice =
    inputMode === 'ai_redraw'
      ? aiAlreadyCharged
        ? 0
        : AI_REDRAW_PRICE_IDR
      : READY_TRACE_PRICE_IDR;
  return basePrice + Math.max(0, Number(separationFilmCount) || 0) * SEPARATION_FILM_PRICE_IDR;
}
