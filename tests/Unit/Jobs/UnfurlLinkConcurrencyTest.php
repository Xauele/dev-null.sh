<?php

declare(strict_types=1);

use App\Actions\CreateCommit;
use App\Jobs\UnfurlLink;
use App\Models\LinkPreview;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;

it('waits for the outer transaction before dispatching link preview jobs', function (): void {
    Queue::fake();

    $user = User::factory()->create();

    DB::transaction(function () use ($user): void {
        resolve(CreateCommit::class)->handle($user, 'Check https://example.com/');

        Queue::assertNotPushed(UnfurlLink::class);
    });

    Queue::assertPushed(UnfurlLink::class, 1);
});

it('does not dispatch link preview jobs for rolled back commits', function (): void {
    Queue::fake();

    $user = User::factory()->create();

    expect(function () use ($user): void {
        DB::transaction(function () use ($user): void {
            resolve(CreateCommit::class)->handle($user, 'Check https://example.com/');

            throw new RuntimeException('Commit aborted');
        });
    })->toThrow(RuntimeException::class, 'Commit aborted');

    Queue::assertNotPushed(UnfurlLink::class);

    resolve(CreateCommit::class)->handle($user, 'Try again https://example.com/');

    Queue::assertPushed(UnfurlLink::class, 1);
});

it('enqueues a single job for repeated links and separate jobs for different links', function (): void {
    $first = LinkPreview::factory()->create(['url' => 'https://example.com/first']);
    $second = LinkPreview::factory()->create(['url' => 'https://example.com/second']);

    dispatch(new UnfurlLink($first));
    dispatch(new UnfurlLink($first));
    dispatch(new UnfurlLink($second));

    expect(DB::table('jobs')->count())->toBe(2);
});

it('queues only one job when two commits reference the same unfetched link', function (): void {
    $user = User::factory()->create();
    $action = resolve(CreateCommit::class);

    $action->handle($user, 'First https://example.com/');
    $action->handle($user, 'Second https://example.com/');

    expect(LinkPreview::query()->count())->toBe(1)
        ->and(DB::table('jobs')->count())->toBe(1);
});
