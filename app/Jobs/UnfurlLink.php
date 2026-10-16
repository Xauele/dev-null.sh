<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Actions\UpdateLinkPreview;
use App\Models\LinkPreview;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Attributes\Backoff;
use Illuminate\Queue\Attributes\DeleteWhenMissingModels;
use Illuminate\Queue\Attributes\Tries;
use Illuminate\Queue\Attributes\UniqueFor;

#[Backoff([60, 600])]
#[Tries(3)]
#[UniqueFor(3600)]
#[DeleteWhenMissingModels]
final class UnfurlLink implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public function __construct(public readonly LinkPreview $linkPreview)
    {
        //
    }

    /**
     * Deduplicate queued and retrying jobs that refer to the same link preview.
     */
    public function uniqueId(): string
    {
        return $this->linkPreview->id;
    }

    /**
     * Skip work when another job has fetched the preview already.
     */
    public function handle(UpdateLinkPreview $action): void
    {
        if ($this->linkPreview->fetched_at !== null) {
            return;
        }

        $action->handle($this->linkPreview);
    }

    /**
     * Once every attempt has failed, the link preview is marked as fetched without metadata, so it is not tried again.
     */
    public function failed(): void
    {
        $this->linkPreview->update(['fetched_at' => now()]);
    }
}
