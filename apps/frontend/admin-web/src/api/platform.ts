/** Shared platform: admin sign in, users, logos, image uploads, QuickLook name lookup. */
import { http } from './client';

export type Role = 'super-admin' | 'games-admin' | 'hunt-admin' | 'prize-desk' | 'viewer';

export const ROLE_LABELS: Record<Role, string> = {
  'super-admin': 'Super admin',
  'games-admin': 'Games admin',
  'hunt-admin': 'Hunt admin',
  'prize-desk': 'Prize desk',
  viewer: 'Viewer',
};

export interface AdminUser {
  username: string;
  role: Role;
  disabled: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Logo {
  logoId: string;
  name: string;
  logoType: 'game' | 'stall' | 'portal' | 'display';
  targetId: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  updatedAt: string;
}

export const platformApi = {
  login: (username: string, password: string) =>
    http.post<{ username: string; role: Role }>('/admin/v1/auth/login', { username, password }),
  logout: () => http.post<void>('/admin/v1/auth/logout'),
  me: () => http.get<{ username: string; role: Role }>('/admin/v1/auth/me'),
  users: () => http.get<{ items: AdminUser[] }>('/admin/v1/users'),
  createUser: (input: { username: string; role: Role; password: string }) =>
    http.post('/admin/v1/users', input),
  updateUser: (
    username: string,
    input: Partial<{ role: Role; disabled: boolean; password: string; unlock: boolean }>,
  ) => http.put<AdminUser>(`/admin/v1/users/${encodeURIComponent(username)}`, input),
  logos: () => http.get<{ items: Logo[] }>('/admin/v1/logos'),
  saveLogo: (logoId: string, input: Omit<Logo, 'logoId' | 'imageUrl' | 'updatedAt'>) =>
    http.put<Logo>(`/admin/v1/logos/${encodeURIComponent(logoId)}`, input),
  deleteLogo: (logoId: string) => http.delete<void>(`/admin/v1/logos/${encodeURIComponent(logoId)}`),
  displayName: (userId: string) =>
    http.get<{ displayName: string | null }>(`/admin/v1/quicklook/users/${encodeURIComponent(userId)}/name`),
};

/**
 * Uploads an image in two steps: ask the platform for a short-lived upload URL, then send the file
 * straight to storage. Returns the stored key to save on the logo or prize.
 */
export async function uploadImage(
  file: File,
  purpose: 'logo' | 'prize',
): Promise<{ key: string; publicUrl: string }> {
  const target = await http.post<{ key: string; uploadUrl: string; publicUrl: string }>('/admin/v1/uploads', {
    purpose,
    contentType: file.type,
    size: file.size,
  });
  const response = await fetch(target.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'content-type': file.type },
  });
  if (!response.ok) throw new Error('Upload failed. Please try again');
  return { key: target.key, publicUrl: target.publicUrl };
}
