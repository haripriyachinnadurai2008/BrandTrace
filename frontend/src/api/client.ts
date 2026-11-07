import { UserRole } from '../types';

const rawEnvUrl = import.meta.env.VITE_API_BASE_URL;
const isDev = import.meta.env.DEV;

// In dev, default to localhost:8000. In production, require VITE_API_BASE_URL.
export const API_BASE_URL = (rawEnvUrl ? rawEnvUrl.trim().replace(/\/+$/, '') : (isDev ? 'http://localhost:8000' : ''));
export const isMissingApiUrl = !API_BASE_URL;

class ApiClient {
  private currentRole: UserRole = 'Admin';
  private currentUserId: string = 'usr_admin_elena';
  private token: string | null = typeof window !== 'undefined' ? localStorage.getItem('brandtrace_token') : null;
  private onAuthErrorListeners: (() => void)[] = [];

  onAuthError(callback: () => void) {
    this.onAuthErrorListeners.push(callback);
    return () => {
      this.onAuthErrorListeners = this.onAuthErrorListeners.filter(cb => cb !== callback);
    };
  }

  notifyAuthError() {
    this.logout();
    this.onAuthErrorListeners.forEach(cb => cb());
  }

  setRole(role: UserRole) {
    this.currentRole = role;
    const roleMap: Record<UserRole, string> = {
      Admin: 'usr_admin_elena',
      Creator: 'usr_creator_marcus',
      Reviewer: 'usr_reviewer_devin',
      Agency: 'usr_agency_partner',
    };
    this.currentUserId = roleMap[role];
  }

  getRole(): UserRole {
    return this.currentRole;
  }

  getUserId(): string {
    return this.currentUserId;
  }

  getToken(): string | null {
    return this.token;
  }

  async login(email: string, password: string): Promise<any> {
    const res = await this.request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res && res.access_token) {
      this.token = res.access_token;
      if (typeof window !== 'undefined') {
        localStorage.setItem('brandtrace_token', res.access_token);
      }
      if (res.user && res.user.role) {
        this.setRole(res.user.role as UserRole);
      }
    }
    return res;
  }

  logout() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('brandtrace_token');
    }
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (isMissingApiUrl) {
      const msg = `API Configuration Error: VITE_API_BASE_URL is not configured for production. Please set VITE_API_BASE_URL in your Render static site settings and redeploy.`;
      console.error(msg);
      throw new Error(msg);
    }

    const url = `${API_BASE_URL}${endpoint}`;
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');

    // Attach JWT Bearer token if present
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    // Role switcher headers for development
    headers.set('X-User-Role', this.currentRole);
    headers.set('X-User-Id', this.currentUserId);

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (networkErr: any) {
      const reachMsg = `Cannot reach backend at ${url}. Check network connection, CORS settings, or server status.`;
      console.warn(`[API Network Error] ${options.method || 'GET'} ${endpoint}:`, reachMsg, networkErr);
      throw new Error(reachMsg);
    }

    if (!response.ok) {
      if (response.status === 401) {
        this.notifyAuthError();
        let errDetail = 'Session expired or authentication required. Please sign in again.';
        try {
          const errData = await response.json();
          errDetail = errData.detail?.message || errData.detail || errDetail;
        } catch {}
        throw new Error(`Authentication Required (401): ${errDetail}`);
      }

      if (response.status === 403) {
        let errDetail = 'You do not have permission to perform this action.';
        try {
          const errData = await response.json();
          errDetail = errData.detail?.message || errData.detail || errDetail;
        } catch {}
        throw new Error(`Access Forbidden (403): ${errDetail}`);
      }

      let errDetail = `Request failed (${response.status} ${response.statusText})`;
      try {
        const errData = await response.json();
        errDetail = errData.detail?.message || errData.detail || JSON.stringify(errData);
      } catch {}
      throw new Error(errDetail);
    }

    return (await response.json()) as T;
  }

  // Content
  getContentItems() {
    return this.request<any[]>('/content');
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

  // Facts
  getFacts() {
    return this.request<any[]>('/facts');
  }

  getEvidenceSources() {
    return this.request<any[]>('/sources');
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

  // Findings
  dismissFinding(findingId: string, reason: string, resolutionAction: string = 'dismissed') {
    return this.request<any>(`/findings/${findingId}/dismiss`, {
      method: 'POST',
      body: JSON.stringify({ reason, resolution_action: resolutionAction }),
    });
  }

  // Precedents
  getPrecedents() {
    return this.request<any[]>('/precedents');
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

