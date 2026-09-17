import { Navigate } from 'react-router';
import { homeFor, useAuth } from '../lib/auth';

/** `/` ve bilinmeyen adresler: oturum varsa rolün ana ekranına, yoksa girişe. */
export function HomeRedirect() {
  const profile = useAuth((s) => s.profile);
  return <Navigate to={profile ? homeFor(profile.role) : '/login'} replace />;
}
