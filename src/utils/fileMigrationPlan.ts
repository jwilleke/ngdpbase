/**
 * The files migration dry run (#1859, epic #1851): what copying today's
 * attachments into files WOULD do, worked out from the door's inventory
 * (`FileManager.inventory`). Pure: it reads nothing and writes nothing.
 *
 * The rules are the decision log's
 * (https://github.com/jwilleke/ngdpbase/issues/1851#issuecomment-6236003946):
 * - two different files with the same name in one place get a numeric
 *   suffix, `report.pdf` and `report-001.pdf`;
 * - each page that shows a renamed file is rewritten to its new name, so it
 *   keeps showing its own file;
 * - an unknown or invalid uploader gets an owner from configuration.
 */

import path from 'path';
import type { FileInventory, FileRecord, VaultFileSummary } from '../types/File.js';

/** The configured values the plan applies (`ngdpbase.files.migration.*`). */
export interface FileMigrationOptions {
  /** Recorded uploader → username, applied first (`owner-map`). */
  ownerMap: Record<string, string>;
  /** Owner for a file whose record names no user (`default-owner`). */
  defaultOwner: string;
  /** Width of the clash suffix: 3 gives `-001` (`clash-suffix-digits`). */
  suffixDigits: number;
}

/** A file the migration would give a new name, and the pages it would rewrite to it. */
export interface PlannedRename {
  id: string;
  from: string;
  to: string;
  pages: string[];
}

/** Who a group of public files would belong to after the migration. */
export interface PlannedOwner {
  /** The uploader the record names, or `null` when it names none. */
  recorded: string | null;
  owner: string;
  /** `kept`: the record names a user; `mapped`: `owner-map`; `default`: `default-owner`. */
  how: 'kept' | 'mapped' | 'default';
  files: number;
}

export interface FileMigrationReport {
  publicFiles: { count: number; bytes: number; byType: Array<{ type: string; files: number }> };
  owners: PlannedOwner[];
  /** Public files whose record names no user (before the owner mapping). */
  noOwner: number;
  /** Each clashing name, with the renames it would get. */
  clashes: Array<{ name: string; files: number; renames: PlannedRename[] }>;
  /** Each page that would be rewritten, and to which names. */
  pagesToRewrite: Array<{ page: string; changes: Array<{ from: string; to: string }> }>;
  vaults: VaultFileSummary[];
}

/** The `-###` name a clash gets: before the extension, `route.png` → `route-001.png`. */
export function suffixedName(name: string, n: number, digits: number): string {
  const ext = path.extname(name);
  const stem = ext && ext !== name ? name.slice(0, -ext.length) : name;
  return `${stem}-${String(n).padStart(digits, '0')}${ext && ext !== name ? ext : ''}`;
}

/**
 * The new name of every file in one place that shares its name with another
 * (id → new name). The oldest keeps the name (then the lowest id, so the
 * answer is the same on every run); the rest are numbered from 1 in that
 * order, skipping any name already used in the place. Names match exactly,
 * as a link finds a file today.
 */
export function planClashRenames(
  files: ReadonlyArray<Pick<FileRecord, 'id' | 'filename' | 'dateCreated'>>,
  digits: number
): Map<string, string> {
  const taken = new Set(files.map((f) => f.filename));
  const byName = new Map<string, Array<Pick<FileRecord, 'id' | 'filename' | 'dateCreated'>>>();
  for (const f of files) {
    const group = byName.get(f.filename);
    if (group) group.push(f);
    else byName.set(f.filename, [f]);
  }
  const renames = new Map<string, string>();
  for (const [name, group] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length < 2) continue;
    group.sort((a, b) => (a.dateCreated ?? '').localeCompare(b.dateCreated ?? '') || a.id.localeCompare(b.id));
    let n = 0;
    for (const f of group.slice(1)) {
      let next: string;
      do next = suffixedName(name, ++n, digits); while (taken.has(next));
      taken.add(next);
      renames.set(f.id, next);
    }
  }
  return renames;
}

function plannedOwner(file: FileRecord, opts: FileMigrationOptions): Pick<PlannedOwner, 'owner' | 'how'> {
  // #2097: the recorded uploader may be an identity @id; the map is keyed by username, so its owner's name is tried too.
  const mapped = (file.author ? opts.ownerMap[file.author] : undefined) ?? (file.owner ? opts.ownerMap[file.owner] : undefined);
  if (mapped) return { owner: mapped, how: 'mapped' };
  if (file.owner) return { owner: file.owner, how: 'kept' };
  return { owner: opts.defaultOwner, how: 'default' };
}

