/// <reference lib="webworker" />
import { PHP } from '@php-wasm/universal';
import { loadWebRuntime } from '@php-wasm/web';

interface Execute { type: 'EXECUTE'; requestId: string; code: string }

declare const self: DedicatedWorkerGlobalScope;
self.onmessage = async (event: MessageEvent<Execute>) => {
    const input = event.data;
    if (input?.type !== 'EXECUTE' || typeof input.requestId !== 'string'
        || typeof input.code !== 'string' || input.code.length > 3500) {
        return;
    }

    const began = performance.now();
    try {
        const php = new PHP(await loadWebRuntime('8.5'));
        self.postMessage({ type: 'EXECUTING', requestId: input.requestId });
        const code = input.code.includes('<?') ? input.code : '<?php\n' + input.code;
        // PHP-level memory_limit alone is not a hard WASM RSS or output limit.
        const response = await php.runStream({
            code: '<?php ini_set("memory_limit", "64M"); error_reporting(E_ALL); ?>' + code,
        });
        const stdout = await response.stdoutText;
        const stderr = await response.stderrText;
        self.postMessage({
            type: 'RESULT', requestId: input.requestId,
            ok: stderr.length === 0,
            stdout: stdout.slice(0, 60000),
            stderr: stderr.slice(0, 4000),
            truncated: stdout.length > 60000 || stderr.length > 4000,
            durationMs: Math.round(performance.now() - began),
        });
    } catch (error) {
        self.postMessage({
            type: 'ERROR', requestId: input.requestId,
            message: error instanceof Error ? error.message.slice(0, 500) : 'PHP failed.',
        });
    }
};
