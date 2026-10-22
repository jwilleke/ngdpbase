/**
 * #1974 — attachments: `sendTo(ctx, …, { attachments })` passes them to the
 * provider, the SMTP provider hands them to Nodemailer, the total is capped by
 * `ngdpbase.mail.attachments.max-bytes`, and no log line carries a file's
 * name or content (the server log keeps the domain-only rule).
 */
const sendMail = vi.fn(async () => ({}));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));

import EmailManager, { AttachmentRefusedError } from '../EmailManager';
import { NodemailerMailProvider } from '../../mail/NodemailerMailProvider';
import { ConsoleMailProvider, type MailAttachment } from '../../mail/MailProvider';
import { TEST_ACTOR } from '../../test-support/actors';
import { loggedText } from './__fixtures__/loggedText';

const ADDRESS = 'treasurer.private@example.org';
const SECRET_CONTENT = 'SECRET-INVOICE-CONTENT';
const pdf = (bytes = 64): MailAttachment => {
  const content = Buffer.alloc(bytes);
  content.write(`%PDF-1.7 ${SECRET_CONTENT}`);
  return { filename: 'invoice-Molly-Member-2026-0042.pdf', contentType: 'application/pdf', content };
};

async function setup(props: Record<string, unknown> = {}): Promise<{ manager: EmailManager; providerSend: ReturnType<typeof vi.fn> }> {
  const all: Record<string, unknown> = {
    'ngdpbase.mail.enabled': true,
    'ngdpbase.mail.provider': 'smtp',
    'ngdpbase.mail.provider.smtp.host': 'smtp.example.com',
    'ngdpbase.mail.provider.smtp.from': 'noreply@example.com',
    'ngdpbase.mail.provider.smtp.user': 'u',
    'ngdpbase.mail.provider.smtp.pass': 'p',
    ...props
  };
  const manager = new EmailManager({
    getManager: (name: string) => (name === 'ConfigurationManager' ? { getProperty: (k: string, d: unknown) => (k in all ? all[k] : d) } : undefined)
  });
  await manager.initialize();
  const providerSend = vi.fn(async () => undefined);
  (manager as unknown as { provider: unknown }).provider = { send: providerSend };
  return { manager, providerSend };
}

describe('EmailManager attachments (#1974)', () => {
  beforeEach(() => vi.clearAllMocks());

  test('sendTo passes the attachment through to the mail provider', async () => {
    const { manager, providerSend } = await setup();
    const file = pdf();
    await manager.sendTo(TEST_ACTOR, ADDRESS, 'Your invoice', 'Attached.', undefined, { attachments: [file] });
    expect(providerSend).toHaveBeenCalledWith(expect.objectContaining({ to: ADDRESS, subject: 'Your invoice', text: 'Attached.', attachments: [file] }));
  });

  test('without attachments the message has none', async () => {
    const { manager, providerSend } = await setup();
    await manager.sendTo(TEST_ACTOR, ADDRESS, 's', 't', '<p>t</p>');
    expect(providerSend.mock.calls[0][0]).not.toHaveProperty('attachments');
  });

  test('the SMTP provider hands each attachment to Nodemailer as filename, contentType and content', async () => {
    const provider = new NodemailerMailProvider({ host: 'h', port: 587, secure: false, from: 'noreply@example.com' });
    const file = pdf();
    await provider.send({ to: ADDRESS, subject: 'Your invoice', text: 'Attached.', attachments: [file] });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [{ filename: file.filename, contentType: 'application/pdf', content: file.content }]
    }));
  });

  test('over ngdpbase.mail.attachments.max-bytes the send is refused before the provider — and is not a delivery failure', async () => {
    const { manager, providerSend } = await setup({ 'ngdpbase.mail.attachments.max-bytes': 100 });
    await expect(manager.sendTo(TEST_ACTOR, ADDRESS, 's', 't', undefined, { attachments: [pdf(60), pdf(60)] }))
      .rejects.toThrow(/attachments total 120 bytes, over ngdpbase.mail.attachments.max-bytes \(100\)/);
    expect(providerSend).not.toHaveBeenCalled();
    expect(manager.getManagerStatus().state).toBe('ready');
    await expect(manager.sendTo(TEST_ACTOR, ADDRESS, 's', 't', undefined, { attachments: [pdf(100)] })).resolves.toBeUndefined();
  });

  test('the shipped limit is 10 MiB', async () => {
    const { manager, providerSend } = await setup();
    const big = { ...pdf(), content: Buffer.alloc(10 * 1024 * 1024 + 1) };
    await expect(manager.sendTo(TEST_ACTOR, ADDRESS, 's', 't', undefined, { attachments: [big] })).rejects.toBeInstanceOf(AttachmentRefusedError);
    expect(providerSend).not.toHaveBeenCalled();
  });

  test('a filename with a path or a line break, a bad media type, or content that is not a Buffer is refused', async () => {
    const { manager, providerSend } = await setup();
    const send = (a: Partial<MailAttachment>): Promise<void> =>
      manager.sendTo(TEST_ACTOR, ADDRESS, 's', 't', undefined, { attachments: [{ ...pdf(), ...a } as MailAttachment] });
    await expect(send({ filename: '../etc/passwd' })).rejects.toThrow(/filename/);
    await expect(send({ filename: 'a\r\nBcc: x@y.z' })).rejects.toThrow(/filename/);
    await expect(send({ filename: '' })).rejects.toThrow(/filename/);
    await expect(send({ contentType: 'pdf' })).rejects.toThrow(/contentType/);
    await expect(send({ content: 'text' as never })).rejects.toThrow(/Buffer/);
    expect(providerSend).not.toHaveBeenCalled();
  });

  test('a context is required', async () => {
    const { manager } = await setup();
    await expect(manager.sendTo(undefined as never, ADDRESS, 's', 't')).rejects.toThrow(/context is required/);
  });

  test('sendInBackground carries attachments and logs a refusal (domain only), never rejecting', async () => {
    const { manager, providerSend } = await setup({ 'ngdpbase.mail.attachments.max-bytes': 10 });
    expect(() => manager.sendInBackground(TEST_ACTOR, ADDRESS, 's', 't', undefined, { attachments: [pdf(64)] })).not.toThrow();
    await vi.waitFor(() => expect(loggedText()).toMatch(/not sent to-domain=example.org: attachments total 64 bytes/));
    expect(providerSend).not.toHaveBeenCalled();
  });

  test('no log line carries an attachment\'s name or content, or the full address — counts and bytes only', async () => {
    const { manager } = await setup();
    await manager.sendTo(TEST_ACTOR, ADDRESS, 'Your invoice', 'Attached.', undefined, { attachments: [pdf()] });
    await new ConsoleMailProvider().send({ to: ADDRESS, subject: 'Your invoice', text: 'Attached.', attachments: [pdf()] });
    await new NodemailerMailProvider({ host: 'h', port: 587, secure: false, from: 'noreply@example.com' })
      .send({ to: ADDRESS, subject: 'Your invoice', text: 'Attached.', attachments: [pdf()] });
    const text = loggedText();
    expect(text).toMatch(/attachments=1 attachment-bytes=64/);
    expect(text).toMatch(/by=test-user/);
    expect(text).not.toContain(SECRET_CONTENT);
    expect(text).not.toContain('Molly-Member');
    expect(text).not.toContain(ADDRESS);
  });
});
