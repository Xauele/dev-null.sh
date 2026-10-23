# Commit sitemap XML rendering benchmark

## Baseline and scope

Upstream [#309](https://github.com/nunomaduro/dev-null.sh/pull/309) already
avoids Eloquent hydration and loads commit + image data using set-based SQL.
This PR keeps that query unchanged and evaluates **only** whether replacing
the Blade rendering layer with a direct XML serializer adds measurable value.

The synthetic dataset contains **10,000 commit URLs, with 2,500 image URLs**.
The benchmark warms both implementations, checks canonical XML equivalence,
and performs **30 alternating measurements** of each renderer on the same
GitHub Actions runner. Units are wall time in milliseconds.

| GitHub Actions run | Blade p50 | Direct XML p50 | Blade p95 | Direct XML p95 |
| --- | ---: | ---: | ---: | ---: |
| [Run 39575154091](https://github.com/Xauele/dev-null.sh/actions/runs/39575154091) | 36.393 | 13.022 | 37.215 | 13.601 |
| [Run 39575841934](https://github.com/Xauele/dev-null.sh/actions/runs/39575841934) | 40.171 | 13.076 | 42.053 | 13.335 |

The observed **render-only median ratio** is about **2.8x to 3.1x**.
This is a microbenchmark, **not an endpoint speedup**: it excludes SQL,
route generation, middleware and HTTP delivery, which may dominate total
latency. Results are runner- and fixture-specific, not production SLO claims.

## Correctness and integration

Canonical XML structures matched in both benchmark runs. The new unit tests
also validate escaping, image nodes, empty sitemaps and 10,000 URL entries.
The existing feature tests cover image order and ETag.

The fork's full CI is not green. The first run encountered unrelated baseline
failures in several non-sitemap features; the targeted sitemap feature tests
then returned empty HTTP bodies and unexpected 200s even for missing routes,
indicating a broader test environment/runtime failure. Therefore, do not
treat those feature tests as verified until that issue is resolved.

The existing single-query sitemap SQL introduced upstream remains intact.
