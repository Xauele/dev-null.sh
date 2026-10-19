# RFC: Code Deltas native to /dev/null

Status: **design + test-first experimental implementation, not released**

Base reference: nunomaduro/dev-null.sh `production` @ `569fc285dd560f3df12cd9672fbc18fe791d5144`.
Prototype repository: Xauele/dev-null.sh; keep the earlier Run & Remix/PHP-Wasm work isolated.

## 1. The actual problem

A developer sees a short code sample in a commit and has a concrete correction.
Today they may write another code block in a reply, but readers have to compare
two chunks mentally. This becomes particularly painful on mobile and in threaded
conversations. There is no reason to run PHP to solve that UI problem.

**One sentence:** turn a normal reply containing a proposed code edit into an
optional, readable delta against its immediate parent, without changing the
social network's publishing, star, following, or moderation rules.

This is not a new programming playground, PR system, code verification engine,
Q&A site, leaderboard, bounty board, or language-specific feature.

## 2. Who benefits and how we know it might matter

- **Reader on a phone:** glance at the change in a few lines; no giant editor.
- **Original author:** understand feedback without manually diffing two snippets.
- **Contributor:** propose a meaningful edit and receive existing reply stars.
- **Library maintainer:** illustrate a reproducible fix in an ordinary discussion.
- **Other readers:** follow the real people in the discussion, star or save the
  useful reply, or post their own variant.

These benefits are hypotheses until real contributors validate them. Do not
claim product-market fit because tests pass.

## 3. Product rules

1. The **log is unchanged** unless a commit contains an eligible fenced code block.
2. Only that block's existing toolbar gets a subtle "Suggest edit" action.
3. Clicking Suggest opens the **existing inline reply composer** prefilled with
   the code and a short readable reference, not a new modal IDE.
4. The author changes lines and optionally explains the reason, previews the
   ordinary reply, then presses its existing Reply button.
5. **No silent auto-post**, and editing the unchanged template cannot be
   mistaken for a meaningful patch.
6. The normal reply is still a commit: it has the existing author, star,
   save, replies, follow, moderation, visibility, and notifications.
7. Readers can expand a **View changes** comparison from the reply against
   its immediate parent. Otherwise the reply remains readable as normal text.
8. No green "verified", "passed", "fixed", "accepted", or runtime badge. The
   code was not executed and even a valid diff can be wrong.
9. Existing non-patch commits and ordinary replies render exactly as before.
10. On disappearing/deleted/blocked parent content, show the existing reply
    only; never reconstruct or leak the missing parent code.

## 4. Interaction design consistent with DESIGN.md

### Default log (620 px column)

The author's lane and graph rail stay untouched. No new card around the
commit, large button or new reaction row.

    John @john · 5m
    Why does array_filter() remove ID 0?
    [php]                        [Suggest edit] [Wrap] [Copy]
      $ids = [0,7,null];
      array_filter($ids);
    ★ 8    Reply    3 replies

### Suggest

The existing inline reply composer opens under the appropriate commit.

    Reply to @john
    Patch for e3f4a5b · block 1
    [php fenced code already filled in]
    [existing Preview] [existing secret warning] [Cancel] [Reply]

If a saved draft (text OR images) exists, do not overwrite it: ask the
user to keep their draft or replace it. Normal Cancel/Esc never publishes.
No draft is sent to a third party until the normal publication flow.

### Under the reply

    Ana @ana · 2m
    Patch for e3f4a5b · block 1
    Avoid loose falsy filtering.
    [php corrected source]
    [View changes]       ★ 12    Reply

View changes expands a diff in **the reply**, separated with one hairline.
Use small mono plus/minus markers, subdued backgrounds, accessible text
labels for added/removed lines. Do not recolor the author's lane.

### Mobile (390 px)

- Keep the code toolbar on one line; use an icon with aria-label/tooltip if
  space is insufficient.
- The normal composer is already mobile-sized; do not inject an IDE.
- Diff is scrollable within the code column, never the whole screen.
- Touch targets, keyboard focus, aria-expanded and screen reader names matter.
- Opening a diff is intentional content expansion. Other actions must not
  cause unexpected layout shift or scroll jump.

### Dark mode

Use existing tokens and Geist/Geist Mono. There is one interaction blue:
the normal action. No custom hues, gradients, confetti, new cards or badges.

## 5. Wire format (v1, ordinary reply body)

    Patch for e3f4a5b · block 1

    Avoid loose falsy filtering.

    ```php
    array_filter($ids, fn ($id) => $id !== null);
    ```

The first line is human-readable and records the *selected block ordinal*.
Nothing is stored beyond the existing reply body and parent_id.

The renderer considers this format only when:
- The reply is directly underneath the corresponding **visible** commit.
- The short hash matches the immediate parent's **full id**.
- The ordinal selects an existing eligible code block (1–20).
- Exactly the same language is used and both code bodies fit the size cap.
- A strict code fence and bounded note match the format.
- Source differs from original before we label it a proposed change.
- We never represent the header as an authenticated signature. Users can
  manually type it. That is acceptable because it grants **no privileges**.

MVP limits: source <= 2,600 Unicode code points, note <= 280, reply <= 4,000,
40,000-cell diff matrix. Longer or malformed examples fall back to normal
reply content, never crash the log.

The source grammar is deliberately stricter than an arbitrary Markdown parser.
Reject nested standalone fences until the existing highlighter is extended
and tested to preserve them without ambiguity. Do not copy raw highlighted
HTML back into the composer.

## 6. Architecture and responsibilities

**Backend:** no new routes, tables, caches, jobs, uploads or API scopes. Existing
POST commits/{commit}/replies, CreateCommitReplyRequest and moderation remain
the only publication path. Approved replies remain normal records.

