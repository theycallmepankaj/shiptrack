import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormAlert, FormField } from '@/components/auth/FormField';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { Button } from '@/components/ui/button';
import { api, parseApiError } from '@/api/client';
import { passwordIssues } from '@/lib/validation';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    const issues = passwordIssues(password);
    if (issues.length) errs.password = issues[0];
    if (confirm !== password) errs.confirm = 'Passwords don’t match';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setFormError('');
    try {
      await api.post(`/auth/reset-password/${token}`, { password });
      toast.success('Password updated — log in with your new password.');
      navigate('/login', { replace: true });
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
      title="Choose a new password"
      subtitle="You’ll be signed out of other devices."
      footer={<Link to="/forgot-password" className="font-semibold text-primary-text hover:underline">Request a new link</Link>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert>{formError}</FormAlert>
        <div>
          <FormField label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} autoFocus />
          <PasswordStrength password={password} />
        </div>
        <FormField label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />} Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
