import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from './ui';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status, error, retry } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-wash">
        <Spinner label="Opening the newsroom" />
      </div>
    );
  }
  if (status === 'signedOut') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (status === 'noAccess') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-wash px-6 text-center">
        <h1 className="text-2xl font-extrabold text-ink">No desk access</h1>
        <p className="max-w-md text-muted">
          You are signed in, but you are not on the 180news newsroom team. Ask an owner to add your email under Users and roles.
        </p>
        <a href="/login" className="font-bold text-navy underline">
          Back to sign in
        </a>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-wash px-6 text-center">
        <h1 className="text-2xl font-extrabold text-ink">Could not open the desk</h1>
        <p className="text-muted">{error}</p>
        <button type="button" onClick={retry} className="cursor-pointer font-bold text-navy underline">
          Retry
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
