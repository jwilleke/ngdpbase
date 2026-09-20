// GENERATED FILE — do not edit.
// Source: config/app-default-config.json → ngdpbase.permissions.definitions
// Regenerate: npm run generate:permissions
//
// A door asks for one of these. The union exists so a mistyped permission is a
// compile error rather than a silent deny (#1431).

/** Every permission core declares. Addons generate their own union. */
export type CorePermission =
  /** View administration screens (read-only, no changes) */
  | 'admin-read'
  /** Role management */
  | 'admin-roles'
  /** System administration */
  | 'admin-system'
  /** Delete assets */
  | 'asset-delete'
  /** Edit asset metadata (EXIF/IPTC/XMP) */
  | 'asset-edit'
  /** View assets (attachments) */
  | 'asset-read'
  /** Upload assets */
  | 'asset-upload'
  /** Add a comment, and delete your own; deleting anyone's is admin-system (#1198) */
  | 'comment-create'
  /** Create new pages */
  | 'page-create'
  /** Delete pages */
  | 'page-delete'
  /** Edit pages */
  | 'page-edit'
  /** Export pages */
  | 'page-export'
  /** View pages */
  | 'page-read'
  /** Rename pages */
  | 'page-rename'
  /** Manage your own account — profile, preferences, display theme, pinned pages and the /my/* pages (#1198). Every signed-in role; never anonymous */
  | 'profile-manage'
  /** Search pages */
  | 'search-page'
  /** Search users */
  | 'search-user'
  /** Create, list and revoke your own share links — hand out anonymous read access to content you may read (#1224) */
  | 'share-manage'
  /** Walk through a private store's door and create your own copy of it — with a user key and recovery words when the store kind is encrypted (#1414). Every signed-in role; never anonymous. The door also needs a password sign-in, so a token or share cannot use it */
  | 'store-create'
  /** Mint, list and revoke your own agent tokens — a standing credential carrying a slice of your authority (#1198, #1178). A token can never carry this scope */
  | 'token-mint'
  /** Create user accounts */
  | 'user-create'
  /** Delete user accounts */
  | 'user-delete'
  /** Edit user accounts */
  | 'user-edit'
  /** View user list and profiles */
  | 'user-read';

/** The same list at runtime, for a check that has to iterate. */
export const CORE_PERMISSIONS: readonly CorePermission[] = [
  'admin-read',
  'admin-roles',
  'admin-system',
  'asset-delete',
  'asset-edit',
  'asset-read',
  'asset-upload',
  'comment-create',
  'page-create',
  'page-delete',
  'page-edit',
  'page-export',
  'page-read',
  'page-rename',
  'profile-manage',
  'search-page',
  'search-user',
  'share-manage',
  'store-create',
  'token-mint',
  'user-create',
  'user-delete',
  'user-edit',
  'user-read'
] as const;
