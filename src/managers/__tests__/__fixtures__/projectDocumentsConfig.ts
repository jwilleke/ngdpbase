/**
 * The worked example of docs/access-policies.md, "Worked example: project
 * documents" (#2261), as configuration: the `page`-based version. No resource
 * type of its own; the documents are the pages whose `system-category` is
 * `project-document`, and the attributes are declared on `page`.
 *
 * A fixture for the decision-table test and the search benchmark, so the
 * documented example and the tested one are the same text.
 */
import { attr, val } from './conditions';

const SAME_DEPARTMENT = {
  'string-equal': [attr('subject:department-id'), attr('resource:owning-department')]
};

export const PROJECT_DOCUMENT_POLICIES = [
  {
    id: 'project-document-read-department',
    name: 'Project documents: the owning department reads',
    effect: 'allow',
    subjects: [{ type: 'authenticated' }],
    resources: [{ type: 'system-category', pattern: 'project-document' }],
    actions: ['page-read'],
    condition: SAME_DEPARTMENT
  },
  {
    id: 'project-document-approve',
    name: 'Project documents: a lead in the owning department approves',
    effect: 'allow',
    subjects: [{ type: 'role', value: 'project-lead' }],
    resources: [{ type: 'system-category', pattern: 'project-document' }],
    actions: ['document-approve'],
    condition: SAME_DEPARTMENT
  },
  {
    id: 'project-document-approve-guard',
    name: 'Project documents: no approval outside business hours or below AAL 2',
    effect: 'deny',
    subjects: [{ type: 'anyone' }],
    resources: [{ type: 'system-category', pattern: 'project-document' }],
    actions: ['document-approve'],
    condition: {
      or: [
        { 'boolean-equal': [attr('environment:is-business-hours', 'boolean'), val(false, 'boolean')] },
        { 'integer-less-than-or-equal': [attr('subject:aal', 'integer'), val(1, 'integer')] }
      ]
    }
  }
];

/** What the example adds to the shipped configuration, key by key. */
export const projectDocumentsConfig = (shipped: Record<string, unknown>): Record<string, unknown> => {
  const types = shipped['ngdpbase.access.resource-types'] as Record<string, { attributes?: Record<string, unknown> }>;
  return {
    ...shipped,
    'ngdpbase.access.resource-types': {
      ...types,
      page: {
        ...types.page,
        attributes: {
          ...types.page.attributes,
          'owning-department': { type: 'string', from: 'frontmatter:department' }
        }
      }
    },
    'ngdpbase.access.subject-attributes': {
      ...(shipped['ngdpbase.access.subject-attributes'] as Record<string, unknown>),
      'department-id': { type: 'string', from: 'profile:department' }
    },
    'ngdpbase.permissions.definitions': {
      ...(shipped['ngdpbase.permissions.definitions'] as Record<string, unknown>),
      'document-approve': {
        description: 'Approve a project document',
        label: 'Approve project documents',
        'step-up': true,
        audit: { enabled: true, 'on-failure': 'refuse' }
      }
    },
    'ngdpbase.access.policies': PROJECT_DOCUMENT_POLICIES
  };
};
