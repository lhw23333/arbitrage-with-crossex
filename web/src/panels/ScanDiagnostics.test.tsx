import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeOpportunityGroup, makeOpportunityPair } from '../test/fixtures';
import { classifyScan, ScanDiagnostics } from './ScanDiagnostics';
import { toRows } from './opportunityFilters';

function sample() {
  const good = makeOpportunityPair();
  const loss = makeOpportunityPair({ longLeg: { ...good.longLeg, marketId: 909 }, netFixedAprOnCapital: -0.02, estProfitUsd: -10 });
  const missing = makeOpportunityPair({ longLeg: { ...good.longLeg, marketId: 910 }, netFixedAprOnCapital: null, reasons: ['No usable BINANCE order book'] });
  return [makeOpportunityGroup({ pairs: [good, loss, missing] })];
}

describe('scan diagnostics', () => {
  it('reconciles visible, facet-hidden, loss and unpriced counts without trading controls', () => {
    const groups = sample();
    const retry = vi.fn();
    render(<ScanDiagnostics groups={groups} rows={toRows(groups)} visibleCount={0} refreshing={false} onRetry={retry}
      diagnostics={[{ symbol: groups[0].pairs[2].longLeg.crossexSymbol, venue: 'BINANCE', instrument: 'ETHUSDT', stage: 'orderbook', endpoint: 'https://fapi.binance.com/fapi/v1/depth', code: 'connection-reset', transportCode: 'ECONNRESET', checkedAt: Date.now(), elapsedMs: 50, timeoutMs: 2500 }]} />);
    expect(screen.getByTestId('scan-counts')).toHaveTextContent('候选组合 3 · 列表内 1 · 当前显示 0 · 被筛选条件隐藏 1');
    fireEvent.click(screen.getByText('亏损被过滤（1）'));
    expect(screen.getByText(/净 APR -2.00%/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('数据缺失未展示（1）'));
    expect(screen.getByText(/不能据此判断是否盈利/)).toBeInTheDocument();
    expect(screen.getAllByText(/连接被重置/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Execute|Open this strategy/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新扫描' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('does not count an already-listed near-zero or repriced held row as excluded', () => {
    const groups = sample();
    const loss = groups[0].pairs[1];
    const key = `${groups[0].tokenId}:${groups[0].maturity}:${loss.shortLeg.marketId}:${loss.longLeg.marketId}`;
    const rows = [...toRows(groups), { key }];
    const result = classifyScan(groups, rows);
    expect(result.loss).toHaveLength(0);
    expect(result.missing).toHaveLength(1);
    expect(result.total).toBe(rows.length + result.loss.length + result.missing.length);
  });

  it('keeps diagnostics available when every candidate is unpriced', () => {
    const groups = sample();
    groups[0].pairs = [groups[0].pairs[2]];
    render(<ScanDiagnostics groups={groups} rows={[]} visibleCount={0} refreshing onRetry={() => {}} />);
    expect(screen.getByText('数据缺失未展示（1）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '扫描更新中…' })).toBeDisabled();
  });
});
