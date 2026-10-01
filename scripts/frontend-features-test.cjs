const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const money = value => new Intl.NumberFormat('tr-TR', { style:'currency', currency:'TRY' }).format(value);
(async () => {
  const browser = await chromium.launch({ channel:'msedge', headless:true });
  const page = await browser.newPage({ viewport:{ width:1440, height:1100 } });
  const ids = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('http://localhost:5011');
    await page.locator('#loading').waitFor({state:'hidden'});
    // Invalid forms must show Turkish inline errors without sending a POST.
    let posts = 0;
    page.on('request', r => { if(r.method()==='POST') posts++; });
    await page.locator('#save-button').click();
    assert.equal(await page.locator('.field-error').count(),3);
    assert.match(await page.locator('#title-error').textContent(), /Lütfen bir başlık/);
    assert.equal(posts,0);
    const fixtures = [
      {title:'Summary older',category:'E2E Food',amount:100,date:'2026-08-01'},
      {title:'Summary newer',category:'E2E Travel',amount:50,date:'2026-08-20'},
      {title:'Summary next month',category:'E2E Food',amount:25,date:'2026-09-01'}
    ];
    const before = await (await page.request.get('http://localhost:5011/api/expenses')).json();
    for(const fixture of fixtures) {
      for(const [name,value] of Object.entries(fixture)) await page.locator(`#${name}`).fill(String(value));
      const wait = page.waitForResponse(r => r.request().method()==='POST');
      await page.locator('#save-button').click();
      const response = await wait;
      assert.equal(response.status(),201);
      ids.push((await response.json()).id);
      await page.waitForFunction(n => Number(document.querySelector('#total-count').textContent)===n, before.length+ids.length);
    }
    await page.locator('#summary-month').fill('2026-08');
    const augustBase = before.filter(r=>r.date.startsWith('2026-08')).reduce((s,r)=>s+Math.round(r.amount*100),0)/100;
    assert.equal(await page.locator('#monthly-total').textContent(), money(augustBase+150));
    assert.match(await page.locator('.chart-row').filter({hasText:'E2E Food'}).textContent(), /100,00/);
    assert.match(await page.locator('.chart-row').filter({hasText:'E2E Travel'}).textContent(), /50,00/);
    if(!augustBase) assert.match(await page.locator('.chart-row').filter({hasText:'E2E Food'}).textContent(), /66,7/);
    await page.locator('#category-filter').selectOption('E2E Food');
    assert.equal(await page.locator('#expense-list tr').count(),2);
    assert.equal(await page.locator('#monthly-total').textContent(),money(augustBase+150));
    await page.locator('#date-sort').selectOption('asc');
    assert.match(await page.locator('#expense-list tr').first().textContent(), /Summary older/);
    await page.locator('#date-sort').selectOption('desc');
    assert.match(await page.locator('#expense-list tr').first().textContent(), /Summary next month/);
    const row = page.locator('#expense-list tr').filter({hasText:'Summary older'});
    await row.getByRole('button',{name:/Düzenle/}).click();
    assert.equal(await page.locator('#edit-dialog').isVisible(),true);
    await page.locator('#title').fill('Should not persist');
    await page.locator('#cancel-edit').click();
    assert.equal(await page.locator('#edit-dialog').isVisible(),false);
    const stored = await (await page.request.get(`http://localhost:5011/api/expenses/${ids[0]}`)).json();
    assert.equal(stored.title,'Summary older');
    await page.locator('#category-filter').selectOption('');
    await page.screenshot({path:'TestResults/frontend-enhanced-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:'TestResults/frontend-enhanced-mobile.png',fullPage:true});
    await row.getByRole('button',{name:/Düzenle/}).click();
    assert.equal(await page.evaluate(()=>document.querySelector('#edit-dialog').getBoundingClientRect().right<=innerWidth),true);
    await page.screenshot({path:'TestResults/frontend-edit-modal.png',fullPage:true});
    await page.keyboard.press('Escape');
    await page.locator('#summary-month').fill('1900-01');
    assert.equal(await page.locator('#monthly-total').textContent(),money(0));
    assert.equal(await page.locator('#chart-empty').isVisible(),true);
    // Keep a selected category after its last row is removed to test filter-empty.
    await page.locator('#category-filter').selectOption('E2E Travel');
    await page.request.delete(`http://localhost:5011/api/expenses/${ids[1]}`);
    await page.locator('#refresh').click();
    await page.locator('#filter-empty').waitFor({state:'visible'});
    assert.equal(await page.locator('#table-wrap').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: category filter, date sorting, monthly totals, category chart shares, friendly validation, edit cancel/Escape, mobile layout and empty chart/filter states.');
  } finally {
    for(const id of ids) await page.request.delete(`http://localhost:5011/api/expenses/${id}`);
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
