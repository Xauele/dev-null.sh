import assert from 'node:assert/strict';
import { test } from 'vite-plus/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CodeBlock } from '../../resources/js/components/code-block';
import { CodeDeltaView } from '../../resources/js/components/code-delta-view';

const parentId = '019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5b';
const parentBody = 'Example\n```php\nreturn 1;\n```';
const replyBody = 'Patch for e3f4a5b · block 1\n\n```php\nreturn 2;\n```';

void test('valid code delta has an accessible comparison toggle, collapsed by default', () => {
    const html = renderToStaticMarkup(createElement(CodeDeltaView, {
        parentId, parentBody, replyParentId: parentId, replyBody,
    }));
    assert.match(html, /data-test="code-delta-toggle"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /View changes/);
    assert.doesNotMatch(html, /data-test="code-delta-comparison"/);
});

void test('unrelated parent never produces a comparison', () => {
    const html = renderToStaticMarkup(createElement(CodeDeltaView, {
        parentId, parentBody, replyParentId: 'another-parent', replyBody,
    }));
    assert.equal(html, '');
});

void test('ordinary prose and a malformed patch remain ordinary replies', () => {
    const html = renderToStaticMarkup(createElement(CodeDeltaView, {
        parentId, parentBody, replyParentId: parentId, replyBody: 'just ordinary text',
    }));
    assert.equal(html, '');
});

void test('unchanged proposed code is not presented as a change', () => {
    const html = renderToStaticMarkup(createElement(CodeDeltaView, {
        parentId, parentBody, replyParentId: parentId,
        replyBody: 'Patch for e3f4a5b · block 1\n\n```php\nreturn 1;\n```',
    }));
    assert.equal(html, '');
});

void test('eligible code block offers a named Suggest control', () => {
    const html = renderToStaticMarkup(createElement(CodeBlock, {
        html: 'return 1;', language: 'php', onSuggest: () => undefined,
    }));
    assert.match(html, /aria-label="Suggest edit to this code block"/);
    assert.match(html, /data-test="suggest-code-edit"/);
});

void test('non-interactive code does not offer Suggest', () => {
    const html = renderToStaticMarkup(createElement(CodeBlock, {
        html: 'return 1;', language: 'php', isCopyable: false, onSuggest: () => undefined,
    }));
    assert.doesNotMatch(html, /data-test="suggest-code-edit"/);
});

void test('server-escaped code HTML is not reinterpreted as executable markup by the comparison', () => {
    const html = renderToStaticMarkup(createElement(CodeDeltaView, {
        parentId, parentBody, replyParentId: parentId,
        replyBody: 'Patch for e3f4a5b · block 1\n\n```php\n&lt;script&gt;alert(1)&lt;/script&gt;\n```',
    }));
    assert.doesNotMatch(html, /<script>/);
});
