import { createContext, useContext } from "react";
import type { AccessUser, AccessSession } from "../types/auth";

export const AuthContext = createContext<{
  user: AccessUser;
  session: AccessSession;
  logout: () => Promise<void>;
} | null>(null);
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("Debes iniciar sesión.");
  return context;
}
