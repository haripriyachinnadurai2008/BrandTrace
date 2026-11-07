import { UserRole } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

class ApiClient {
  private currentRole: UserRole = 'Admin';
  private currentUserId: string = 'usr_admin_elena';
  private token: string | null = typeof window !== 'undefined' ? localStorage.getItem('brandtrace_token') : null;

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

    try {
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) {
        let errDetail = 'Request failed';
        try {
          const errData = await response.json();
          errDetail = errData.detail?.message || errData.detail || JSON.stringify(errData);
        } catch {
          errDetail = response.statusText;
        }
        throw new Error(errDetail);
      }
      return (await response.json()) as T;
    } catch (err: any) {
      console.warn(`[API] ${options.method || 'GET'} ${endpoint} failed:`, err.message);
      throw err;
    }
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

