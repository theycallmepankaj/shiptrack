import { expect, test } from '@playwright/test';
import { apiAs, bookPaid, driverId, loginAs } from './helpers.js';

async function swipe(page) {
  const handle = page.getByRole('button', { name: /Swipe right/ });
  const box = await handle.boundingBox();
  const track = await handle.locator('..').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + (track.width * i) / 12, box.y + box.height / 2);
  await page.mouse.up();
}

test.use({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 12.9716, longitude: 77.6412 }, permissions: ['geolocation'] });

test('driver picks up and delivers with the code, photo and signature', async ({ page, browser, request }) => {
  const admin = await apiAs(request, 'admin');
  const shipment = await bookPaid(request);
  await admin.patch(`/admin/shipments/${shipment.id}/assign`, { driverId: await driverId(admin) });
  const driver = await apiAs(request, 'driver');
  await driver.patch('/driver/duty', { isOnDuty: true, lat: 12.9716, lng: 77.6412 });

  await loginAs(page, 'driver');
  await page.goto(`/driver/shipments/${shipment.id}`);
  const status = page.locator('h1.font-mono + span');
  await expect(status).toHaveText('Assigned');
  await swipe(page);
  await expect(status).toHaveText('Picked up');
  await page.getByRole('button', { name: /Swipe right/ }).focus();
  await page.keyboard.press('Enter'); // keyboard alternative to swiping
  await expect(status).toHaveText('In transit');
  await swipe(page);
  await expect(status).toHaveText('Out for delivery');

  // The customer sees the handover code.
  const customerPage = await (await browser.newContext()).newPage();
  await loginAs(customerPage, 'customer');
  await customerPage.goto(`/app/shipments/${shipment.id}`);
  const code = (await customerPage.getByLabel(/Delivery code/).getAttribute('aria-label')).replace(/\D/g, '');
  expect(code).toMatch(/^\d{4}$/);

  await page.getByRole('button', { name: /Deliver — enter code/ }).click();
  await page.getByLabel('Digit 1 of 4').fill(code === '0000' ? '1111' : '0000');
  await page.getByRole('tab', { name: /Signature/ }).click();
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + 30, box.y + 100);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) await page.mouse.move(box.x + 30 + i * 12, box.y + 100 - Math.sin(i / 2) * 30);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Confirm delivery' }).click();
  await expect(page.getByText(/Wrong code — 4 tries left/)).toBeVisible();

  await page.getByRole('tab', { name: /Photo/ }).click();
  // A real (small) photo, drawn in the page.
  const png = Buffer.from(
    (await page.evaluate(() => {
      const c = Object.assign(document.createElement('canvas'), { width: 320, height: 240 });
      const x = c.getContext('2d');
      x.fillStyle = '#c8803c';
      x.fillRect(0, 0, 320, 240);
      x.fillStyle = '#7a4a1e';
      x.fillRect(110, 60, 100, 120);
      return c.toDataURL('image/png');
    })).split(',')[1],
    'base64',
  );
  await page.locator('input[type=file]').setInputFiles({ name: 'parcel.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByAltText('Parcel at delivery')).toBeVisible();
  await page.getByLabel('Digit 1 of 4').fill(code);
  await page.getByRole('button', { name: 'Confirm delivery' }).click();
  await expect(page.getByRole('heading', { name: 'Delivered!' })).toBeVisible();

  await customerPage.reload();
  await expect(customerPage.getByText('Delivered').first()).toBeVisible();
  await expect(customerPage.getByRole('img', { name: /photo/i }).first()).toBeVisible();
});
