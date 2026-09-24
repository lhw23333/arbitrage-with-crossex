import type { OpportunityGroup, OpportunityPair, PerpBookDiagnostic } from '../api/types';
import { fmtDateLocal, fmtPct, fmtUsd } from '../lib/fmt';
import type { OpportunityRow } from './opportunityFilters';

interface ExcludedPair { key: string; group: OpportunityGroup; pair: OpportunityPair }

/** Reconcile against the actual list, including its near-zero hysteresis and
 * existing-position repricing. The diagnostic groups deliberately ignore facets. */
export function classifyScan(groups: OpportunityGroup[], listed: Pick<OpportunityRow, 'key'>[]) {
  const shown = new Set(listed.map((r) => r.key));
  const loss: ExcludedPair[] = [];
  const missing: ExcludedPair[] = [];
  let total = 0;
  for (const group of groups) for (const pair of group.pairs) {
    total++;
    const key = `${group.tokenId}:${group.maturity}:${pair.shortLeg.marketId}:${pair.longLeg.marketId}`;
    if (shown.has(key)) continue;
    const row = { key, group, pair };
    const apr = pair.netFixedAprOnCapital;
    if (apr !== null && Number.isFinite(apr) && apr < 0) loss.push(row);
    else missing.push(row);
  }
  return { total, loss, missing };
}

const CODE_LABEL: Record<PerpBookDiagnostic['code'], string> = {
  ok: '已取得盘口', 'unsupported-venue': '暂不支持该交易所', dns: 'DNS 域名解析失败',
  timeout: '请求超时', 'connection-reset': '连接被重置', network: '网络连接失败',
  http: 'HTTP 错误', 'rate-limited': '接口限流', 'access-denied': '访问被拒绝',
  'venue-error': '交易所返回业务错误', 'instrument-unavailable': '合约元数据缺失或无法解析',
  'empty-or-invalid': '盘口为空或格式无法解析',
};
const STAGE_LABEL: Record<PerpBookDiagnostic['stage'], string> = {
  metadata: '合约规格', 'market-lookup': '市场编号', orderbook: '订单簿',
};
const describeRead = (d: PerpBookDiagnostic) =>
  `${d.venue} ${d.instrument ?? d.symbol}：${CODE_LABEL[d.code] ?? d.code} · ${STAGE_LABEL[d.stage]}` +
  (d.httpStatus ? ` · HTTP ${d.httpStatus}` : '') + (d.transportCode ? ` · ${d.transportCode}` : '');