/** What the migration would do with this inventory. */
export function planFileMigration(inventory: FileInventory, opts: FileMigrationOptions): FileMigrationReport {
  const files = inventory.publicFiles;

  const byType = new Map<string, number>();
  for (const f of files) byType.set(f.encodingFormat, (byType.get(f.encodingFormat) ?? 0) + 1);

  const owners = new Map<string, PlannedOwner>();
  for (const f of files) {
    const recorded = f.author ?? null;
    const { owner, how } = plannedOwner(f, opts);
    const key = `${recorded ?? ''}\u0000${owner}\u0000${how}`;
    const row = owners.get(key);
    if (row) row.files++;
    else owners.set(key, { recorded, owner, how, files: 1 });
  }

  const renames = planClashRenames(files, opts.suffixDigits);
  const nameCount = new Map<string, number>();
  for (const f of files) nameCount.set(f.filename, (nameCount.get(f.filename) ?? 0) + 1);
  const clashes = new Map<string, { name: string; files: number; renames: PlannedRename[] }>();
  const pages = new Map<string, Array<{ from: string; to: string }>>();
  for (const f of files) {
    if ((nameCount.get(f.filename) ?? 0) < 2) continue;
    const to = renames.get(f.id);
    const clash = clashes.get(f.filename) ?? { name: f.filename, files: 0, renames: [] };
    clash.files++;
    clashes.set(f.filename, clash);
    if (to === undefined) continue;
    const shownOn = [...f.mentions].sort();
    clash.renames.push({ id: f.id, from: f.filename, to, pages: shownOn });
    for (const page of shownOn) {
      const changes = pages.get(page) ?? [];
      changes.push({ from: f.filename, to });
      pages.set(page, changes);
    }
  }
  for (const c of clashes.values()) c.renames.sort((a, b) => a.to.localeCompare(b.to));

  return {
    publicFiles: {
      count: files.length,
      bytes: files.reduce((sum, f) => sum + (f.contentSize ?? 0), 0),
      byType: [...byType].map(([type, n]) => ({ type, files: n })).sort((a, b) => b.files - a.files || a.type.localeCompare(b.type))
    },
    owners: [...owners.values()].sort((a, b) => b.files - a.files || a.owner.localeCompare(b.owner)),
    noOwner: files.filter((f) => !f.owner).length,
    clashes: [...clashes.values()].sort((a, b) => a.name.localeCompare(b.name)),
    pagesToRewrite: [...pages].map(([page, changes]) => ({ page, changes })).sort((a, b) => a.page.localeCompare(b.page)),
    vaults: inventory.vaults
  };
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The report as the operator reads it. */
export function formatFileMigrationReport(r: FileMigrationReport, header: string[] = []): string {
  const out: string[] = [...header, 'DRY RUN: nothing was copied, renamed or rewritten.', ''];

  out.push(`Public files: ${r.publicFiles.count} (${size(r.publicFiles.bytes)})`);
  for (const t of r.publicFiles.byType) out.push(`  ${t.type}: ${t.files}`);

  out.push('', `Owners (${r.noOwner} file(s) whose record names no user):`);
  for (const o of r.owners) {
    const how = o.how === 'kept' ? 'kept' : o.how === 'mapped' ? 'owner-map' : 'default-owner';
    out.push(`  ${o.recorded ?? '(none)'} -> ${o.owner} [${how}]: ${o.files}`);
  }

  out.push('', `Name clashes: ${r.clashes.length}`);
  for (const c of r.clashes) {
    out.push(`  ${c.name}: ${c.files} different files`);
    for (const x of c.renames) out.push(`    ${x.id} -> ${x.to}${x.pages.length ? ` (on ${x.pages.join(', ')})` : ''}`);
  }

  out.push('', `Pages whose links would be rewritten: ${r.pagesToRewrite.length}`);
  for (const p of r.pagesToRewrite) out.push(`  ${p.page}: ${p.changes.map((c) => `${c.from} -> ${c.to}`).join(', ')}`);

  out.push('', `Vaults with files: ${r.vaults.length}`);
  for (const v of r.vaults) {
    const state = v.readable ? 'unsealed' : 'sealed or not opened, counted on disk';
    const clashes = v.clashes === null ? 'clashes unknown without its key' : `${v.clashes} clash rename(s)`;
    out.push(`  ${v.owner}/${v.vault} (${v.systemCategory ?? 'no system-category'}): ${v.files} file(s), ${size(v.bytes)}, ${state}, ${clashes}`);
  }
  return out.join('\n');
}
