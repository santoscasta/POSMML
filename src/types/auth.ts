export type UserRole = "admin" | "collaborator";
export interface AccessUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  active: boolean;
  employeeId: string | null;
}
export interface AccessSession {
  id: string;
  expiresAt: string;
}
export interface UserSession {
  id: string;
  userId: string;
  username: string;
  name: string;
  role: UserRole;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  reason: string | null;
  current: boolean;
  status: "active" | "expired" | "revoked";
}
