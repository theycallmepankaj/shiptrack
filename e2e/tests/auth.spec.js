import { expect, test } from '@playwright/test';
import { loginAs } from './helpers.js';

test('a new customer registers, is signed in, and can log out', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Asha Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone').fill('+91 98765 43210');
  await page.getByLabel('Password', { exact: true }).fill('Tester@1234');
  await page.getByRole('button', { name: /Create account/ }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Asha/ })).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: /Log out/ }).click();
  await page.waitForURL(/\/login|\/$/);
  await page.goto('/app');
  await page.waitForURL(/\/login/);
});

test('roles only reach their own area', async ({ page }) => {
  await loginAs(page, 'customer');
  await page.goto('/admin');
  await expect(page).not.toHaveURL(/\/admin/);
});

test('wrong password shows an error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('customer@shiptrack.dev');
  await page.getByLabel('Password', { exact: true }).fill('nope-nope');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toContainText(/Invalid|incorrect/i);
});
