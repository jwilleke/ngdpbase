/**
 * sendApiError — the one way a refusal reaches the client (#1749), including
 * `page` mode for a link the person followed in the browser.
 */
import express from 'express';
import request from 'supertest';
import { ApiError, sendApiError } from '../ApiContext';

function appRefusing(err: ApiError, mode: 'json' | 'text' | 'page' | 'download') {
  const app = express();
  app.get('/thing', (_req, res) => sendApiError(res, err, mode));
  return app;
}

describe('sendApiError', () => {
  test('json: status, message and a same-site reauth link', async () => {
    const res = await request(appRefusing(new ApiError(403, 'A fresh sign-in is needed', '/auth/reauth?next=%2Fthing'), 'json')).get('/thing');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, error: 'A fresh sign-in is needed', reauth: '/auth/reauth?next=%2Fthing' });
  });

  test('page: a step-up refusal redirects to the re-authenticate page', async () => {
    const res = await request(appRefusing(new ApiError(403, 'A fresh sign-in is needed', '/auth/reauth?next=%2Fthing'), 'page')).get('/thing');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/reauth?next=%2Fthing');
  });

  test('download (#2145): a link to a file is answered as a page, so a step-up refusal redirects too', async () => {
    const res = await request(appRefusing(new ApiError(403, 'A fresh sign-in is needed', '/auth/reauth?next=%2Fadmin%2Fbackup'), 'download')).get('/thing');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/reauth?next=%2Fadmin%2Fbackup');
  });

  test('page: a 401 redirects to sign-in, returning to the page', async () => {
    const res = await request(appRefusing(new ApiError(401, 'Authentication required'), 'page')).get('/thing?x=1');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?redirect=%2Fthing%3Fx%3D1');
  });

  test('page: any other refusal is its status and message', async () => {
    const res = await request(appRefusing(new ApiError(403, 'Forbidden'), 'page')).get('/thing');
    expect(res.status).toBe(403);
    expect(res.text).toBe('Forbidden');
  });

  test('a consent refusal (#2027): json carries the link, page redirects to the prompt, text names it', async () => {
    const err = new ApiError(403, 'You have terms to accept: Terms of Service, version 2.', undefined, '/consent?returnTo=%2Fthing');
    const json = await request(appRefusing(err, 'json')).get('/thing');
    expect(json.body).toEqual({ success: false, error: 'You have terms to accept: Terms of Service, version 2.', consent: '/consent?returnTo=%2Fthing' });
    const page = await request(appRefusing(err, 'page')).get('/thing');
    expect(page.status).toBe(302);
    expect(page.headers.location).toBe('/consent?returnTo=%2Fthing');
    const text = await request(appRefusing(err, 'text')).get('/thing');
    expect(text.text).toBe('You have terms to accept: Terms of Service, version 2. Read and accept them at /consent?returnTo=%2Fthing');
  });

  test('page: a consent link anywhere but this site\'s prompt is never followed', async () => {
    const res = await request(appRefusing(new ApiError(403, 'x', undefined, 'https://evil.example/consent?x'), 'page')).get('/thing');
    expect(res.status).toBe(403);
    expect(res.headers.location).toBeUndefined();
  });

  test('page: a reauth link to another site is never followed', async () => {
    const res = await request(appRefusing(new ApiError(403, 'A fresh sign-in is needed', 'https://evil.example/auth/reauth?x'), 'page')).get('/thing');
    expect(res.status).toBe(403);
    expect(res.headers.location).toBeUndefined();
  });

  // #2360: every plain form post to a step-up route is sent to the prompt by the one shared answer.
  test('a plain form post (a browser\'s, no script headers) with a step-up refusal redirects to the prompt, in the default json mode too', async () => {
    const app = express();
    app.post('/thing', (_req, res) => sendApiError(res, new ApiError(403, 'A fresh sign-in is needed', '/auth/reauth?next=%2Fadmin%2Faddons')));
    const res = await request(app).post('/thing').type('form').set('Accept', 'text/html,application/xhtml+xml').send({ a: '1' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/reauth?next=%2Fadmin%2Faddons');
  });

  test('a script\'s post keeps the JSON answer; so does a plain form post refused without a way to re-authenticate', async () => {
    const app = express();
    app.post('/thing', (_req, res) => sendApiError(res, new ApiError(403, 'A fresh sign-in is needed', '/auth/reauth?next=%2Fthing&prompt=ab')));
    app.post('/token', (_req, res) => sendApiError(res, new ApiError(403, 'This needs a fresh sign-in by the person; a token cannot give one')));
    const script = await request(app).post('/thing').type('form').set('Accept', 'application/json').set('X-Requested-With', 'XMLHttpRequest').send({ a: '1' });
    expect(script.status).toBe(403);
    expect(script.body.reauth).toBe('/auth/reauth?next=%2Fthing&prompt=ab');
    const delegated = await request(app).post('/token').type('form').set('Accept', 'text/html').send({ a: '1' });
    expect(delegated.status).toBe(403);
    expect(delegated.body).toEqual({ success: false, error: 'This needs a fresh sign-in by the person; a token cannot give one' });
  });
});
