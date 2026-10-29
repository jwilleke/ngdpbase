/**
 * Unit tests for the xml shim (#685 slice 8; a core shim since #2109).
 *
 * @jest-environment node
 */
import { describe, expect, it } from 'vitest';
import { xmlShim, xmlItems } from '../xml';
import { RECORD_SHIMS } from '../index';
import { readShim, recordsOf } from './__fixtures__/readShim';

describe('xmlShim (#685)', () => {
  it('is one of core\'s record shims', () => {
    expect(RECORD_SHIMS).toContain(xmlShim);
  });

  it('locates repeated elements via itemsPath', () => {
    expect(xmlItems('<rss><channel><item><id>a</id></item><item><id>b</id></item></channel></rss>', 'rss.channel.item'))
      .toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('coerces a single element to a 1-item array', () => {
    expect(xmlItems('<rss><channel><item><id>only</id></item></channel></rss>', 'rss.channel.item')).toEqual([{ id: 'only' }]);
  });

  it('without itemsPath unwraps the root and envelope-detects', () => {
    expect(xmlItems('<feed><items><id>1</id></items><items><id>2</id></items></feed>', undefined)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('returns [] when itemsPath resolves to nothing', () => {
    expect(xmlItems('<feed><meta>x</meta></feed>', 'feed.nope')).toEqual([]);
  });

  it('exposes attributes with the @ prefix and text under #text', () => {
    const [item] = xmlItems('<doc><adv id="A1"><link href="https://x.test/a1">Advisory A1</link></adv></doc>', 'doc.adv');
    expect(item['@id']).toBe('A1');
    expect((item.link as Record<string, unknown>)['@href']).toBe('https://x.test/a1');
    expect((item.link as Record<string, unknown>)['#text']).toBe('Advisory A1');
  });

  it('maps fields via dot-paths incl. attributes (VAAC-ish shape)', async () => {
    const doc = '<doc><adv id="BEZY-2026-045"><volcano code="300250">Bezymianny</volcano><cloud><altitude>9144</altitude></cloud></adv></doc>';
    const [r] = recordsOf(await readShim(xmlShim, doc, {
      itemsPath: 'doc.adv',
      recordIdField: '@id',
      map: { volcano: 'volcano.#text', gvpCode: 'volcano.@code', altitude_m: 'cloud.altitude' }
    }));
    expect(r).toEqual({ id: 'BEZY-2026-045', properties: { volcano: 'Bezymianny', gvpCode: 300250, altitude_m: 9144 } });
  });

  it('lifts the element itself when no map is set', async () => {
    const [r] = recordsOf(await readShim(xmlShim, '<doc><e><id>e1</id><title>T</title></e></doc>', { itemsPath: 'doc.e' }));
    expect(r).toEqual({ id: 'e1', properties: { id: 'e1', title: 'T' } });
  });

  it('drops an element with no id', async () => {
    expect((await readShim(xmlShim, '<doc><e><title>no id</title></e></doc>', { itemsPath: 'doc.e' })).items).toEqual([]);
  });
});
