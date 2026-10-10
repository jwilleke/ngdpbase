/**
 * Tests for FormsPlugin — prefill, field rendering, section grouping
 */

// ── Mock fs so unit lookup doesn't hit disk ───────────────────────────────────
// vi.spyOn patches the live fs.promises object in-place so the spy is
// observed regardless of whether the module used ESM import or CJS require.
import * as fsMod from 'fs';

let readFileSpy: ReturnType<typeof vi.spyOn>;

// Import AFTER registering the spy (spy is set up in beforeEach/beforeAll)
type FormsPluginType = { name: string; execute: (ctx: unknown, params: unknown) => Promise<string> };
let FormsPlugin: FormsPluginType;

beforeAll(async () => {
  const mod = await import('../plugins/FormsPlugin');
  FormsPlugin = ((mod as unknown as { default: FormsPluginType }).default ?? mod) as FormsPluginType;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Every form carries its page name; the prefill tests look at the fields only. */
const withoutPageInput = (html: string) => html.replace(/<input type="hidden" name="_page"[^>]*>/, '');

const UNITS = [
  { id: 'unit-43', parcel: '66-09960.043', address: '43 Fairways Drive', phone: '' }
];

function makeEngine(formDef: object | null, resolveDataPath = '/data/fairways') {
  return {
    getManager: vi.fn((name: string) => {
      if (name === 'FormsDataManager') {
        return { getDefinition: vi.fn(() => formDef) };
      }
      if (name === 'ConfigurationManager') {
        return {
          resolveDataPath: vi.fn(() => resolveDataPath),
          getProperty: vi.fn(() => [])
        };
      }
      return undefined;
    })
  };
}

function makeForm(fields: object[]) {
  return {
    id: 'test-form',
    title: 'Test Form',
    proxySubmission: false,
    fields
  };
}

function makeContext(userCtx?: Record<string, unknown>) {
  return {
    engine: makeEngine(makeForm([
      { name: 'name', type: 'text', label: 'Full Name', required: true, prefill: 'user.displayName' },
      { name: 'email', type: 'email', label: 'Email', required: false, prefill: 'user.email' },
      { name: 'phone', type: 'tel', label: 'Phone', required: false, prefill: 'user.cellPhone' }
    ])),
    userContext: userCtx ?? null,
    pageName: 'test'
  };
}

// ── Missing form / manager ────────────────────────────────────────────────────

describe('FormsPlugin — error states', () => {
  test('returns warning when id param is missing', async () => {
    const ctx = { engine: makeEngine(null), userContext: null, pageName: 'test' };
    const html = await FormsPlugin.execute(ctx, {});
    expect(html).toContain('alert-warning');
    expect(html).toContain('missing required parameter');
  });

  test('returns danger when FormsDataManager not available', async () => {
    const ctx = { engine: { getManager: () => undefined }, userContext: null, pageName: 'test' };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).toContain('alert-danger');
    expect(html).toContain('FormsDataManager not available');
  });

  test('returns warning when form id not found', async () => {
    const ctx = { engine: makeEngine(null), userContext: null, pageName: 'test' };
    const html = await FormsPlugin.execute(ctx, { id: 'missing-form' });
    expect(html).toContain('alert-warning');
    expect(html).toContain('missing-form');
  });
});

// ── Prefill — anonymous user ──────────────────────────────────────────────────

describe('FormsPlugin — prefill with anonymous user', () => {
  test('fields render empty when userContext is null', async () => {
    const ctx = makeContext(null);
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    // Fields should exist but have no value attribute
    expect(html).toContain('name="name"');
    expect(withoutPageInput(html)).not.toContain('value="');
  });

  test('fields render empty when userContext is anonymous (no displayName)', async () => {
    const ctx = makeContext({ username: 'Anonymous', roles: ['Anonymous'] });
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(withoutPageInput(html)).not.toContain('value="');
  });
});

// ── Prefill — logged-in user ──────────────────────────────────────────────────

describe('FormsPlugin — prefill with logged-in user', () => {
  const userCtx = {
    username: 'jim',
    displayName: 'Jim Willeke',
    email: 'jim@willeke.com',
    cellPhone: '419-564-7692',
    parcel: '66-09960.043',
    roles: ['resident', 'Authenticated']
  };

  test('injects displayName into name field', async () => {
    const ctx = makeContext(userCtx);
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).toContain('value="Jim Willeke"');
  });

  test('injects email into email field', async () => {
    const ctx = makeContext(userCtx);
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).toContain('value="jim@willeke.com"');
  });

  test('injects cellPhone into phone field', async () => {
    const ctx = makeContext(userCtx);
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).toContain('value="419-564-7692"');
  });

  test('prefill values are in editable inputs (not readonly)', async () => {
    const ctx = makeContext(userCtx);
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    // Should not have readonly or disabled
    expect(html).not.toContain('readonly');
    expect(html).not.toContain('disabled');
  });

  test('user with missing optional field renders empty for that field', async () => {
    const ctx = makeContext({ ...userCtx, cellPhone: undefined });
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).toContain('value="Jim Willeke"');
    expect(html).toContain('value="jim@willeke.com"');
    // phone field should have no value attr
    expect(html).not.toContain('value="419');
  });
});

