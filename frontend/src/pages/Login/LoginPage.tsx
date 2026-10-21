import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { ApiError } from '@/services/apiClient';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username || !password) {
      setError('请输入账号和密码');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, var(--tw-primary-900), var(--tw-primary-700) 55%, var(--tw-bg) 55%)',
      }}
    >
      <form
        onSubmit={onSubmit}
        className="card"
        style={{ width: 360, padding: 32 }}
      >
        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--tw-primary-800)' }}>TideWatch</div>
        <div className="muted" style={{ margin: '4px 0 24px', fontSize: 13 }}>
          智慧河流水环境监测与异常研判系统
        </div>
        <input
          placeholder="账号"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ ...inputStyle, marginTop: 12 }}
        />
        {error && <div style={{ color: 'var(--tw-danger)', fontSize: 13, margin: '10px 0' }}>{error}</div>}
        <button className="btn-primary" disabled={submitting} style={{ width: '100%', marginTop: 16, padding: '10px 0' }}>
          {submitting ? '登录中…' : '登录'}
        </button>
        <div className="muted" style={{ fontSize: 12, marginTop: 16, lineHeight: 1.7 }}>
          演示账号：admin / analyst / inspector
          <br />
          密码见 backend/README.md
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--tw-border)',
  borderRadius: 6,
  fontSize: 14,
  outlineColor: 'var(--tw-accent)',
};
