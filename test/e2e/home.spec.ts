import { expect, test } from '@playwright/test';

test('home exposes the core discovery paths', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Useful tools/i })).toBeVisible();
  await expect(page.getByText('Recent', { exact: true })).toBeVisible();
  await expect(page.getByText('Pinned', { exact: true })).toBeVisible();
  await expect(page.getByText('Explore', { exact: true })).toBeVisible();
});
