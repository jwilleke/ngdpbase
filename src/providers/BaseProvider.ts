/**
 * The root every provider base class inherits from (#1148).
 *
 * It exists for one contract: a provider states what it does with data between
 * accepting it and having it on disk. That question is not specific to
 * auditing — a page provider that buffers its index writes, a search provider
 * that batches, and a logging provider that flushes on a timer all have the
 * same window in which a record can be lost, and an instance should be able to
 * say so uniformly rather than one subsystem at a time.
 *
 * It carries what every provider genuinely shares, and deliberately no more:
 * the durability contract (#1148) and its own identity (#1151).
 *
 * __Identity, not lifecycle.__ `ProviderInfo` was declared nine times across
 * this tree — once canonically and eight times locally — and the copies had
 * already drifted into three different shapes, which is the failure that made
 * consolidating it worth doing. Every provider has a name and a version, so
 * that belongs here.
 *
 * Lifecycle does NOT. `initialize()`, `shutdown()` and `isHealthy()` appear in
 * 8, 4 and 4 of the nine base classes respectively, some abstract and some
 * concrete, and whether a cache provider's lifecycle is genuinely the same
 * shape as a page provider's is a design question rather than a refactor. A
 * uniform lifecycle asserted across providers that do not have one would be
 * the same defect as the `durable` flag #1148 removed: a contract declared for
 * everybody and honoured by some. #1151 keeps that as its own step, undecided.
 */

/**
 * What a provider does with a record before it is durably stored.
 *
 * Facts rather than a claim. Durability on a single node means write, fsync,
 * then acknowledge — and even that trusts a disk controller's cache, while a
 * failed disk takes the data with it. So a provider reports the window in
 * which a record can still be lost and the reader draws the conclusion.
 *
 * The alternative was a `durable: boolean`, which is what this replaces: it
 * was derived from an unrelated property, was true for every storing provider,
 * and was false in fact for the one that shipped by default (#1148).
 */
import type { ProviderInfo } from '../types/Provider.js';

export interface ProviderDurability {
  /** Milliseconds a record may sit in memory before being written. 0 = never buffered. */
  bufferedForMs: number;
  /** Records held before an early write is forced. 0 = no bound. */
  bufferedRecords: number;
  /** Whether EVERY write is flushed to the device before being reported as stored. */
  fsync: boolean;
  /**
   * Classes of write that ARE unbuffered and fsynced even when `fsync` is
   * false, named in the provider's own vocabulary — for auditing, the tier
   * (#1158).
   *
   * A partial guarantee needs somewhere to be stated, or it rounds to a claim
   * that is wrong in one direction or the other: `fsync: true` would promise
   * durability for buffered `standard` events that do not have it, and a bare
   * `fsync: false` hides a guarantee the critical path genuinely provides.
   * Absent when the whole answer is `fsync`.
   */
  fsyncedClasses?: readonly string[];
}

abstract class BaseProvider {
  /**
   * What this provider calls itself (#1151).
   *
   * `protected`, and set by a subclass in its constructor or field
   * initialisers. A provider that sets nothing reports the class name rather
   * than a placeholder, so the answer is never a lie — it is either what the
   * author chose or what the runtime knows.
   */
  protected providerName?: string;

  /** Version this provider reports. Defaults to `1.0.0` when unset. */
  protected providerVersion?: string;

  /** One line on what it does. Optional, as on the canonical type. */
  protected providerDescription?: string;

  /** Capability strings a manager may log or branch on. */
  protected providerFeatures?: string[];

  /**
   * Identify this provider.
   *
   * Concrete providers may still override this — their name, version and
   * feature list are their own data, not duplication. What moved up here is
   * the SHAPE, so the nine copies of `ProviderInfo` become one, and so a new
   * provider that sets the fields gets a correct answer without writing the
   * method at all.
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: this.providerName ?? this.constructor.name,
      version: this.providerVersion ?? '1.0.0',
      description: this.providerDescription,
      features: this.providerFeatures ?? []
    };
  }

  /**
   * What this provider does with a record before it is durably stored.
   *
   * Null means the provider has not stated it — silence rather than a default.
   * A provider that buffers and forgets to declare it must not inherit an
   * assertion that it writes immediately, which is precisely the bug this
   * contract replaces. A reporting layer renders null as "not stated", never
   * as "durable".
   */
  getDurability(): ProviderDurability | null {
    return null;
  }
}

export default BaseProvider;
