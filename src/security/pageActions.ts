'use strict';

/**
 * One vocabulary for page actions (#1431, step 5).
 *
 * A door asks for a PERMISSION, and every permission name is declared in
 * `ngdpbase.permissions.definitions`. Page-level checks grew their own words
 * anyway — `canAccess('view')`, `canAccess('edit')` — which are declared
 * nowhere, and `PolicyInformationPoint.checkDefaultPermission` invented a third set with
 * colons (`page:read`), declared nowhere either, so that check could only ever
 * deny ([#1174](https://github.com/jwilleke/ngdpbase/issues/1174)).
 *
 * This is the one translation: the short word a caller passes, mapped to the
 * registry name policy is written in. It exists so the mapping is not
 * copied — it was already in `checkPagePermissionWithContext` twice, and in
 * `checkDefaultPermission` in a different and broken form.
 *
 * New code should pass the registry name directly. The short forms stay
 * because they are what a page author writes in `[{ALLOW view …}]` ACL markup,
 * and that is a content syntax, not an internal vocabulary.
 */

/** The short words accepted at a page door, and in ACL markup. */
export const PAGE_ACTION_ALIASES = {
  view: 'page-read',
  read: 'page-read',
  edit: 'page-edit',
  delete: 'page-delete',
  create: 'page-create',
  rename: 'page-rename',
  export: 'page-export',
  upload: 'asset-upload'
} as const satisfies Record<string, string>;

export type PageActionAlias = keyof typeof PAGE_ACTION_ALIASES;

/**
 * The registry permission a page action means.
 *
 * An unknown word is returned unchanged rather than guessed at: it is either
 * already a registry name — which is what new code passes — or it is a typo,
 * and the permission-registry invariant is what catches a typo, not a silent
 * rewrite into `page:<whatever>` (which is what the deleted code did).
 */
export function permissionForPageAction(action: string): string {
  const key = action.trim().toLowerCase();
  return (PAGE_ACTION_ALIASES as Record<string, string>)[key] ?? key;
}
