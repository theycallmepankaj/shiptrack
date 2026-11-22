import { expect } from '@playwright/test';

export const API = process.env.E2E_API_URL ?? 'http://localhost:5000';
export const ACCOUNTS = {
  admin: ['admin@shiptrack.dev', 'Admin@123'],
  driver: ['driver1@shiptrack.dev', 'Driver@123'],
  customer: ['customer@shiptrack.dev', 'Customer@123'],
};
export const BOOKING = {
  pickup: { address: '100 Feet Road, Indiranagar', city: 'Bengaluru', lat: 12.9719, lng: 77.6412, contactName: 'Chetan Customer', contactPhone: '+91 90000 00003' },
  drop: { address: '5th Block, Koramangala', city: 'Bengaluru', lat: 12.9352, lng: 77.6245, contactName: 'Ben Thomas', contactPhone: '+91 99887 66554' },
  package: { weightKg: 2, type: 'parcel' },
  speed: 'standard',
};
// Geocoder answers for the booking form, so tests don't depend on Nominatim.
export const PLACES = {
  indiranagar: [{ label: '100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038, India', city: 'Bengaluru', lat: 12.9719, lng: 77.6412 }],
  koramangala: [{ label: '5th Block, Koramangala, Bengaluru, Karnataka 560095, India', city: 'Bengaluru', lat: 12.9352, lng: 77.6245 }],
};

/** Thin JSON client for arranging test data through the real API. */
export async function apiAs(request, role) {
  const [email, password] = ACCOUNTS[role];
  const res = await request.post(`${API}/api/auth/login`, { data: { email, password } });
  expect(res.ok(), `login ${role}`).toBeTruthy();
  const { accessToken } = await res.json();
  const call = async (method, path, data) => {
    const r = await request.fetch(`${API}/api${path}`, { method, data, headers: { Authorization: `Bearer ${accessToken}` } });
    const body = r.headers()['content-type']?.includes('json') ? await r.json() : null;
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${body?.error ?? ''}`);
    return body;
  };
  return { token: accessToken, get: (p) => call('GET', p), post: (p, d) => call('POST', p, d ?? {}), patch: (p, d) => call('PATCH', p, d ?? {}) };
}

/** Books a shipment as the demo customer and pays it through the (mock) checkout API. */
export async function bookPaid(request, overrides = {}) {
  const customer = await apiAs(request, 'customer');
  const { shipment } = await customer.post('/shipments', { ...BOOKING, ...overrides });
  const { order } = await customer.post('/payments/create-order', { shipmentId: shipment.id });
  const paid = await customer.post('/payments/verify', { shipmentId: shipment.id, orderId: order.orderId, paymentId: `pay_mock_${Date.now().toString(36)}`, signature: 'mock', method: 'upi' });
  return paid.shipment;
}

export async function driverId(admin) {
  const { drivers } = await admin.get('/admin/drivers?q=driver1%40');
  return drivers[0].id;
}

/** Logs in through the login page's demo-account buttons. */
export async function loginAs(page, role) {
  await page.goto('/login');
  await page.getByRole('button', { name: role[0].toUpperCase() + role.slice(1), exact: true }).click();
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(role === 'customer' ? /\/app$/ : new RegExp(`/${role}$`));
}

export const horizontalOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
