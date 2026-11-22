import { useEffect, useState } from 'react';
import { Loader2, MapPin, Sparkles, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { api, parseApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** FR-31: pick a driver (ranked: on duty → has room → nearest) or auto-assign the nearest. */
export function AssignDialog({ shipment, open, onOpenChange, onAssigned }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!open || !shipment) return;
    setList(null);
    api.get(`/admin/shipments/${shipment.id}/candidates`).then(({ data }) => setList(data.candidates)).catch((e) => toast.error(parseApiError(e).message));
  }, [open, shipment]);

  const run = async (key, request, message) => {
    setBusy(key);
    try {
      const { data } = await request();
      toast.success(message(data));
      onAssigned?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(parseApiError(e).message);
    } finally {
      setBusy(null);
    }
  };

  const reassign = shipment?.status === 'ASSIGNED';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{reassign ? 'Reassign' : 'Assign'} {shipment?.trackingId}</DialogTitle>
        <DialogDescription>{shipment?.from} → {shipment?.to}. Ranked by duty status, spare capacity and distance to the pickup.</DialogDescription>
        <Button
          className="mt-5 w-full"
          onClick={() => run('auto', () => api.post(`/admin/shipments/${shipment.id}/auto-assign`), (d) => `Auto-assigned to ${d.driver.name}`)}
          disabled={!!busy}
        >
          {busy === 'auto' ? <Loader2 className="animate-spin" /> : <Sparkles />} Auto-assign nearest available
        </Button>
        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
          {!list && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          {list?.length === 0 && <p className="py-6 text-center text-sm text-muted">No active drivers. Add one on the Drivers page.</p>}
          {list?.map((c) => {
            const disabled = !!busy || c.isCurrent;
            return (
              <div key={c.driverId} className={cn('flex items-center gap-3 rounded-xl border p-3', c.isOnDuty && c.fits ? 'border-border' : 'border-dashed border-border opacity-80')}>
                <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', c.isOnDuty ? 'bg-navy-900 text-white' : 'bg-ink/10 text-muted')}><Truck className="h-4 w-4" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.name} {c.isCurrent && <span className="font-normal text-muted">(current)</span>}</p>
                  <p className="flex flex-wrap gap-x-2 text-xs text-muted">
                    <span>{c.isOnDuty ? 'On duty' : 'Off duty'}</span>·
                    <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" aria-hidden />{c.distanceKm == null ? 'no location' : `${c.distanceKm} km`}</span>·
                    <span>{c.activeShipments} active</span>·
                    <span className={c.fits ? '' : 'font-medium text-status-failed'}>{c.capacityLeftKg} kg free</span>
                  </p>
                </div>
                <Button size="sm" variant={c.isOnDuty && c.fits ? 'default' : 'outline'} disabled={disabled} aria-label={`${reassign ? 'Move' : 'Assign'} to ${c.name}`}
                  onClick={() => run(c.driverId, () => api.patch(`/admin/shipments/${shipment.id}/assign`, { driverId: c.driverId }), () => `${reassign ? 'Reassigned' : 'Assigned'} to ${c.name}`)}>
                  {busy === c.driverId && <Loader2 className="animate-spin" />} {reassign ? 'Move here' : 'Assign'}
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
