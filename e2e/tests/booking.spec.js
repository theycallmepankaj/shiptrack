import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { apiAs, BOOKING, loginAs, PLACES } from './helpers.js';

test('customer books, survives a declined payment, pays and downloads the invoice', async ({ page }) => {
  await page.route('**/api/geo/search**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q').toLowerCase();
    route.fulfill({ json: { results: PLACES[q.includes('kora') ? 'koramangala' : 'indiranagar'] } });
  });
  await loginAs(page, 'customer');
  await page.goto('/app/book');
  await page.getByLabel('Pickup address', { exact: true }).fill('Indiranagar');
  await page.getByLabel('Pickup address', { exact: true }).press('Enter');
  await page.getByRole('option').first().click();
  await page.getByLabel('Drop address', { exact: true }).fill('Koramangala');
  await page.getByRole('button', { name: 'Search drop address' }).click();
  await page.getByRole('option').first().click();
  await page.getByLabel('Recipient name').fill('Ben Thomas');
  await page.getByLabel('Recipient phone').fill('+91 99887 66554');
  const quote = page.locator('aside[aria-label="Quote"]');
  await expect(quote.getByText(/₹\d+/).first()).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: /^Pay · ₹/ }).click();
  const checkout = page.getByRole('dialog');
  await expect(checkout.getByText('Test mode — no real money moves')).toBeVisible();
  await checkout.getByRole('button', { name: 'Simulate a declined payment' }).click();
  await expect(page.getByText(/declined \(test\).*is saved/)).toBeVisible();

  await page.getByRole('button', { name: /Try payment again/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Pay ₹/ }).click();
  await expect(page.getByRole('heading', { name: 'Paid & booked!' })).toBeVisible();
  const trackingId = (await page.locator('span.font-mono.text-2xl').textContent()).trim();
  expect(trackingId).toMatch(/^SHP-[A-Z0-9]{6}$/);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Invoice (PDF)' }).click()]);
  expect(download.suggestedFilename()).toBe(`INV-${trackingId.slice(4)}.pdf`);
  expect(readFileSync(await download.path()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('public tracking shows status but no personal details', async ({ page, request }) => {
  const customer = await apiAs(request, 'customer');
  const { shipment } = await customer.post('/shipments', BOOKING);
  await page.goto(`/track/${shipment.trackingId}`);
  await expect(page.getByText(shipment.trackingId, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Booked').first()).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toContain(BOOKING.pickup.address);
  expect(text).not.toContain(BOOKING.drop.contactPhone);
});

test('an unpaid booking can be paid from its page, then cancelled with a refund', async ({ page, request }) => {
  const customer = await apiAs(request, 'customer');
  const { shipment } = await customer.post('/shipments', BOOKING);
  await loginAs(page, 'customer');
  await page.goto(`/app/shipments/${shipment.id}`);
  await expect(page.getByRole('heading', { name: 'Awaiting payment' })).toBeVisible();
  await page.getByRole('button', { name: /^Pay ₹/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Pay ₹/ }).click();
  await expect(page.getByText('Paid · upi')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Awaiting payment' })).toBeHidden();

  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel shipment' }).click();
  await expect(page.getByText(/^Refunded /)).toBeVisible();
});
