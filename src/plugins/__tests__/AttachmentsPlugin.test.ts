/**
 * AttachmentsPlugin tests
 *
 * Covers:
 * - No engine → '0'
 * - No AttachmentManager → '0'
 * - Non-array result → '0'
 * - format=count (default) → count string
 * - format=list → list of attachment links
 * - max param limits list
 * - attachment with/without url or name
 * - error handling → '0'
 *
 * @jest-environment node
 */

import AttachmentsPlugin from '../AttachmentsPlugin';

const makeAttachmentManager = (attachments: unknown[]) => ({
  getSharedPoolAttachments: vi.fn().mockResolvedValue(attachments)
});

const makeEngine = (attachmentManager: unknown = null) => ({
  getManager: vi.fn((name: string) => name === 'AttachmentManager' ? attachmentManager : null),
  logger: { error: vi.fn() }
});

describe('AttachmentsPlugin', () => {
  describe('metadata', () => {
    test('has correct name and version', () => {
      expect(AttachmentsPlugin.name).toBe('AttachmentsPlugin');
      expect(AttachmentsPlugin.version).toBe('1.0.0');
      expect(typeof AttachmentsPlugin.execute).toBe('function');
    });
  });

  describe('early returns', () => {
    test('returns "0" when engine is null', async () => {
      const result = await AttachmentsPlugin.execute({ engine: null }, {});
      expect(result).toBe('0');
    });

    test('returns "0" when AttachmentManager unavailable', async () => {
      const context = { engine: makeEngine(null) };
      const result = await AttachmentsPlugin.execute(context, {});
      expect(result).toBe('0');
    });

    test('returns "0" when getSharedPoolAttachments is missing', async () => {
      const context = { engine: makeEngine({}) };
      const result = await AttachmentsPlugin.execute(context, {});
      expect(result).toBe('0');
    });

    test('returns "0" when getSharedPoolAttachments returns non-array', async () => {
      const am = { getSharedPoolAttachments: vi.fn().mockResolvedValue(null) };
      const context = { engine: makeEngine(am) };
      const result = await AttachmentsPlugin.execute(context, {});
      expect(result).toBe('0');
    });
  });

  describe('format=count (default)', () => {
    test('returns "0" for empty attachments', async () => {
      const am = makeAttachmentManager([]);
      const context = { engine: makeEngine(am) };
      const result = await AttachmentsPlugin.execute(context, {});
      expect(result).toContain('0');
    });

    test('returns count for multiple attachments', async () => {
      const attachments = [
        { identifier: 'a1', name: 'doc.pdf', url: '/attach/a1' },
        { identifier: 'a2', name: 'img.jpg', url: '/attach/a2' },
        { identifier: 'a3', name: 'sheet.xlsx', url: '/attach/a3' }
      ];
      const am = makeAttachmentManager(attachments);
      const context = { engine: makeEngine(am) };
      const result = await AttachmentsPlugin.execute(context, {});
      expect(result).toContain('3');
    });

    test('uses count format when format param is explicitly "count"', async () => {
      const am = makeAttachmentManager([{ identifier: 'a1', name: 'file.txt', url: '/a' }]);
      const context = { engine: makeEngine(am) };
      const result = await AttachmentsPlugin.execute(context, { format: 'count' });
      expect(result).toContain('1');
    });
  });

  describe('format=list', () => {
    test('renders list of attachments as links', async () => {
      const attachments = [
        { identifier: 'a1', name: 'report.pdf', url: '/attach/a1' },
        { identifier: 'a2', name: 'photo.jpg', url: '/attach/a2' }
      ];
      const am = makeAttachmentManager(attachments);
      const context = { engine: makeEngine(am) };
      const result = await AttachmentsPlugin.execute(context, { format: 'list' });
      expect(result).toContain('report.pdf');
      expect(result).toContain('photo.jpg');
    });

    test('falls back to identifier when name is absent', async () => {
      const attachments = [{ identifier: 'att-001' }];
      const am = makeAttachmentManager(attachments);
      const context = { engine: makeEngine(am) };
      const result = await AttachmentsPlugin.execute(context, { format: 'list' });
      expect(result).toContain('att-001');
    });

    test('uses /attach/identifier path when url is absent', async () => {
      const attachments = [{ identifier: 'att-002', name: 'file.txt' }];
      const am = makeAttachmentManager(attachments);
      const context = { engine: makeEngine(am) };
      const result = await AttachmentsPlugin.execute(context, { format: 'list' });
      expect(result).toContain('/attach/att-002');
    });

    test('max param limits list results', async () => {
      const attachments = Array.from({ length: 10 }, (_, i) => ({
        identifier: `a${i}`,
        name: `file${i}.txt`,
        url: `/attach/a${i}`
      }));
      const am = makeAttachmentManager(attachments);
      const context = { engine: makeEngine(am) };
      const result = await AttachmentsPlugin.execute(context, { format: 'list', max: '3' });
      const count = (result.match(/\/attach\//g) ?? []).length;
      expect(count).toBeLessThanOrEqual(3);
    });

    test('renders empty list when no attachments', async () => {
      const am = makeAttachmentManager([]);
      const context = { engine: makeEngine(am) };
      const result = await AttachmentsPlugin.execute(context, { format: 'list' });
      expect(typeof result).toBe('string');
    });
  });

  describe('error handling', () => {
    test('returns "0" on unexpected exception', async () => {
      const am = {
        getSharedPoolAttachments: vi.fn().mockRejectedValue(new Error('DB down'))
      };
      const context = { engine: makeEngine(am) };
      const result = await AttachmentsPlugin.execute(context, {});
      expect(result).toBe('0');
    });
  });
});
