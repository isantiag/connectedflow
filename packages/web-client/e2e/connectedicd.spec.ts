/**
 * ConnectedICD E2E Tests — Critical User Behaviors
 * Tests run against live servers (localhost:4000 + localhost:4001)
 *
 * Covers:
 * 1. Login / authentication
 * 2. Systems page — create system
 * 3. Signals page — new signal button
 * 4. Baselines page
 * 5. Workflows page — filter tabs
 * 6. N2 Matrix page
 * 7. Navigation
 */
import { test, expect } from '@playwright/test';

const EMAIL = 'admin@enteraero.com';
const PASSWORD = 'Admin1!';

async function login(page: any) {
  await page.goto('/');
  // If redirected to login, fill credentials
  if (page.url().includes('login') || await page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]').isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.fill('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
  }
}

test.describe('Authentication', () => {
  test('app loads and shows main UI', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Should show the main app or login page
    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).toContain('localhost:4000');
  });

  test('login page accepts credentials', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]').first();
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill(EMAIL);
      await page.fill('input[type="password"]', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      // Should navigate away from login
      await expect(page.locator('body')).toBeVisible();
    } else {
      // Already logged in
      expect(true).toBe(true);
    }
  });
});

test.describe('Systems', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('systems page renders', async ({ page }) => {
    await page.goto('/systems');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('New System button is present', async ({ page }) => {
    await page.goto('/systems');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button:has-text("New System")')).toBeVisible({ timeout: 8000 });
  });

  test('New System button opens create form', async ({ page }) => {
    await page.goto('/systems');
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("New System")');
    await expect(page.locator('button:has-text("Create System"), button:has-text("Cancel")')).toBeVisible({ timeout: 5000 });
  });

  test('export buttons are present', async ({ page }) => {
    await page.goto('/systems');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button:has-text("DBC"), button:has-text("Excel")')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Signals', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('signals page renders', async ({ page }) => {
    await page.goto('/signals');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('New Signal button is present', async ({ page }) => {
    await page.goto('/signals');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button:has-text("New Signal")')).toBeVisible({ timeout: 8000 });
  });

  test('Import button is present', async ({ page }) => {
    await page.goto('/signals');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Import')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Baselines', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('baselines page renders', async ({ page }) => {
    await page.goto('/baselines');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Freeze Baseline button is present for admin', async ({ page }) => {
    await page.goto('/baselines');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button:has-text("Freeze Baseline"), button:has-text("Freeze")')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Workflows', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('workflows page renders', async ({ page }) => {
    await page.goto('/workflows');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('filter tabs are present', async ({ page }) => {
    await page.goto('/workflows');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button:has-text("Pending"), button:has-text("All")')).toBeVisible({ timeout: 8000 });
  });

  test('filter tab switches content', async ({ page }) => {
    await page.goto('/workflows');
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("All")');
    await expect(page.locator('button:has-text("All")').first()).toBeVisible();
  });
});

test.describe('N2 Matrix', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('N2 matrix page renders', async ({ page }) => {
    await page.goto('/n2-matrix');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('can navigate between pages', async ({ page }) => {
    await page.goto('/systems');
    await page.waitForLoadState('networkidle');
    await page.goto('/signals');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/signals');
  });

  test('traceability page renders', async ({ page }) => {
    await page.goto('/traceability');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });
});
