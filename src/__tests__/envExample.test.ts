/**
 * #1633: `.env.example` lists every variable the app reads from or generates
 * into the environment, so an operator can find each one in one place. The
 * names come from where they are declared — never retyped here.
 */
import fs from 'fs';
import path from 'path';
import { CREDENTIALS_KEY_ENV } from '../providers/BaseCredentialsProvider';
import { DATABASE_KEY_ENV } from '../managers/DatabaseManager';

const ROOT = path.resolve(__dirname, '../..');

describe('#1633 .env.example is complete', () => {
  test('lists every env-owned config key and every generated or env-only secret', () => {
    const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
    const envOwned = Object.values(shipped['ngdpbase.config.env-keys'] as Record<string, string>);
    const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    const missing = [...envOwned, CREDENTIALS_KEY_ENV, DATABASE_KEY_ENV].filter((name) => !example.includes(name));
    expect(missing).toEqual([]);
  });
});
