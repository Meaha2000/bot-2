import { useAuthContext } from '../context/AuthContext';

export function useAuth() {
  return useAuthContext();
}

export type { User } from '../context/AuthContext';
