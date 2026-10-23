/**
 * The ICE fixture add-on (#1979): shaped like yourPHR, to prove its parsers
 * fit the shim interface without changing phr (another repository).
 *
 * - `ccda` reads C-CDA XML with phr's reader shape: `xmlKind(text)` is the
 *   "can I read this?" check, `readCcda(xml)` returns records plus an
 *   optional partial note. Duplicates are per file.
 * - `fhir` reads FHIR JSON / NDJSON resources. Each resource has its own id,
 *   so duplicates are per item.
 * - `health-records` is the receiver: the add-on's own manager's door. It
 *   checks its own rule — your own health record only — with the context the
 *   run carries, and keeps originals itself (phr's choice, D11).
 *
 * Both shims and the receiver are declared in package.json's manifest; the
 * host refuses anything else.
 */
import type { ActorContext } from '../../../../context/ActorContext.js';
import type { AddonModule } from '../../../AddonsManager.js';
import type { IceItem, IceReceiver, IceShim, ReceiveOutcome } from '../../../../ice/types.js';
import { readCcda, xmlKind } from './ccda.js';

export const RECORD_KIND = 'ice-fixture.health-record';

export interface HealthRecord {
  owner: string;
  code: string;
  value: string;
  source: string;
}

/** The add-on's manager: the only door to its records. */
export class FixtureHealthRecords {
  readonly records: HealthRecord[] = [];
  readonly originals: Array<{ owner: string; name: string; size: number }> = [];
  /** Every call to a door, with the context it was given. */
  readonly calls: Array<{ door: string; ctx: ActorContext }> = [];

  /** Its own rule (phr's): a signed-in person, writing their own record. Not a permission core knows. */
  mayWrite(ctx: ActorContext): boolean {
    return !!ctx?.username && ctx.username !== 'Anonymous' && !this.closed.has(ctx.username);
  }

  /** People whose records are closed to writes (a test switch). */
  readonly closed = new Set<string>();

  add(record: Omit<HealthRecord, 'owner'>, ctx: ActorContext): ReceiveOutcome {
    this.calls.push({ door: 'add', ctx });
    if (!this.mayWrite(ctx)) return { status: 'refused', message: 'Only you can add to your health record' };
    this.records.push({ ...record, owner: ctx.username });
    return { status: 'stored', ref: `record-${this.records.length}` };
  }

  keepOriginal(name: string, bytes: Buffer, ctx: ActorContext): ReceiveOutcome {
    this.calls.push({ door: 'keepOriginal', ctx });
    if (!this.mayWrite(ctx)) return { status: 'refused', message: 'Only you can add to your health record' };
    this.originals.push({ owner: ctx.username, name, size: bytes.length });
    return { status: 'stored', ref: `original-${this.originals.length}` };
  }
}

function ccdaShim(): IceShim {
  return {
    name: 'ccda',
    label: 'C-CDA',
    direction: 'in',
    accepts: { extensions: ['.xml'], mediaTypes: ['application/xml', 'text/xml'], canRead: (input) => xmlKind(input.text ?? '') === 'ccda' },
    produces: RECORD_KIND,
    receivers: ['ice-fixture.health-records'],
    duplicates: 'file',
    async read(input) {
      const { records, note } = readCcda(input.text ?? '');
      return {
        items: records.map(r => ({ kind: RECORD_KIND, name: input.name, data: r })),
        ...(note ? { partial: note } : {})
      };
    }
  };
}

function fhirShim(): IceShim {
  const resources = (text: string): Array<Record<string, unknown>> => {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && !trimmed.includes('\n{')) {
      const one = JSON.parse(trimmed) as Record<string, unknown>;
      if (one.resourceType === 'Bundle' && Array.isArray(one.entry)) {
        return (one.entry as Array<{ resource?: Record<string, unknown> }>).map(e => e.resource ?? {});
      }
      return [one];
    }
    return trimmed.split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
  };
  return {
    name: 'fhir',
    label: 'FHIR',
    direction: 'in',
    accepts: {
      extensions: ['.json', '.ndjson'],
      canRead: (input) => {
        try {
          return resources(input.text ?? '').every(r => typeof r.resourceType === 'string');
        } catch {
          return false;
        }
      }
    },
    produces: RECORD_KIND,
    receivers: ['ice-fixture.health-records'],
    duplicates: 'item',
    async read(input) {
      return {
        items: resources(input.text ?? '')
          .filter(r => r.resourceType === 'Observation')
          .map(r => ({
            kind: RECORD_KIND,
            name: input.name,
            itemKey: `Observation/${String(r.id)}`,
            data: { code: String(r.code ?? ''), value: String(r.value ?? '') }
          }))
      };
    }
  };
}

function healthRecordsReceiver(manager: FixtureHealthRecords): IceReceiver {
  return {
    name: 'health-records',
    label: 'Health records',
    accepts: [RECORD_KIND],
    mayUse: async (ctx) => manager.mayWrite(ctx),
    receive: async (item: IceItem, ctx: ActorContext, info) => {
      const r = item.data as { code: string; value: string };
      return manager.add({ code: r.code, value: r.value, source: info.source.name }, ctx);
    },
    keepOriginal: async (item: IceItem, ctx: ActorContext) => manager.keepOriginal(item.name, item.bytes ?? Buffer.alloc(0), ctx)
  };
}

const addon: AddonModule = {
  name: 'ice-fixture',
  version: '1.0.0',
  description: 'ICE test fixture: phr-shaped shims into its own manager',
  register(engine, _config, host) {
    if (!host) throw new Error('ice-fixture needs the host');
    const manager = new FixtureHealthRecords();
    engine.registerManager('FixtureHealthRecords', manager);
    host.registerReceiver(healthRecordsReceiver(manager));
    host.registerShim(ccdaShim());
    host.registerShim(fhirShim());
  }
};

export default addon;
