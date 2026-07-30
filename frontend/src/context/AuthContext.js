import React, { createContext, useContext, useEffect, useState } from 'react';
import { authAPI } from '../api/client';
import { saveSession, getToken, getUser, clearSession } from '../utils/storage';
import { connectSocket, disconnectSocket } from '../utils/socket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const storedToken = await getToken();
      const storedUser = await getUser();
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(storedUser);
        connectSocket(storedToken);
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email, password) => {
    const { data } = await authAPI.login({ email, password });
    await saveSession(data.token, data.user);
    setToken(data.token);
    setUser(data.user);
    connectSocket(data.token);
    return data.user;
  };

  const register = async (name, email, password, phone) => {
    const { data } = await authAPI.register({ name, email, password, phone });
    await saveSession(data.token, data.user);
    setToken(data.token);
    setUser(data.user);
    connectSocket(data.token);
    return data.user;
  };

  const logout = async () => {
    await clearSession();
    disconnectSocket();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
