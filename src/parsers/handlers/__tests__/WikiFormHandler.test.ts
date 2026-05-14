/**
 * WikiFormHandler tests
 *
 * Covers:
 * - process() with empty content
 * - process() passthrough for non-form content
 * - [{FormOpen action='' method='POST'}] → <form> with CSRF token
 * - [{FormInput name='field' type='text'}] → input HTML
 * - [{FormInput name='field' type='hidden'}] → no label
 * - [{FormInput name='field' type='checkbox'}]
 * - [{FormInput} without name → error comment
 * - [{FormSelect name='choice' options='A,B,C'}] → select with options
 * - [{FormTextarea name='text'}] → textarea element
 * - [{FormButton type='submit' value='Save'}] → button HTML
 * - [{FormClose}] → </form>
 * - Full form sequence: Open+Input+Close
 * - getSupportedPatterns() / getSupportedInputTypes()
 * - getInfo() metadata
 * - onInitialize() no-throw
 *
 * @jest-environment node
 */

import WikiFormHandler from '../WikiFormHandler';

const ctx = { pageName: 'TestPage', engine: { getManager: vi.fn(() => null) } };

async function run(content: string): Promise<string> {
  const h = new WikiFormHandler();
  return h.process(content, ctx);
}

describe('WikiFormHandler', () => {
  describe('metadata', () => {
    test('has correct handlerId', () => {
      expect(new WikiFormHandler().handlerId).toBe('WikiFormHandler');
    });

    test('has priority 85', () => {
      expect(new WikiFormHandler().priority).toBe(85);
    });
  });

  describe('process() — passthrough', () => {
    test('returns empty string for empty content', async () => {
      expect(await run('')).toBe('');
    });

    test('returns non-form content unchanged', async () => {
      const text = 'Regular wiki content here.';
      expect(await run(text)).toBe(text);
    });
  });

  describe('process() — FormOpen', () => {
    test('[{FormOpen}] generates <form> tag with canonical _csrf field (#690)', async () => {
      const result = await run('[{FormOpen}]');
      expect(result).toContain('<form ');
      expect(result).toContain('name="_csrf"');
      expect(result).not.toContain('name="_csrfToken"');
    });

    test('[{FormOpen action="save" method="POST"}] uses specified action', async () => {
      const result = await run("[{FormOpen action='save' method='POST'}]");
      expect(result).toContain('action="save"');
      expect(result).toContain('method="POST"');
    });

    test('[{FormOpen class="my-form"}] applies custom CSS class', async () => {
      const result = await run("[{FormOpen class='my-form'}]");
      expect(result).toContain('class="my-form"');
    });
  });

  describe('process() — FormInput', () => {
    test('[{FormInput name="email" type="text"}] generates input', async () => {
      const result = await run("[{FormInput name='email' type='text'}]");
      expect(result).toContain('<input');
      expect(result).toContain('name="email"');
      expect(result).toContain('type="text"');
    });

    test('[{FormInput name="pwd" type="password"}] generates password input', async () => {
      const result = await run("[{FormInput name='pwd' type='password'}]");
      expect(result).toContain('type="password"');
    });

    test('[{FormInput name="token" type="hidden" value="xyz"}] generates hidden input without label', async () => {
      const result = await run("[{FormInput name='token' type='hidden' value='xyz'}]");
      expect(result).toContain('type="hidden"');
      expect(result).not.toContain('<label');
    });

    test('[{FormInput name="field" required="true"}] adds required attribute', async () => {
      const result = await run("[{FormInput name='field' required='true'}]");
      expect(result).toContain('required');
    });

    test('[{FormInput}] without name produces error comment', async () => {
      const result = await run("[{FormInput type='text'}]");
      expect(result).toContain('<!-- Form Error:');
    });

    test('[{FormInput name="x" type="invalid"}] produces error comment', async () => {
      const result = await run("[{FormInput name='x' type='invalid-type'}]");
      expect(result).toContain('<!-- Form Error:');
    });
  });

  describe('process() — FormSelect', () => {
    test('[{FormSelect name="choice" options="A,B,C"}] generates select with options', async () => {
      const result = await run("[{FormSelect name='choice' options='A,B,C'}]");
      expect(result).toContain('<select');
      expect(result).toContain('name="choice"');
      expect(result).toContain('<option value="A">A</option>');
      expect(result).toContain('<option value="B">B</option>');
    });

    test('[{FormSelect name="x" options="A" selected="A"}] marks selected option', async () => {
      const result = await run("[{FormSelect name='x' options='A,B' selected='A'}]");
      expect(result).toContain('selected');
    });

    test('[{FormSelect}] without name produces error comment', async () => {
      const result = await run("[{FormSelect options='X,Y'}]");
      expect(result).toContain('<!-- Form Error:');
    });
  });

  describe('process() — FormTextarea', () => {
    test('[{FormTextarea name="comment"}] generates textarea', async () => {
      const result = await run("[{FormTextarea name='comment'}]");
      expect(result).toContain('<textarea');
      expect(result).toContain('name="comment"');
    });

    test('[{FormTextarea name="text" rows="5"}] applies rows attribute', async () => {
      const result = await run("[{FormTextarea name='text' rows='5'}]");
      expect(result).toContain('rows="5"');
    });

    test('[{FormTextarea}] without name produces error comment', async () => {
      const result = await run("[{FormTextarea rows='3'}]");
      expect(result).toContain('<!-- Form Error:');
    });
  });

  describe('process() — FormButton', () => {
    test('[{FormButton type="submit" value="Save"}] generates submit button', async () => {
      const result = await run("[{FormButton type='submit' value='Save'}]");
      expect(result).toContain('<button');
      expect(result).toContain('type="submit"');
      expect(result).toContain('Save');
    });

    test('[{FormButton type="reset"}] generates reset button', async () => {
      const result = await run("[{FormButton type='reset' value='Reset'}]");
      expect(result).toContain('type="reset"');
    });
  });

  describe('process() — FormClose', () => {
    test('[{FormClose}] generates </form>', async () => {
      const result = await run('[{FormClose}]');
      expect(result).toContain('</form>');
    });
  });

  describe('process() — complete form sequence', () => {
    test('FormOpen + FormInput + FormClose generates complete form', async () => {
      const content = "[{FormOpen action='/submit'}]\n[{FormInput name='user' type='text'}]\n[{FormClose}]";
      const result = await run(content);
      expect(result).toContain('<form ');
      expect(result).toContain('<input');
      expect(result).toContain('</form>');
    });
  });

  describe('getSupportedPatterns()', () => {
    test('returns array of pattern strings', () => {
      const patterns = new WikiFormHandler().getSupportedPatterns();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  describe('getSupportedInputTypes()', () => {
    test('returns array of input types', () => {
      const types = new WikiFormHandler().getSupportedInputTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types).toContain('text');
      expect(types).toContain('email');
    });
  });

  describe('getInfo()', () => {
    test('returns features and supportedPatterns arrays', () => {
      const info = new WikiFormHandler().getInfo();
      expect(Array.isArray(info.features)).toBe(true);
      expect(Array.isArray(info.supportedPatterns)).toBe(true);
    });
  });

  describe('onInitialize()', () => {
    test('does not throw when no MarkupParser', async () => {
      const handler = new WikiFormHandler();
      const engine = { getManager: vi.fn(() => null) };
      await expect(
        (handler as unknown as { onInitialize: (ctx: unknown) => Promise<void> }).onInitialize({ engine })
      ).resolves.not.toThrow();
    });
  });
});