**Frontend:** a small formatter/parser + bounded, deterministic line diff,
a compact UI affordance on eligible code blocks, a prefilled ordinary
ReplyComposer with draft-conflict handling, and an optional "View changes"
inside a visible reply. Code and note always render as escaped React text.

**Authorization:** backend remains the authority. The frontend does not
query an unavailable parent, bypass blocks, expose pending content or
automatically approve anything.

**Data minimization:** no new analytics identifiers, no patch DB table,
no permanent comparison cache, no tokens, and no extra network requests.
Metrics can be assessed by aggregate analysis of existing published replies.

**Failure:** if JS is unavailable or parsing fails, readers still get the
original commit/reply. A renderer failure must never block Reply, Star or
Copy. A deleted root shows the existing tombstone, not a diff.

## 7. Threat model

- Injection/XSS via source or notes: escape all dynamic text using React;
  never insert source into dangerouslySetInnerHTML or eval.
- Fake header: user-controlled representation only; never grant trust.
- Privacy: only compare **already delivered visible parent body**; never
  fetch private code or use global caches keyed by private contents.
- Resource exhaustion: cap input, patch blocks, diff cells, output lines,
  and ensure no automatic diff work on all feed entries.
- CSRF, auth, moderation, rate limits, deletion: the existing server route
  is the single enforcement point.
- Accidental draft overwrite: preserved unless the user confirms replacement.
- HTML/script pasted in code: displayed as inert text.
- No arbitrary execution, WebAssembly, external embed or third-party API.

## 8. State model

- Normal code block: idle -> Suggest requested.
- Unauthenticated Suggest: existing GitHub sign-in flow.
- Authenticated Suggest, no stash: prefilled reply. User edits, previews,
  and submits through existing Reply route.
- Authenticated Suggest, existing stash: explicit Keep or Replace.
- Publish: pending moderation -> visible to author only -> approval -> others
  see; rejection keeps normal visibility rules.
- Reply on screen: plain view -> View changes -> expanded comparison -> collapse.
- Deleted/hidden parent, renamed author, changed block: renderer fails closed
  to ordinary reply, with no leaked code.

## 9. Tests required

### Automated pure TypeScript tests

- Extract and index fenced snippets exactly and deterministically.
- Ignore missing/unclosed/empty/unlabeled/oversized blocks.
- Correctly format normal reply, including optional note and casing.
- Round-trip source and reason across LF/CRLF and Unicode.
- Reject invalid parent/ordinal/language/length/nested fences.
- Never compare an unrelated or hidden parent.
- Don't treat malformed headers as authoritative.
- Diff preserves every old/new line and line numbers.
- Diff handles ties/repeated lines/whitespace, is deterministic, and stops
  at the matrix cap. Seeded property tests reconstruct both inputs.

### Automated Laravel feature tests

- The existing authenticated Reply endpoint stores the patch as plain body.
- Ordinary moderation still applies.
- Unauthenticated, hidden, deleted or blocked parent cannot be used.
- Stars remain on the author's reply, not on the source snippet.
- Pending, rejected or deleted replies remain inaccessible to others.
- Existing 4,000 character and secret-warning enforcement is unchanged.

### UI/component tests (must run, not just compile)

- Eligible code offers one accessible Suggest control; plain text doesn't.
- Suggest brings focus to normal Reply; Enter/Ctrl+Enter/Escape preserved.
- Existing text or image draft is never overwritten without consent.
- Note/code edits update preview and no-change draft cannot be mistaken
  for a proposed fix.
- A reply without matching parent or code remains ordinary.
- View changes toggle, ARIA state, keyboard navigation, star controls intact.
- Multiple blocks use correct ordinal, nested replies compare direct parent.
- No copies of the same global keyboard handler when multiple editors open.

### Cross-browser and product QA (manual release gates, not fake PASS)

- 1440x900, 1366x650, 390x844; light/dark/reduced motion/keyboard.
- CLS 0 for initial page, navigation, polling; intentional diff expansion
  doesn't break scroll anchoring.
- No N+1 queries, no extra backend requests, no execution.
- Production main/fork rebase, independent review, screenshots/recording,
  full CI, negative security tests.
- Five to ten developers complete real tasks, including mobile and a
  saved-draft conflict; observe whether they actually use View changes.

## 10. Success metrics (proposed acceptance hypotheses)

- At least 80% of participants understand a proposed delta without opening
  the original and reply side-by-side.
- At least 60% can create a useful correction in under 90 seconds without
  instructions (including on phone); otherwise redesign or remove it.
- No privacy leak, no corrupted drafts, no code execution, no extra database
  queries on ordinary log reads.
- No extra UI in non-code content and no new engagement currency.
- Do **not** claim adoption, improvement, speedup or community demand until
  tested against a small baseline with real users.

## 11. Rollout and kill criteria

Stage A: standalone parser and diff + negative tests.
Stage B: existing reply composer integration and accessible delta toggles.
Stage C: full repo CI + independent security/UX review.
Stage D: small opt-in preview via maintainers' agreement.
Stage E: enable only after observed value and no regressions.

Stop and rethink if the feature requires a second composer, a server runner,
a new persistence layer, an additional star system, or makes non-code feeds
more crowded. Unchanged examples must never be labeled "fixed".

## 12. Out of scope

Multi-file patches, executable snippets, diff-based auto-merge, verified
correctness, ranking by test pass rate, accepted-answer badges, AI auto-fixes,
new tabs, global leaderboards, and platform-specific PHP behavior.

## 13. Definition of Done

A feature is complete only when it fits DESIGN.md, code can be compared safely,
all automated checks including strict formatter are green, desktop/mobile
review passes, no secret/visibility bypass exists, and the maintainer wants
this behavior on /dev/null. A green PR alone is not product validation.
