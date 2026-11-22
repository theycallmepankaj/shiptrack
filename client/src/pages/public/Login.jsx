import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormAlert, FormField } from '@/components/auth/FormField';
import { Button } from '@/components/ui/button';
import { parseApiError } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABEL, safeRedirect } from '@/lib/roles';
import { isEmail } from '@/lib/validation';

const DEMO = [
  { role: 'customer', email: 'customer@shiptrack.dev', password: 'Customer@123' },
  { role: 'driver', email: 'driver1@shiptrack.dev', password: 'Driver@123' },
  { role: 'admin', email: 'admin@shiptrack.dev', password: 'Admin@123' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!isEmail(form.email)) errs.email = 'Enter a valid email';
    if (!form.password) errs.password = 'Enter your password';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      navigate(safeRedirect(location.state?.from, user.role), { replace: true });
    } catch (err) {
      const { message, fields } = parseApiError(err);
      setErrors(fields);
      setFormError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to book, track and manage your shipments."
      footer={<>New to ShipTrack? <Link to="/register" className="font-semibold text-primary-text hover:underline">Create an account</Link></>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert>{formError}</FormAlert>
        <FormField label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} autoFocus />
        <div>
          <FormField label="Password" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} error={errors.password} />
          <Link to="/forgot-password" className="mt-2 inline-block text-sm font-medium text-primary-text hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />} Log in
        </Button>
      </form>

      <div className="mt-8 rounded-card border border-dashed border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Demo accounts</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO.map((d) => (
            <button
              key={d.role}
              type="button"
              onClick={() => { setForm({ email: d.email, password: d.password }); setErrors({}); setFormError(''); }}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:text-primary-text"
            >
              {ROLE_LABEL[d.role]}
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
