import { expect, test } from '@playwright/test';
import { apiAs, BOOKING, bookPaid, loginAs } from './helpers.js';

test('admin dashboard loads its numbers and charts', async ({ page }) => {
  await loginAs(page, 'admin');
  await expect(page.getByText('Shipments today')).toBeVisible();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
});

test('admin assigns a paid shipment; unpaid ones wait for payment', async ({ page, request }) => {
  const customer = await apiAs(request, 'customer');
  const { shipment: unpaid } = await customer.post('/shipments', BOOKING);
  const paid = await bookPaid(request);

  await loginAs(page, 'admin');
  await page.goto('/admin/shipments');
  const unpaidRow = page.getByRole('row').filter({ hasText: unpaid.trackingId });
  await expect(unpaidRow.getByText('Unpaid')).toBeVisible();
  await expect(unpaidRow.getByText('Waiting for payment')).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: paid.trackingId });
  await row.getByRole('button', { name: /Assign/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Assign to Ravi Kumar' }).click();
  await expect(row.getByText('Ravi Kumar')).toBeVisible();
});
