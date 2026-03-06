import type { ReviewRule } from './types.js';

export const securityRule: ReviewRule = {
  id: 'security/basics',
  name: 'Security Fundamentals',
  category: 'Security',
  defaultSeverity: 'critical',
  enabledByDefault: true,
  applicability: {},
  requiredContext: 'diff',
  prompt: `Evaluate security posture. Security issues are always high priority.

Look for:
- SQL injection (string concatenation in queries)
- XSS vulnerabilities (unescaped user input in HTML/templates)
- Command injection (user input in shell commands)
- Path traversal (user input in file paths without sanitization)
- SSRF (user-controlled URLs in server-side requests)
- Missing input validation at system boundaries
- Authentication/authorization gaps (missing auth checks, broken access control)
- Secrets, API keys, or credentials in code or logs
- PII exposure in logs, error messages, or API responses
- Insecure cryptographic practices (weak algorithms, hardcoded keys)
- CSRF vulnerabilities on state-changing endpoints
- Missing rate limiting on sensitive endpoints
- Overly permissive CORS or security headers

Be precise — state the exact attack vector and impact.
False positives on security are better than false negatives, but still aim for precision.`,
};
