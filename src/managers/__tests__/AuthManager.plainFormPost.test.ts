/**
 * #2360 — which requests are a browser's plain form post, and the mode a step-up answer
 * takes for each. A script's request keeps the JSON answer; a plain form is answered as a page.
 */
import type { Request } from 'express';
import { answeredWithPage, isPlainFormPost, stepUpModeFor, type ReauthMode } from '../AuthManager';

const BROWSER = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

const request = (method: string, headers: Record<string, string | string[]>): Request => ({ method, headers }) as unknown as Request;

describe('isPlainFormPost (#2360)', () => {
  test.each<[string, string, Record<string, string | string[]>, boolean]>([
    ['a browser form post', 'POST', { accept: BROWSER }, true],
    ['Accept in capitals', 'POST', { accept: 'TEXT/HTML' }, true],
    ['Accept naming both text/html and JSON stays JSON', 'POST', { accept: 'text/html, application/json' }, false],
    ['Accept: application/json', 'POST', { accept: 'application/json' }, false],
    ['a vendor JSON type', 'POST', { accept: 'text/html,application/vnd.api+json' }, false],
    ['Accept: */* (a script that asks for no type)', 'POST', { accept: '*/*' }, false],
    ['no Accept at all', 'POST', {}, false],
    ['X-Requested-With on a form', 'POST', { accept: BROWSER, 'x-requested-with': 'XMLHttpRequest' }, false],
    ['an array-valued Accept naming a page', 'POST', { accept: ['text/html', 'application/xhtml+xml'] }, true],
    ['an array-valued Accept that also names JSON', 'POST', { accept: ['text/html', 'application/json'] }, false],
    ['an array-valued X-Requested-With', 'POST', { accept: BROWSER, 'x-requested-with': ['XMLHttpRequest'] }, false],
    ['a GET', 'GET', { accept: BROWSER }, false],
    ['a PUT', 'PUT', { accept: BROWSER }, false]
  ])('%s', (_name, method, headers, expected) => {
    expect(isPlainFormPost(request(method, headers))).toBe(expected);
  });

  test('a request with no headers object is not one', () => {
    expect(isPlainFormPost({ method: 'POST' })).toBe(false);
  });
});

describe('stepUpModeFor (#2360)', () => {
  const form = request('POST', { accept: BROWSER });
  const script = request('POST', { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' });

  test.each<[ReauthMode, ReauthMode]>([
    ['json', 'page'],
    ['page', 'page'],
    ['text', 'text'],
    ['download', 'download']
  ])('a plain form post asked as %s is answered as %s', (asked, answered) => {
    expect(stepUpModeFor(form, asked)).toBe(answered);
  });

  test.each<ReauthMode>(['json', 'page', 'text', 'download'])('a script\'s request asked as %s is answered as asked', (asked) => {
    expect(stepUpModeFor(script, asked)).toBe(asked);
  });

  // A route that must not run its action until the person presses it again (Reset configuration).
  test('asked as form: a plain form post stays form (a page that is not kept for a redo), any other request is json', () => {
    expect(stepUpModeFor(form, 'form')).toBe('form');
    expect(stepUpModeFor(script, 'form')).toBe('json');
    expect(stepUpModeFor(request('POST', { accept: '*/*' }), 'form')).toBe('json');
    expect(stepUpModeFor(request('GET', { accept: BROWSER }), 'form')).toBe('json');
  });

  test('a form answer is sent to a page, as a page and a download are', () => {
    expect(answeredWithPage('form')).toBe(true);
    expect(answeredWithPage('json')).toBe(false);
    expect(answeredWithPage('text')).toBe(false);
  });

  test('a GET asked as json stays json', () => {
    expect(stepUpModeFor(request('GET', { accept: BROWSER }), 'json')).toBe('json');
  });
});
