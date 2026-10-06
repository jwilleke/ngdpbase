/**
 * The shipped permission entries (#1638). The audit registry reads events from
 * `ngdpbase.audit.events` AND from each permission's `audit` field, so a test
 * that binds the registry itself must serve both keys.
 */
import fs from 'fs';
import path from 'path';

export const PERMISSIONS_KEY = 'ngdpbase.permissions.definitions';

export const shippedPermissions = (JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')
) as Record<string, unknown>)[PERMISSIONS_KEY];
