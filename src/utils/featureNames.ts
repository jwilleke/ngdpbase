/**
 * #2348 — a plain, home-user name for the feature a manager provides, so the
 * dashboard says "Backups", not "BackupManager". A manager not listed here has
 * no name: the item shows its reason alone, never the class name.
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
  MediaManager: 'Media',
  MetricsManager: 'Metrics',
  NotificationManager: 'Notifications',
  OidcManager: 'Single sign-on',
  PageManager: 'Pages',
  PolicyEvaluator: 'Access policies',
  ReviewManager: 'Page reviews',
  RoleManager: 'Roles',
  SharedFolderManager: 'Shared folders',
  UserManager: 'Users',
  ValidationManager: 'Validation'
};

export function featureNameFor(manager: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(FEATURE_NAMES, manager) ? FEATURE_NAMES[manager] : undefined;
}
