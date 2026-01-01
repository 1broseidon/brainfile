import type { Contract, Deliverable } from '@brainfile/core';

export const ALLOWED_DELIVERABLE_TYPES = ['file', 'test', 'docs', 'design', 'research'] as const;
export type AllowedDeliverableType = (typeof ALLOWED_DELIVERABLE_TYPES)[number];

export function normalizeToArray(input?: string | string[]): string[] {
  if (!input) return [];
  return Array.isArray(input) ? input : [input];
}

export function parseDeliverableSpec(spec: string): Deliverable {
  const raw = spec.trim();
  if (!raw) {
    throw new Error('Deliverable spec is required');
  }

  const firstColon = raw.indexOf(':');
  if (firstColon === -1) {
    throw new Error(
      `Invalid deliverable format: "${spec}". Expected "type:path:description" (description optional).`
    );
  }

  const type = raw.slice(0, firstColon).trim();
  const rest = raw.slice(firstColon + 1);

  const secondColon = rest.indexOf(':');
  const path = (secondColon === -1 ? rest : rest.slice(0, secondColon)).trim();
  const description = (secondColon === -1 ? '' : rest.slice(secondColon + 1)).trim();

  if (!type) {
    throw new Error(
      `Invalid deliverable format: "${spec}". Expected "type:path:description" with non-empty type.`
    );
  }

  if (!path) {
    throw new Error(
      `Invalid deliverable format: "${spec}". Expected "type:path:description" with non-empty path.`
    );
  }

  const typeLower = type.toLowerCase();
  if (!(ALLOWED_DELIVERABLE_TYPES as readonly string[]).includes(typeLower)) {
    throw new Error(
      `Invalid deliverable type: "${type}". Expected one of: ${ALLOWED_DELIVERABLE_TYPES.join(', ')}`
    );
  }

  const deliverable: Deliverable = {
    type: typeLower,
    path,
    ...(description ? { description } : {}),
  };

  return deliverable;
}

export function buildContract(params: {
  deliverableSpecs?: string | string[];
  validationCommands?: string | string[];
  constraints?: string | string[];
}): Contract {
  const deliverableSpecs = normalizeToArray(params.deliverableSpecs);
  const validationCommands = normalizeToArray(params.validationCommands).map((c) => c.trim()).filter(Boolean);
  const constraints = normalizeToArray(params.constraints).map((c) => c.trim()).filter(Boolean);

  const deliverables = deliverableSpecs.map(parseDeliverableSpec);

  const contract: Contract = {
    status: 'ready',
    ...(deliverables.length > 0 ? { deliverables } : {}),
    ...(validationCommands.length > 0 ? { validation: { commands: validationCommands } } : {}),
    ...(constraints.length > 0 ? { constraints } : {}),
  };

  return contract;
}
