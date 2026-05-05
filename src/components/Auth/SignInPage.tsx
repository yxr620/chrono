import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../../stores/authStore';
import './SignInPage.css';

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

export const SignInPage: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
      onSuccess?.();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="signin-overlay" onClick={onClose}>
      <form className="signin-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{mode === 'login' ? '登录 Chrono' : '注册 Chrono'}</h3>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={8}
          />
        </label>
        {error && <p className="signin-error">{error}</p>}
        <div className="signin-actions">
          <button type="button" onClick={onClose}>取消</button>
          <button type="submit" disabled={busy}>
            {busy ? '...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </div>
        <p className="signin-switch">
          {mode === 'login' ? '没有账号？' : '已有账号？'}
          <button
            type="button"
            onClick={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}
          >
            {mode === 'login' ? '注册' : '登录'}
          </button>
        </p>
      </form>
    </div>,
    document.body,
  );
};
