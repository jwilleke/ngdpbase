/**
 * #1916 — a full email address never reaches the server log; the domain does.
 *
 * One helper (`emailForLog`) is the way an address reaches a log line. These
 * tests drive each log site that used to print a full address and read back
 * everything written to the (mocked) logger. Audit records are not the server
 * log and keep full addresses (UserManager.audit.test.ts).
 *
 * Sabotage: put `${message.to}` back in NodemailerMailProvider's sent line, or
 * `${email}` back in MagicLinkAuthProvider's "Link sent" line, and the matching
 * test goes red.
 */
import { emailDomain, redactEmailAddresses, errorForLog } from '../emailForLog';
import { ConsoleMailProvider } from '../../mail/MailProvider';
import { NodemailerMailProvider } from '../../mail/NodemailerMailProvider';
import EmailManager from '../../managers/EmailManager';
import { MagicLinkAuthProvider } from '../../providers/MagicLinkAuthProvider';
import { loggedText } from '../../managers/__tests__/__fixtures__/loggedText';

const sendMail = vi.fn().mockResolvedValue({});
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));

const ADDRESS = 'bob.private@example.org';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('emailForLog helpers', () => {
  test('emailDomain keeps the domain only, for one address or a list', () => {
    expect(emailDomain(ADDRESS)).toBe('example.org');
    expect(emailDomain('Bob <bob@Example.ORG>, ann@x.io, ann2@x.io')).toBe('example.org,x.io');
    expect(emailDomain('')).toBe('unknown');
    expect(emailDomain(undefined)).toBe('unknown');
    expect(emailDomain('no-at-sign')).toBe('unknown');
  });

  test('redactEmailAddresses cuts every address in free text to its domain', () => {
    expect(redactEmailAddresses(`550 <${ADDRESS}>: rejected; also ann@x.io`)).toBe('550 <…@example.org>: rejected; also …@x.io');
    expect(errorForLog(new Error(`rejected ${ADDRESS}`))).toBe('rejected …@example.org');
  });
});

describe('mail providers log the recipient domain only', () => {
  test('NodemailerMailProvider: the sent line', async () => {
    const provider = new NodemailerMailProvider({ host: 'smtp.example.com', port: 587, secure: false, from: 'noreply@example.com' });
    await provider.send({ to: ADDRESS, subject: 'Hello', text: 'body' });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: ADDRESS }));
    const text = loggedText();
    expect(text).toContain('to-domain=example.org');
    expect(text).not.toContain(ADDRESS);
  });

  test('ConsoleMailProvider: the To line, and any address in the body', async () => {
    await new ConsoleMailProvider().send({ to: ADDRESS, subject: 'Hello', text: 'From: Ann <ann.secret@x.io>\nhttps://site/verify?token=abc' });
    const text = loggedText();
    expect(text).toContain('an address at example.org');
    expect(text).toContain('https://site/verify?token=abc');
    expect(text).not.toContain(ADDRESS);
    expect(text).not.toContain('ann.secret@x.io');
  });

  test('EmailManager: the initialised line names the from domain, not the from address', async () => {
    const props: Record<string, unknown> = {
      'ngdpbase.mail.provider': 'smtp',
      'ngdpbase.mail.provider.smtp.host': 'smtp.example.com',
      'ngdpbase.mail.provider.smtp.from': 'site.owner@example.net'
    };
    const configManager = { getProperty: (key: string, def: unknown) => (key in props ? props[key] : def) };
    const manager = new EmailManager({ getManager: (n: string) => (n === 'ConfigurationManager' ? configManager : null) });
    await manager.initialize();
    const text = loggedText();
    expect(text).toContain('from-domain=example.net');
    expect(text).not.toContain('site.owner@example.net');
  });
});

describe('MagicLinkAuthProvider logs the domain only', () => {
  function build(opts: { user?: { username: string; email: string } | null; autoProvision?: boolean; send?: ReturnType<typeof vi.fn>; createUser?: ReturnType<typeof vi.fn> } = {}) {
    const send = opts.send ?? vi.fn().mockResolvedValue(undefined);
    const userManager = {
      getUserByEmail: vi.fn().mockResolvedValue(opts.user ?? undefined),
      getUser: vi.fn().mockResolvedValue(undefined),
      createUser: opts.createUser ?? vi.fn(async (u: { username: string }) => ({ username: u.username }))
    };
    const config: Record<string, unknown> = { 'ngdpbase.auth.magic-link.auto-provision': opts.autoProvision ?? false };
    const engine = {
      getManager: (name: string) => {
        if (name === 'UserManager') return userManager;
        if (name === 'ConfigurationManager') return { getBaseURL: () => 'https://site.example', getProperty: (k: string, d: unknown) => (k in config ? config[k] : d) };
        if (name === 'PolicyInformationPoint') return { systemPrincipalName: () => 'system' };
        return null;
      }
    };
    const provider = new MagicLinkAuthProvider(engine, { ttlMs: 60_000, mailProvider: { send } });
    return { provider, send, userManager };
  }

  const tokenOf = (send: ReturnType<typeof vi.fn>): string => /token=([0-9a-f]+)/.exec((send.mock.calls[0][0] as { text: string }).text)[1];

  test('link sent, then rate limited: neither line names the address', async () => {
    const { provider, send } = build({ user: { username: 'bob', email: ADDRESS } });
    await provider.initiate({ email: ADDRESS });
    await provider.initiate({ email: ADDRESS });
    expect(send).toHaveBeenCalledTimes(1);
    const text = loggedText();
    expect(text).toContain('Link sent to an address at example.org');
    expect(text).toContain('Rate limited: an address at example.org');
    expect(text).not.toContain(ADDRESS);
  });

  test('no account for the address: the silent line names the domain only', async () => {
    const { provider, send } = build({ user: null });
    await provider.initiate({ email: ADDRESS });
    expect(send).not.toHaveBeenCalled();
    expect(loggedText()).toContain('No user for an address at example.org');
    expect(loggedText()).not.toContain(ADDRESS);
  });

  test('a failed send is not logged again here (EmailManager reported it), and nothing names the address', async () => {
    const send = vi.fn().mockRejectedValue(new Error(`550 <${ADDRESS}>: Recipient address rejected`));
    const { provider } = build({ user: { username: 'bob', email: ADDRESS }, send });
    await provider.initiate({ email: ADDRESS });
    const text = loggedText();
    expect(text).not.toContain('550');
    expect(text).not.toContain('Link sent');
    expect(text).not.toContain(ADDRESS);
  });

  test('provisioned on verify: the provisioned line names the domain only', async () => {
    const { provider, send } = build({ user: null, autoProvision: true });
    await provider.initiate({ email: ADDRESS });
    expect(await provider.provisionIfNew(tokenOf(send))).toBe(true);
    const text = loggedText();
    expect(text).toContain('Provisioned new user: bob-private (an address at example.org)');
    expect(text).not.toContain(ADDRESS);
  });

  test('provisioning fails: the error line names the domain only, also inside the error', async () => {
    const createUser = vi.fn().mockRejectedValue(new Error(`email ${ADDRESS} is taken`));
    const { provider, send } = build({ user: null, autoProvision: true, createUser });
    await provider.initiate({ email: ADDRESS });
    expect(await provider.provisionIfNew(tokenOf(send))).toBe(false);
    const text = loggedText();
    expect(text).toContain('Failed to provision an account for an address at example.org: email …@example.org is taken');
    expect(text).not.toContain(ADDRESS);
  });
});
