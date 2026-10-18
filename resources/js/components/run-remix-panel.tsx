import { usePage } from '@inertiajs/react';
import { Check, Copy, GitCompare, Play, RotateCcw, Square, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signIn } from '@/lib/auth';
import { diffRemix, MAX_RUN_SOURCE_UNITS, remixReply } from '@/lib/run-remix';
import { runRemixAvailable, startRemixRun, type RunSession } from '@/lib/run-remix-runner';

export function RunRemixPanel({
    initialCode,
    commitId,
    autoRun,
    onRemix,
    onClose,
}: {
    initialCode: string;
    commitId: string;
    autoRun: boolean;
    onRemix: (body: string) => void;
    onClose: () => void;
}) {
    const { auth } = usePage().props;
    const [code, setCode] = useState(initialCode);
    const [note, setNote] = useState('');
    const [mode, setMode] = useState<'editor' | 'diff'>('editor');
    const [output, setOutput] = useState('');
    const [runState, setRunState] = useState<'idle' | 'running' | 'finished' | 'error'>('idle');
    const [phase, setPhase] = useState('');
    const [executedCode, setExecutedCode] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [publishMessage, setPublishMessage] = useState('');
    const session = useRef<RunSession | null>(null);
    const startedAutomatically = useRef(false);
    const hash = commitId.replaceAll('-', '').slice(-7);
    const diff = useMemo(() => diffRemix(initialCode, code), [initialCode, code]);
    const draft = useMemo(() => {
        try {
            return { body: remixReply(hash, note, code), error: '' };
        } catch (error) {
            return { body: '', error: error instanceof Error ? error.message : 'Invalid remix.' };
        }
    }, [hash, note, code]);
    const dirty = code !== initialCode;
    const canRun = runRemixAvailable && Array.from(code).length <= MAX_RUN_SOURCE_UNITS && code.trim() !== '';

    const run = useCallback(async () => {
        if (!canRun || session.current !== null) return;
        setRunState('running');
        setOutput('');
        setPhase('Starting isolated PHP…');
        const current = startRemixRun(code, (next) => setPhase(
            next === 'connecting' ? 'Connecting to sandbox…'
                : next === 'booting' ? 'Loading PHP 8.5…' : 'Executing…',
        ));
        session.current = current;
        try {
            const result = await current.result;
            setRunState(result.ok ? 'finished' : 'error');
            setExecutedCode(code);
            setOutput([
                result.stdout,
                result.stderr ? 'stderr:\n' + result.stderr : '',
                result.truncated ? '[output truncated]' : '',
            ].filter(Boolean).join('\n\n') || '(no output)');
            setPhase('PHP 8.5 · ' + Math.round(result.durationMs) + ' ms');
        } catch (error) {
            setRunState('error');
            setPhase('Execution unavailable');
            setOutput(error instanceof Error ? error.message : 'PHP runtime failed.');
        } finally {
            session.current = null;
        }
    }, [canRun, code]);

    useEffect(() => {
        if (autoRun && !startedAutomatically.current && canRun) {
            startedAutomatically.current = true;
            void run();
        }
    }, [autoRun, canRun, run]);

    useEffect(() => () => session.current?.stop(), []);

    const stop = () => session.current?.stop();

    const copy = async () => {
        if (!draft.body) return;
        try {
            await navigator.clipboard.writeText(draft.body);
            setCopied(true);
        } catch {
            setPublishMessage('Clipboard is unavailable. Select the preview manually.');
        }
    };

    const insert = () => {
        if (!draft.body) return;
        if (!auth.user) {
            signIn();
            return;
        }
        onRemix(draft.body);
        setPublishMessage('Remix inserted into the normal reply composer. Review it and press Reply.');
        onClose();
    };

    return (
        <section aria-label="Run and remix PHP" className="border-t bg-background px-3 py-3 text-[13px]">
            <div className="mb-2 flex items-center gap-2">
                <span className="font-mono font-semibold text-foreground">RUN & REMIX</span>
                <span className="font-mono text-[11px] text-muted-foreground">PHP 8.5 · browser sandbox</span>
                <button type="button" aria-label="Close Run and Remix" onClick={() => { stop(); onClose(); }}
                    className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <X className="size-4" aria-hidden />
                </button>
            </div>
            <div className="mb-2 flex items-center gap-1" role="tablist" aria-label="Remix editor mode">
                {(['editor', 'diff'] as const).map((tab) =>
                    <button key={tab} type="button" role="tab" aria-selected={mode === tab}
                        onClick={() => setMode(tab)}
                        className={mode === tab
                            ? 'rounded-md bg-muted px-2 py-1 font-medium text-foreground'
                            : 'rounded-md px-2 py-1 text-muted-foreground hover:text-foreground'}>
                        {tab === 'diff' ? 'Diff' : 'Editor'}
                    </button>,
                )}
                {dirty && <span className="ml-auto font-mono text-[11px] text-muted-foreground">Modified</span>}
            </div>
            {mode === 'editor' ? (
                <textarea aria-label="Editable PHP source" spellCheck={false} value={code}
                    onChange={(event) => { setCode(event.currentTarget.value); setCopied(false); }}
                    onKeyDown={(event) => {
                        if (event.key !== 'Tab' || event.shiftKey) return;
                        event.preventDefault();
                        const target = event.currentTarget;
                        const start = target.selectionStart;
                        const end = target.selectionEnd;
                        if (code.length + 4 - (end - start) > MAX_RUN_SOURCE_UNITS) return;
                        setCode(code.slice(0, start) + '    ' + code.slice(end));
                        requestAnimationFrame(() => target.setSelectionRange(start + 4, start + 4));
                    }}
                    maxLength={MAX_RUN_SOURCE_UNITS}
                    rows={8}
                    className="block max-h-[45dvh] min-h-36 w-full resize-y rounded-md border bg-muted/40 p-3 font-mono text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-test="remix-source" />
            ) : (
                <div role="tabpanel" aria-label="PHP source changes"
                    className="max-h-[45dvh] min-h-36 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
                    {diff.map((line, index) =>
                        <div key={index} className={line.kind === 'added'
                            ? 'text-green-600 dark:text-green-400'
                            : line.kind === 'removed' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}>
                            <span aria-hidden>{line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '- ' : '  '}</span>
                            <span className="whitespace-pre-wrap break-all">{line.value || ' '}</span>
                        </div>,
                    )}
                </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void run()} disabled={!canRun || runState === 'running'}
                    className="inline-flex min-w-20 items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-50">
                    <Play className="size-3.5" aria-hidden /> Run PHP
                </button>
                {runState === 'running' &&
                    <button type="button" onClick={stop} className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5">
                        <Square className="size-3.5" aria-hidden /> Stop
                    </button>}
                <button type="button" onClick={() => { setCode(initialCode); setOutput(''); setRunState('idle'); }}
                    disabled={!dirty} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-muted-foreground disabled:opacity-40">
                    <RotateCcw className="size-3.5" aria-hidden /> Reset
                </button>
                {!runRemixAvailable &&
                    <span className="text-xs text-muted-foreground">Runner disabled until isolated hosting is reviewed.</span>}
            </div>
            {(runState !== 'idle' || output !== '') && (
                <div className="mt-3 rounded-md border bg-muted/30 p-2.5">
                    <div className="mb-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                        <span>OUTPUT</span><span aria-live="polite">{phase}</span>
                    </div>
                    {executedCode !== null && executedCode !== code &&
                        <p className="mb-1 text-xs text-muted-foreground">Output is from an earlier version of the code.</p>}
                    <pre aria-live="polite" className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[13px]">{output}</pre>
                </div>
            )}
            <div className="mt-3 border-t pt-3">
                <label htmlFor={'remix-note-' + commitId} className="mb-1 block font-medium">What did you change?</label>
                <textarea id={'remix-note-' + commitId} value={note} onChange={(e) => setNote(e.currentTarget.value)}
                    rows={2} placeholder="Explain your approach (optional)"
                    className="w-full resize-y rounded-md border bg-background p-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-[13px]" />
                <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Preview reply · {Array.from(draft.body).length}/4000 characters</summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-2 font-mono text-xs">{draft.body || draft.error}</pre>
                </details>
                {draft.error && <p role="alert" className="mt-2 text-xs text-destructive">{draft.error}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={insert} disabled={!draft.body}
                        className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background disabled:opacity-50">
                        {auth.user ? 'Insert into reply' : 'Sign in to reply'}
                    </button>
                    <button type="button" onClick={() => void copy()} disabled={!draft.body}
                        className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 disabled:opacity-50">
                        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                        {copied ? 'Copied' : 'Copy remix'}
                    </button>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <GitCompare className="size-3.5" aria-hidden /> Normal reply moderation applies
                    </span>
                </div>
                {publishMessage && <p role="status" className="mt-2 text-xs">{publishMessage}</p>}
            </div>
        </section>
    );
}
