import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

await mkdir('evidence/mermaid', { recursive: true });

const { execFileSync } = await import('node:child_process');
let chromePath;
try {
    chromePath = execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim();
} catch {
    chromePath = undefined;
}

const browser = await chromium.launch({
    ...(chromePath ? { executablePath: chromePath } : {}),
    headless: true,
    args: ['--no-sandbox'],
});

async function capture(mode, width, height) {
    const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        colorScheme: mode,
    });
    await context.addInitScript((appearance) => {
        localStorage.setItem('appearance', appearance);
        document.cookie = `appearance=${appearance}; path=/`;
    }, mode);

    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto('http://127.0.0.1:8000/log/latest', { waitUntil: 'domcontentloaded' });
    const diagram = page.locator('[data-test="mermaid-diagram"]').first();
    await diagram.waitFor({ timeout: 30000 });
    await diagram.locator('img').waitFor({ timeout: 30000 });
    const image = diagram.locator('img');

    assert.ok((await image.getAttribute('src')).startsWith('blob:'), 'SVG must be inert img blob');
    assert.equal(await image.evaluate((element) => element.complete && element.naturalWidth > 0), true, 'SVG image must load');
    assert.deepEqual(consoleErrors, [], 'No page runtime errors');

    const suffix = width < 700 ? 'mobile' : 'desktop';
    await page.screenshot({ path: `evidence/mermaid/${suffix}-${mode}.png`, fullPage: true, animations: 'disabled' });
    await diagram.getByRole('button', { name: 'Show source' }).click();
    await diagram.locator('pre').waitFor();
    assert.match(await diagram.locator('pre').textContent(), /flowchart LR/);
    assert.equal(await diagram.locator('script').count(), 0);
    await page.screenshot({ path: `evidence/mermaid/${suffix}-${mode}-source.png`, fullPage: true, animations: 'disabled' });
    await diagram.getByRole('button', { name: 'Show diagram' }).click();
    await diagram.getByRole('button', { name: 'Zoom in' }).click();
    assert.equal(await diagram.locator('span.tabular-nums').textContent(), '125%');
    console.log(`${suffix} ${mode}: SVG image, source, safe DOM, zoom, and screenshots PASS`);
    await context.close();
}

try {
    await capture('dark', 1440, 900);
    await capture('light', 1440, 900);
    await capture('dark', 390, 844);
    console.log('All live-rendered Mermaid visual checks passed');
} finally {
    await browser.close();
}
