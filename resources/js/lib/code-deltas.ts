/**
 * Code Delta is normal reply text, not executable code or verified evidence.
 * It is rendered only when its immediate visible parent can be compared.
 */
export const MAX_PATCH_SOURCE = 2600;
export const MAX_PATCH_NOTE = 280;
export const MAX_PATCH_BLOCK_INDEX = 20;
export const MAX_REPLY_BODY = 4000;

export type CodeBlockSource = { language: string | null; source: string };
export type CodeDeltaDraft = {
    parentId: string;
    blockIndex: number;
    language: string;
    original: string;
    body: string;
};
export type CodeDelta = {
    blockIndex: number;
    language: string;
    original: string;
    proposed: string;
    note: string;
    changed: boolean;
};

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const languagePattern = /^[a-z0-9_+-]{1,30}$/i;
const unix = (value: string): string => value.replace(/\r\n?/g, '\n');
const count = (value: string): number => Array.from(value).length;
export const shortHash = (id: string): string => id.replaceAll('-', '').slice(-7).toLowerCase();

// Strict subset of the existing /dev/null Markdown fence grammar: exact closing
// delimiter, single supported block, and no nested standalone fence lines.
const blockPattern = /^(`{3,})([^`\r\n]*)\r?\n([\s\S]*?)\r?\n\1[ \t]*$/gm;

export function codeBlocks(body: string): CodeBlockSource[] {
    const normalized = unix(body);
    return [...normalized.matchAll(blockPattern)].map((match) => {
        const language = match[2].trim().split(/[ \t]/)[0].toLowerCase();
        return { language: language || null, source: match[3] };
    });
}

export function eligibleBlock(body: string, index: number): CodeBlockSource | null {
    if (!Number.isInteger(index) || index < 1 || index > MAX_PATCH_BLOCK_INDEX) return null;
    const block = codeBlocks(body)[index - 1];
    if (!block?.language || !languagePattern.test(block.language)
        || block.source.trim() === '' || count(block.source) > MAX_PATCH_SOURCE) return null;
    return block;
}

export function formatCodeDelta(input: {
    parentId: string;
    blockIndex: number;
    language: string;
    source: string;
    note?: string;
}): string {
    if (!idPattern.test(input.parentId)) throw new Error('Invalid parent commit.');
    if (!Number.isInteger(input.blockIndex) || input.blockIndex < 1
        || input.blockIndex > MAX_PATCH_BLOCK_INDEX) throw new Error('Invalid code block index.');
    const language = input.language.toLowerCase();
    if (!languagePattern.test(language)) throw new Error('Unsupported language label.');
    const source = unix(input.source).trimEnd();
    const note = unix(input.note ?? '').trim();
    if (source.trim() === '' || count(source) > MAX_PATCH_SOURCE) {
        throw new Error('Code must have 1–2600 characters.');
    }
    if (count(note) > MAX_PATCH_NOTE || /\n[ \t]*\n/.test(note)) {
        throw new Error('Explanation must fit in a single 280-character paragraph.');
    }
    if (/^`{3,}[ \t]*$/m.test(source)) {
        throw new Error('Nested standalone fences are not supported.');
    }
    const longest = (source.match(/`+/g) ?? []).reduce((n, run) => Math.max(n, run.length), 0);
    const fence = '`'.repeat(Math.max(3, longest + 1));
    const blocks = [
        'Patch for ' + shortHash(input.parentId) + ' · block ' + input.blockIndex,
        note,
        fence + language + '\n' + source + '\n' + fence,
    ];
    const reply = blocks.filter(Boolean).join('\n\n');
    if (count(reply) > MAX_REPLY_BODY) throw new Error('Reply exceeds 4000 characters.');
    return reply;
}

const replyPattern = /^Patch for ([0-9a-f]{7}) · block ([1-9]\d{0,2})\n\n(?:(.{1,280}(?:\n.{1,280})*)\n\n)?(`{3,})([a-z0-9_+-]{1,30})\n([\s\S]*?)\n\4$/i;

export function resolveCodeDelta(
    parentId: string,
    parentBody: string,
    replyParentId: string | null,
    replyBody: string,
): CodeDelta | null {
    if (!idPattern.test(parentId) || parentId !== replyParentId
        || count(replyBody) > MAX_REPLY_BODY) return null;
    const match = unix(replyBody).trim().match(replyPattern);
    if (!match || match[1].toLowerCase() !== shortHash(parentId)) return null;
    const index = Number(match[2]);
    const block = eligibleBlock(parentBody, index);
    const proposed = match[6];
    const language = match[5].toLowerCase();
    const note = match[3] ?? '';
    if (!block || block.language !== language || count(proposed) > MAX_PATCH_SOURCE
        || !proposed.trim() || count(note) > MAX_PATCH_NOTE
        || /^`{3,}[ \t]*$/m.test(proposed)) return null;
    return {
        blockIndex: index, language, original: block.source,
        proposed, note, changed: unix(block.source) !== unix(proposed),
    };
}
