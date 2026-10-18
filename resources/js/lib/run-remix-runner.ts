import { MAX_RUN_SOURCE_UNITS } from '@/lib/run-remix';

export type RunPhase = 'connecting' | 'booting' | 'executing';
export type RunOutput = {
    ok: boolean;
    stdout: string;
    stderr: string;
    truncated: boolean;
    durationMs: number;
};
export type RunSession = { result: Promise<RunOutput>; stop: () => void };

const BOOT_MS = 25000,
    EXEC_MS = 3000,
    MAX_OUTPUT = 64000;
export const runRemixAvailable = Boolean(
    import.meta.env.VITE_RUN_REMIX_RUNNER_ORIGIN,
);

/**
 * Runner is intentionally not bundled into dev-null.sh. It must live on a
 * dedicated HTTPS site, with a restrictive CSP and no auth cookies or APIs.
 * Merely moving it to a sibling dev-null.sh subdomain is NOT sufficient.
 */
function sandboxOrigin(): URL {
    const origin = import.meta.env.VITE_RUN_REMIX_RUNNER_ORIGIN;
    if (!origin) throw new Error('PHP runner is not configured.');
    const url = new URL(origin);
    if (
        url.protocol !== 'https:' ||
        url.origin === window.location.origin ||
        url.hostname === 'dev-null.sh' ||
        url.hostname.endsWith('.dev-null.sh') ||
        url.username !== '' ||
        url.password !== '' ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
    ) {
        throw new Error('PHP runner requires its own isolated HTTPS domain.');
    }
    return url;
}

export function startRemixRun(
    source: string,
    onPhase: (phase: RunPhase) => void,
): RunSession {
    let frame: HTMLIFrameElement | null = null;
    let channel: MessageChannel | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    let rejectPromise: (error: Error) => void = () => undefined;
    const requestId = crypto.randomUUID();

    const clean = () => {
        if (timer !== undefined) clearTimeout(timer);
        channel?.port1.close();
        channel?.port2.close();
        frame?.remove();
    };

    const result = new Promise<RunOutput>((resolve, reject) => {
        rejectPromise = reject;
        try {
            const url = sandboxOrigin();
            if (
                Array.from(source).length > MAX_RUN_SOURCE_UNITS ||
                new TextEncoder().encode(source).length > 20000
            ) {
                throw new Error('Code exceeds the sandbox size limit.');
            }

            const fail = (reason: string) => {
                if (done) return;
                done = true;
                clean();
                reject(new Error(reason));
            };
            channel = new MessageChannel();
            frame = document.createElement('iframe');
            frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
            frame.setAttribute('referrerpolicy', 'no-referrer');
            frame.setAttribute('aria-hidden', 'true');
            frame.setAttribute('tabindex', '-1');
            frame.title = 'Isolated PHP interpreter';
            frame.style.display = 'none';
            frame.src = new URL('index.html', url).href;
            timer = setTimeout(
                () => fail('PHP runner boot timed out.'),
                BOOT_MS,
            );

            channel.port1.onmessage = (event: MessageEvent<unknown>) => {
                if (done || !event.data || typeof event.data !== 'object')
                    return;
                const msg = event.data as Record<string, unknown>;
                if (msg.type === 'READY') {
                    onPhase('booting');
                    channel?.port1.postMessage({
                        type: 'RUN',
                        requestId,
                        code: source,
                    });
                } else if (
                    msg.type === 'EXECUTING' &&
                    msg.requestId === requestId
                ) {
                    onPhase('executing');
                    if (timer !== undefined) clearTimeout(timer);
                    timer = setTimeout(
                        () => fail('PHP run stopped after 3 seconds.'),
                        EXEC_MS,
                    );
                } else if (
                    msg.type === 'RESULT' &&
                    msg.requestId === requestId &&
                    typeof msg.ok === 'boolean' &&
                    typeof msg.stdout === 'string' &&
                    typeof msg.stderr === 'string' &&
                    msg.stdout.length <= MAX_OUTPUT &&
                    msg.stderr.length <= MAX_OUTPUT &&
                    typeof msg.truncated === 'boolean' &&
                    typeof msg.durationMs === 'number' &&
                    Number.isFinite(msg.durationMs)
                ) {
                    done = true;
                    clean();
                    resolve({
                        ok: msg.ok,
                        stdout: msg.stdout,
                        stderr: msg.stderr,
                        truncated: msg.truncated,
                        durationMs: msg.durationMs,
                    });
                } else if (
                    msg.type === 'ERROR' &&
                    msg.requestId === requestId &&
                    typeof msg.message === 'string' &&
                    msg.message.length <= 500
                ) {
                    fail(msg.message);
                }
            };

            frame.addEventListener(
                'load',
                () => {
                    frame?.contentWindow?.postMessage(
                        { type: 'RUN_REMIX_CONNECT' },
                        url.origin,
                        [channel!.port2],
                    );
                },
                { once: true },
            );
            frame.addEventListener(
                'error',
                () => fail('Could not load the PHP runner.'),
                { once: true },
            );
            onPhase('connecting');
            document.body.appendChild(frame);
        } catch (error) {
            done = true;
            clean();
            reject(
                error instanceof Error
                    ? error
                    : new Error('Runner unavailable.'),
            );
        }
    });

    return {
        result,
        stop: () => {
            if (done) return;
            done = true;
            clean();
            rejectPromise(new Error('Run cancelled.'));
        },
    };
}
