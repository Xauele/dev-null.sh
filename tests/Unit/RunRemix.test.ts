import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffRemix, remixReply } from '../../resources/js/lib/run-remix';

test('a remix is a regular PHP-fenced reply', () => {
    assert.equal(remixReply('c0ffee1', 'Better approach.', '<?php echo 42;'),
        'Remix of c0ffee1\n\nBetter approach.\n\n```php\n<?php echo 42;\n```');
});
test('backticks inside PHP cannot prematurely close the code fence', () => {
    const source = '<?php echo "___";'.replace('___', '```');
    assert.ok(remixReply('abc', '', source).includes('\n````php\n'));
});
test('rejects empty and oversized source', () => {
    assert.throws(() => remixReply('abc', '', ' \n '), /Write some PHP/);
    assert.throws(() => remixReply('abc', '', 'x'.repeat(3501)), /too long/);
});
test('rejects replies longer than the server 4000 character limit', () => {
    assert.throws(() => remixReply('abc', 'x'.repeat(3900), 'echo 1;'), /4,000/);
});
test('diff preserves added, removed and unchanged lines', () => {
    assert.deepEqual(diffRemix('a\nb', 'a\nc'), [
        { kind: 'same', value: 'a' },
        { kind: 'removed', value: 'b' },
        { kind: 'added', value: 'c' },
    ]);
});
test('diff handles many short lines without unbounded work', () => {
    assert.equal(diffRemix('x\n'.repeat(200), 'y\n'.repeat(200)).length, 802);
});
