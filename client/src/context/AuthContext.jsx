import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchMe, logoutApi } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Cookie session restore (httpOnly cookie sent automatically).
  const refresh = useCallback(async () => {
    try {
      const res = await fetchMe();
      setUser(res.data);
      return res.data;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const saveSession = (session) => {
    // Cookie-only: the server set the httpOnly cookie; keep just the user.
    setUser(session.user);
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch {
      // still clear local state even if API call fails
    }
    try {
      localStorage.removeItem('studyai_token'); // legacy cleanup, once
    } catch {
      // ignore
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, saveSession, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
