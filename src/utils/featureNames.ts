/**
 * #2348 — a plain, home-user name for the feature a manager provides, so the
 * dashboard says "Backups", not "BackupManager". A manager not listed here has
 * no name: the item shows its reason alone, never the class name. A manager that can
 * report a state must be listed (a test enforces it).
 */
const FEATURE_NAMES: Record<string, string> = {
  AttachmentManager: 'Attachments',
  AuditManager: 'Audit log',
  AuthManager: 'Sign-in',
  BackgroundJobManager: 'Scheduled jobs',
  BackupManager: 'Backups',
  CommentManager: 'Comments',
  ConfigurationManager: 'Settings',
  ConsentManager: 'Consent',
  DatabaseManager: 'Database',
  EmailManager: 'Email',
  ExportManager: 'Export',
  FootnoteManager: 'Footnotes',
  IdentityManager: 'Contacts',
  MediaManager: 'Media',
  MetricsManager: 'Metrics',
  NotificationManager: 'Notifications',
  OidcManager: 'Single sign-on',
  OrganizationManager: 'Organization',
  PageManager: 'Pages',
  PolicyEvaluator: 'Access policies',
  PolicyInformationPoint: 'Access checks',
  ReviewManager: 'Page reviews',
  RoleManager: 'Roles',
  ShareManager: 'Shared links',
  SharedFolderManager: 'Shared folders',
  TemplateManager: 'Templates',
  UserManager: 'Users',
  ValidationManager: 'Page categories'
};

export function featureNameFor(manager: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(FEATURE_NAMES, manager) ? FEATURE_NAMES[manager] : undefined;
}
