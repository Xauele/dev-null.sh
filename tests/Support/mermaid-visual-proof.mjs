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
    const mermaidRequests = [];
    const externalImageRequests = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    page.on('request', (request) => {
        if (/mermaid\.core|mermaid-renderer/i.test(request.url())) {
            mermaidRequests.push(request.url());
        }
        if (request.url().includes('mermaid-egress.invalid')) {
            externalImageRequests.push(request.url());
        }
    });

    await page.goto('http://127.0.0.1:8000/log/latest', { waitUntil: 'domcontentloaded' });
    assert.equal(mermaidRequests.length, 0, 'Ordinary folded feed must not load Mermaid runtime');
    console.log('Feed first 500 chars:', (await page.locator('body').innerText()).slice(0, 500));
    const showMore = page.getByRole('button', { name: 'Show more' }).first();
    if (await showMore.count()) {
        await showMore.click();
    }
    const joinDismiss = page.locator('[data-test="guest-join-sheet-dismiss"]');
    if (width < 700 && await joinDismiss.isVisible()) {
        await joinDismiss.click();
    }

    const diagram = page.locator('[data-test="mermaid-diagram"]').first();
    await diagram.waitFor({ timeout: 30000 });
    await diagram.locator('img').waitFor({ timeout: 30000 });
    const image = diagram.locator('img');

    assert.ok((await image.getAttribute('src')).startsWith('blob:'), 'SVG must be inert img blob');
    assert.equal(await image.evaluate((element) => element.complete && element.naturalWidth > 0), true, 'SVG image must load');
    assert.ok(mermaidRequests.length > 0, 'Mermaid runtime must be loaded only after unfolding the diagram');
    assert.deepEqual(consoleErrors, [], 'No page runtime errors');

    const svg = await image.evaluate(async (element) =>
        (await fetch(element.src)).text(),
    );
    assert.match(svg, /#(?:7aa2f7|3b6fe0)/i, 'Diagram should use the dev-null primary blue');
    assert.match(svg, /font-family:system-ui/i, 'Diagram must use an image-safe font to prevent clipped labels');
    assert.doesNotMatch(svg, /\.node\.default polygon/, 'No broad polygon tint for diamonds and hexagons');
    assert.match(svg, /Release check/, 'Graph must include the hexagon');
    assert.ok((svg.match(/<polygon\b/gi) ?? []).length >= 2, 'Both diamond and hexagon must be drawn');

    const viewport = diagram.getByRole('region', { name: 'Diagram viewport' });
    if (width < 700) {
        const dimensions = await viewport.evaluate((element) => ({
            viewport: element.clientWidth,
            content: element.scrollWidth,
            image: element.querySelector('img').getBoundingClientRect().width,
        }));
        assert.ok(dimensions.image >= 580, 'Wide diagrams must not shrink below legible mobile width');
        assert.ok(dimensions.content > dimensions.viewport + 100, 'Wide diagrams must scroll horizontally');
        assert.ok(await diagram.getByText('Scroll to explore').isVisible());
    }

    const suffix = width < 700 ? 'mobile' : 'desktop';
    await page.screenshot({ path: `evidence/mermaid/${suffix}-${mode}.png`, fullPage: true, animations: 'disabled' });
    if (width < 700) {
        await viewport.evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
        });
        await page.screenshot({ path: `evidence/mermaid/mobile-${mode}-pan.png`, fullPage: true, animations: 'disabled' });
    }
    await diagram.getByRole('button', { name: 'Show source' }).click();
    await diagram.locator('pre').waitFor();
    assert.match(await diagram.locator('pre').textContent(), /flowchart LR/);
    assert.equal(await diagram.locator('script').count(), 0);
    await page.screenshot({ path: `evidence/mermaid/${suffix}-${mode}-source.png`, fullPage: true, animations: 'disabled' });
    await diagram.getByRole('button', { name: 'Show diagram' }).click();
    await diagram.getByRole('button', { name: 'Zoom in' }).click();
    assert.equal(await diagram.locator('span.tabular-nums').textContent(), '125%');
    const blocked = page.locator('[data-test="mermaid-diagram"]').nth(1);
    await blocked.scrollIntoViewIfNeeded();
    await blocked.locator('pre').waitFor({ timeout: 30000 });
    assert.match((await blocked.locator('pre').textContent()) ?? '', /img:/);
    assert.deepEqual(externalImageRequests, [], 'Untrusted image node must not cause an external request');
    console.log(`${suffix} ${mode}: SVG image, source fallback, no image egress, zoom, and screenshots PASS`);
    await context.close();
}

try {
    await capture('dark', 1440, 900);
    await capture('light', 1440, 900);
    await capture('dark', 390, 844);
    await capture('light', 390, 844);
    console.log('All live-rendered Mermaid visual checks passed');
} finally {
    await browser.close();
}
