/**
 * Every upload goes through FileManager's door (#2148): `uploadAttachment`
 * asks FileManager for the place and `put` asks the permission, has ICE vet
 * the file (#2149), then AttachmentManager stores. A test that builds a real
 * AttachmentManager over a fake engine gives that engine the door with this:
 * a real FileManager over the same engine, the AttachmentManager itself when
 * the engine does not already name one, and, when it names no ImportManager,
 * the engine's own vetting (`vetFile`) over core's cleaning shims. Nothing
 * else on the engine changes.
 */
import type AttachmentManager from '../managers/AttachmentManager.js';
import FileManager from '../managers/FileManager.js';
import { RECORD_SHIMS, VETTING_SHIMS } from '../ice/shims/index.js';
import { vetFile } from '../ice/vet.js';
import type { IceUpload, RegisteredShim } from '../ice/types.js';
import type { WikiEngine } from '../types/WikiEngine.js';

const CORE_SHIMS: RegisteredShim[] = [...RECORD_SHIMS, ...VETTING_SHIMS].map(s => ({ ...s, id: `core.${s.name}`, owner: 'core' }));

/** ImportManager's vetting, as the engine runs it with every core shim switched on. */
export const coreVetting = { vetFile: (upload: IceUpload) => vetFile(CORE_SHIMS, upload) };

export function withFilesDoor<T extends AttachmentManager>(attachments: T): T {
  const engine = (attachments as unknown as { engine: { getManager: (name: string) => unknown } }).engine;
  const getManager = engine.getManager.bind(engine);
  const files = new FileManager(engine as unknown as WikiEngine);
  engine.getManager = (name: string): unknown => {
    if (name === 'FileManager') return files;
    if (name === 'AttachmentManager') return getManager(name) ?? attachments;
    if (name === 'ImportManager') return getManager(name) ?? coreVetting;
    return getManager(name);
  };
  return attachments;
}
