/**
 * Every upload goes through FileManager's door (#2148): `uploadAttachment`
 * asks FileManager for the place and `put` asks the permission, then
 * AttachmentManager stores. A test that builds a real AttachmentManager over
 * a fake engine gives that engine the door with this: a real FileManager
 * over the same engine, and the AttachmentManager itself when the engine
 * does not already name one. Nothing else on the engine changes.
 */
import type AttachmentManager from '../managers/AttachmentManager.js';
import FileManager from '../managers/FileManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';

export function withFilesDoor<T extends AttachmentManager>(attachments: T): T {
  const engine = (attachments as unknown as { engine: { getManager: (name: string) => unknown } }).engine;
  const getManager = engine.getManager.bind(engine);
  const files = new FileManager(engine as unknown as WikiEngine);
  engine.getManager = (name: string): unknown => {
    if (name === 'FileManager') return files;
    if (name === 'AttachmentManager') return getManager(name) ?? attachments;
    return getManager(name);
  };
  return attachments;
}
