/**
 * Mermaid stays out of the normal feed bundle. The renderer is loaded only for a diagram
 * approaching the viewport, and its SVG is displayed as an inert image, never as DOM HTML.
 */
export const MAX_DIAGRAM_LENGTH = 6000;

type DiagramTheme = 'light' | 'dark';
type Mermaid = typeof import('mermaid')['default'];

let engine: Promise<Mermaid> | null = null;
let renderQueue: Promise<void> = Promise.resolve();
let nextId = 0;

function loadMermaid(): Promise<Mermaid> {
    engine ??= import('mermaid').then(({ default: mermaid }) => mermaid);

    return engine;
}

/**
 * Mermaid writes temporary DOM nodes during rendering. Its shared configuration is global,
 * so serialize renders to avoid cross-diagram races and theme bleeding.
 */
export function renderMermaid(source: string, theme: DiagramTheme): Promise<string> {
    if (!source.trim() || source.length > MAX_DIAGRAM_LENGTH) {
        return Promise.reject(new Error('Diagram source is empty or too long.'));
    }

    const task = renderQueue.then(async (): Promise<string> => {
        const mermaid = await loadMermaid();

        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            maxTextSize: MAX_DIAGRAM_LENGTH,
            maxEdges: 80,
            theme: 'base',
            flowchart: { htmlLabels: false },
            themeVariables:
                theme === 'dark'
                    ? {
                          background: '#18181a',
                          primaryColor: '#232326',
                          primaryTextColor: '#ececec',
                          primaryBorderColor: '#57575c',
                          lineColor: '#7aa2f7',
                          secondaryColor: '#232326',
                          tertiaryColor: '#18181a',
                          fontFamily: 'Geist, sans-serif',
                      }
                    : {
                          background: '#ffffff',
                          primaryColor: '#eef0f2',
                          primaryTextColor: '#121417',
                          primaryBorderColor: '#8a929e',
                          lineColor: '#3b6fe0',
                          secondaryColor: '#eef0f2',
                          tertiaryColor: '#ffffff',
                          fontFamily: 'Geist, sans-serif',
                      },
        });

        if (!(await mermaid.parse(source, { suppressErrors: true }))) {
            throw new Error('Invalid Mermaid syntax.');
        }

        const rendered = await mermaid.render(`devnull-diagram-${++nextId}`, source);

        return rendered.svg;
    });

    renderQueue = task.then(
        () => undefined,
        () => undefined,
    );

    return task;
}