// ── Prefill — user.unit.* lookup ──────────────────────────────────────────────

describe('FormsPlugin — user.unit.* prefill', () => {
  const userCtx = { username: 'jim', displayName: 'Jim', parcel: '66-09960.043', roles: [] };

  // vi.spyOn patches the live fs.promises object in-place so the spy is
  // observed regardless of whether FormsPlugin used ESM import or CJS require.
   
  let readFileSpy: any;

  function makeUnitForm() {
    return {
      ...makeForm([
        { name: 'address', type: 'text', label: 'Unit Address', required: false, prefill: 'user.unit.address' }
      ])
    };
  }

  beforeEach(() => {
    readFileSpy = vi.spyOn(fsMod.promises, 'readFile');
  });

  afterEach(() => {
    readFileSpy?.mockRestore();
  });

  test('resolves unit address from units.json by parcel', async () => {
    readFileSpy.mockResolvedValue(JSON.stringify(UNITS));
    const ctx = {
      engine: makeEngine(makeUnitForm()),
      userContext: userCtx,
      pageName: 'test'
    };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).toContain('value="43 Fairways Drive"');
    expect(readFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('units.json'),
      'utf8'
    );
  });

  test('renders empty address when parcel does not match any unit', async () => {
    readFileSpy.mockResolvedValue(JSON.stringify(UNITS));
    const ctx = {
      engine: makeEngine(makeUnitForm()),
      userContext: { ...userCtx, parcel: '66-09960.999' },
      pageName: 'test'
    };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(withoutPageInput(html)).not.toContain('value="');
  });

  test('renders empty address when units.json read fails', async () => {
    readFileSpy.mockRejectedValue(new Error('ENOENT'));
    const ctx = {
      engine: makeEngine(makeUnitForm()),
      userContext: userCtx,
      pageName: 'test'
    };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(withoutPageInput(html)).not.toContain('value="');
    expect(html).toContain('name="address"');
  });

  test('skips units.json read when user has no parcel', async () => {
    const ctx = {
      engine: makeEngine(makeUnitForm()),
      userContext: { username: 'jim', roles: [] }, // no parcel
      pageName: 'test'
    };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(readFileSpy).not.toHaveBeenCalled();
    expect(html).toContain('name="address"');
  });

  test('skips units.json read when no field has user.unit.* prefill', async () => {
    const form = makeForm([
      { name: 'name', type: 'text', label: 'Name', prefill: 'user.displayName' }
    ]);
    const ctx = {
      engine: makeEngine(form),
      userContext: userCtx,
      pageName: 'test'
    };
    await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(readFileSpy).not.toHaveBeenCalled();
  });
});

// ── Textarea prefill ──────────────────────────────────────────────────────────

describe('FormsPlugin — textarea prefill', () => {
  test('injects prefill as textarea content, not value attribute', async () => {
    const form = makeForm([
      { name: 'notes', type: 'textarea', label: 'Notes', prefill: 'user.displayName' }
    ]);
    const ctx = {
      engine: makeEngine(form),
      userContext: { username: 'jim', displayName: 'Jim Willeke', roles: [] },
      pageName: 'test'
    };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).toContain('>Jim Willeke</textarea>');
  });
});

// ── Dropdown prefill ──────────────────────────────────────────────────────────

describe('FormsPlugin — dropdown prefill', () => {
  test('marks the matching option as selected', async () => {
    const form = makeForm([
      { name: 'type', type: 'dropdown', label: 'Type', options: ['Birthday', 'Meeting', 'Other'], prefill: 'user.displayName' }
    ]);
    const ctx = {
      engine: makeEngine(form),
      userContext: { username: 'jim', displayName: 'Meeting', roles: [] },
      pageName: 'test'
    };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).toContain('<option value="Meeting" selected>Meeting</option>');
    expect(html).not.toMatch(/<option value="Birthday" selected>/);
  });

  test('no option selected when prefill does not match any option', async () => {
    const form = makeForm([
      { name: 'type', type: 'dropdown', label: 'Type', options: ['A', 'B'], prefill: 'user.displayName' }
    ]);
    const ctx = {
      engine: makeEngine(form),
      userContext: { username: 'jim', displayName: 'NoMatch', roles: [] },
      pageName: 'test'
    };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).not.toContain('selected');
  });
});

// ── Section grouping into fieldsets ──────────────────────────────────────────

