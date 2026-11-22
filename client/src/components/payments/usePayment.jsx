import { useCallback, useState } from 'react';
import { api, parseApiError } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { MockCheckout } from './MockCheckout';

const CHECKOUT_JS = 'https://checkout.razorpay.com/v1/checkout.js';
let scriptPromise = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CHECKOUT_JS;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Couldn’t load the payment window. Check your connection and try again.'));
    };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Pays for a booked shipment (FR-13): server order → checkout → server-side signature check.
 * Razorpay's checkout in test mode, or — without keys, in development — a built-in test dialog.
 * `pay(shipment)` resolves to { status: 'paid' | 'failed' | 'dismissed', shipment?, error? }.
 * Render `ui` somewhere in the page (it holds the test dialog).
 */
export function usePayment() {
  const { user } = useAuth();
  const [mock, setMock] = useState(null); // { order, shipment, resolve }
  const [busy, setBusy] = useState(false);

  const verify = (shipment, order, paymentId, signature, method) =>
    api.post('/payments/verify', { shipmentId: shipment.id, orderId: order.orderId, paymentId, signature, method }).then(({ data }) => data.shipment);
  const reportFailure = (shipment, order, reason) => api.post('/payments/failed', { shipmentId: shipment.id, orderId: order.orderId, reason }).catch(() => {});

  const pay = useCallback(
    async (shipment) => {
      setBusy(true);
      let order;
      try {
        order = (await api.post('/payments/create-order', { shipmentId: shipment.id })).data.order;
      } catch (err) {
        setBusy(false);
        return { status: 'failed', error: parseApiError(err).message };
      }
      if (order.provider === 'mock') {
        setBusy(false);
        return new Promise((resolve) => setMock({ order, shipment, resolve }));
      }
      try {
        await loadRazorpay();
      } catch (err) {
        setBusy(false);
        return { status: 'failed', error: err.message };
      }
      return new Promise((resolve) => {
        let settled = false;
        const done = (r) => {
          if (settled) return;
          settled = true;
          setBusy(false);
          resolve(r);
        };
        const rzp = new window.Razorpay({
          key: order.keyId,
          amount: Math.round(order.amount * 100),
          currency: order.currency,
          order_id: order.orderId,
          name: 'ShipTrack',
          description: `Shipment ${order.trackingId}`,
          prefill: { name: user?.name, email: user?.email, contact: user?.phone },
          theme: { color: '#FF6B2C' },
          handler: async (r) => {
            try {
              done({ status: 'paid', shipment: await verify(shipment, order, r.razorpay_payment_id, r.razorpay_signature) });
            } catch (err) {
              done({ status: 'failed', error: parseApiError(err).message });
            }
          },
          modal: { ondismiss: () => done({ status: 'dismissed' }) },
        });
        rzp.on('payment.failed', (r) => {
          const reason = r?.error?.description ?? 'Payment failed';
          reportFailure(shipment, order, reason);
          done({ status: 'failed', error: reason });
        });
        rzp.open();
      });
    },
    [user],
  );

  const ui = mock && (
    <MockCheckout
      order={mock.order}
      onPay={async (method) => {
        try {
          const paid = await verify(mock.shipment, mock.order, `pay_mock_${Date.now().toString(36)}`, 'mock', method);
          mock.resolve({ status: 'paid', shipment: paid });
        } catch (err) {
          mock.resolve({ status: 'failed', error: parseApiError(err).message });
        }
        setMock(null);
      }}
      onFail={async () => {
        await reportFailure(mock.shipment, mock.order, 'Card declined (test)');
        mock.resolve({ status: 'failed', error: 'Your card was declined (test). Try again.' });
        setMock(null);
      }}
      onClose={() => {
        mock.resolve({ status: 'dismissed' });
        setMock(null);
      }}
    />
  );

  return { pay, busy, ui };
}
