import { useId } from 'react';
import type { AprLeverage } from '../lib/aprLeverage';

/** Changes only the opportunity quote; no trading mutations or ticket prefills. */
export function AprLeverageControl({ value, onChange }: { value: AprLeverage; onChange: (value: AprLeverage) => void }) {
  const id = useId();
  const choices = [...new Set([1, 2, 3, 5, 10, 15, 20, 25, 50, 100, ...(value ? [value] : [])])].sort((a, b) => a - b);
  return (
    <div className="flex max-w-sm flex-col items-start gap-1.5">
      <label htmlFor={id} className="text-xs text-ink-400">APR 测算杠杆（仅模拟）</label>
      <select id={id} aria-label="APR 测算杠杆" className="input h-9 text-xs"
        value={value ?? 'max'}
        onChange={(e) => onChange(e.target.value === 'max' ? null : Number(e.target.value))}>
        <option value="max">Venue max / 平台最高</option>
        {choices.map((n) => <option key={n} value={n}>{n}×</option>)}
      </select>
      <span className="text-[11px] text-ink-400">
        只重算 Capital / APR，不修改实际下单或已有仓位。
        每条永续腿取所选值与平台上限的较小值；Boros 保证金规则不变。
      </span>
    </div>
  );
}
