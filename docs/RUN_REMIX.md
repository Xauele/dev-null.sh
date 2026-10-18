# Run & Remix: experimental fork branch

The /dev/null frontend adds a lazy, per-code-block PHP editor in public commits and replies.
It produces an ordinary reply draft using the existing composer; it does **not** introduce
a publishing API, migrations, extra database columns, or execute user PHP in Laravel.

## Important: not production ready

The branch is a reviewable proof of concept. **Do not deploy the runner publicly** until
real PHP-Wasm execution, containment, licensing, accessibility and cross-browser checks pass.
Frontend Run is deliberately disabled unless VITE_RUN_REMIX_RUNNER_ORIGIN is set.

The runner is a separate Vite application in tools/run-remix-runner. The PHP-Wasm packages
are GPL-2.0-or-later; legal review of distribution and the MIT host is required.
PHP-Wasm has a relatively large binary, and first run is expected to be slow on mobile.

## Product behavior

1. A PHP code block in a real commit/reply displays "Run & Remix" beside Copy and Wrap.
2. Click to load the editor chunk. Running code opens one ephemeral, cross-origin iframe
   containing one new Worker. No session, token, cookies, or private app state are sent.
3. Diff compares the original highlighted PHP source (extracted from pre.textContent) and
   the draft. A user may edit source without executing it.
4. "Insert into reply" opens the existing composer under the original commit. The user
   reviews and manually submits the reply; secret scan, CSRF, rate limit and moderation
   remain owned by the existing workflow. If a saved reply already exists, the composer
   asks permission to replace it. Nothing is posted automatically.
5. An unauthenticated visitor can inspect/copy the draft, but must sign in before posting.

## Security boundaries

- Runner must be deployed under a **separate registrable HTTPS domain**. A subdomain
  of dev-null.sh is insufficient. No cookies, authentication, backend, or user-data endpoints.
- Serve the runner with header CSP:
  default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';
  connect-src 'self'; img-src 'none'; object-src 'none'; form-action 'none';
  base-uri 'none'; frame-ancestors https://dev-null.sh
- Serve the exact built PHP-Wasm assets as static files with application/wasm MIME,
  immutable versioned caching, and no additional routes; do not enable a service worker.
- Add only this runner origin to the main app frame-src directive. Do not add unsafe-eval
  to dev-null.sh. The iframe sandbox uses allow-scripts allow-same-origin strictly on the
  separate site so it can load a module Web Worker.
- Build the runner with VITE_ALLOWED_PARENT_ORIGIN=https://dev-null.sh and configure
  VITE_RUN_REMIX_RUNNER_ORIGIN=https://AN-ISOLATED-RUNNER-DOMAIN/ in the frontend build.
- The transferred MessagePort is a capability only to execute code; the bridge requires
  the exact parent origin. Neither messages nor results may include credentials.
- Text input <= 3500 code points and <= 20 KB; output displayed as React text, never HTML.
  Boot and execution timers terminate workers. These are **best effort**, not a hard
  browser memory limit. Current output truncation occurs after collection: output-bomb
  scripts may still consume memory. Production release is BLOCKED until hard containment
  is demonstrated (and necessary worker limits added).

## Required release gates

- Supply a runner domain, lock down CSP and verify outbound requests cannot reach dev-null.
- Validate a real PHP 8.5 Wasm build, code without php tags, syntax errors, output limits,
  infinite loops, repeated runs, Unicode and browsers with slow/no WASM.
- Run composer test and bun run test:types/test:lint/test:unit on an environment with
  all repository dependencies. Ensure PHP source in quoted previews never shows Run.
- Test 390x844, 1366x650 and 1440x900, light and dark, keyboard shortcuts and focus,
  reduced motion, screen-reader announcements, no viewport overflow and layout shifts.
- Confirm static runner artifact license compatibility and vulnerability scanning.
- Ask upstream maintainers whether they accept separate-domain sandbox hosting before PR.

## Isolated runner build

From tools/run-remix-runner, install the pinned dependencies, then run npm run check
and npm run build. Deploy the **dist/** directory only to the isolated runner domain.
Never configure a production app with the runner pointing to itself.

The UI/runner currently exist only on the fork feature branch, not production.
