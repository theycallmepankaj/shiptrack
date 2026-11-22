import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { horizontalOverflow, loginAs } from './helpers.js';

// §11.6 quality bar: WCAG AA (automated subset) and no sideways scrolling at 360 px.

// Entrance animations fade text in; scan once they've finished so mid-fade frames don't count.
const settle = async (page) => {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
};
const axe = (page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.leaflet-container') // third-party map tiles
    .exclude('[data-logotype]') // brand wordmark: exempt from WCAG 1.4.3
    .analyze();
// Each failure names the rule, the element and (for contrast) the colours, so CI logs are actionable.
const serious = (r) =>
  r.violations
    .filter((v) => ['serious', 'critical'].includes(v.impact))
    .flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')} — ${(n.any[0]?.message ?? v.help).replace(/\s+/g, ' ').slice(0, 160)}`));

for (const scheme of ['light', 'dark']) {
  test(`public pages pass axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    for (const path of ['/', '/login', '/register', '/track']) {
      await page.goto(path);
      await settle(page);
      expect(serious(await axe(page)), path).toEqual([]);
    }
  });
}

test('signed-in pages pass axe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loginAs(page, 'customer');
  for (const path of ['/app', '/app/shipments', '/app/book', '/app/notifications']) {
    await page.goto(path);
    await settle(page);
    expect(serious(await axe(page)), path).toEqual([]);
  }
});

test('key pages fit a 360 px phone', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
  for (const path of ['/', '/login', '/track']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await horizontalOverflow(page), path).toBeLessThanOrEqual(0);
  }
  for (const [role, paths] of [['customer', ['/app', '/app/shipments', '/app/book', '/app/notifications']], ['driver', ['/driver', '/driver/history']], ['admin', ['/admin', '/admin/shipments', '/admin/documents']]]) {
    await loginAs(page, role);
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await horizontalOverflow(page), path).toBeLessThanOrEqual(0);
    }
    await page.context().clearCookies();
  }
});
