/**
 * #2269 — the log warning about a stored `access:` the site no longer reads
 * stays quiet only for the stamp install wrote outside `general`. The same
 * value on a general page is someone's own rule, and is said.
 */
import PolicyInformationPoint from '../PolicyInformationPoint';
import logger from '../../utils/logger';

function makePip(): PolicyInformationPoint {
  const engine = { getManager: vi.fn(() => null) } as never;
  return new PolicyInformationPoint(engine);
}

const said = (warn: ReturnType<typeof vi.spyOn>): string[] => warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("'access'"));

describe('PolicyInformationPoint warns about a leftover access: (#2269)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('is quiet for the install stamp on a page outside general', () => {
    const warn = vi.spyOn(logger, 'warn');
    makePip().pageAttributesFrom('Help', { title: 'Help', 'system-category': 'documentation', access: { edit: ['admin'] } });
    expect(said(warn)).toEqual([]);
  });

  test('warns for the same value on a general page', () => {
    const warn = vi.spyOn(logger, 'warn');
    makePip().pageAttributesFrom('Board Notes', { title: 'Board Notes', 'system-category': 'general', access: { edit: ['admin'] } });
    expect(said(warn)).toHaveLength(1);
  });

  test('warns for any other value', () => {
    const warn = vi.spyOn(logger, 'warn');
    makePip().pageAttributesFrom('Help', { title: 'Help', 'system-category': 'documentation', access: { view: ['editor'] } });
    expect(said(warn)).toHaveLength(1);
  });
});
