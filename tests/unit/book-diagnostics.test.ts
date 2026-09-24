import nock from 'nock';
import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchVenueBook, fetchVenueBookDiagnostic } from '../../src/core/estimate/books';

const url = 'https://fapi.binance.com';
const levels = { bids: [['99', '3']], asks: [['101', '4']] };
const read = () => fetchVenueBookDiagnostic('BINANCE', 'BTC', 'USDT');
afterEach(() => vi.restoreAllMocks());

describe('public orderbook diagnostic reads', () => {
  it.each([
    ['ENOTFOUND', 'dns'], ['EAI_AGAIN', 'dns'], ['ENOENT', 'dns'],
    ['ECONNRESET', 'connection-reset'], ['ECONNABORTED', 'timeout'], ['ETIMEDOUT', 'timeout'],
    ['ECONNREFUSED', 'network'],
  ])('classifies %s without exposing the raw error', async (code, category) => {
    // Reject at the transport seam: Nock's synthetic socket errors on Node 24
    // can be delivered as timeouts rather than preserving the OS error code.
    vi.spyOn(axios, 'get').mockRejectedValueOnce(Object.assign(new Error('secret-proxy-password'), { code }));
    const result = await read();
    expect(result.book).toBeNull();
    expect(result.diagnostic).toMatchObject({ code: category, transportCode: code, stage: 'orderbook', instrument: 'BTCUSDT', timeoutMs: 2500 });
    expect(result.diagnostic.httpStatus).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('secret-proxy-password');
  });

  it.each([[429, 'rate-limited'], [418, 'rate-limited'], [403, 'access-denied'], [451, 'access-denied'], [500, 'http']])(
    'keeps HTTP %s distinct from an empty book', async (status, code) => {
      nock(url).get('/fapi/v1/depth').query(true).reply(status as number, 'private upstream body');
      const result = await read();
      expect(result.book).toBeNull();
      expect(result.diagnostic).toMatchObject({ code, httpStatus: status });
      expect(JSON.stringify(result)).not.toContain('private upstream body');
    },
  );

  it('reports HTTP-200 venue errors instead of inventing a price', async () => {
    nock('https://api.bybit.com').get('/v5/market/orderbook').query(true).reply(200, { retCode: 10001, retMsg: 'bad symbol' });
    const result = await fetchVenueBookDiagnostic('BYBIT', 'HYPE', 'USDT');
    expect(result.book).toBeNull();
    expect(result.diagnostic).toMatchObject({ code: 'venue-error', httpStatus: 200 });
  });

  it('reports metadata lookup failures with their own stage', async () => {
    vi.spyOn(axios, 'get').mockRejectedValueOnce({ code: 'ENOTFOUND' });
    const result = await fetchVenueBookDiagnostic('OKX', 'BTC', 'USDT');
    expect(result.book).toBeNull();
    expect(result.diagnostic).toMatchObject({ code: 'dns', stage: 'metadata' });
    expect(result.diagnostic.endpoint).toContain('/public/instruments');
  });

  it('does not mislabel a later orderbook failure as HTTP 200 metadata success', async () => {
    vi.spyOn(axios, 'get')
      .mockResolvedValueOnce({ status: 200, data: { code: '0', data: [{ ctVal: '0.1' }] } })
      .mockRejectedValueOnce({ code: 'ECONNRESET' });
    const result = await fetchVenueBookDiagnostic('OKX', 'TEST', 'USDT');
    expect(result.diagnostic).toMatchObject({ code: 'connection-reset', stage: 'orderbook' });
    expect(result.diagnostic.httpStatus).toBeUndefined();
  });

  it('separates an invalid/empty book from successful recovery; old callers keep their null contract', async () => {
    nock(url).get('/fapi/v1/depth').query(true).reply(200, {});
    expect((await read()).diagnostic.code).toBe('empty-or-invalid');
    nock(url).get('/fapi/v1/depth').query(true).reply(200, levels);
    const result = await read();
    expect(result.diagnostic.code).toBe('ok');
    expect(result.book?.bids).toEqual([[99, 3]]);
    nock(url).get('/fapi/v1/depth').query(true).reply(500);
    expect(await fetchVenueBook('BINANCE', 'BTC', 'USDT')).toBeNull();
    expect((await fetchVenueBookDiagnostic('UNKNOWN', 'BTC', 'USD')).diagnostic.code).toBe('unsupported-venue');
  });
});
