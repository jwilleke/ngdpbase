/**
 * The guarded resolver (#1133) — the actual SSRF control.
 *
 * `validateUrl` in ./ssrf.ts inspects a URL string and is a courtesy: it gives
 * an operator a clear message instead of a connection error. It cannot be the
 * boundary, because a name that resolves to a public address when validated
 * can resolve to an internal one moments later when connected, and because a
 * redirect sends the request somewhere the original URL never named.
 *
 * This runs at connect time, after resolution, for every connection an agent
 * makes — which is every redirect hop as well.
 *
 * Adapted from `src/http/ssrf.ts` in jwilleke/yourphr, sole-authored by the
 * copyright holder and contributed here under this repository's Apache-2.0
 * licence. The callback-shape handling and the `all: true` reasoning carry
 * over; taking an `EgressPolicy` rather than a boolean, and the injected
 * resolver, are new.
 */
import { lookup as dnsLookup } from 'node:dns';
import { isAddressAllowed, isBlockedHostname, REFUSAL } from './ssrf.js';
/** Marks a refusal as the guard's own decision rather than a network failure. */
export const ESSRF_BLOCKED = 'ESSRFBLOCKED';
function refuse(message) {
    return Object.assign(new Error(message), { code: ESSRF_BLOCKED });
}
/**
 * A `dns.lookup` that refuses to hand back an address the policy does not permit.
 *
 * Pass as the `lookup` option to an `http.Agent` / `https.Agent`; Node then
 * calls it for every connection that agent opens.
 *
 * Resolution is always requested with `all: true` regardless of what the
 * caller asked for, and EVERY returned address is judged. A name with several
 * A records must not pass on the strength of one public answer while another
 * points inward — that is round-robin SSRF, and checking only the first record
 * misses it entirely. The caller's requested shape is restored afterwards.
 */
export function guardedLookup(policy, resolver = dnsLookup) {
    return function guarded(hostname, options, callback) {
        // Node calls lookup(hostname, options, cb) or lookup(hostname, cb).
        const cb = (typeof options === 'function' ? options : callback);
        const opts = (typeof options === 'function' ? {} : options ?? {});
        // Names that are internal by definition never reach the resolver.
        if (isBlockedHostname(hostname)) {
            cb(refuse(`${REFUSAL}: ${hostname}`));
            return;
        }
        resolver(hostname, { ...opts, all: true }, (err, addresses) => {
            if (err) {
                cb(err);
                return;
            }
            const resolved = addresses ?? [];
            const blocked = resolved.find((a) => !isAddressAllowed(a.address, policy));
            if (blocked) {
                cb(refuse(`${REFUSAL}: ${hostname} resolved to ${blocked.address}`));
                return;
            }
            if (opts['all'] === true) {
                cb(null, resolved);
                return;
            }
            const first = resolved[0];
            if (!first) {
                // An empty answer must be an error, not `undefined` handed onward as
                // though it were an address.
                cb(Object.assign(new Error(`no addresses for ${hostname}`), { code: 'ENOTFOUND' }));
                return;
            }
            cb(null, first.address, first.family);
        });
    };
}
//# sourceMappingURL=guardedLookup.js.map