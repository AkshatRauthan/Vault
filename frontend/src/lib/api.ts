import type {
  DocumentDetailsResponse,
  DocumentListResponse,
  DocumentProfile,
  KeyVersionView,
  PublicUser,
  SessionView,
  SignedProofResponse,
  UploadResponse,
  VerifyResponse,
} from './types';

const configuredBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');
const API_BASE = configuredBase || '/api';
const V1 = `${API_BASE}/v1`;

let csrfToken: string | undefined;

export function setCsrfToken(token?: string) {
  csrfToken = token || undefined;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function getMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const value = (body as { message?: unknown }).message;
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  const hasJsonBody = typeof init.body === 'string' && !headers.has('Content-Type');
  if (hasJsonBody) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(`${V1}${path}`, {
      ...init,
      method,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('Could not reach Vault API. Check that the backend is running and the frontend proxy is configured.', 0);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') || '';
  let body: unknown;
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
  } else if (response.ok && (contentType.includes('application/pdf') || contentType.includes('application/octet-stream'))) {
    body = await response.blob();
  } else {
    body = await response.text().catch(() => '');
  }

  if (typeof body === 'object' && body !== null && 'csrfToken' in body) {
    const token = (body as { csrfToken?: unknown }).csrfToken;
    if (typeof token === 'string') setCsrfToken(token);
  }

  if (!response.ok) {
    if (response.status === 401 && !/\/auth\/(login|register|reauth|change-password)$/.test(path)) {
      window.dispatchEvent(new CustomEvent('vault:unauthorized'));
    }
    throw new ApiError(getMessage(body, `Request failed (${response.status})`), response.status, body);
  }
  return body as T;
}

function json(body: unknown): string {
  return JSON.stringify(body);
}

export const api = {
  auth: {
    async me() {
      return request<{ user: PublicUser; csrfToken: string }>('/auth/me');
    },
    async login(input: { identifier: string; password: string; remember: boolean }) {
      return request<{ user: PublicUser; csrfToken: string }>('/auth/login', { method: 'POST', body: json(input) });
    },
    async register(input: { name: string; tag: string; email: string; password: string }) {
      return request<{ user: PublicUser; csrfToken: string }>('/auth/register', { method: 'POST', body: json(input) });
    },
    logout() {
      return request<void>('/auth/logout', { method: 'POST' });
    },
    logoutAll() {
      return request<void>('/auth/logout-all', { method: 'POST' });
    },
    async reauth(password: string) {
      return request<{ csrfToken: string }>('/auth/reauth', { method: 'POST', body: json({ password }) });
    },
    async changePassword(currentPassword: string, newPassword: string) {
      return request<{ csrfToken: string }>('/auth/change-password', {
        method: 'POST',
        body: json({ currentPassword, newPassword }),
      });
    },
    async sessions() {
      return request<{ sessions: SessionView[] }>('/auth/sessions');
    },
    revokeSession(ref: string) {
      return request<void>(`/auth/sessions/${encodeURIComponent(ref)}`, { method: 'DELETE' });
    },
  },
  users: {
    async tagAvailability(tag: string) {
      const params = new URLSearchParams({ tag });
      return request<{ available: boolean }>(`/users/tag-availability?${params.toString()}`);
    },
    async updateName(name: string) {
      return request<{ user: PublicUser }>('/users/me', { method: 'PATCH', body: json({ name }) });
    },
  },
  documents: {
    list(page = 1, limit = 20) {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      return request<DocumentListResponse>(`/documents?${params.toString()}`);
    },
    details(documentId: string) {
      return request<DocumentDetailsResponse>(`/documents/${encodeURIComponent(documentId)}`);
    },
    upload(file: File, name: string) {
      if ([...name].some((character) => character.codePointAt(0)! > 0xff)) {
        throw new ApiError('This API version cannot transmit document names containing non-Latin-1 characters in the name header. Use a compatible name for now; Unicode header support needs a backend API change.', 400);
      }
      return request<UploadResponse>('/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'X-Document-Name': name,
        },
        body: file,
      });
    },
    sign(documentId: string, versionId: string, profile: DocumentProfile) {
      return request<SignedProofResponse>(
        `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/sign`,
        { method: 'POST', body: json({ profile }) },
      );
    },
    verify(documentId: string, versionId: string, file: File) {
      return request<VerifyResponse>(
        `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/verify`,
        { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file },
      );
    },
    proof(documentId: string, versionId: string) {
      return request<SignedProofResponse>(
        `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/proof`,
      );
    },
    async download(documentId: string, versionId: string, fileName: string) {
      const blob = await request<Blob>(
        `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/download`,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  },
  keys: {
    async mine() {
      return request<{ keys: KeyVersionView[] }>('/keys/me');
    },
    rotate() {
      return request<{ key: KeyVersionView }>('/keys/rotate', { method: 'POST' });
    },
    revoke(reason: 'suspected_compromise' | 'other') {
      return request<{ revoked: KeyVersionView; active: KeyVersionView }>('/keys/revoke', { method: 'POST', body: json({ reason }) });
    },
  },
};
