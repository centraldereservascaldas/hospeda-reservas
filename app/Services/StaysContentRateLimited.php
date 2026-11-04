<?php

namespace App\Services;

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use RuntimeException;

class StaysContentRateLimited extends RuntimeException
{
    public function __construct(public readonly int $retryAfterSeconds)
    {
        parent::__construct('Stays public content reads are temporarily rate limited.');
    }

    public static function fromHeader(?string $header): self
    {
        $date = is_string($header) ? DateTimeImmutable::createFromFormat('!'.DateTimeInterface::RFC7231, $header, new DateTimeZone('UTC')) : false;
        $validDate = $date !== false && $date->format(DateTimeInterface::RFC7231) === $header;
        $seconds = is_string($header) && ctype_digit($header)
            ? (int) $header : ($validDate ? $date->getTimestamp() - now()->timestamp : 15);

        return new self(max(1, min(86400, $seconds)));
    }
}
