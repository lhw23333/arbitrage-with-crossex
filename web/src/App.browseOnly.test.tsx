import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import App, { BROWSE_ONLY_KEY } from './App';
import { ACTIVE_TAB_KEY } from './components/TabBar';
import { baseHandlers, makeOpportunitiesResult, opportunitiesHandler } from './test/fixtures';
import { env, server } from './test/server';
import { renderWithClient } from './test/utils';

function fixtures(configured = false, credentialsFail = false) {
  const privateReads: string[] = [];
  const writes: string[] = [];
  const quotes: string[] = [];
  server.use(
    ...baseHandlers(),
    opportunitiesHandler(makeOpportunitiesResult(), { urls: quotes }),
  );
  server.use(
    http.get('/api/credentials', () => credentialsFail
      ? HttpResponse.json({ ok: false, error: { category: 'network', message: 'offline' } }, { status: 503 })
      : HttpResponse.json(env({ configured, keyMasked: configured ? 'test…key' : null }))),
    ...['account', 'positions', 'orders/open', 'trades', 'rebalance', 'transfer'].map((path) =>
      http.get(`/api/${path}`, () => { privateReads.push(path); return HttpResponse.json(env({})); })),
    http.post('*', ({ request }) => { writes.push(request.url); return HttpResponse.json(env({})); }),
    http.put('*', ({ request }) => { writes.push(request.url); return HttpResponse.json(env({})); }),
  );
  return { privateReads, writes, quotes };
}

function expectNoTrading() {
  expect(screen.queryByRole('button', { name: 'Order ticket' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: /Balances|Positions|Open Orders/ })).not.toBeInTheDocument();
  for (const button of screen.getAllByRole('button', { name: /^Open this strategy —/ })) {
    expect(button).toBeDisabled();
  }
}

describe('public browse-only mode', () => {
  it('opens public quotes, APR simulation and diagnostics without account reads or mutations', async () => {
    const { privateReads, writes, quotes } = fixtures();
    renderWithClient(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '仅浏览，稍后配置' }));
    await screen.findByRole('heading', { name: '仅浏览模式' });
    await screen.findByRole('region', { name: '扫描诊断' });
    expectNoTrading();
    await userEvent.selectOptions(screen.getByLabelText('APR 测算杠杆'), '5');
    await waitFor(() => expect(new URL(quotes.at(-1)!).searchParams.get('perpLeverage')).toBe('5'));
    await userEvent.click(screen.getByRole('button', { name: /^Open this strategy —/ }));
    expect(privateReads).toEqual([]);
    expect(writes).toEqual([]);
    expect(localStorage.getItem(BROWSE_ONLY_KEY)).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: '继续配置' }));
    await screen.findByRole('heading', { name: 'Set up the terminal' });
    expect(localStorage.getItem(BROWSE_ONLY_KEY)).toBe('false');
  });

  it('remembers browsing across remounts and ignores an old account tab selection', async () => {
    fixtures();
    localStorage.setItem(BROWSE_ONLY_KEY, 'true');
    localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify('balances'));
    const first = renderWithClient(<App />);
    await screen.findByRole('region', { name: '扫描诊断' });
    expectNoTrading();
    first.unmount();
    renderWithClient(<App />);
    await screen.findByRole('heading', { name: '仅浏览模式' });
    await screen.findByRole('region', { name: '扫描诊断' });
    expectNoTrading();
  });

  it('does not turn trading on merely because keys exist while browsing', async () => {
    const { privateReads } = fixtures(true);
    localStorage.setItem(BROWSE_ONLY_KEY, 'true');
    renderWithClient(<App />);
    await screen.findByRole('region', { name: '扫描诊断' });
    expectNoTrading();
    expect(privateReads).toEqual([]);
  });

  it('allows public browsing after credential-status failure but keeps trading disabled', async () => {
    fixtures(false, true);
    renderWithClient(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '仅浏览，稍后配置' }));
    await screen.findByRole('region', { name: '扫描诊断' });
    expectNoTrading();
  });
});
