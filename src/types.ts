// Core domain types — provider-agnostic
// These represent the canonical model that all providers normalize into.

export interface ReviewRequest {
  provider: 'github' | 'gitlab';
  repo: { owner: string; name: string };
  changeRequest: {
    id: number;
    title: string;
    description: string;
    author: string;
    baseSha: string;
    headSha: string;
    url: string; // Web URL for the change request (provider-agnostic)
  };
  trigger: {
    type: 'mention' | 'auto' | 'recheck';
    actor: string;
    commentId?: number;
  };
}

export interface ChangedFile {
  path: string;
  previousPath?: string; // for renames
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch: string; // unified diff
}

export interface ChangeSet {
  files: ChangedFile[];
  stats: {
    additions: number;
    deletions: number;
    changedFiles: number;
  };
}

export type Severity = 'critical' | 'warning' | 'suggestion' | 'nitpick';
export type Confidence = 'high' | 'medium' | 'low';

export interface ReviewFinding {
  ruleId: string;
  severity: Severity;
  confidence: Confidence;
  category: string;
  file: string;
  line?: number;
  endLine?: number;
  title: string;
  message: string;
  suggestion?: string; // concrete code fix
  evidence?: string; // why this matters
}

export interface ReviewOutput {
  summary: string;
  findings: ReviewFinding[];
  riskScore: number; // 1-10
  positives: string[]; // what looks good
}

export interface ExistingComment {
  id: number;
  body: string;
  path?: string;
  line?: number;
  author: string;
}
