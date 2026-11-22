import { expect, test } from '@playwright/test';
import { apiAs, bookPaid, driverId, loginAs } from './helpers.js';

test('the bell updates live and notifications can be read', async ({ page, request }) => {
  await loginAs(page, 'customer');
  await page.goto('/app/notifications');
  await page.getByRole('button', { name: 'Mark all read' }).click().catch(() => {});
  await expect(page.getByRole('button', { name: /^Notifications$/ })).toBeVisible();

  const admin = await apiAs(request, 'admin');
  const shipment = await bookPaid(request);
  await admin.patch(`/admin/shipments/${shipment.id}/assign`, { driverId: await driverId(admin) });

  // Payment + assignment arrive over the socket without a reload.
  const bell = page.getByRole('button', { name: /Notifications, 2 unread/ });
  await expect(bell).toBeVisible();
  await bell.click();
  await page.getByRole('menuitem', { name: new RegExp(`Driver assigned.*${shipment.trackingId}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/app/shipments/${shipment.id}$`));
  await expect(page.getByRole('button', { name: /Notifications, 1 unread/ })).toBeVisible();

  await page.goto('/app/notifications');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByRole('button', { name: /^Notifications$/ })).toBeVisible();
});
