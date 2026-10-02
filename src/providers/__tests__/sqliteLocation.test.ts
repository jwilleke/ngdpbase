import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NETWORK_FILESYSTEMS, refuseNetworkFilesystem } from '../sqliteLocation';

// Ported from yourPHR (yourphr#628), ngdpbase #1536. The types are the real ones: 0x6969 is what the live /nas-backup NFS mount reports,
// 0xef53 what the live data volume (ext4) reports, 0x1a what macOS APFS reports — measured 2026-09-29.
const fsOf = (type: number) => () => ({ type });

describe('refuseNetworkFilesystem — SQLite may not live on NFS/SMB', () => {
  it('refuses NFS, naming the database, the filesystem and the fix', () => {
    expect(() => refuseNetworkFilesystem('/nas/data/spike.db', fsOf(0x6969), 'linux')).toThrow(
      /refusing to start: the SQLite database \/nas\/data\/spike\.db would live on NFS .*type 0x6969.*FAST_STORAGE/
    );
  });

  it('refuses every known network filesystem', () => {
    for (const [type, name] of Object.entries(NETWORK_FILESYSTEMS)) {
      expect(() => refuseNetworkFilesystem('/x/records.db', fsOf(Number(type)), 'linux')).toThrow(`would live on ${name}`);
    }
  });

  it('boots on local disk (ext4)', () => {
    expect(() => refuseNetworkFilesystem('/opt/ngdpbase/data/spike.db', fsOf(0xef53), 'linux')).not.toThrow();
  });

  it('fails OPEN on an unrecognised type, and off Linux altogether — a laptop must boot', () => {
    expect(() => refuseNetworkFilesystem('/x/spike.db', fsOf(0x12345678), 'linux')).not.toThrow();
    expect(() => refuseNetworkFilesystem('/x/spike.db', fsOf(0x6969), 'darwin')).not.toThrow();
    expect(() => refuseNetworkFilesystem('/x/spike.db', () => { throw new Error('EPERM'); }, 'linux')).not.toThrow();
  });

  it('judges a database that does not exist yet by the nearest folder that does — where SQLite will create it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ngdpbase-1536-'));
    try {
      const seen: string[] = [];
      refuseNetworkFilesystem(join(dir, 'not', 'yet', 'spike.db'), (p) => { seen.push(p); return { type: 0xef53 }; }, 'linux');
      expect(seen).toEqual([dir]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('with the real statfs, local disk here boots', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ngdpbase-1536-'));
    try {
      expect(() => refuseNetworkFilesystem(join(dir, 'spike.db'))).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
