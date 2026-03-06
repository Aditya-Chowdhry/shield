import type { ReviewRule } from './types.js';

export const dddRule: ReviewRule = {
  id: 'design/ddd-modeling',
  name: 'Domain Modeling & DDD',
  category: 'Design',
  defaultSeverity: 'warning',
  enabledByDefault: true,
  applicability: {},
  requiredContext: 'diff',
  prompt: `Evaluate domain modeling, DDD principles, and ubiquitous language.

Look for:
- Are domain concepts named clearly and consistently? Do names match business language?
- Are boundaries correct? Is domain logic leaking into controllers, handlers, or infrastructure?
- Are value objects used where appropriate instead of primitive obsession?
- Is business logic scattered across layers instead of living in the domain?
- Are aggregates too large or too small?
- Is there anemic domain model (entities that are just data bags with no behavior)?
- Does the code mix infrastructure concerns (HTTP, DB, messaging) with domain logic?

Be practical — not every codebase needs full DDD. Flag issues only when
the modeling choice will cause real confusion or maintenance burden.`,
};
