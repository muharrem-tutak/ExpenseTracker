// Run with Node.js and Playwright installed. Uses an isolated browser session.
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = 'http://localhost:5011';
function sql(id, condition, count) {
  const query = `SET NOCOUNT ON; SELECT COUNT(*) FROM dbo.Expenses WHERE Id=${Number(id)} ${condition};`;
  const result = execFileSync('sqlcmd', ['-S', '(localdb)\\MSSQLLocalDB', '-E', '-d', 'ExpenseTrackerPortfolio', '-b', '-h', '-1', '-W', '-Q', query], { encoding: 'utf8' });
  assert.equal(Number(result.trim()), count);
  console.log(`SQL verified: id=${id}, rows=${count}`);
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let id;
  try {
    await page.goto(base);
    await page.locator('#loading').waitFor({ state: 'hidden' });
    await page.locator('#save-button').waitFor({ state: 'visible' });
    const originalCount = Number(await page.locator('#total-count').textContent());
    await page.locator('#title').fill('Browser E2E market');
    await page.locator('#category').fill('Gıda');
    await page.locator('#amount').fill('125.75');
    await page.locator('#date').fill('2026-10-01');
    const created = page.waitForResponse(r => r.url().endsWith('/api/expenses') && r.request().method() === 'POST');
    await page.locator('#save-button').click();
    const post = await created;
    assert.equal(post.status(), 201);
    id = (await post.json()).id;
    await page.waitForFunction(n => Number(document.querySelector('#total-count').textContent) === n, originalCount + 1);
    let row = page.locator('tbody tr').filter({ hasText: 'Browser E2E market' });
    assert.equal(await row.count(), 1);
    sql(id, "AND Title=N'Browser E2E market' AND Amount=125.75 AND Category=N'Gıda' AND Date='2026-10-01'", 1);
    await page.reload();
    await page.locator('#loading').waitFor({ state: 'hidden' });
    row = page.locator('tbody tr').filter({ hasText: 'Browser E2E market' });
    assert.equal(await row.count(), 1);
    await row.getByRole('button', { name: /Düzenle/ }).click();
    await page.locator('#title').fill('Browser E2E updated');
    await page.locator('#amount').fill('200.50');
    const updated = page.waitForResponse(r => r.request().method() === 'PUT');
    await page.locator('#save-button').click();
    assert.equal((await updated).status(), 204);
    await page.locator('tbody tr').filter({ hasText: 'Browser E2E updated' }).waitFor();
    sql(id, "AND Title=N'Browser E2E updated' AND Amount=200.50", 1);
    const rows = await (await page.request.get(`${base}/api/expenses`)).json();
    const expectedTotal = rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100;
    assert.equal(await page.locator('#total-amount').textContent(), new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(expectedTotal));
    fs.mkdirSync('TestResults', { recursive: true });
    await page.screenshot({ path: 'TestResults/frontend-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: 'TestResults/frontend-mobile.png', fullPage: true });
    row = page.locator('tbody tr').filter({ hasText: 'Browser E2E updated' });
    await row.getByRole('button', { name: /Sil/ }).click();
    await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
    assert.equal(await row.count(), 1);
    await row.getByRole('button', { name: /Sil/ }).click();
    const deleted = page.waitForResponse(r => r.request().method() === 'DELETE');
    await page.getByRole('button', { name: 'Harcamayı sil', exact: true }).click();
    assert.equal((await deleted).status(), 204);
    await row.waitFor({ state: 'detached' });
    await page.waitForFunction(n => Number(document.querySelector('#total-count').textContent) === n, originalCount);
    sql(id, '', 0);
    id = null;
    assert.equal((await page.request.get(`${base}/swagger/v1/swagger.json`)).status(), 200);
    // HTML validation blocks invalid amounts before any request is sent.
    await page.locator('#title').fill('Invalid amount');
    await page.locator('#category').fill('Test');
    await page.locator('#amount').fill('-1');
    assert.equal(await page.locator('#amount').evaluate(input => input.checkValidity()), false);
    assert.deepEqual(errors, []);
    console.log('PASS: browser CRUD, reload persistence, SQL insert/update/delete, totals, mobile layout, delete cancel, validation and Swagger.');
  } finally {
    if (id) await page.request.delete(`${base}/api/expenses/${id}`);
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
