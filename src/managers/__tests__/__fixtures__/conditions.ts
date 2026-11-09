/**
 * Arguments of a policy condition in the XACML-lowercase form (#2330), so a
 * test reads `{ 'string-equal': [attr('resource:owner'), attr('subject:id')] }`
 * and the function name stays written out where the test is about it.
 */

/** An attribute reference: `{ attributeid, datatype }`. The datatype is `string` unless given. */
export const attr = (attributeid: string, datatype = 'string'): { attributeid: string; datatype: string } => ({ attributeid, datatype });

/** A literal: `{ value, datatype }`. The datatype is the value's own (an array's first entry's) unless given. */
export const val = (value: unknown, datatype?: string): { value: unknown; datatype: string } => {
  const sample = Array.isArray(value) ? value[0] : value;
  return { value, datatype: datatype ?? (typeof sample === 'number' ? 'integer' : typeof sample === 'boolean' ? 'boolean' : 'string') };
};
