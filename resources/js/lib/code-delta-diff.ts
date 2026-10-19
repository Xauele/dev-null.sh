export type DeltaLine = {
    kind: 'equal' | 'added' | 'removed';
    text: string;
    oldLine: number | null;
    newLine: number | null;
};

/** A bounded LCS diff. Never do unbounded quadratic work while rendering a feed. */
export function compareCodeLines(
    original: string,
    proposed: string,
): DeltaLine[] | null {
    const before = original.replace(/\r\n?/g, '\n').split('\n');
    const after = proposed.replace(/\r\n?/g, '\n').split('\n');
    if (before.length * after.length > 40_000) return null;
    const table = Array.from(
        { length: before.length + 1 },
        () => new Uint16Array(after.length + 1),
    );
    for (let i = before.length - 1; i >= 0; i--) {
        for (let j = after.length - 1; j >= 0; j--) {
            table[i][j] =
                before[i] === after[j]
                    ? table[i + 1][j + 1] + 1
                    : Math.max(table[i + 1][j], table[i][j + 1]);
        }
    }
    const lines: DeltaLine[] = [];
    let i = 0,
        j = 0;
    while (i < before.length || j < after.length) {
        if (i < before.length && j < after.length && before[i] === after[j]) {
            lines.push({
                kind: 'equal',
                text: before[i],
                oldLine: ++i,
                newLine: ++j,
            });
        } else if (
            i < before.length &&
            (j === after.length || table[i + 1][j] >= table[i][j + 1])
        ) {
            lines.push({
                kind: 'removed',
                text: before[i],
                oldLine: ++i,
                newLine: null,
            });
        } else {
            lines.push({
                kind: 'added',
                text: after[j],
                oldLine: null,
                newLine: ++j,
            });
        }
    }
    return lines;
}
