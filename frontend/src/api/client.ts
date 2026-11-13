import { UserRole } from '../types';

const rawEnvUrl = import.meta.env.VITE_API_BASE_URL;
const isDev = import.meta.env.DEV;

// In dev, default to localhost:8000. In production, default to https://brandtrace.onrender.com
export const API_BASE_URL = (rawEnvUrl ? rawEnvUrl.trim().replace(/\/+$/, '') : (isDev ? 'http://localhost:8000' : 'https://brandtrace.onrender.com'));
export const isMissingApiUrl = !API_BASE_URL;

export type SessionInfo = {
  role: UserRole;
  userId: string;
  name?: string;
  email?: string;
  hasToken: boolean;
};

export class ApiError extends Error {
  status?: number;
  isForbidden: boolean;
  isUnauthorized: boolean;
  isNetworkError: boolean;
  isTimeout: boolean;

  constructor(
    message: string,
    opts?: {
      status?: number;
      isForbidden?: boolean;
      isUnauthorized?: boolean;
      isNetworkError?: boolean;
      isTimeout?: boolean;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = opts?.status;
    this.isForbidden = Boolean(opts?.isForbidden);
    this.isUnauthorized = Boolean(opts?.isUnauthorized);
    this.isNetworkError = Boolean(opts?.isNetworkError);
    this.isTimeout = Boolean(opts?.isTimeout);
  }
}

export function isPermissionError(err: unknown): boolean {
  if (err instanceof ApiError) return err.isForbidden || err.status === 403;
  const msg = err instanceof Error ? err.message : String(err || '');
  return msg.includes('(403)') || msg.toLowerCase().includes('not permitted') || msg.toLowerCase().includes('forbidden');
}

export function normalizeRole(raw?: string | null): UserRole {
  const val = (raw || '').trim().toLowerCase();
  if (val === 'admin') return 'Admin';
  if (val === 'creator') return 'Creator';
  if (val === 'reviewer') return 'Reviewer';
  if (val === 'agency') return 'Agency';
  return 'Admin';
}

export function decodeJwtPayload(token: string | null): Record<string, any> | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

const ROLE_DEFAULT_USER_IDS: Record<UserRole, string> = {
  Admin: 'usr_admin_elena',
  Creator: 'usr_creator_marcus',
  Reviewer: 'usr_reviewer_devin',
  Agency: 'usr_agency_partner',
};

type RequestOptions = RequestInit & {
  skipAuth?: boolean;
  timeoutMs?: number;
  silentWake?: boolean;
};

class ApiClient {
  private currentRole: UserRole = 'Admin';
  private currentUserId: string = ROLE_DEFAULT_USER_IDS.Admin;
  private token: string | null = null;
  private onAuthErrorListeners: (() => void)[] = [];
  private onSessionChangeListeners: ((session: SessionInfo) => void)[] = [];
  private onServerWakingListeners: ((waking: boolean) => void)[] = [];
  private slowRequestsCount = 0;

  constructor() {
    this.restoreSessionFromStorage();
  }

  private restoreSessionFromStorage() {
    if (typeof window === 'undefined') return;
    let storedToken: string | null = null;
    try {
      storedToken = localStorage.getItem('brandtrace_token');
    } catch {
      storedToken = null;
    }

    if (!storedToken) {
      this.token = null;
      this.currentRole = 'Admin';
      this.currentUserId = ROLE_DEFAULT_USER_IDS.Admin;
      return;
    }

    const payload = decodeJwtPayload(storedToken);
    if (!payload || (payload.exp && payload.exp * 1000 < Date.now())) {
      this.clearStorageSession();
      this.token = null;
      this.currentRole = 'Admin';
      this.currentUserId = ROLE_DEFAULT_USER_IDS.Admin;
      return;
    }

    // JWT payload is the single source of truth for role and user id
    this.token = storedToken;
    const role = normalizeRole(payload.role);
    const userId = payload.sub || ROLE_DEFAULT_USER_IDS[role];
    this.currentRole = role;
    this.currentUserId = userId;

    // Reconcile stale localStorage brandtrace_user if out of sync with JWT
    try {
      const rawUser = localStorage.getItem('brandtrace_user');
      const parsedUser = rawUser ? JSON.parse(rawUser) : {};
      if (parsedUser.role !== role || parsedUser.id !== userId) {
        localStorage.setItem(
          'brandtrace_user',
          JSON.stringify({
            ...parsedUser,
            id: userId,
            email: payload.email || parsedUser.email,
            role,
          })
        );
      }
    } catch {
      // ignore storage failure
    }
  }

