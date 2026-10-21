/**
 * The environment variable holding the SQLCipher key (#1536). Never a config
 * key: config is readable from the admin screens. Declared here, with no
 * dependencies, so the boot (`bootstrap-env.ts`) can name it without loading
 * DatabaseManager; DatabaseManager re-exports it.
 */
export const DATABASE_KEY_ENV = 'NGDPBASE_DATABASE_KEY';
