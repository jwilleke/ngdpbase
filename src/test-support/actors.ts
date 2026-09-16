/**
 * Test subjects for the page write doors (#1179, #1382).
 *
 * `savePage`, `deletePage` and `restoreVersion` take an ActorContext —
 * mandatory and positional — so a test states who is writing, exactly as a
 * route or a job does.
 */
import type { ActorContext } from '../context/ActorContext.js';

/** An authenticated editor, for tests that only need somebody to act as. */
export const TEST_ACTOR: ActorContext = {
  username: 'test-user',
  roles: ['editor'],
  isAuthenticated: true
};

/** An authenticated subject with a chosen username — a private page's owner, say. */
export function actor(username: string, roles: string[] = ['editor']): ActorContext {
  return { username, roles, isAuthenticated: true };
}
