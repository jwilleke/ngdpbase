// GENERATED FILE — do not edit.
// Source: config/app-default-config.json → ngdpbase.permissions.definitions
// Regenerate: npm run generate:permissions
//
// A door asks for one of these. The union exists so a mistyped permission is a
// compile error rather than a silent deny (#1431).

/** Every permission core declares. Addons generate their own union. */
export type CorePermission =
  /** Change what protects your own account — password, email, sign-in methods (passkeys), vault takeout and import, approving a device (#1525). Granted wherever profile-manage is; asks for a fresh sign-in when listed in ngdpbase.auth.step-up */
  | 'account-security'
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
  /** Export the audit trail to a file (#1638) */
  | 'audit-export'
  /** Add a comment, and delete your own; deleting anyone's is admin-system (#1198) */
  | 'comment-create'
  /** Change any configuration setting, and download a backup (#1525). Admin only by default; asks for a fresh sign-in when listed in ngdpbase.auth.step-up */
  | 'config-manage'
  /** Create, edit, delete and link contacts: persons (with or without an account) and organizations, and a person's affiliations, through PersonManager and OrganizationManager (#1930). Reading them is contact-read. Admins by default; an add-on grants it to its own roles in its own policy */
  | 'contact-manage'
  /** List, search and view contacts: persons (with or without an account) and organizations, and their affiliations, through PersonManager and OrganizationManager, and the /admin/contacts and /admin/organizations views (#1930). Admins and demo admins by default; an add-on grants it to its own roles in its own policy */
  | 'contact-read'
  /** Browse and view the media library (not delegated to anonymous visitors) */
  | 'media-read'
  /** Create new pages */
  | 'page-create'
  /** Delete pages */
  | 'page-delete'
  /** Edit pages */
  | 'page-edit'
  /** Export pages */
  | 'page-export'
  /** Make a page public: move it out of its vault (checked by the page's system-category, #1504) */
  | 'page-public'
  /** Edit a page's raw file in the admin raw editor — bypasses the page editor's checks (#1638) */
  | 'page-raw-edit'
  /** View pages */
  | 'page-read'
  /** Rename pages */
  | 'page-rename'
  /** Manage your own account — profile, preferences, display theme, pinned pages and the /my/* pages (#1198). Every signed-in role; never anonymous */
  | 'profile-manage'
  /** Let another person act for you, within permissions you hold, and revoke it (#1762). Every signed-in role except demo-admin; an administrator making or revoking a grant for someone else also needs user-edit, and that grant never carries a copy of the person's vault key. A grant that includes proxy-grant lets the proxy give others access too. Asks for a fresh sign-in */
  | 'proxy-grant'
  /** Search pages */
  | 'search-page'
  /** Search users */
  | 'search-user'
  /** Unmask a configuration secret (#1525). Admin only by default; asks for a fresh sign-in when listed in ngdpbase.auth.step-up. Hashed credentials (agent tokens) and shown-once secrets can never be revealed */
  | 'secret-reveal'
  /** End another person's signed-in session (#1638) */
  | 'session-revoke'
  /** Create share links — hand out anonymous read access to content you may read — and see your own (#1224, #1638) */
  | 'share-create'
  /** Extend your own share links (#1638) */
  | 'share-extend'
  /** Revoke your own share links; revoking anyone's also needs admin-system (#1638) */
  | 'share-revoke'
  /** Walk through a private store's door and create your own copy of it — with a user key and recovery words when the store kind is encrypted (#1414). Every signed-in role; never anonymous. The door also needs a password sign-in, so a token or share cannot use it */
  | 'store-create'
  /** Extend your own live agent tokens instead of minting new ones, to at most max-ttl-hours from now; the token and its scopes stay the same (#1734). Admin only by default. A token can never carry this scope */
  | 'token-extend'
  /** Mint, list and revoke your own agent tokens — a standing credential carrying a slice of your authority (#1198, #1178). Every signed-in role except demo-admin; never anonymous (#1734). A token can never carry this scope */
  | 'token-mint'
  /** Create user accounts */
  | 'user-create'
  /** Delete user accounts */
  | 'user-delete'
  /** Edit user accounts */
  | 'user-edit'
  /** View user list and profiles */
  | 'user-read'
  /** Let a person acting for you into your vaults (#1762). Read only from a proxy grant: a grant that includes it lets the proxy act inside your vaults within the grant's other permissions; without it a proxy never reaches them. Encrypted vaults stay shut to a proxy until a vault key copy is supported (#1762 slice 5). Every signed-in role except demo-admin, beside proxy-grant. Never carried by an agent token or an app */
  | 'vault-proxy';

/** The same list at runtime, for a check that has to iterate. */
export const CORE_PERMISSIONS: readonly CorePermission[] = [
  'account-security',
  'admin-read',
  'admin-roles',
  'admin-system',
  'asset-delete',
  'asset-edit',
  'asset-read',
  'asset-upload',
  'audit-export',
  'comment-create',
  'config-manage',
  'contact-manage',
  'contact-read',
  'media-read',
  'page-create',
  'page-delete',
  'page-edit',
  'page-export',
  'page-public',
  'page-raw-edit',
  'page-read',
  'page-rename',
  'profile-manage',
  'proxy-grant',
  'search-page',
  'search-user',
  'secret-reveal',
  'session-revoke',
  'share-create',
  'share-extend',
  'share-revoke',
  'store-create',
  'token-extend',
  'token-mint',
  'user-create',
  'user-delete',
  'user-edit',
  'user-read',
  'vault-proxy'
] as const;
