import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MailCheck } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormAlert, FormField } from '@/components/auth/FormField';
import { Button } from '@/components/ui/button';
import { api, parseApiError } from '@/api/client';
import { isEmail } from '@/lib/validation';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!isEmail(email)) return setError('Enter a valid email');
    setLoading(true);
    setFormError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setFormError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Check your inbox" footer={<Link to="/login" className="font-semibold text-primary-text hover:underline">Back to log in</Link>}>
        <div className="rounded-card border border-border bg-surface p-6 text-center shadow-soft">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-status-delivered/10 text-status-delivered">
            <MailCheck className="h-7 w-7" aria-hidden />
          </div>
          <p className="mt-4 text-sm text-muted">
            If an account exists for <span className="font-semibold text-ink">{email}</span>, we’ve sent a link to reset your password. It’s valid for 30 minutes.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email and we’ll send you a reset link."
      footer={<>Remembered it? <Link to="/login" className="font-semibold text-primary-text hover:underline">Log in</Link></>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert>{formError}</FormAlert>
        <FormField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} error={error} autoFocus />
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />} Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
