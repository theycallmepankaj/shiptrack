import { expect, test } from '@playwright/test';
import { apiAs } from './helpers.js';

// Needs the Python AI service (E2E_AI_URL); skipped otherwise.
test('the chatbot answers a policy question with sources and tracks a parcel', async ({ page, request }) => {
  const admin = await apiAs(request, 'admin');
  const { assistant } = await admin.get('/admin/chat/overview');
  test.skip(!assistant, 'AI service not running');
  await expect.poll(async () => (await admin.get('/admin/documents')).documents.filter((d) => d.status === 'ready').length, { timeout: 60_000 }).toBeGreaterThan(0);

  const customer = await apiAs(request, 'customer');
  const { items } = await customer.get('/shipments/mine?status=all');
  await page.goto(`/track/${items[0].trackingId}`);
  await page.getByRole('button', { name: 'Chat with the ShipTrack assistant' }).click();
  const chat = page.getByRole('dialog', { name: /ShipTrack assistant/ });
  await chat.getByRole('button', { name: 'What can’t I ship?' }).click();
  await expect(chat.getByRole('list', { name: 'Sources' }).first()).toContainText(/Prohibited/);
  // Suggestion chips only show on an empty chat, so type the follow-up.
  await chat.getByLabel('Message', { exact: true }).fill(`Where is ${items[0].trackingId}?`);
  await chat.getByLabel('Message', { exact: true }).press('Enter');
  await expect(chat.getByText(/Log in as the sender/)).toBeVisible({ timeout: 30_000 });
});
