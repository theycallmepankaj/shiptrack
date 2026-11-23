import { useEffect, useState } from 'react';
import { CalendarDays, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api, parseApiError } from '@/api/client';
import { FormAlert, FormField } from '@/components/auth/FormField';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABEL } from '@/lib/roles';
import { initials } from '@/lib/utils';
import { PageHeader } from './PageHeader';

/** Your account: edit name and phone, change password (signs out your other devices). */
export default function Profile() {
  const { setUser: setAuthUser } = useAuth();
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/auth/me').then(({ data }) => setUser(data.user)).catch((e) => setError(parseApiError(e).message));
  }, []);

  const onSaved = (u) => {
    setUser(u);
    setAuthUser(u); // header avatar and menu pick up the new name
  };

  return (
    <>
      <PageHeader title="Profile" subtitle="Your account details and password." />
      {error && <p className="text-status-failed">{error}</p>}
      {!user && !error && <Skeleton className="h-64 max-w-2xl" />}
      {user && (
        <div className="grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="overflow-hidden rounded-card border border-border bg-surface shadow-soft" aria-labelledby="details-title">
            <div className="flex items-center gap-4 border-b border-border p-6">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary font-display text-xl font-extrabold text-primary-foreground">{initials(user.name)}</span>
              <div className="min-w-0">
                <h2 id="details-title" className="truncate text-xl font-bold">{user.name}</h2>
                <Badge className="mt-1 bg-ink/5 text-ink"><ShieldCheck className="h-3 w-3" /> {ROLE_LABEL[user.role]}</Badge>
              </div>
            </div>
            <dl className="divide-y divide-border border-b border-border">
              {[
                [Mail, 'Email', user.email],
                [CalendarDays, 'Member since', new Date(user.createdAt).toLocaleDateString('en-IN', { dateStyle: 'long' })],
              ].map(([Icon, k, v]) => (
                <div key={k} className="flex items-center gap-4 px-6 py-4">
                  <Icon className="h-4 w-4 text-muted" aria-hidden />
                  <dt className="w-28 text-sm text-muted">{k}</dt>
                  <dd className="min-w-0 flex-1 truncate text-sm font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <DetailsForm user={user} onSaved={onSaved} />
          </section>
          <PasswordForm />
        </div>
      )}
    </>
  );
}

function DetailsForm({ user, onSaved }) {
  const [form, setForm] = useState({ name: user.name, phone: user.phone ?? '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const dirty = form.name.trim() !== user.name || form.phone.trim() !== (user.phone ?? '');
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const { data } = await api.patch('/auth/me', { name: form.name.trim(), phone: form.phone.trim() });
      onSaved(data.user);
      toast.success('Profile updated');
    } catch (err) {
      const { message, fields } = parseApiError(err);
      setErrors(Object.keys(fields).length ? fields : { form: message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-4 p-6">
      <FormAlert>{errors.form}</FormAlert>
      <FormField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} autoComplete="name" />
      <FormField label="Phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} autoComplete="tel" />
      <Button type="submit" disabled={!dirty || saving}>{saving && <Loader2 className="animate-spin" />} Save changes</Button>
    </form>
  );
}

function PasswordForm() {
  const empty = { currentPassword: '', newPassword: '', confirm: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return setErrors({ confirm: 'Passwords don’t match' });
    setSaving(true);
    setErrors({});
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm(empty);
      toast.success(data.message);
    } catch (err) {
      const { message, fields } = parseApiError(err);
      setErrors(Object.keys(fields).length ? fields : { form: message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="h-fit space-y-4 rounded-card border border-border bg-surface p-6 shadow-soft" aria-labelledby="pw-title">
      <h2 id="pw-title" className="flex items-center gap-2 font-bold"><KeyRound className="h-4 w-4 text-primary-text" aria-hidden /> Change password</h2>
      <p className="text-sm text-muted">You’ll stay signed in here; your other devices will be signed out.</p>
      <FormAlert>{errors.form}</FormAlert>
      <FormField label="Current password" type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} error={errors.currentPassword} autoComplete="current-password" />
      <div>
        <FormField label="New password" type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} error={errors.newPassword} autoComplete="new-password" />
        <PasswordStrength password={form.newPassword} />
      </div>
      <FormField label="Confirm new password" type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} error={errors.confirm} autoComplete="new-password" />
      <Button type="submit" disabled={saving || !form.currentPassword || !form.newPassword}>{saving && <Loader2 className="animate-spin" />} Change password</Button>
    </form>
  );
}
