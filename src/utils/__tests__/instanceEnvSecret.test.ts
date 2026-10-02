/**
 * The shared "generate once into the instance .env" rule (#1194, #1524).
 */
import { ensureInstanceEnvSecret, readEnvLine } from '../instanceEnvSecret';

const SPEC = {
  name: 'NGDPBASE_TEST_KEY',
  comment: 'Generated for a test',
  refusal: (envPath: string, cause: Error) => new Error(`cannot write ${envPath}: ${cause.message}`)
};

function memFs(initial: string | null) {
  const written: Array<{ path: string; line: string; mode: number }> = [];
  return {
    written,
    readFile: () => initial,
    appendFile: (path: string, line: string, mode: number) => { written.push({ path, line, mode }); },
    randomSecret: () => 'generated-value'
  };
}

describe('ensureInstanceEnvSecret', () => {
  test('a value in the environment is used and nothing is written', () => {
    const fs = memFs(null);
    expect(ensureInstanceEnvSecret(SPEC, { NGDPBASE_TEST_KEY: 'from-env' }, '/d', fs)).toEqual({ secret: 'from-env', origin: { kind: 'env' } });
    expect(fs.written).toEqual([]);
  });

  test('blank in the environment, present in the instance .env: the file line is used', () => {
    const fs = memFs('OTHER=1\nNGDPBASE_TEST_KEY="from-file"\n');
    expect(ensureInstanceEnvSecret(SPEC, { NGDPBASE_TEST_KEY: '' }, '/d/', fs)).toEqual({ secret: 'from-file', origin: { kind: 'instance-env-file', path: '/d/.env' } });
  });

  test('absent everywhere: generated, appended with its comment, created 0600', () => {
    const fs = memFs('OTHER=1');
    expect(ensureInstanceEnvSecret(SPEC, {}, '/d', fs).secret).toBe('generated-value');
    expect(fs.written).toEqual([{ path: '/d/.env', line: '\n# Generated for a test\nNGDPBASE_TEST_KEY=generated-value\n', mode: 0o600 }]);
  });

  test('a value is passed through accept(), which may refuse it', () => {
    const accept = (v: string): string => { if (v === 'placeholder') throw new Error('placeholder refused'); return v; };
    expect(() => ensureInstanceEnvSecret({ ...SPEC, accept }, { NGDPBASE_TEST_KEY: 'placeholder' }, '/d', memFs(null))).toThrow('placeholder refused');
  });

  test('a failed write refuses with the spec’s message', () => {
    const fs = { ...memFs(null), appendFile: () => { throw new Error('EACCES'); } };
    expect(() => ensureInstanceEnvSecret(SPEC, {}, '/d', fs)).toThrow('cannot write /d/.env: EACCES');
  });
});

describe('readEnvLine', () => {
  test('the last line wins, export and quotes and trailing comments are handled', () => {
    expect(readEnvLine('A=1\nexport A = "two"\n', 'A')).toBe('two');
    expect(readEnvLine('A=three # note\n', 'A')).toBe('three');
    expect(readEnvLine('A=\n', 'A')).toBeNull();
    expect(readEnvLine('AB=1\n', 'A')).toBeNull();
  });
});
