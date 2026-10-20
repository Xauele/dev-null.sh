export const MAX_RUN_SOURCE_UNITS = 3500;
export const MAX_REPLY_UNITS = 4000;
export type RemixDraft = { id: string; body: string };
export type DiffLine = { kind: 'same' | 'added' | 'removed'; value: string };

export function remixReply(hash: string, note: string, source: string): string {
    const code = source.trimEnd();
    if (!code.trim())
        throw new Error('Write some PHP before publishing a remix.');
    if (Array.from(code).length > MAX_RUN_SOURCE_UNITS) {
        throw new Error('This PHP snippet is too long to remix.');
    }

    const runs = code.match(/`+/g) ?? [];
    const fence = '`'.repeat(
        Math.max(3, 1 + Math.max(0, ...runs.map((run) => run.length))),
    );
    const parts = [
        'Remix of ' + hash,
        note.trim(),
        fence + 'php\n' + code + '\n' + fence,
    ];
    const body = parts.filter(Boolean).join('\n\n');
    if (Array.from(body).length > MAX_REPLY_UNITS) {
        throw new Error('The remix exceeds the 4,000-character reply limit.');
    }
    return body;
}

export function diffRemix(before: string, after: string): DiffLine[] {
    const a = before.split('\n'),
        b = after.split('\n');
    if (a.length * b.length > 20000) {
        return [
            ...a.map((value): DiffLine => ({ kind: 'removed', value })),
            ...b.map((value): DiffLine => ({ kind: 'added', value })),
        ];
    }
    const counts = Array.from(
        { length: a.length + 1 },
        () => new Uint16Array(b.length + 1),
    );
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            counts[i][j] =
                a[i] === b[j]
                    ? 1 + counts[i + 1][j + 1]
                    : Math.max(counts[i + 1][j], counts[i][j + 1]);
        }
    }
    const result: DiffLine[] = [];
    let i = 0,
        j = 0;
    while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && a[i] === b[j]) {
            result.push({ kind: 'same', value: a[i++] });
            j++;
        } else if (
            i < a.length &&
            (j === b.length || counts[i + 1][j] >= counts[i][j + 1])
        ) {
            result.push({ kind: 'removed', value: a[i++] });
        } else {
            result.push({ kind: 'added', value: b[j++] });
        }
    }
    return result;
}
