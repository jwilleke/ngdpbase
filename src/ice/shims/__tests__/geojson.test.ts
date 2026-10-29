/**
 * Unit tests for the geojson shim (#685 slice 4; a core shim since #2109).
 */
import { geojsonRecord, geojsonShim } from '../geojson';
import { readShim, recordsOf } from './__fixtures__/readShim';

const feature = (id: string, mag: number, place: string, time: number) => ({
  type: 'Feature', id, properties: { mag, place, time }, geometry: { type: 'Point', coordinates: [1, 2, 10] }
});
const opts = { recordIdField: 'id', map: { magnitude: 'properties.mag', place: 'properties.place', time: 'properties.time' } };

describe('geojsonShim (#685, #2109)', () => {
  test('maps via dot-paths and uses recordIdField', () => {
    expect(geojsonRecord(feature('us1', 5.2, 'Ridgecrest', 1_700_000_000_000), opts))
      .toEqual({ id: 'us1', properties: { magnitude: 5.2, place: 'Ridgecrest', time: 1_700_000_000_000 } });
  });
  test('lifts feature.properties when no map is configured', () => {
    expect(geojsonRecord(feature('us2', 4.8, 'Aleutians', 1), { recordIdField: 'id' })!.properties).toMatchObject({ mag: 4.8, place: 'Aleutians' });
  });
  test('returns null when no id resolves', () => {
    expect(geojsonRecord({ properties: {} }, opts)).toBeNull();
  });
  test('reads a FeatureCollection, a bare array or a single feature into record items', async () => {
    const one = feature('a', 1, 'x', 1);
    expect(recordsOf(await readShim(geojsonShim, JSON.stringify({ type: 'FeatureCollection', features: [one] }), opts)))
      .toEqual([{ id: 'a', properties: { magnitude: 1, place: 'x', time: 1 } }]);
    expect((await readShim(geojsonShim, JSON.stringify([one]), opts)).items).toHaveLength(1);
    expect((await readShim(geojsonShim, JSON.stringify(one), opts)).items).toHaveLength(1);
  });
  test('hands to any receiver of records, per item', () => {
    expect(geojsonShim).toMatchObject({ produces: 'record', receivers: ['*'], duplicates: 'item' });
  });
});
