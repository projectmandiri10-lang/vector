import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_REDRAW_PRICE_IDR, READY_TRACE_PRICE_IDR, SEPARATION_FILM_PRICE_IDR, calculateJobPrice } from './pricing.js';

test('ready trace costs Rp1.000', () => {
  assert.equal(calculateJobPrice({ inputMode: 'ready_trace' }), READY_TRACE_PRICE_IDR);
});

test('image retouch costs Rp5.000 before separations', () => {
  assert.equal(calculateJobPrice({ inputMode: 'ai_redraw' }), AI_REDRAW_PRICE_IDR);
});

test('separation adds Rp1.000 per film', () => {
  assert.equal(
    calculateJobPrice({ inputMode: 'ready_trace', separationFilmCount: 4 }),
    READY_TRACE_PRICE_IDR + 4 * SEPARATION_FILM_PRICE_IDR
  );
});

test('AI commit can skip base price when already charged', () => {
  assert.equal(calculateJobPrice({ inputMode: 'ai_redraw', separationFilmCount: 2, aiAlreadyCharged: true }), 2 * SEPARATION_FILM_PRICE_IDR);
});