function ExcludedList({ rows, loss, diagnostics }: { rows: ExcludedPair[]; loss: boolean; diagnostics: PerpBookDiagnostic[] }) {
  return rows.length === 0 ? <p className="p-3 text-xs text-ink-400">本次无此类组合。</p> : (
    <ul className="max-h-96 divide-y divide-ink-800 overflow-auto px-3">
      {rows.map(({ key, group, pair }) => {
        const failed = diagnostics.filter((d) => d.code !== 'ok' &&
          [pair.shortLeg.crossexSymbol, pair.longLeg.crossexSymbol].includes(d.symbol));
        return (
          <li key={key} className="py-3 text-xs leading-relaxed">
            <div className="font-medium text-ink-100">
              {pair.base} · {pair.shortLeg.venue} SHORT / {pair.longLeg.venue} LONG
            </div>
            <div className="text-ink-400">{group.collateral} 抵押 · {fmtDateLocal(group.maturity)} 到期</div>
            {loss ? (
              <p className="text-guava">
                净 APR {fmtPct(pair.netFixedAprOnCapital!, 2)} · 预计净收益 {fmtUsd(pair.estProfitUsd ?? 0)}。
                当前规模及成本假设下，费用和滑点超过固定利差收益。
              </p>
            ) : <p className="text-amber-400">无法完整报价，不能据此判断是否盈利；包含数据缺失或深度不足。</p>}
            {failed.map((d) => <p key={d.symbol} className="text-amber-400">{describeRead(d)}</p>)}
            <ul className="mt-1 list-inside list-disc break-words text-ink-400">
              {pair.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              {!loss && pair.reasons.length === 0 && <li>报价输入不完整，请查看盘口诊断并重试。</li>}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

export function ScanDiagnostics({ groups, rows, visibleCount, diagnostics = [], refreshing, onRetry }: {
  groups: OpportunityGroup[];
  rows: OpportunityRow[];
  visibleCount: number;
  diagnostics?: PerpBookDiagnostic[];
  refreshing: boolean;
  onRetry: () => void;
}) {
  const scan = classifyScan(groups, rows);
  const failures = diagnostics.filter((d) => d.code !== 'ok');
  const groupWarnings = [...new Set(groups.flatMap((g) => g.warnings))];
  return (
    <section aria-label="扫描诊断" className="mb-4 rounded border border-ink-800 bg-wash/[0.03] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-100">扫描结果与未展示原因</h3>
        <button type="button" className="btn !py-1 text-xs" disabled={refreshing} onClick={onRetry}>
          {refreshing ? '扫描更新中…' : '重新扫描'}
        </button>
      </div>
      <p className="my-2 text-xs leading-relaxed text-ink-400" data-testid="scan-counts">
        候选组合 {scan.total} · 列表内 {rows.length} · 当前显示 {visibleCount} · 被筛选条件隐藏 {Math.max(0, rows.length - visibleCount)}
      </p>
      <p className="mb-2 text-[11px] text-ink-400">
        以下按整批扫描统计，不受币种/平台筛选影响。未报价不等于亏损；刷新过程中保留上次结果。
        列表可能短暂保留接近零收益的组合，已有仓位也可能按免开仓费重新排序。
      </p>
      <details className="border-t border-ink-800 py-2">
        <summary className="cursor-pointer text-xs text-guava">亏损被过滤（{scan.loss.length}）</summary>
        <ExcludedList rows={scan.loss} loss diagnostics={diagnostics} />
      </details>
      <details className="border-t border-ink-800 py-2">
        <summary className="cursor-pointer text-xs text-amber-400">数据缺失未展示（{scan.missing.length}）</summary>
        <ExcludedList rows={scan.missing} loss={false} diagnostics={diagnostics} />
      </details>
      <details className="border-t border-ink-800 py-2">
        <summary className="cursor-pointer text-xs text-ink-200">永续盘口诊断（{failures.length} / {diagnostics.length} 项异常）</summary>
        <p className="mt-2 text-[11px] text-ink-400">每项是一个交易所合约，不是一个四腿组合；同一盘口故障可影响多个组合。取得盘口不代表深度足够成交。</p>
        <ul className="max-h-80 divide-y divide-ink-800 overflow-auto text-xs">
          {[...failures, ...diagnostics.filter((d) => d.code === 'ok')].map((d) => (
            <li key={d.symbol} className="break-words py-2">
              <p className={d.code === 'ok' ? 'text-ink-300' : 'text-amber-400'}>{describeRead(d)}</p>
              <p className="text-ink-400">{d.elapsedMs} ms · 单次超时上限 {d.timeoutMs} ms · {new Date(d.checkedAt).toLocaleTimeString()} 检查</p>
              <p className="break-all text-ink-500">{d.endpoint}</p>
            </li>
          ))}
        </ul>
        {diagnostics.length === 0 && <p className="text-xs text-ink-400">暂无盘口诊断记录。</p>}
      </details>
      {groupWarnings.length > 0 && <details className="border-t border-ink-800 py-2">
        <summary className="cursor-pointer text-xs text-ink-400">组合范围限制（{groupWarnings.length}）</summary>
        <ul className="mt-2 list-inside list-disc text-xs text-ink-400">{groupWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
      </details>}
    </section>
  );
}
