/**
 * sendApiError — the one way a refusal reaches the client (#1749), including
 * `page` mode for a link the person followed in the browser.
 */
import express from 'express';
import request from 'supertest';
import { ApiError, sendApiError } from '../ApiContext';

function appRefusing(err: ApiError, mode: 'json' | 'text' | 'page') {
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

  test('page: a reauth link to another site is never followed', async () => {
    const res = await request(appRefusing(new ApiError(403, 'A fresh sign-in is needed', 'https://evil.example/auth/reauth?x'), 'page')).get('/thing');
    expect(res.status).toBe(403);
    expect(res.headers.location).toBeUndefined();
  });
});
