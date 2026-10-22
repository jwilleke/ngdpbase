// The site restore record's module as v5.25.0 shipped it (src/utils/siteRestore.ts at tag v5.25.0),
// compiled to JavaScript unchanged, for #1986's compatibility test (BackupManager.v5250compat.test.ts):
// a record the current code writes is read and applied by v5.25.0's own code, and the other way round.
// Made with: git show v5.25.0:src/utils/siteRestore.ts > s.ts; npx esbuild s.ts --format=esm --platform=node --target=node20
// Never edit it: it stands for the released code.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
const SITE_RESTORE_MANIFEST_KEY = "ngdpbase.backup.restore-manifest";
const SITE_RESTORE_MANIFEST_DEFAULT = "./data/site-restore.json";
const stagedPathFor = (live) => `${live}.staged`;
const keptPathFor = (live) => `${live}.pre-restore`;
function siteRestoreFile(configManager) {
  return configManager?.getResolvedDataPath(SITE_RESTORE_MANIFEST_KEY, SITE_RESTORE_MANIFEST_DEFAULT) ?? SITE_RESTORE_MANIFEST_DEFAULT;
}
function isFile(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}
function readSiteRestore(file) {
  if (!isFile(file)) return null;
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (parsed?.version !== 1 || !Array.isArray(parsed.parts) || !["staging", "staged", "refused"].includes(parsed.state)) {
    throw new Error(`${path.basename(file)} is not a site restore manifest`);
  }
  return parsed;
}
function writeSiteRestore(file, manifest) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2) + "\n", { mode: 384 });
  renameSync(tmp, file);
}
function beginSiteRestore(file, meta) {
  if (isFile(file)) throw new Error("A site restore is already staged; cancel it or replace it first");
  writeSiteRestore(file, { version: 1, state: "staging", ...meta, parts: [] });
}
function recordStagedPart(file, part) {
  const manifest = readSiteRestore(file);
  if (!manifest || manifest.state !== "staging") throw new Error("No site restore is being staged");
  manifest.parts = [...manifest.parts.filter((p) => p.manager !== part.manager), { manager: part.manager, swaps: part.swaps, ...part.discard ? { discard: part.discard } : {} }];
  writeSiteRestore(file, manifest);
}
function commitSiteRestore(file) {
  const manifest = readSiteRestore(file);
  if (!manifest || manifest.state !== "staging") throw new Error("No site restore is being staged");
  for (const part of manifest.parts) {
    const missing = part.swaps.filter((s) => !existsSync(s.staged));
    if (missing.length > 0) throw new Error(`${part.manager} recorded staged files that are not there: ${missing.map((s) => path.basename(s.staged)).join(", ")}`);
  }
  manifest.state = "staged";
  writeSiteRestore(file, manifest);
  return manifest;
}
function discardSiteRestore(file) {
  let manifest;
  try {
    manifest = readSiteRestore(file);
  } catch {
    manifest = null;
  }
  for (const part of manifest?.parts ?? []) {
    for (const swap of part.swaps) rmSync(swap.staged, { recursive: true, force: true });
    for (const extra of part.discard ?? []) rmSync(extra, { recursive: true, force: true });
  }
  rmSync(file, { force: true });
  return manifest;
}
function setAsidePath(staged) {
  if (!existsSync(staged)) return;
  const target = `${staged}.incomplete`;
  rmSync(target, { recursive: true, force: true });
  renameSync(staged, target);
}
function gatePart(file, manager) {
  let manifest;
  try {
    manifest = readSiteRestore(file);
  } catch (err) {
    return { decision: "set-aside", reason: `the site restore manifest ${file} cannot be read: ${err.message}` };
  }
  if (!manifest) return { decision: "none" };
  const part = manifest.parts.find((p) => p.manager === manager);
  if (!part || part.status) return { decision: "none" };
  if (manifest.state === "staging") {
    return refuse(file, manifest, part, "the site restore was still being staged when the server stopped (interrupted staging)");
  }
  if (manifest.state === "refused") {
    return { decision: "set-aside", reason: manifest.reason ?? "the site restore was refused", part };
  }
  const setAsideAlready = manifest.parts.filter((p) => p.status === "set-aside").map((p) => p.manager);
  if (setAsideAlready.length > 0) {
    return refuse(file, manifest, part, `part of it (${setAsideAlready.join(", ")}) was not applied, and the parts belong together`);
  }
  const missing = manifest.parts.filter((p) => !p.status).flatMap((p) => p.swaps.filter((s) => !existsSync(s.staged)).map((s) => `${p.manager}: ${path.basename(s.staged)}`));
  if (missing.length > 0) {
    return refuse(file, manifest, part, `staged files are missing (${missing.join(", ")}), and the parts belong together`);
  }
  return { decision: "apply", part, manifest };
}
function refuse(file, manifest, part, reason) {
  manifest.state = "refused";
  manifest.reason = reason;
  writeSiteRestore(file, manifest);
  return { decision: "set-aside", reason, part };
}
function markPart(file, manager, status, note) {
  let manifest;
  try {
    manifest = readSiteRestore(file);
  } catch {
    return;
  }
  if (!manifest) return;
  const part = manifest.parts.find((p) => p.manager === manager);
  if (!part) return;
  part.status = status;
  if (note) part.note = note;
  if (status === "set-aside" && manifest.state !== "refused") {
    manifest.state = "refused";
    manifest.reason = note ?? `${manager}'s part was not applied`;
  }
  writeSiteRestore(file, manifest);
  if (manifest.parts.every((p) => p.status)) {
    const done = `${file}.done`;
    rmSync(done, { force: true });
    renameSync(file, done);
  }
}
function applyPartAtStart(file, manager, options) {
  const gate = gatePart(file, manager);
  if (gate.decision === "none") {
    const strays = options.strays?.() ?? [];
    if (strays.length === 0) return null;
    for (const s of strays) setAsidePath(s);
    return { applied: [], refused: `staged files with no site restore naming them (an interrupted staging): ${strays.map((s) => path.basename(s)).join(", ")} \u2014 set aside as *.incomplete` };
  }
  if (gate.decision === "set-aside") {
    for (const swap of gate.part?.swaps ?? []) setAsidePath(swap.staged);
    for (const s of options.strays?.() ?? []) setAsidePath(s);
    if (gate.part) markPart(file, manager, "set-aside", gate.reason);
    return { applied: [], refused: gate.reason };
  }
  const bad = gate.part.swaps.find((s) => !options.allowed(s) || s.staged !== stagedPathFor(s.live));
  if (bad) {
    const reason = `the site restore manifest names ${bad.live}, which is not ${manager}'s to replace`;
    for (const swap of gate.part.swaps) if (swap.staged === stagedPathFor(swap.live)) setAsidePath(swap.staged);
    markPart(file, manager, "set-aside", reason);
    return { applied: [], refused: reason };
  }
  const applied = [];
  try {
    for (const swap of gate.part.swaps) {
      const kept = keptPathFor(swap.live);
      rmSync(kept, { recursive: true, force: true });
      if (existsSync(swap.live)) renameSync(swap.live, kept);
      mkdirSync(path.dirname(swap.live), { recursive: true });
      renameSync(swap.staged, swap.live);
      applied.push({ live: swap.live, kept });
    }
  } catch (err) {
    const reason = `applying ${manager}'s part failed after ${applied.length} of ${gate.part.swaps.length} paths: ${err.message}`;
    markPart(file, manager, "set-aside", reason);
    return { applied, refused: reason };
  }
  markPart(file, manager, "applied");
  return { applied };
}
function finishSiteRestoreAtBoot(file) {
  const done = `${file}.done`;
  let manifest;
  try {
    manifest = readSiteRestore(file);
  } catch {
    manifest = null;
  }
  if (manifest) {
    if (manifest.state === "staging") refuse(file, manifest, manifest.parts[0], "the site restore was still being staged when the server stopped (interrupted staging)");
    const pending = manifest.parts.filter((p) => !p.status);
    for (const part of pending) {
      for (const swap of part.swaps) setAsidePath(swap.staged);
      for (const extra of part.discard ?? []) setAsidePath(extra);
      markPart(file, part.manager, "set-aside", `${part.manager} did not apply its part at start, so it was set aside`);
    }
    if (manifest.parts.length === 0 && isFile(file)) {
      rmSync(done, { force: true });
      renameSync(file, done);
    }
  }
  if (!isFile(done)) return null;
  const finished = JSON.parse(readFileSync(done, "utf8"));
  const last = `${file}.last`;
  rmSync(last, { force: true });
  renameSync(done, last);
  return finished;
}
export {
  SITE_RESTORE_MANIFEST_DEFAULT,
  SITE_RESTORE_MANIFEST_KEY,
  applyPartAtStart,
  beginSiteRestore,
  commitSiteRestore,
  discardSiteRestore,
  finishSiteRestoreAtBoot,
  gatePart,
  keptPathFor,
  markPart,
  readSiteRestore,
  recordStagedPart,
  setAsidePath,
  siteRestoreFile,
  stagedPathFor
};
