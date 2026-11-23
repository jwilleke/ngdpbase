/**
 * #2454 S2 — the source store: one JSON file per shared footnote source.
 * docs/design/shared-footnote-sources.md, "The records".
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { SourceStore } from '../footnoteSources';
import { FootnoteLinkError, tidyUrl } from '../footnoteLinks';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let dir: string;
let store: SourceStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-store-'));
  store = new SourceStore(dir);
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('SourceStore.create', () => {
  test('writes one {id}.json with every field of the record', async () => {
    const rec = await store.create({ title: '  A book  ', url: '  http://www.Example.com/a/  ', createdBy: '@id:alice' });
    expect(rec.id).toMatch(UUID);
    expect(rec).toMatchObject({
      title: 'A book',
      url: 'http://www.Example.com/a/',
      urlKey: tidyUrl('http://www.Example.com/a/'),
      status: 'good',
      flagReason: '',
      lastChecked: '',
      staleBy: '',
      createdBy: '@id:alice'
    });
    expect(rec.statusSince).toBe(rec.createdAt);
    expect(new Date(rec.createdAt).toISOString()).toBe(rec.createdAt);
    expect(JSON.parse(fs.readFileSync(path.join(dir, `${rec.id}.json`), 'utf8'))).toEqual(rec);
  });

  test('the id is random: the same link twice gives two ids, never one made from the link', async () => {
    const a = await store.create({ title: 'One', url: 'https://example.com/x', createdBy: 'alice' });
    const b = await store.create({ title: 'Two', url: 'https://example.com/x', createdBy: 'alice' });
    expect(a.id).not.toBe(b.id);
    expect(a.id).not.toContain('example');
  });

  test.each(['javascript:alert(1)', 'data:text/html,x', 'file:///etc/hosts', 'not a link', ''])(
    'refuses %j as a link and writes nothing',
    async (url) => {
      await expect(store.create({ title: 'T', url, createdBy: 'alice' })).rejects.toBeInstanceOf(FootnoteLinkError);
      expect(fs.readdirSync(dir)).toEqual([]);
    }
  );

  test('refuses a title with nothing in it and writes nothing', async () => {
    await expect(store.create({ title: '   ', url: 'https://example.com/x', createdBy: 'alice' })).rejects.toThrow(/title/i);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  test('makes the folder when it is not there yet', async () => {
    const nested = path.join(dir, 'a', 'b');
    const rec = await new SourceStore(nested).create({ title: 'T', url: 'https://example.com/x', createdBy: 'alice' });
    expect(fs.existsSync(path.join(nested, `${rec.id}.json`))).toBe(true);
  });
});

describe('SourceStore.get', () => {
  test('returns the record', async () => {
    const rec = await store.create({ title: 'T', url: 'https://example.com/x', createdBy: 'alice' });
    expect(await store.get(rec.id)).toEqual(rec);
  });

  test('returns null for an id with no file', async () => {
    expect(await store.get('11111111-1111-4111-8111-111111111111')).toBeNull();
  });

  test.each(['../secret', '..', 'a/b', '', 'not-a-uuid', '11111111-1111-4111-8111-111111111111.history'])(
    'returns null for %j and never reads outside the folder',
    async (id) => {
      fs.writeFileSync(path.join(path.dirname(dir), 'secret.json'), JSON.stringify({ id: 'x', title: 'leak', url: 'https://example.com', urlKey: 'k' }));
      try {
        expect(await store.get(id)).toBeNull();
      } finally {
        fs.rmSync(path.join(path.dirname(dir), 'secret.json'), { force: true });
      }
    }
  );

  test('returns null for a file that is not readable JSON', async () => {
    const id = '22222222-2222-4222-8222-222222222222';
    fs.writeFileSync(path.join(dir, `${id}.json`), '{ not json');
    expect(await store.get(id)).toBeNull();
  });
});

describe('SourceStore.findByKey', () => {
  test('returns every source with that key, oldest first, then by id', async () => {
    let tick = 0;
    const clocked = new SourceStore(dir, { now: () => new Date(Date.UTC(2026, 10, 22, 12, 0, tick++)) });
    const first = await clocked.create({ title: 'First', url: 'https://example.com/x', createdBy: 'a' });
    const other = await clocked.create({ title: 'Other', url: 'https://example.com/y', createdBy: 'a' });
    const second = await clocked.create({ title: 'Second', url: 'http://www.example.com/x/', createdBy: 'a' });
    const found = await clocked.findByKey(tidyUrl('https://example.com/x'));
    expect(found.map((s) => s.id)).toEqual([first.id, second.id]);
    expect(found.map((s) => s.id)).not.toContain(other.id);

    const frozen = new SourceStore(path.join(dir, 'same-time'), { now: () => new Date(Date.UTC(2026, 10, 22)) });
    const a = await frozen.create({ title: 'A', url: 'https://example.com/z', createdBy: 'a' });
    const b = await frozen.create({ title: 'B', url: 'https://example.com/z', createdBy: 'a' });
    expect((await frozen.findByKey(tidyUrl('https://example.com/z'))).map((s) => s.id)).toEqual([a.id, b.id].sort());
  });

  test('returns nothing for a key nobody has, and for no key', async () => {
    await store.create({ title: 'T', url: 'https://example.com/x', createdBy: 'a' });
    expect(await store.findByKey('https://example.com/none')).toEqual([]);
    expect(await store.findByKey('')).toEqual([]);
  });

  test('reads only source files: a history file, another extension and a folder are left alone', async () => {
    const rec = await store.create({ title: 'T', url: 'https://example.com/x', createdBy: 'a' });
    fs.writeFileSync(path.join(dir, `${rec.id}.history.json`), JSON.stringify([{ ...rec, title: 'old' }]));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
    fs.mkdirSync(path.join(dir, 'reports'));
    fs.writeFileSync(path.join(dir, '33333333-3333-4333-8333-333333333333.json'), '{ not json');
    expect((await store.findByKey(rec.urlKey)).map((s) => s.id)).toEqual([rec.id]);
  });

  test('a folder that is not there yet has no sources', async () => {
    expect(await new SourceStore(path.join(dir, 'missing')).findByKey('https://example.com/x')).toEqual([]);
  });
});
