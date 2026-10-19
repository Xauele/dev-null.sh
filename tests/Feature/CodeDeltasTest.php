<?php

declare(strict_types=1);

use App\Enums\CommitStatus;
use App\Models\Commit;
use App\Models\User;

it('publishes a code delta through the normal reply route and moderation', function (): void {
    $parent = Commit::factory()->create(['body' => "Try this:\n```php\nreturn [0, 7];\n```"]);
    $user = User::factory()->create();
    $body = 'Patch for '.mb_substr(str_replace('-', '', $parent->id), -7)." · block 1\n\n```php\nreturn [0, 7, 9];\n```";

    $response = $this->actingAs($user)->postJson(route('commit-reply.store', $parent), ['body' => $body]);

    $response->assertCreated()->assertJsonPath('committed.body', $body);

    $reply = $user->commits()->sole();
    expect($reply->parent_id)->toBe($parent->id)
        ->and($reply->status)->toBe(CommitStatus::Pending);
});

it('does not let a suggested code reply bypass parent visibility', function (): void {
    $parent = Commit::factory()->pending()->create();
    $user = User::factory()->create();

    $this->actingAs($user)->postJson(route('commit-reply.store', $parent), [
        'body' => "Patch for ".mb_substr(str_replace('-', '', $parent->id), -7)." · block 1\n\n```php\nreturn 1;\n```",
    ])->assertNotFound();

    expect($parent->replies()->count())->toBe(0);
});

it('does not let unauthenticated guests post suggested code', function (): void {
    $parent = Commit::factory()->create();

    $this->postJson(route('commit-reply.store', $parent), [
        'body' => "Patch for 1234567 · block 1\n\n```php\nreturn 1;\n```",
    ])->assertUnauthorized();

    expect($parent->replies()->count())->toBe(0);
});

it('keeps the existing stars on the suggested reply, not on the code block', function (): void {
    config(['app.admins' => ['patch_author']]);
    $author = User::factory()->create(['username' => 'patch_author']);
    $viewer = User::factory()->create();
    $parent = Commit::factory()->create();
    $reply = Commit::factory()->for($parent, 'parent')->for($author)->create(['body' => "Patch for 1234567 · block 1\n\n```php\nreturn 1;\n```"]);

    $this->actingAs($viewer)->postJson(route('commit-star.store', $reply))
        ->assertOk()->assertJsonPath('stars_count', 1);

    expect($viewer->hasStarred($reply))->toBeTrue()
        ->and($viewer->hasStarred($parent))->toBeFalse();
});
