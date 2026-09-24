import { expect, it } from 'vitest';
import { makeTestApp } from './helpers/gate-nock';

it('keeps upstream Telegram and the read-only scanner, without retired fork mutation routes', async () => {
  const app = makeTestApp();
  try {
    await app.ready();
    expect(app.hasRoute({ method: 'GET', url: '/api/telegram' })).toBe(true);
    expect(app.hasRoute({ method: 'GET', url: '/api/opportunities' })).toBe(true);
    for (const method of ['GET', 'POST', 'PUT', 'DELETE'] as const) {
      for (const url of ['/api/notifications', '/api/notifications/test', '/api/risk-guard', '/api/risk-guard/preview', '/api/risk-guard/arm']) {
        expect(app.hasRoute({ method, url }), `${method} ${url}`).toBe(false);
      }
    }
  } finally {
    await app.close();
  }
});
