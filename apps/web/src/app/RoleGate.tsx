import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { homeFor, useAuth, type Role } from '../lib/auth';

export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const profile = useAuth((s) => s.profile);
  if (!profile) return <Navigate to="/login" replace />;
  if (!roles.includes(profile.role)) return <Navigate to={homeFor(profile.role)} replace />;
  return <>{children}</>;
}