  private clearStorageSession() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem('brandtrace_token');
      localStorage.removeItem('brandtrace_user');
    } catch {
      // ignore storage error
    }
  }

  private applyAuthenticatedSession(token: string, user?: any) {
    // Clear any stale token/user before setting the new session
    this.clearStorageSession();
    this.token = token;

    const payload = decodeJwtPayload(token);
    const role = normalizeRole(payload?.role || user?.role);
    const userId = payload?.sub || user?.id || ROLE_DEFAULT_USER_IDS[role];
    this.currentRole = role;
    this.currentUserId = userId;

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('brandtrace_token', token);
        localStorage.setItem(
          'brandtrace_user',
          JSON.stringify({
            ...(user || {}),
            id: userId,
            email: payload?.email || user?.email,
            role,
          })
        );
      } catch {
        // ignore storage error
      }
    }
    this.emitSessionChange();
  }

  private emitSessionChange() {
    const snapshot = this.getSessionInfo();
    this.onSessionChangeListeners.forEach((cb) => cb(snapshot));
  }

  private emitServerWaking(waking: boolean) {
    this.onServerWakingListeners.forEach((cb) => cb(waking));
  }

  onSessionChange(callback: (session: SessionInfo) => void) {
    this.onSessionChangeListeners.push(callback);
    return () => {
      this.onSessionChangeListeners = this.onSessionChangeListeners.filter((cb) => cb !== callback);
    };
  }

  onServerWaking(callback: (waking: boolean) => void) {
    this.onServerWakingListeners.push(callback);
    return () => {
      this.onServerWakingListeners = this.onServerWakingListeners.filter((cb) => cb !== callback);
    };
  }

  onAuthError(callback: () => void) {
    this.onAuthErrorListeners.push(callback);
    return () => {
      this.onAuthErrorListeners = this.onAuthErrorListeners.filter((cb) => cb !== callback);
    };
  }

  notifyAuthError() {
    this.logout();
    this.onAuthErrorListeners.forEach((cb) => cb());
  }

  getSessionInfo(): SessionInfo {
    let storedName: string | undefined;
    let storedEmail: string | undefined;
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('brandtrace_user');
        if (raw) {
          const parsed = JSON.parse(raw);
          storedName = parsed?.name;
          storedEmail = parsed?.email;
        }
      } catch {
        // ignore
      }
    }
    if (this.token) {
      const payload = decodeJwtPayload(this.token);
      if (payload) {
        const role = normalizeRole(payload.role);
        return {
          role,
          userId: payload.sub || this.currentUserId,
          name: storedName,
          email: payload.email || storedEmail,
          hasToken: true,
        };
      }
    }
    return {
      role: this.currentRole,
      userId: this.currentUserId,
      name: storedName,
      email: storedEmail,
      hasToken: Boolean(this.token),
    };
  }

  setRole(role: UserRole) {
    // Dev switcher must clear stale JWT so Bearer does not override X-User-Role
    this.token = null;
    this.clearStorageSession();
    this.currentRole = role;
    this.currentUserId = ROLE_DEFAULT_USER_IDS[role];
    this.emitSessionChange();
  }

  getRole(): UserRole {
    if (this.token) {
      const payload = decodeJwtPayload(this.token);
      if (payload?.role) {
        const jwtRole = normalizeRole(payload.role);
        if (jwtRole !== this.currentRole) {
          this.currentRole = jwtRole;
        }
        return jwtRole;
      }
    }
    return this.currentRole;
  }

  getUserId(): string {
    return this.currentUserId;
  }

  getToken(): string | null {
    return this.token;
  }

  isTokenValid(): boolean {
    if (!this.token) return false;
    const payload = decodeJwtPayload(this.token);
    if (!payload) {
      this.logout();
      return false;
    }
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      this.logout();
      return false;
    }
    // Ensure in-memory role tracks valid JWT token
    const jwtRole = normalizeRole(payload.role);
    this.currentRole = jwtRole;
    this.currentUserId = payload.sub || ROLE_DEFAULT_USER_IDS[jwtRole];
    return true;
  }

  async pingHealth(): Promise<boolean> {
    if (isMissingApiUrl) return false;
    try {
      await this.request<any>('/health', {
        method: 'GET',
        skipAuth: true,
        timeoutMs: 8000,
        silentWake: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  async getPublicConfig(): Promise<{ demo_mode: boolean }> {
    try {
      return await this.request<{ demo_mode: boolean }>('/config/public', {
        method: 'GET',
        skipAuth: true,
        timeoutMs: 12000,
        silentWake: true,
      });
    } catch {
      return { demo_mode: false };
    }
  }

  async demoLogin(role: string = 'admin'): Promise<any> {
    this.logout();
    const res = await this.request<any>('/auth/demo-login', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ role }),
    });
    if (res && res.access_token) {
      this.applyAuthenticatedSession(res.access_token, res.user);
    }
    return res;
  }

  async login(email: string, password: string): Promise<any> {
    this.logout();
    const res = await this.request<any>('/auth/login', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    });
    if (res && res.access_token) {
      this.applyAuthenticatedSession(res.access_token, res.user);
    }
    return res;
  }

  async register(name: string, email: string, password: string, role: string = 'Creator'): Promise<any> {
    this.logout();
    const res = await this.request<any>('/auth/register', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ name, email, password, role }),
    });
    if (res && res.access_token) {
      this.applyAuthenticatedSession(res.access_token, res.user);
    }
    return res;
  }

  logout() {
    this.token = null;
    this.currentRole = 'Admin';
    this.currentUserId = ROLE_DEFAULT_USER_IDS.Admin;
    this.clearStorageSession();
    this.emitSessionChange();
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    if (isMissingApiUrl) {
      const msg = `API Configuration Error: VITE_API_BASE_URL is not configured for production. Please set VITE_API_BASE_URL in your Render static site settings and redeploy.`;
      console.error(msg);
      throw new ApiError(msg, { isNetworkError: true });
    }

    const url = `${API_BASE_URL}${endpoint}`;
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    // Never send stale Bearer tokens alongside auth requests, and never mix
    // dev role-switcher headers when a signed JWT token is active.
    if (!options.skipAuth) {
      if (this.token) {
        headers.set('Authorization', `Bearer ${this.token}`);
      } else {
        headers.set('X-User-Role', this.currentRole);
        headers.set('X-User-Id', this.currentUserId);
      }
    }

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? ((options.method === 'POST' && endpoint.includes('/check')) ? 45000 : 45000);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let markedSlow = false;
    const slowTimer = !options.silentWake
      ? setTimeout(() => {
          markedSlow = true;
          this.slowRequestsCount += 1;
          if (this.slowRequestsCount === 1) {
            this.emitServerWaking(true);
          }
        }, 3500)
      : null;

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers, signal: controller.signal });
    } catch (networkErr: any) {
      if (networkErr.name === 'AbortError') {
        const timeoutMsg = `Request timed out after ${Math.round(timeoutMs / 1000)}s while contacting ${url}. If using the free cloud tier, the server may be waking up (takes ~30-50s). Please retry.`;
        throw new ApiError(timeoutMsg, { isNetworkError: true, isTimeout: true });
      }
      const reachMsg = `Cannot reach backend server at ${API_BASE_URL}. The server may be waking up (free tier takes ~30-50s) or check network connection.`;
      console.warn(`[API Network Error] ${options.method || 'GET'} ${endpoint}:`, reachMsg, networkErr);
      throw new ApiError(reachMsg, { isNetworkError: true });
    } finally {
      clearTimeout(timeoutId);
      if (slowTimer) clearTimeout(slowTimer);
      if (markedSlow) {
        this.slowRequestsCount = Math.max(0, this.slowRequestsCount - 1);
        if (this.slowRequestsCount === 0) {
          this.emitServerWaking(false);
        }
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        if (!options.skipAuth) {
          this.notifyAuthError();
        }
        let errDetail = 'Session expired or authentication required. Please sign in again.';
        try {
          const errData = await response.json();
          errDetail = errData.detail?.message || errData.detail || errDetail;
        } catch {}
        throw new ApiError(errDetail, { status: 401, isUnauthorized: true });
      }

      if (response.status === 403) {
        let errDetail = 'Not available for your role.';
        try {
          const errData = await response.json();
          errDetail = errData.detail?.message || errData.detail || errDetail;
        } catch {}
        throw new ApiError(`Not available for your role (${errDetail})`, {
          status: 403,
          isForbidden: true,
        });
      }

      let errDetail = `Request failed (${response.status} ${response.statusText})`;
      try {
        const errData = await response.json();
        errDetail = errData.detail?.message || errData.detail || JSON.stringify(errData);
      } catch {}
      throw new ApiError(errDetail, { status: response.status });
    }

    return (await response.json()) as T;
  }

  // Content
  getContentItems() {
    return this.request<any[]>('/content');
  }

  createContent(title: string, channel: string, raw_text: string, campaign_id?: string) {
    return this.request<{ id: string; title: string; version_id: string }>('/content', {
      method: 'POST',
      body: JSON.stringify({ title, channel, raw_text, campaign_id }),
    });
  }

  getContentDetail(contentId: string) {
    return this.request<any>(`/content/${contentId}`);
  }

  checkContent(contentId: string) {
    return this.request<any>(`/content/${contentId}/check`, { method: 'POST' });
  }

  approveContent(contentId: string, reason: string) {
    return this.request<any>(`/content/${contentId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  updatePublishStatus(contentId: string, payload: { state: string; publish_url?: string }) {
    return this.request<any>(`/content/${contentId}/publish-status`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Reseed Demo Data
  reseedDemoData() {
    return this.request<any>('/seed', { method: 'POST' });
  }

  // Facts
  getFacts() {
    return this.request<any[]>('/facts');
  }

  getEvidenceSources() {
    return this.request<any[]>('/sources');
  }

  locateEvidence(documentId: string, claimId?: string, findingId?: string) {
    const params = new URLSearchParams();
    if (claimId) params.set('claim_id', claimId);
    if (findingId) params.set('finding_id', findingId);
    const qs = params.toString();
    return this.request<any>(`/evidence/${encodeURIComponent(documentId)}/locate${qs ? `?${qs}` : ''}`);
  }

  async fetchEvidencePageImage(
    documentId: string,
    pageNo: number,
    highlightClaimId?: string
  ): Promise<{
    objectUrl: string;
    located: boolean;
    page: number;
    pageCount: number;
    highlights: number;
    reason: string;
  }> {
    if (isMissingApiUrl) {
      throw new ApiError(
        'API Configuration Error: VITE_API_BASE_URL is not configured for production.',
        { isNetworkError: true }
      );
    }

    const qs = highlightClaimId ? `?highlight=${encodeURIComponent(highlightClaimId)}` : '';
    const url = `${API_BASE_URL}/evidence/${encodeURIComponent(documentId)}/page/${pageNo}${qs}`;
    const headers = new Headers();
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    } else {
      headers.set('X-User-Role', this.currentRole);
      headers.set('X-User-Id', this.currentUserId);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    let markedSlow = false;
    const slowTimer = setTimeout(() => {
      markedSlow = true;
      this.slowRequestsCount += 1;
      if (this.slowRequestsCount === 1) this.emitServerWaking(true);
    }, 3500);

    let response: Response;
    try {
      response = await fetch(url, { headers, signal: controller.signal });
    } catch (networkErr: any) {
      if (networkErr.name === 'AbortError') {
        throw new ApiError('Request timed out while loading evidence PDF page. Please retry.', {
          isNetworkError: true,
          isTimeout: true,
        });
      }
      throw new ApiError(
        `Cannot reach backend server at ${API_BASE_URL}. Please retry in a moment.`,
        { isNetworkError: true }
      );
    } finally {
      clearTimeout(timeoutId);
      clearTimeout(slowTimer);
      if (markedSlow) {
        this.slowRequestsCount = Math.max(0, this.slowRequestsCount - 1);
        if (this.slowRequestsCount === 0) this.emitServerWaking(false);
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        this.notifyAuthError();
        throw new ApiError('Session expired. Please sign in again.', {
          status: 401,
          isUnauthorized: true,
        });
      }
      if (response.status === 403) {
        let detail = 'Evidence PDF viewer is restricted to internal roles.';
        try {
          const data = await response.json();
          detail = data.detail || detail;
        } catch {}
        throw new ApiError(`Not available for your role (${detail})`, {
          status: 403,
          isForbidden: true,
        });
      }
      let errDetail = `Failed to load PDF page (${response.status})`;
      try {
        const data = await response.json();
        errDetail = data.detail?.message || data.detail || errDetail;
      } catch {}
      throw new ApiError(errDetail, { status: response.status });
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const locatedHdr = response.headers.get('X-Evidence-Located');
    const pageHdr = response.headers.get('X-Evidence-Page');
    const countHdr = response.headers.get('X-Evidence-Page-Count');
    const highlightsHdr = response.headers.get('X-Evidence-Highlights');
    const reasonHdr = response.headers.get('X-Evidence-Reason') || '';

    return {
      objectUrl,
      located: locatedHdr === 'true',
      page: pageHdr ? parseInt(pageHdr, 10) || pageNo : pageNo,
      pageCount: countHdr ? parseInt(countHdr, 10) || pageNo : pageNo,
      highlights: highlightsHdr ? parseInt(highlightsHdr, 10) || 0 : 0,
      reason: reasonHdr,
    };
  }

  uploadEvidencePdf(file: File, title?: string) {
    const formData = new FormData();
    formData.append('file', file);
    if (title && title.trim()) {
      formData.append('title', title.trim());
    }
    return this.request<any>('/evidence/upload', {
      method: 'POST',
      body: formData,
    });
  }

  getFactImpact(factId: string, newValue: string, validFrom?: string) {
    let q = `?new_value=${encodeURIComponent(newValue)}`;
    if (validFrom) q += `&valid_from=${encodeURIComponent(validFrom)}`;
    return this.request<any>(`/facts/${factId}/impact${q}`);
  }

  createFactVersion(factId: string, payload: any) {
    return this.request<any>(`/facts/${factId}/versions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Campaigns
  getCampaigns() {
    return this.request<any[]>('/campaigns');
  }

  checkCampaignCoherence(campaignId: string) {
    return this.request<any>(`/campaigns/${campaignId}/check-coherence`, { method: 'POST' });
  }

  // Semantic Campaign Conflicts (Improvement 2)
  runSemanticCheck(campaignId: string) {
    return this.request<any>(`/campaigns/${campaignId}/semantic-check`, { method: 'POST' });
  }

  getSemanticConflicts(campaignId: string) {
    return this.request<any>(`/campaigns/${campaignId}/semantic-conflicts`);
  }

  dismissSemanticConflict(conflictId: string, reason: string) {
    return this.request<any>(`/semantic-conflicts/${encodeURIComponent(conflictId)}/dismiss`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  approveSemanticConflict(conflictId: string, reason?: string) {
    return this.request<any>(`/semantic-conflicts/${encodeURIComponent(conflictId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'Approved cross-channel alignment fix' }),
    });
  }

  // Expiry Forecast (Improvement 2)
  getExpiryForecast() {
    return this.request<any>('/facts/expiry-forecast');
  }

  // Findings
  dismissFinding(findingId: string, reason: string, resolutionAction: string = 'dismissed') {
    return this.request<any>(`/findings/${findingId}/dismiss`, {
      method: 'POST',
      body: JSON.stringify({ reason, resolution_action: resolutionAction }),
    });
  }

  // Precedents & Rules
  getPrecedents() {
    return this.request<any[]>('/precedents');
  }

  getProposedRules() {
    return this.request<any[]>('/rules/proposed');
  }

  getActiveGuidelines(activeOnly: boolean = true) {
    return this.request<any[]>(`/rules/guidelines?active_only=${activeOnly}`);
  }

  approveProposedRule(ruleId: string, payload?: { policy_text?: string; reason?: string }) {
    return this.request<any>(`/rules/${encodeURIComponent(ruleId)}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  rejectProposedRule(ruleId: string, payload?: { reason?: string }) {
    return this.request<any>(`/rules/${encodeURIComponent(ruleId)}/reject`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // Audit
  getAuditLogs(params?: { entity_type?: string; action?: string }) {
    let q = '';
    if (params?.entity_type) q += `?entity_type=${encodeURIComponent(params.entity_type)}`;
    if (params?.action) q += `${q ? '&' : '?'}action=${encodeURIComponent(params.action)}`;
    return this.request<any[]>(`/audit${q}`);
  }

  // Notifications
  getNotifications() {
    return this.request<any[]>('/notifications');
  }

  markNotificationRead(id: string) {
    return this.request<any>(`/notifications/${id}/read`, { method: 'POST' });
  }
}

export const api = new ApiClient();

