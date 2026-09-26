/**
 * JSON that cannot end the <script> element it is written into.
 */

import { jsonForScript } from '../jsonForScript';

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe('jsonForScript', () => {
  test('a closing script tag in a string cannot end the element', () => {
    const out = jsonForScript('a </script><b>x</b>');

    expect(out).not.toContain('<');
    expect(out).not.toMatch(/<\/script/i);
  });

  test('the separators U+2028 and U+2029 are escaped', () => {
    const out = jsonForScript(`a${LS}b${PS}c`);

    expect(out.includes(LS) || out.includes(PS)).toBe(false);
  });

  test('parsed back, the value is exactly what went in', () => {
    const value = { q: '</script><script>x()</script>', n: 1, list: ['<a>', `x${LS}y`], nothing: null };

    expect(JSON.parse(jsonForScript(value))).toEqual(value);
  });

  test('undefined becomes null rather than an empty script', () => {
    expect(jsonForScript(undefined)).toBe('null');
  });
});
