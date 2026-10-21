/**
 * #1876 ("one thing to save") — each person with vault keys gets ONE reminder,
 * addressed to them, to keep their recovery words safe; dismissing it is their
 * confirmation, and it is never sent to them again, across sign-ins and
 * restarts (the stored notifications keep a dismissed one).
 */
import { remindRecoveryWords, RECOVERY_WORDS_TITLE } from '../recoveryWordsReminder';

function store() {
  const all: Array<{ title: string; targetUsers: string[]; dismissedBy: string[]; message: string }> = [];
  return {
    all,
    addNotification: async (n: { title: string; targetUsers: string[]; message: string }) => { all.push({ ...n, dismissedBy: [] }); return 'id'; },
    getAllNotifications: () => all
  };
}

describe('the recovery-words reminder (#1876)', () => {
  test('once per person with vault keys, addressed to them alone, across sign-ins — dismissed or not', async () => {
    const n = store();
    expect(await remindRecoveryWords(n, 'molly', async () => true)).toBe(true);
    expect(n.all).toEqual([expect.objectContaining({ title: RECOVERY_WORDS_TITLE, targetUsers: ['molly'], message: expect.stringMatching(/12 recovery words are the only way back in/) })]);
    n.all[0].dismissedBy.push('molly');
    expect(await remindRecoveryWords(n, 'molly', async () => true)).toBe(false);
    // Another person gets their own.
    expect(await remindRecoveryWords(n, 'sam', async () => true)).toBe(true);
    expect(n.all.filter((x) => x.title === RECOVERY_WORDS_TITLE)).toHaveLength(2);
  });

  test('nobody without vault keys is reminded, and a failure never stops the sign-in', async () => {
    const n = store();
    expect(await remindRecoveryWords(n, 'alex', async () => false)).toBe(false);
    expect(n.all).toEqual([]);
    expect(await remindRecoveryWords(n, 'alex', async () => { throw new Error('disk gone'); })).toBe(false);
  });
});
