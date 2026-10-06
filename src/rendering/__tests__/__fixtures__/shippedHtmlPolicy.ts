/**
 * The HTML policy as it ships (#1623), for tests that render as an install
 * does. Read from config/app-default-config.json — the one declaration — so a
 * test never carries its own copy of the list.
 */
import fs from 'fs';
import path from 'path';
import { HTML_POLICY_KEY } from '../../htmlPolicy';

export const shippedHtmlPolicy: unknown = (JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../../config/app-default-config.json'), 'utf8')
) as Record<string, unknown>)[HTML_POLICY_KEY];
