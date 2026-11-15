<?php

namespace App\Services;

use DateTimeImmutable;

class LegalPageRegistry
{
    private const REQUIRED_SECTIONS = [
        'privacidade' => [
            'controller_contact',
            'data_categories',
            'purposes_legal_bases',
            'sharing_processors',
            'international_transfers',
            'retention_deletion',
            'data_subject_rights',
            'cookies_tracking',
            'security_incidents',
            'updates',
        ],
        'termos' => [
            'supplier_identity_contact',
            'service_roles',
            'booking_confirmation',
            'price_payment_conditions',
            'accommodation_conditions',
            'payment_terms',
            'changes_cancellations_refunds',
            'support_complaints',
            'consumer_rights',
            'updates',
        ],
        'cancelamento' => [
            'supplier_identity_contact',
            'cancellation_windows',
            'change_and_no_show_rules',
            'refund_method_and_timing',
            'consumer_rights',
            'support_complaints',
        ],
    ];

    private const PAGE_PATHS = [
        'privacidade' => '/privacidade',
        'termos' => '/termos',
        'cancelamento' => '/cancelamento',
    ];

    /**
     * @return list<array{slug: string, path: string, title: string, version: string, publishedAt: string}>
     */
    public function all(): array
    {
        $pages = [];

        foreach (array_keys(self::PAGE_PATHS) as $slug) {
            $page = $this->find($slug);
            if ($page === null) {
                continue;
            }

            $pages[] = [
                'slug' => $slug,
                'path' => self::PAGE_PATHS[$slug],
                'title' => $page['title'],
                'version' => $page['version'],
                'publishedAt' => $page['publishedAt'],
            ];
        }

        return $pages;
    }

    /**
     * @return array{slug: string, path: string, title: string, version: string, publishedAt: string, sections: list<array{title: string, content: string}>}|null
     */
    public function find(string $slug): ?array
    {
        if (! array_key_exists($slug, self::PAGE_PATHS)) {
            return null;
        }

        $entry = config("legal_pages.pages.{$slug}");
        if (! is_array($entry) || ($entry['status'] ?? null) !== 'published') {
            return null;
        }

        $version = $entry['version'] ?? null;
        $publishedAt = $entry['published_at'] ?? null;
        $title = $entry['title'] ?? null;
        $sections = $entry['sections'] ?? null;
        $approvals = $entry['approvals'] ?? null;

        if (! is_string($version) || trim($version) === '' ||
            ! is_string($publishedAt) || ! $this->isValidDate($publishedAt) ||
            ! is_string($title) || trim($title) === '' ||
            ! is_array($sections) || $sections === []) {
            return null;
        }

        $validatedSections = [];
        $hashSections = [];
        $sectionKeys = [];
        foreach ($sections as $section) {
            if (! is_array($section) ||
                ! is_string($section['key'] ?? null) || trim($section['key']) === '' ||
                ! is_string($section['title'] ?? null) || trim($section['title']) === '' ||
                ! is_string($section['content'] ?? null) || trim($section['content']) === '') {
                return null;
            }

            $sectionKey = trim($section['key']);
            if (in_array($sectionKey, $sectionKeys, true)) {
                return null;
            }
            $sectionKeys[] = $sectionKey;
            $content = trim(str_replace(['\\r\\n', '\\n', '\\r'], "\n", $section['content']));
            $hashSections[] = [
                'key' => $sectionKey,
                'title' => trim($section['title']),
                'content' => $content,
            ];
            $validatedSections[] = [
                'title' => trim($section['title']),
                'content' => $content,
            ];
        }

        if (array_diff(self::REQUIRED_SECTIONS[$slug], $sectionKeys) !== []) {
            return null;
        }

        $contentHash = $this->contentHash($slug, trim($version), trim($title), $hashSections);
        if (! $this->hasCurrentApprovals($approvals, trim($version), $publishedAt, $contentHash)) {
            return null;
        }

        return [
            'slug' => $slug,
            'path' => self::PAGE_PATHS[$slug],
            'title' => trim($title),
            'version' => trim($version),
            'publishedAt' => $publishedAt,
            'sections' => $validatedSections,
        ];
    }

    private function isValidDate(string $date): bool
    {
        $parsedDate = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        $errors = DateTimeImmutable::getLastErrors();

        return $parsedDate !== false && $parsedDate->format('Y-m-d') === $date &&
            ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0));
    }

    private function hasCurrentApprovals(mixed $approvals, string $version, string $publishedAt, string $contentHash): bool
    {
        if (! is_array($approvals)) {
            return false;
        }

        foreach (['business', 'legal'] as $reviewType) {
            $approval = $approvals[$reviewType] ?? null;
            if (! is_array($approval) ||
                ! is_string($approval['reviewer'] ?? null) || trim($approval['reviewer']) === '' ||
                ! is_string($approval['version'] ?? null) || $approval['version'] !== $version ||
                ! is_string($approval['content_hash'] ?? null) || ! hash_equals($contentHash, $approval['content_hash']) ||
                ! is_string($approval['approved_at'] ?? null) || ! $this->isValidDate($approval['approved_at']) ||
                $approval['approved_at'] > $publishedAt) {
                return false;
            }
        }

        return true;
    }

    /** @param list<array{key: string, title: string, content: string}> $sections */
    private function contentHash(string $slug, string $version, string $title, array $sections): string
    {
        return hash('sha256', json_encode([
            'slug' => $slug,
            'version' => $version,
            'title' => $title,
            'sections' => $sections,
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
}
