import { useState } from 'react';

/** Simulation ONLY. Never import this module in a ticket or execution path. */
export type AprLeverage = number | null;
export const APR_LEVERAGE_STORAGE_KEY = 'crossex.apr-simulation-leverage.v1';

export function readAprLeverage(): AprLeverage {
  try {
    const raw = localStorage.getItem(APR_LEVERAGE_STORAGE_KEY);
    const value = raw === null ? null : JSON.parse(raw);
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1000
      ? value : null;
  } catch { return null; }
}

export function useAprLeverage(): [AprLeverage, (value: AprLeverage) => void] {
  const [value, setValue] = useState(readAprLeverage);
  const update = (next: AprLeverage) => {
    if (next !== null && (!Number.isInteger(next) || next < 1 || next > 1000)) return;
    setValue(next);
    try { localStorage.setItem(APR_LEVERAGE_STORAGE_KEY, JSON.stringify(next)); } catch { /* optional persistence */ }
  };
  return [value, update];
}
