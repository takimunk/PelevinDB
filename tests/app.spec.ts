import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
async function upload(page: Page, name: string, content: string | Buffer) {
  await page.getByRole('button', { name: 'Загрузить книгу', exact: true }).last().click();
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) });
}
test('sample navigation, filters, segmentation, export, and responsive layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Эмоциональный атлас' })).toBeVisible();
  await page.locator('.page-map .tile').nth(11).click();
  await expect(page.locator('.reader-top')).toContainText('012');
  await page.getByRole('button', { name: 'Следующая страница' }).click();
  await expect(page.locator('.reader-top')).toContainText('013');
  await page.locator('.legend').getByRole('button', { name: 'Грусть', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сбросить фильтр ×' })).toBeVisible();
  await page.getByRole('button', { name: 'Treemap', exact: true }).click();
  await expect(page.locator('.treemap')).toBeVisible();
  await page.getByLabel('Разбиение текста').selectOption('paragraphs');
  await expect(page.locator('.reader-top')).toContainText('ФРАГМЕНТ 001');
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON · полный датасет' }).click();
  const file = await downloaded;
  const dataset = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(dataset.book.demo).toBe(true); expect(dataset.segments.length).toBe(1800); expect(dataset.segmentation.mode).toBe('paragraphs');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Загрузить книгу', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('TXT import has no invented scores; blank and unsupported files fail clearly', async ({ page }) => {
  await page.route('/api/status', route => route.fulfill({ json: { configured: false } }));
  await page.goto('/');
  await upload(page, 'journey.txt', 'A calm morning.\n\nA storm is coming.');
  await expect(page.getByRole('heading', { name: 'journey', exact: true })).toBeVisible();
  await expect(page.locator('.reader-text')).toContainText('A calm morning.');
  await expect(page.getByRole('button', { name: 'Анализировать', exact: true })).toBeDisabled();
  await expect(page.locator('.reader-footer')).toContainText('Ожидает анализа');
  await upload(page, 'empty.txt', '   ');
  await expect(page.getByRole('alert')).toContainText('не найден текст');
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('hello') });
  await expect(page.getByRole('alert')).toContainText('Поддерживаются EPUB');
});
test('FB2 extracts metadata and excludes notes', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'book.fb2', '<?xml version="1.0"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>Тестовая книга</book-title><author><first-name>Анна</first-name><last-name>Тестова</last-name></author></title-info></description><body><section><p>Первая история.</p><p>Вторая история.</p></section></body><body name="notes"><p>Скрытая сноска</p></body><binary>secret</binary></FictionBook>');
  await expect(page.getByRole('heading', { name: 'Тестовая книга' })).toBeVisible();
  await expect(page.locator('.book-info')).toContainText('Анна Тестова');
  await expect(page.locator('.reader-text')).toContainText('Первая история.');
  await expect(page.locator('.reader-text')).not.toContainText('Скрытая сноска');
});
test('EPUB follows spine order instead of archive order', async ({ page }) => {
  const zip = new JSZip();
  zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
  zip.file('OPS/book.opf', '<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Spine order</dc:title><dc:creator>Test Writer</dc:creator></metadata><manifest><item id="b" href="second.xhtml"/><item id="a" href="first.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>');
  zip.file('OPS/second.xhtml', '<html><body><p>SECOND chapter</p></body></html>');
  zip.file('OPS/first.xhtml', '<html><body><p>FIRST chapter</p><script>alert("xss")</script></body></html>');
  await page.goto('/'); await upload(page, 'book.epub', await zip.generateAsync({ type: 'nodebuffer' }));
  await expect(page.getByRole('heading', { name: 'Spine order' })).toBeVisible();
  await expect(page.locator('.reader-text')).toHaveText(/FIRST chapter\s+SECOND chapter/);
});
test('analysis supports partial failure and resume without recomputing completed fragments', async ({ page }) => {
  await page.route('/api/status', route => route.fulfill({ json: { configured: true } }));
  let count = 0, fail = true;
  await page.route('/api/analyze', async route => {
    count++;
    if (fail && count === 2) { await new Promise(r => setTimeout(r, 150)); return route.fulfill({ status: 503, json: { error: 'Попробуйте продолжить.' } }); }
    const scores = Object.fromEntries(['joy','trust','fear','surprise','sadness','disgust','anger','anticipation'].map(e => [e, .5]));
    await route.fulfill({ json: { scores, confidence: scores, model: 'test-jev' } });
  });
  await page.goto('/'); await upload(page, 'partial.txt', 'Some story text. '.repeat(220));
  await page.getByRole('button', { name: 'Анализировать', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Попробуйте продолжить.');
  const before = count; fail = false;
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.locator('.data-badge')).toContainText('Анализ завершён');
  expect(count).toBe(before + 1);
});
