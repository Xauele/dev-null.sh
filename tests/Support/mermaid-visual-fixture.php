<?php

declare(strict_types=1);

use App\Enums\CommitStatus;
use App\Models\Commit;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;

require dirname(__DIR__, 2).'/vendor/autoload.php';

$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$author = User::factory()->create([
    'github_id' => '251239544',
    'handle' => 'Xauele',
    'name' => 'Xauele',
    'avatar_url' => 'https://avatars.githubusercontent.com/u/251239544?v=4',
]);

$body = <<<'BODY'
Here's the deployment flow as a diagram instead of a wall of text.

```mermaid
flowchart LR
    A["PR opened"] --> B{"CI checks"}
    B -->|green| C["Staging"]
    B -->|red| D["Fix and retry"]
    D --> B
    C --> E["Production"]
```

The source stays copyable and works in commit previews, too.
BODY;

Commit::factory()->for($author)->create([
    'body' => $body,
    'status' => CommitStatus::Approved,
    'created_at' => now(),
]);

$other = User::factory()->create([
    'github_id' => '5457236',
    'handle' => 'nunomaduro',
    'name' => 'Nuno Maduro',
    'avatar_url' => 'https://avatars.githubusercontent.com/u/5457236?v=4',
]);

Commit::factory()->for($other)->create([
    'body' => 'Shipping small, focused improvements to the developer log.',
    'status' => CommitStatus::Approved,
    'created_at' => now()->subMinutes(12),
]);

echo "Seeded 2 approved test commits, including one real Mermaid block.\n";
