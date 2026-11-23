import { expect, test } from '@playwright/test';
import { loginAs } from './helpers.js';

test('the public pricing page shows live rates and a calculator with areas', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'Pricing' }).first().click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole('heading', { level: 1, name: /pricing/i })).toBeVisible();
  await expect(page.getByText('Base fare').first()).toBeVisible();
  const from = page.getByLabel('From', { exact: true });
  await from.selectOption({ label: 'Andheri East, Mumbai' });
  await page.getByLabel('To', { exact: true }).selectOption({ label: 'Kothrud, Pune' });
  await expect(page.getByText(/₹\d+/).first()).toBeVisible();
});

test('a user edits their profile and changes their password', async ({ page }) => {
  const email = `profile-${Date.now()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Profile Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone').fill('+91 98765 43210');
  await page.getByLabel('Password', { exact: true }).fill('Tester@1234');
  await page.getByRole('button', { name: /Create account/ }).click();
  await page.waitForURL(/\/app$/);

  await page.goto('/app/profile');
  await page.getByLabel('Name').fill('Profile Renamed');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Profile updated')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Profile Renamed' })).toBeVisible();

  await page.getByLabel('Current password').fill('wrong-pass1');
  await page.getByLabel('New password', { exact: true }).fill('Changed@1234');
  await page.getByLabel('Confirm new password').fill('Changed@1234');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Incorrect password')).toBeVisible();
  await page.getByLabel('Current password').fill('Tester@1234');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();
});

test('an admin adds another admin who can then sign in', async ({ page, browser }) => {
  await loginAs(page, 'admin');
  await page.goto('/admin/team');
  await page.getByRole('button', { name: 'Add admin' }).click();
  const email = `ops-${Date.now()}@shiptrack.dev`;
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill('Ops Admin');
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Phone').fill('+91 90000 00099');
  await dialog.getByLabel('Temporary password', { exact: true }).fill('OpsAdmin@123');
  await dialog.getByRole('button', { name: 'Add admin' }).click();
  await expect(page.getByText(email)).toBeVisible();

  const other = await (await browser.newContext()).newPage();
  await other.goto('/login');
  await other.getByLabel('Email').fill(email);
  await other.getByLabel('Password', { exact: true }).fill('OpsAdmin@123');
  await other.getByRole('button', { name: 'Log in' }).click();
  await other.waitForURL(/\/admin$/);
});
