import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    codeBlocks,
    eligibleBlock,
    formatCodeDelta,
    resolveCodeDelta,
    shortHash,
    MAX_PATCH_SOURCE,
} from '../../resources/js/lib/code-deltas.ts';
import { compareCodeLines } from '../../resources/js/lib/code-delta-diff.ts';

const PARENT = '019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5b';
const OTHER = '019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5c';
const parentBody = 'Here is a bug:\n```php\n$ids = [0, 7, null];\narray_filter($ids);\n```';
const before = '$ids = [0, 7, null];\narray_filter($ids);';
const after = '$ids = [0, 7, null];\narray_filter($ids, fn ($id) => $id !== null);';
const build = (source = after, note = 'Keep zero IDs.') => formatCodeDelta({
    parentId: PARENT, blockIndex: 1, language: 'PHP', source, note,
});

void test('short hash is the last seven hex characters of a commit UUID', () => {
    assert.equal(shortHash(PARENT), 'e3f4a5b');
});

void test('fenced source extraction handles prose, multiple languages and case', () => {
    assert.deepEqual(codeBlocks('Hello `foo`\n```pHp\nA\n```\nOther\n```sql\nB\n```'), [
        { language: 'php', source: 'A' },
        { language: 'sql', source: 'B' },
    ]);
});

void test('unclosed, inline, plain, and indented fences are not eligible', () => {
    assert.deepEqual(codeBlocks('Hello `php`'), []);
    assert.deepEqual(codeBlocks('```php\nA'), []);
    assert.deepEqual(codeBlocks('    ```php\nA\n    ```'), []);
});

void test('eligible block must exist, be labeled, and be nonempty', () => {
    assert.equal(eligibleBlock(parentBody, 0), null);
    assert.equal(eligibleBlock(parentBody, 2), null);
    assert.equal(eligibleBlock(parentBody, 21), null);
    assert.equal(eligibleBlock('```\nA\n```', 1), null);
    assert.equal(eligibleBlock('```php\n \n```', 1), null);
});

void test('multiple blocks retain their original 1-based index', () => {
    const body = '```php\nA\n```\n```SQL\nselect 1;\n```';
    assert.deepEqual(eligibleBlock(body, 2), { language: 'sql', source: 'select 1;' });
});

void test('does not offer a patch on an oversized block', () => {
    assert.equal(eligibleBlock('```php\n' + 'x'.repeat(MAX_PATCH_SOURCE + 1) + '\n```', 1), null);
});

void test('generates a short, readable normal reply', () => {
    assert.equal(build(), 'Patch for e3f4a5b · block 1\n\nKeep zero IDs.\n\n```php\n' + after + '\n```');
});

void test('a note is optional and can be a single paragraph', () => {
    assert.ok(build(after, '').startsWith('Patch for e3f4a5b · block 1\n\n```php'));
    assert.equal(resolveCodeDelta(PARENT, parentBody, PARENT, build(after, 'One note.'))?.note, 'One note.');
});

void test('round-trip includes the exact source and selected parent', () => {
    assert.deepEqual(resolveCodeDelta(PARENT, parentBody, PARENT, build()), {
        blockIndex: 1,
        language: 'php',
        original: before,
        proposed: after,
        note: 'Keep zero IDs.',
        changed: true,
    });
});

void test('plain unchanged templates are explicitly marked as unchanged', () => {
    assert.equal(resolveCodeDelta(PARENT, parentBody, PARENT, build(before, ''))?.changed, false);
});

void test('never renders a comparison for an unrelated or inaccessible parent', () => {
    assert.equal(resolveCodeDelta(PARENT, parentBody, OTHER, build()), null);
    assert.equal(resolveCodeDelta(OTHER, parentBody, OTHER, build()), null);
    assert.equal(resolveCodeDelta(PARENT, '', PARENT, build()), null);
});

void test('disallows a different code language or missing target block', () => {
    const wrongLanguage = formatCodeDelta({
        parentId: PARENT, blockIndex: 1, language: 'SQL', source: after,
    });
    const wrongIndex = formatCodeDelta({
        parentId: PARENT, blockIndex: 2, language: 'php', source: after,
    });
    assert.equal(resolveCodeDelta(PARENT, parentBody, PARENT, wrongLanguage), null);
    assert.equal(resolveCodeDelta(PARENT, parentBody, PARENT, wrongIndex), null);
});

