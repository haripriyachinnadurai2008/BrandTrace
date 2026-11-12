export type UserRole = 'Admin' | 'Creator' | 'Reviewer' | 'Agency';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  org_id: string;
}

export type RiskTier = 'Critical' | 'High' | 'Medium' | 'Info';
export type ClaimStatus = 'Verified' | 'Contradicted' | 'Unverified' | 'Stale';
export type ContentState = 'draft' | 'approved' | 'live' | 'archived' | 're-review required';

export interface FactVersion {
  version_id: string;
  fact_id: string;
  version_no: number;
  value: string;
  unit: string;
  normalised_value: string;
  valid_from: string;
  valid_to: string | null;
  status: string;
  approved_by?: string;
  approved_at?: string;
  source_id: string;
  source_page: number;
  supersedes_version_id?: string;
  created_at: string;
}

export interface BrandFact {
  id: string;
  name: string;
  category: string;
  created_at: string;
  versions: FactVersion[];
}

export interface FixOptions {
  professional: string;
  marketing: string;
  minimal: string;
}

export interface Finding {
  finding_id: string;
  claim_id: string;
  risk_tier: RiskTier;
  status: ClaimStatus;
  reason: string;
  source_reference: string;
  extraction_confidence: number;
  excerpt: string;
  span_start: number;
  span_end: number;
  raw_span_text: string;
  normalised_value?: string;
  verified_value?: string | null;
  fact_id?: string;
  fact_name?: string | null;
  fact_version_id?: string;
  match_method?: string;
  match_score?: number;
  is_approximate: boolean;
  fix_options?: FixOptions;
  claim_type?: string;
  claim_subject?: string | null;
  evidence_document_id?: string | null;
  evidence_page?: number | null;
  evidence_rects?: number[][] | null;
  evidence_page_width?: number | null;
  evidence_page_height?: number | null;
  evidence_located?: boolean | null;
  evidence_reason?: string | null;
}

export interface EvidenceLocateClaimSummary {
  claim_id: string;
  finding_id?: string | null;
  raw_span_text: string;
  normalised_value: string;
  value_type?: string;
  subject?: string | null;
  attribute?: string | null;
  verified_value?: string | null;
  verified_normalised_value?: string | null;
  fact_id?: string | null;
  fact_name?: string | null;
  extraction_confidence: number;
  risk_tier?: string | null;
  status?: string | null;
  finding_reason?: string | null;
  source_reference?: string | null;
}

export interface EvidenceLocateResponse {
  document_id: string;
  title: string;
  file_name: string;
  located: boolean;
  reason: string;
  page_count: number;
  evidence_page?: number | null;
  evidence_rects: number[][];
  evidence_page_width?: number | null;
  evidence_page_height?: number | null;
  matched_query?: string | null;
  claim?: EvidenceLocateClaimSummary | null;
}

export interface ContentVersionSummary {
  version_id: string;
  version_no: number;
  raw_text?: string;
  state: ContentState;
  approved_at?: string;
  published_at?: string;
  archived_at?: string;
  publish_url?: string;
  created_at: string;
}

export interface ContentItem {
  id: string;
  title: string;
  channel: string;
  current_state: ContentState;
  owner_id: string;
  campaign_id?: string;
  created_at: string;
  current_version?: ContentVersionSummary;
}

export interface ContentCheckResult {
  content_id: string;
  content_version_id: string;
  content_status: 'Ready for review' | 'Needs human review';
  findings_count: number;
  findings: Finding[];
  ai_label: string;
  ai_unavailable?: boolean;
  extraction_source?: 'groq' | 'cache' | 'fallback';
  fallback_reason?: string | null;
}

export interface ImpactItem {
  content_id: string;
  content_version_id: string;
  title: string;
  channel: string;
  old_state: string;
  new_state: string;
  owner_name: string;
  owner_email: string;
  action_required: string;
  is_red_alert: boolean;
  is_stale: boolean;
  is_re_review: boolean;
  is_left_alone: boolean;
  outdated_value: string;
  new_value: string;
  priority: 'Critical' | 'High' | 'Medium' | 'None';
}

export interface FactImpactSummary {
  re_review: number;
  stale: number;
  red_alert: number;
  left_alone: number;
  total: number;
}

export interface FactImpactResponse {
  fact_id: string;
  fact_name: string;
  new_version_no: number;
  new_value: string;
  effective_from: string;
  summary: FactImpactSummary;
  items: ImpactItem[];
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  approved_offer?: string;
  status: string;
  content_count?: number;
  created_at: string;
}

export interface CoherenceFinding {
  finding_id: string;
  content_title: string;
  channel: string;
  subject: string;
  attribute: string;
  this_value: string;
  all_values: string[];
  risk_tier: string;
  reason: string;
}

export interface Precedent {
  id: string;
  rule_id?: string;
  finding_id?: string;
  reviewer_id: string;
  reason: string;
  finding_summary: string;
  resolution_action: string;
  timestamp: string;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id?: string;
  actor_role?: string;
  old_values?: any;
  new_values?: any;
  reason?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  reference_id?: string;
  reference_type?: string;
  is_read: boolean;
  created_at: string;
}

