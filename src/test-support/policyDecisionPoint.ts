/**
 * A real PolicyDecisionPoint over a given configuration (#2125), for tests
 * that assert what the SHIPPED policies decide rather than a stand-in's
 * answer. The caller passes the configuration (usually
 * `config/app-default-config.json`, read where the test lives).
 */
import PolicyDecisionPoint from '../security/PolicyDecisionPoint.js';
import PolicyEvaluator from '../managers/PolicyEvaluator.js';

/** A PDP with its own PolicyEvaluator, reading every key from `config`. */
export async function pdpOver(config: Record<string, unknown>): Promise<PolicyDecisionPoint> {
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def) }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null } as never;
  const evaluator = new PolicyEvaluator(engine);
  const pdp = new PolicyDecisionPoint(engine);
  managers.PolicyEvaluator = evaluator;
  managers.PolicyDecisionPoint = pdp;
  await evaluator.initialize();
  return pdp;
}
