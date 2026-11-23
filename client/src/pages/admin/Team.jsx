import { useEffect, useState } from 'react';
import { Loader2, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api, parseApiError } from '@/api/client';
import { FormAlert, FormField } from '@/components/auth/FormField';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/format';
import { initials } from '@/lib/utils';
import { PageHeader } from '../shared/PageHeader';

/** FR-2: admins are created by an admin — there's no public sign-up for staff. */
export default function AdminTeam() {
  const { user: me } = useAuth();
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = () => api.get('/admin/admins').then(({ data }) => setAdmins(data.admins)).catch((e) => setError(parseApiError(e).message));
  useEffect(() => {
    load();
  }, []);

  const toggle = async (a) => {
    setBusy(a.id);
    try {
      const { data } = await api.patch(`/admin/admins/${a.id}`, { isActive: !a.isActive });
      setAdmins((list) => list.map((x) => (x.id === a.id ? data.admin : x)));
      toast.success(`${a.name} ${data.admin.isActive ? 'reactivated' : 'deactivated'}`);
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <EmptyState title="Couldn’t load the team" text={error} />;
  return (
    <>
      <PageHeader title="Team" subtitle="Admins who can run ShipTrack. Drivers are managed on the Drivers page." actions={<Button onClick={() => setOpen(true)}><Plus /> Add admin</Button>} />
      {!admins ? (
        <Skeleton className="h-48 max-w-3xl" />
      ) : (
        <ul className="max-w-3xl divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-soft">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-5">
              <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-navy-900 text-xs font-bold text-white sm:grid">{initials(a.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {a.name}
                  {a.id === me?.id && <Badge className="bg-primary/15 text-primary-text">You</Badge>}
                  {!a.isActive && <Badge className="bg-ink/10 text-muted">Deactivated</Badge>}
                </p>
                <p className="truncate text-sm text-muted">{a.email} · {a.phone} · added {formatDate(a.createdAt)}</p>
              </div>
              {a.id !== me?.id && (
                <Button variant="outline" size="sm" className="self-start sm:self-auto" disabled={busy === a.id} onClick={() => toggle(a)}>
                  {busy === a.id && <Loader2 className="animate-spin" />} {a.isActive ? 'Deactivate' : 'Reactivate'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <AddAdminDialog open={open} onOpenChange={setOpen} onCreated={(a) => setAdmins((list) => [...(list ?? []), a].sort((x, y) => x.name.localeCompare(y.name)))} />
    </>
  );
}

function AddAdminDialog({ open, onOpenChange, onCreated }) {
  const empty = { name: '', email: '', phone: '', password: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const { data } = await api.post('/admin/admins', form);
      onCreated(data.admin);
      toast.success(`${data.admin.name} can now sign in as an admin`);
      setForm(empty);
      onOpenChange(false);
    } catch (err) {
      const { message, fields } = parseApiError(err);
      setErrors(Object.keys(fields).length ? fields : { form: message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary-text" /> Add an admin</DialogTitle>
        <DialogDescription>They’ll have full access: shipments, drivers, pricing and the chatbot. Share the password with them securely.</DialogDescription>
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          <FormAlert>{errors.form}</FormAlert>
          <FormField label="Full name" value={form.name} onChange={set('name')} error={errors.name} autoComplete="off" />
          <FormField label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} autoComplete="off" />
          <FormField label="Phone" type="tel" value={form.phone} onChange={set('phone')} error={errors.phone} autoComplete="off" />
          <div>
            <FormField label="Temporary password" type="password" value={form.password} onChange={set('password')} error={errors.password} autoComplete="new-password" />
            <PasswordStrength password={form.password} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Add admin</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
