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
 * Deliberately narrow. This is not a place to accumulate shared provider
 * behaviour: the nine base classes have different lifecycles, different
 * initialisation and different contracts with their managers, and pulling any
 * of that up here would couple them for no reason. It carries the durability
 * contract and nothing else.
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
export interface ProviderDurability {
  /** Milliseconds a record may sit in memory before being written. 0 = never buffered. */
  bufferedForMs: number;
  /** Records held before an early write is forced. 0 = no bound. */
  bufferedRecords: number;
  /** Whether a write is flushed to disk before being reported as stored. */
  fsync: boolean;
}

abstract class BaseProvider {
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
