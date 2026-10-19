import { GitCompareArrows } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { compareCodeLines } from '@/lib/code-delta-diff';
import { resolveCodeDelta } from '@/lib/code-deltas';

/**
 * Optional, inert comparison. If the immediate parent is not already visible,
 * the caller must not render this component. No network request, no execution.
 */
export function CodeDeltaView({
    parentId,
    parentBody,
    replyParentId,
    replyBody,
}: {
    parentId: string;
    parentBody: string;
    replyParentId: string | null;
    replyBody: string;
}) {
    const [expanded, setExpanded] = useState(false);
    const regionId = useId();
    const delta = useMemo(
        () => resolveCodeDelta(parentId, parentBody, replyParentId, replyBody),
        [parentId, parentBody, replyParentId, replyBody],
    );
    const lines = useMemo(
        () =>
            expanded && delta?.changed
                ? compareCodeLines(delta.original, delta.proposed)
                : null,
        [expanded, delta],
    );

    if (!delta?.changed) return null;

    return (
        <div className="mt-1" data-test="code-delta">
            <button
                type="button"
                aria-expanded={expanded}
                aria-controls={regionId}
                onClick={() => setExpanded((previous) => !previous)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                data-test="code-delta-toggle"
            >
                <GitCompareArrows aria-hidden className="size-3.5" />
                {expanded ? 'Hide changes' : 'View changes'}
            </button>
            {expanded && (
                <div
                    id={regionId}
                    role="region"
                    aria-label="Proposed code changes"
                    className="mt-1 max-h-64 overflow-auto rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-xs"
                    data-test="code-delta-comparison"
                >
                    {lines === null ? (
                        <p className="font-sans text-xs text-muted-foreground">
                            Too many lines to compare here. Read the full reply
                            instead.
                        </p>
                    ) : (
                        lines.map((line, index) => (
                            <div
                                key={index}
                                className="flex min-w-0 gap-2 wrap-anywhere whitespace-pre-wrap"
                                data-kind={line.kind}
                            >
                                <span
                                    className="w-3 shrink-0 text-center text-muted-foreground"
                                    aria-hidden
                                >
                                    {line.kind === 'added'
                                        ? '+'
                                        : line.kind === 'removed'
                                          ? '−'
                                          : ' '}
                                </span>
                                <span className="sr-only">
                                    {line.kind === 'added'
                                        ? 'Added: '
                                        : line.kind === 'removed'
                                          ? 'Removed: '
                                          : 'Unchanged: '}
                                </span>
                                <span className="min-w-0">
                                    {line.text || ' '}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