void test('malformed patch headers and trailing prose become ordinary replies', () => {
    assert.equal(resolveCodeDelta(PARENT, parentBody, PARENT, 'Patch for fake · block 1\n\n```php\nA\n```'), null);
    assert.equal(resolveCodeDelta(PARENT, parentBody, PARENT, build() + '\nNew untrusted prose'), null);
});

void test('invalid input cannot construct a patch reply', () => {
    assert.throws(() => formatCodeDelta({ parentId: 'abc', blockIndex: 1, language: 'php', source: after }), /Invalid parent/);
    assert.throws(() => formatCodeDelta({ parentId: PARENT, blockIndex: 0, language: 'php', source: after }), /Invalid code block/);
    assert.throws(() => formatCodeDelta({ parentId: PARENT, blockIndex: 1, language: 'php bad', source: after }), /Unsupported/);
});

void test('empty or overlong code is not publishable', () => {
    assert.throws(() => build(''), /1–2600/);
    assert.throws(() => build('   '), /1–2600/);
    assert.throws(() => build('a'.repeat(2601)), /1–2600/);
});

void test('notes have a hard character cap and cannot contain paragraph breaks', () => {
    assert.throws(() => build(after, 'a'.repeat(281)), /280/);
    assert.throws(() => build(after, 'first\n\nsecond'), /280/);
});

void test('standalone nested code fences are rejected to match the site parser', () => {
    assert.throws(() => build('A\n```\nB'), /Nested/);
});

void test('inline backticks remain literal and trigger a longer outer fence', () => {
    const source = 'echo "```";';
    const reply = build(source, '');
    assert.ok(reply.includes('\n````php\n'));
    assert.equal(resolveCodeDelta(PARENT, parentBody, PARENT, reply)?.proposed, source);
});

void test('HTML-like source remains data and is never executed by this module', () => {
    const source = '<img src=x onerror=alert(1)>';
    assert.equal(resolveCodeDelta(PARENT, parentBody, PARENT, build(source, ''))?.proposed, source);
});

void test('CRLF normalizes without changing content', () => {
    const input = after.replaceAll('\n', '\r\n');
    assert.equal(resolveCodeDelta(PARENT, parentBody, PARENT, build(input, ''))?.proposed, after);
});

void test('Unicode code points are limited consistently with the reply counter', () => {
    assert.throws(() => build('😀'.repeat(2601)), /1–2600/);
    assert.doesNotThrow(() => build('😀'.repeat(25)));
});

void test('a minimal diff has deterministic order, symbols, and line numbers', () => {
    assert.deepEqual(compareCodeLines('a\nb\nc', 'a\nz\nc'), [
        { kind: 'equal', text: 'a', oldLine: 1, newLine: 1 },
        { kind: 'removed', text: 'b', oldLine: 2, newLine: null },
        { kind: 'added', text: 'z', oldLine: null, newLine: 2 },
        { kind: 'equal', text: 'c', oldLine: 3, newLine: 3 },
    ]);
});

void test('unchanged source displays only equal lines', () => {
    assert.ok(compareCodeLines('a\nb', 'a\nb')?.every(x => x.kind === 'equal'));
});

void test('whitespace changes and trailing line breaks are preserved', () => {
    const result = compareCodeLines('  x\n', ' x\n');
    assert.deepEqual(result?.filter(x => x.kind !== 'equal').map(x => x.kind), ['removed', 'added']);
});

void test('diff declines unbounded quadratic work', () => {
    assert.equal(compareCodeLines('x\n'.repeat(250), 'y\n'.repeat(250)), null);
});

void test('randomized lossless diff reconstruction over 100 deterministic cases', () => {
    let seed = 19;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % 7; };
    for (let sample = 0; sample < 100; sample++) {
        const source = Array.from({ length: rand() + 1 }, () => String(rand())).join('\n');
        const target = Array.from({ length: rand() + 1 }, () => String(rand())).join('\n');
        const lines = compareCodeLines(source, target);
        assert.ok(lines);
        assert.equal(lines.filter(x => x.kind !== 'added').map(x => x.text).join('\n'), source);
        assert.equal(lines.filter(x => x.kind !== 'removed').map(x => x.text).join('\n'), target);
        assert.deepEqual(compareCodeLines(source, target), lines);
    }
});
