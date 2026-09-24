import { describe, expect, it } from 'vitest';
import { APR_LEVERAGE_STORAGE_KEY, readAprLeverage } from './aprLeverage';

describe('APR simulation preference', () => {
  it.each(['null', 'false', '"5"', '0', '-1', '1.5', '1001', '{}', 'invalid'])('ignores invalid saved input %s', (raw) => {
    localStorage.setItem(APR_LEVERAGE_STORAGE_KEY, raw);
    expect(readAprLeverage()).toBeNull();
  });
  it('restores a valid multiplier and keeps the old trading preference separate', () => {
    localStorage.setItem('crossex.perp-leverage.v1', '25');
    expect(readAprLeverage()).toBeNull();
    localStorage.setItem(APR_LEVERAGE_STORAGE_KEY, '5');
    expect(readAprLeverage()).toBe(5);
  });
});
