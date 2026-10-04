/**
 * Which providers the bearer middleware tries, in order (#946, #1576): every
 * registered provider that declares `acceptsBearer`, in registration order.
 * Selected by the flag, not a list, so a new bearer provider joins by
 * declaring it rather than by editing app.ts.
 */
export function bearerProviderIds(providers: ReadonlyArray<{ id: string; acceptsBearer?: boolean }>): string[] {
  return providers.filter((p) => p.acceptsBearer === true).map((p) => p.id);
}
