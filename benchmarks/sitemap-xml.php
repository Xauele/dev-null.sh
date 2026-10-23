<?php

declare(strict_types=1);

use App\Services\SitemapXml;
use Illuminate\Contracts\Console\Kernel;

require dirname(__DIR__).'/vendor/autoload.php';

/** @var Illuminate\Foundation\Application $app */
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$urls = [];

for ($number = 1; $number <= 10_000; $number++) {
    $urls[] = [
        'loc' => "https://example.com/@user/commits/{$number}?tag=one&mode=two",
        'lastmod' => '2026-10-16T12:00:00+00:00',
        'images' => $number % 4 === 0
            ? ["https://example.com/images/{$number}?size=1&format=webp"]
            : [],
    ];
}

$xml = resolve(SitemapXml::class);
$renderBlade = static fn (): string => view('sitemaps.urls', ['urls' => $urls])->render();
$renderDirect = static fn (): string => $xml->render($urls);

$original = new DOMDocument;
$original->preserveWhiteSpace = false;
$updated = new DOMDocument;
$updated->preserveWhiteSpace = false;

if (! $original->loadXML($renderBlade()) || ! $updated->loadXML($renderDirect())
    || $original->C14N() !== $updated->C14N()) {
    throw new RuntimeException('Blade and direct XML renderers are not semantically equivalent.');
}

$times = ['Blade' => [], 'Direct XML' => []];

foreach (range(1, 3) as $warmup) {
    $renderBlade();
    $renderDirect();
}

foreach (range(1, 30) as $round) {
    $pairs = $round % 2 === 0
        ? ['Direct XML' => $renderDirect, 'Blade' => $renderBlade]
        : ['Blade' => $renderBlade, 'Direct XML' => $renderDirect];

    foreach ($pairs as $label => $render) {
        $started = hrtime(true);
        $render();
        $times[$label][] = (hrtime(true) - $started) / 1_000_000;
    }
}

$quantile = static function (array $data, float $percentile): float {
    sort($data);

    return $data[(int) floor((count($data) - 1) * $percentile)];
};

foreach ($times as $name => $measurements) {
    printf(
        "%s: p50 %.3f ms, p95 %.3f ms, n=%d\n",
        $name,
        $quantile($measurements, 0.50),
        $quantile($measurements, 0.95),
        count($measurements),
    );
}

printf("Dataset: 10,000 URLs, 2,500 image URLs. Render-only microbenchmark, no SQL or HTTP. DOM structure equal.\n");
