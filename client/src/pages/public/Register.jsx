import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormAlert, FormField } from '@/components/auth/FormField';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { Button } from '@/components/ui/button';
import { parseApiError } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { isEmail, passwordIssues } from '@/lib/validation';

function validate(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'Enter your name';
  if (!isEmail(f.email)) e.email = 'Enter a valid email';
  if (!/^\+?[0-9\s-]{7,16}$/.test(f.phone.trim())) e.phone = 'Enter a valid phone number';
  const pw = passwordIssues(f.password);
  if (pw.length) e.password = pw[0];
  return e;
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const user = await register(form);
      toast.success(`Welcome to ShipTrack, ${user.name.split(' ')[0]}!`);
      navigate('/app', { replace: true });
    } catch (err) {
      const { message, fields } = parseApiError(err);
      setErrors(fields);
      setFormError(Object.keys(fields).length ? '' : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Book your first shipment in under a minute."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-primary-text hover:underline">Log in</Link></>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert>{formError}</FormAlert>
        <FormField label="Full name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} autoFocus />
        <FormField label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <FormField label="Phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} error={errors.phone} />
        <div>
          <FormField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
            hint="At least 8 characters, with a letter and a number."
          />
          <PasswordStrength password={form.password} />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />} Create account
        </Button>
        <p className="text-center text-xs text-muted">Driver or admin? Your account is created by an administrator.</p>
      </form>
    </AuthLayout>
  );
}