describe('FormsPlugin — section field renders as fieldset', () => {
  test('section field produces a <fieldset> with <legend>', async () => {
    const form = makeForm([
      { name: 'sec', type: 'section', label: 'My Section' },
      { name: 'name', type: 'text', label: 'Name' }
    ]);
    const ctx = { engine: makeEngine(form), userContext: null, pageName: 'test' };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).toContain('<fieldset');
    expect(html).toContain('<legend');
    expect(html).toContain('My Section');
  });

  test('multiple sections produce multiple fieldsets', async () => {
    const form = makeForm([
      { name: 's1', type: 'section', label: 'Section One' },
      { name: 'a', type: 'text', label: 'A' },
      { name: 's2', type: 'section', label: 'Section Two' },
      { name: 'b', type: 'text', label: 'B' }
    ]);
    const ctx = { engine: makeEngine(form), userContext: null, pageName: 'test' };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).toContain('Section One');
    expect(html).toContain('Section Two');
    expect((html.match(/<fieldset/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test('section field itself does not produce an <input> element', async () => {
    const form = makeForm([
      { name: 'sec', type: 'section', label: 'Details' }
    ]);
    const ctx = { engine: makeEngine(form), userContext: null, pageName: 'test' };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).not.toContain('name="sec"');
  });

  test('prefill on a section field is silently ignored', async () => {
    const form = makeForm([
      { name: 'sec', type: 'section', label: 'Details', prefill: 'user.displayName' },
      { name: 'other', type: 'text', label: 'Other' }
    ]);
    const ctx = {
      engine: makeEngine(form),
      userContext: { username: 'jim', displayName: 'Jim', roles: [] },
      pageName: 'test'
    };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    // Section should render as fieldset, not as input with value
    expect(html).toContain('<fieldset');
    expect(html).not.toContain('name="sec"');
  });
});

// ── proxySubmission block ─────────────────────────────────────────────────────

describe('FormsPlugin — proxySubmission block', () => {
  test('renders "For Another Occupant" fieldset when proxySubmission is true', async () => {
    const form = { ...makeForm([{ name: 'n', type: 'text', label: 'N' }]), proxySubmission: true };
    const ctx = { engine: makeEngine(form), userContext: null, pageName: 'test' };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).toContain('For Another Occupant');
    expect(html).toContain('onBehalfOf[name]');
    expect(html).toContain('onBehalfOf[email]');
  });

  test('omits proxy block when proxySubmission is false', async () => {
    const form = { ...makeForm([{ name: 'n', type: 'text', label: 'N' }]), proxySubmission: false };
    const ctx = { engine: makeEngine(form), userContext: null, pageName: 'test' };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).not.toContain('onBehalfOf');
  });
});

// ── HTML escaping ─────────────────────────────────────────────────────────────

describe('FormsPlugin — HTML escaping', () => {
  test('escapes XSS in prefill values', async () => {
    const form = makeForm([{ name: 'name', type: 'text', label: 'Name', prefill: 'user.displayName' }]);
    const ctx = {
      engine: makeEngine(form),
      userContext: { username: 'x', displayName: '<script>alert(1)</script>', roles: [] },
      pageName: 'test'
    };
    const html = await FormsPlugin.execute(ctx, { id: 'test-form' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ── Choices from a manager, amount field, page name, error slots ──────────────

describe('FormsPlugin — fetch options, amount, page name', () => {
  const form = makeForm([
    { name: 'fund', type: 'dropdown', label: 'Fund', required: true, optionsSource: 'fetch:LedgerManager.toFormOptions(list=funds)' },
    { name: 'amount', type: 'amount', label: 'Amount', required: true }
  ]);

  function ctxWith(toFormOptions: (o: unknown, viewer: unknown) => Promise<unknown>) {
    return {
      engine: {
        getManager: (name: string) => {
          if (name === 'FormsDataManager') return { getDefinition: () => form };
          if (name === 'LedgerManager') return { toFormOptions };
          return undefined;
        }
      },
      pageName: 'Treasurer <Books>',
      userContext: { username: 'molly', roles: ['treasurer'] }
    };
  }

  test('dropdown choices come from the manager, asked with the viewer', async () => {
    let viewer: unknown;
    const html = await FormsPlugin.execute(ctxWith(async (_o, v) => { viewer = v; return [{ value: 'general', label: 'General <Fund>' }]; }), { id: 'test-form' });
    expect(html).toContain('<option value="general">General &lt;Fund&gt;</option>');
    expect(viewer).toEqual({ username: 'molly', roles: ['treasurer'] });
  });

  test('an amount field is a decimal text input', async () => {
    const html = await FormsPlugin.execute(ctxWith(async () => []), { id: 'test-form' });
    expect(html).toMatch(/<input type="text" inputmode="decimal"[^>]*name="amount"/);
  });

  test('the form carries its page name, escaped, and an error slot per field', async () => {
    const html = await FormsPlugin.execute(ctxWith(async () => []), { id: 'test-form' });
    expect(html).toContain('<input type="hidden" name="_page" value="Treasurer &lt;Books&gt;">');
    expect(html).toContain('data-field-error="fund"');
    expect(html).toContain('data-field-error="amount"');
  });
});
