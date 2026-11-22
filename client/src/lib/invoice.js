import { api, parseApiError } from '@/api/client';

/** Downloads the invoice PDF (FR-14) with the user's token and saves it. Returns an error message or null. */
export async function downloadInvoice(shipment) {
  try {
    const { data, headers } = await api.get(`/shipments/${shipment.id}/invoice`, { responseType: 'blob' });
    const name = /filename="([^"]+)"/.exec(headers['content-disposition'] ?? '')?.[1] ?? `invoice-${shipment.trackingId}.pdf`;
    const url = URL.createObjectURL(data);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return null;
  } catch (err) {
    // Blob error bodies need decoding to read the API's message.
    if (err?.response?.data instanceof Blob) {
      try {
        return JSON.parse(await err.response.data.text()).error ?? 'Couldn’t download the invoice';
      } catch {
        /* fall through */
      }
    }
    return parseApiError(err).message;
  }
}

export const PAYMENT_LABEL = {
  pending: 'Awaiting payment',
  failed: 'Payment failed',
  paid: 'Paid',
  refunded: 'Refunded',
  cancelled: 'Not charged',
};
