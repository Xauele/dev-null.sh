/// <reference types="node" />
import assert from 'node:assert/strict';
import { App } from '@inertiajs/react';
import type { ComponentProps, ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'vite-plus/test';
import { CommitBody } from '../../resources/js/components/commit-body';
import { bodySegments } from '../../resources/js/lib/code';

function renderPage(content: ReactElement): string {
    return renderToStaticMarkup(
        <App
            initialComponent={() => content}
            initialPage={
                {
                    component: 'Commit',
                    url: '/',
                    version: null,
                    props: { errors: {}, auth: { user: null, pasteis: null } },
                    clearHistory: false,
                    encryptHistory: false,
                } as unknown as ComponentProps<typeof App>['initialPage']
            }
        />,
    );
}

const source = 'flowchart LR\nA[<script>alert(1)</script>] --> B[okay]';
const segments = bodySegments('Before\n```MERMAID\n' + source + '\n```\nAfter');

test('preserves Mermaid source verbatim alongside an escaped fallback', () => {
    const mermaid = segments.find((segment) => segment.type === 'block');
    assert.ok(mermaid && mermaid.type === 'block');
    assert.equal(mermaid.language, 'MERMAID');
    assert.equal(mermaid.source, source);
    assert.ok(mermaid.html.includes('&lt;script&gt;'));
});

test('server-renders a native diagram placeholder without executing or injecting SVG', () => {
    const markup = renderPage(<CommitBody segments={segments} mentions={null} />);
    assert.ok(markup.includes('data-test="mermaid-diagram"'));
    assert.ok(markup.includes('Loading diagram'));
    assert.ok(!markup.includes('<script>'));
    // Lucide toolbar icons are SVG; the diagram itself must not be embedded in the HTML.
    assert.ok(!markup.includes('<foreignObject'));
    assert.ok(!markup.includes('src="blob:'));
    assert.ok(markup.includes('Show source'));
});

test('does not load diagrams in static excerpts or private Remotes', () => {
    for (const props of [{ isStatic: true }, { renderDiagrams: false }]) {
        const markup = renderPage(
            <CommitBody segments={segments} mentions={null} {...props} />,
        );
        assert.ok(!markup.includes('data-test="mermaid-diagram"'));
        assert.match(markup, /<pre[^>]*>flowchart LR/);
        assert.ok(!markup.includes('<script>'));
    }
});

test('uses the normal code block for other languages and unrecognized Mermaid source', () => {
    const markup = renderPage(
        <CommitBody
            segments={[
                { type: 'block', language: 'javascript', html: 'hello' },
                { type: 'block', language: 'mermaid', html: 'source was not provided' },
            ]}
            mentions={null}
        />,
    );

    assert.ok(!markup.includes('data-test="mermaid-diagram"'));
    assert.ok(markup.includes('source was not provided'));
});
