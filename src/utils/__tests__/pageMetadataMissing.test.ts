/**
 * A damaged page is reported loudly, and only once (#1431 step 7).
 *
 * Operator decision 2026-09-21: a page that exists but has no metadata fails
 * with a 500, an error-level log, and a notification to administrators.
 * These pin the parts that could go wrong quietly: who is told, how often,
 * and that the reporting itself can never replace the error page.
 */
import { reportMissingPageMetadata, missingMetadataTitle, PageMetadataMissingError } from '../pageMetadataMissing';

interface Created { title: string; targetUsers: string[]; level: string }

function makeEngine(opts: {
  users?: string[];
  holders?: string[];
  existing?: string[];
  throwOnCreate?: boolean;
} = {}) {
  const created: Created[] = [];
  const existing = [...(opts.existing ?? [])];
  const notifications = {
    getAllNotifications: () => existing.map((title) => ({ title, expiresAt: null })),
    createNotification: async (n: Created) => {
      if (opts.throwOnCreate) throw new Error('storage full');
      created.push(n);
      existing.push(n.title);
      return 'n1';
    }
  };
  const users = {
    getUsers: async () => (opts.users ?? ['root', 'jim', 'bob']).map((username) => ({ username })),
    userHoldsPermission: async (u: string, a: string) =>
      a === 'admin-system' && (opts.holders ?? ['root']).includes(u)
  };
  const engine = {
    getManager: (name: string) =>
      name === 'NotificationManager' ? notifications : name === 'UserManager' ? users : null
  };
  return { engine, created };
}

describe('#1431 reportMissingPageMetadata', () => {
  test('notifies exactly the holders of admin-system', async () => {
    const { engine, created } = makeEngine({ users: ['root', 'jim', 'bob'], holders: ['root', 'jim'] });
    await reportMissingPageMetadata(engine, 'Broken', 'view', 'bob');
    expect(created).toHaveLength(1);
    expect(created[0].targetUsers).toEqual(['root', 'jim']);
    expect(created[0].level).toBe('error');
    expect(created[0].title).toBe(missingMetadataTitle('Broken'));
  });

  test('one damaged page viewed many times produces one notification', async () => {
    const { engine, created } = makeEngine();
    for (let i = 0; i < 5; i++) await reportMissingPageMetadata(engine, 'Broken', 'view', 'bob');
    expect(created).toHaveLength(1);
  });

  test('a different damaged page gets its own notification', async () => {
    const { engine, created } = makeEngine();
    await reportMissingPageMetadata(engine, 'Broken', 'view', 'bob');
    await reportMissingPageMetadata(engine, 'AlsoBroken', 'view', 'bob');
    expect(created.map((c) => c.title)).toEqual([missingMetadataTitle('Broken'), missingMetadataTitle('AlsoBroken')]);
  });

  test('with no administrator it tells nobody, rather than everybody', async () => {
    // An empty targetUsers list means ALL users in NotificationManager — which
    // would announce a damaged page to every reader.
    const { engine, created } = makeEngine({ holders: [] });
    await reportMissingPageMetadata(engine, 'Broken', 'view', 'bob');
    expect(created).toHaveLength(0);
  });

  test('a notification that cannot be sent never throws — the 500 still renders', async () => {
    const { engine } = makeEngine({ throwOnCreate: true });
    await expect(reportMissingPageMetadata(engine, 'Broken', 'view', 'bob')).resolves.toBeUndefined();
  });

  test('without the managers it still returns — the error log stands alone', async () => {
    await expect(reportMissingPageMetadata({ getManager: () => null }, 'Broken', 'view', undefined)).resolves.toBeUndefined();
    await expect(reportMissingPageMetadata(null, 'Broken', 'view', undefined)).resolves.toBeUndefined();
  });

  test('the error names the page', () => {
    const err = new PageMetadataMissingError('Broken');
    expect(err.pageName).toBe('Broken');
    expect(err.message).toContain("'Broken'");
  });
});
