/**
 * This document must be hosted on an isolated registrable domain without
 * authentication cookies or application endpoints. It never sends requests
 * to Laravel. Only the parent origin configured at build time gets a port.
 */
const allowedParent = import.meta.env.VITE_ALLOWED_PARENT_ORIGIN;
let port: MessagePort | null = null;
let worker: Worker | null = null;
let activeId: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function report(payload: Record<string, unknown>) {
    port?.postMessage(payload);
}

function cleanup() {
    if (timer !== undefined) clearTimeout(timer);
    worker?.terminate();
    worker = null;
    activeId = null;
}

function fail(id: string, message: string) {
    if (activeId !== id) return;
    cleanup();
    report({ type: 'ERROR', requestId: id, message });
}

function run(id: string, code: string) {
    if (activeId !== null) {
        report({ type: 'ERROR', requestId: id, message: 'Another script is running.' });
        return;
    }
    if (Array.from(code).length > 3500 || new TextEncoder().encode(code).length > 20000) {
        report({ type: 'ERROR', requestId: id, message: 'Source exceeds the limit.' });
        return;
    }

    activeId = id;
    try {
        worker = new Worker(new URL('./php.worker.ts', import.meta.url), { type: 'module' });
    } catch {
        fail(id, 'Could not launch the PHP worker.');
        return;
    }

    timer = setTimeout(() => fail(id, 'PHP did not boot in time.'), 25000);
    worker.onmessage = (event: MessageEvent<unknown>) => {
        if (!event.data || typeof event.data !== 'object') return;
        const message = event.data as Record<string, unknown>;
        if (message.requestId !== activeId) return;

        if (message.type === 'EXECUTING') {
            if (timer !== undefined) clearTimeout(timer);
            timer = setTimeout(() => fail(id, 'PHP execution timed out.'), 3000);
            report({ type: 'EXECUTING', requestId: id });
        } else if (message.type === 'RESULT'
            && typeof message.stdout === 'string' && typeof message.stderr === 'string'
            && message.stdout.length <= 64000 && message.stderr.length <= 64000
            && typeof message.ok === 'boolean' && typeof message.truncated === 'boolean'
            && typeof message.durationMs === 'number') {
            cleanup();
            report(message);
        } else if (message.type === 'ERROR' && typeof message.message === 'string') {
            fail(id, message.message.slice(0, 500));
        }
    };
    worker.onerror = () => fail(id, 'PHP worker failed.');
    worker.postMessage({ type: 'EXECUTE', requestId: id, code });
}

window.addEventListener('message', (event: MessageEvent) => {
    if (port !== null || !allowedParent || event.origin !== allowedParent
        || event.source !== window.parent || event.data?.type !== 'RUN_REMIX_CONNECT'
        || event.ports.length !== 1) {
        return;
    }

    port = event.ports[0];
    port.onmessage = (message: MessageEvent<unknown>) => {
        if (!message.data || typeof message.data !== 'object') return;
        const payload = message.data as Record<string, unknown>;

        if (payload.type !== 'RUN' || typeof payload.requestId !== 'string'
            || payload.requestId.length > 80 || typeof payload.code !== 'string') return;
        run(payload.requestId, payload.code);
    };
    port.start();
    report({ type: 'READY' });
});
