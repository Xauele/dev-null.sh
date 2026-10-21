<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Dto\SshSignature;
use App\Enums\CommitStatus;
use App\Models\Commit;
use App\Services\SignedCommits;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final readonly class CommitProofController
{
    public function show(Commit $commit): JsonResponse
    {
        // No proof of pending, rejected, or deleted content is publicly accessible.
        abort_unless($commit->status === CommitStatus::Approved && ! $commit->trashed(), 404);

        /** @var object{signature: string, payload: string, public_key: string, fingerprint: string, namespace: string}|null $record */
        $record = DB::table('commit_signatures')->where('commit_id', $commit->id)->first();

        abort_if($record === null, 404);

        // A corrupt DB row must never produce a misleading signed receipt.
        try {
            $signature = SshSignature::parse($record->signature);
        } catch (InvalidArgumentException) {
            abort(404);
        }

        abort_unless(
            in_array($record->namespace, [SignedCommits::Namespace, SignedCommits::ImagesNamespace], true)
            && $signature->verify($record->payload, $record->namespace)
            && hash_equals($record->public_key, $signature->publicKey->toOpenSsh())
            && hash_equals($record->fingerprint, $signature->publicKey->fingerprint())
            && hash_equals($record->fingerprint, (string) $commit->signer_fingerprint),
            404,
        );

        return response()->json([
            'version' => 1,
            'commit_id' => $commit->id,
            'html_url' => route('commit.show', [$commit->user, $commit]),
            'signer' => $commit->user?->username,
            'namespace' => $record->namespace,
            'public_key' => $signature->publicKey->toOpenSsh(),
            'fingerprint' => $signature->publicKey->fingerprint(),
            'payload_base64' => base64_encode($record->payload),
            'ssh_signature' => $signature->toArmored(),
            'displayed_body' => $commit->body,
            'note' => 'The signed payload is the original CLI submission. Display text may be normalized or expand emoji shortcodes. GitHub key ownership was checked at submission time, not reverified now.',
        ])->header('Cache-Control', 'no-store');
    }
}
