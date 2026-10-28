<?php

namespace App\Services;

use DateTimeImmutable;

class LegalPageRegistry
{
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
        if (! is_array($entry) || ($entry['approved'] ?? false) !== true) {
            return null;
        }

        $version = $entry['version'] ?? null;
        $publishedAt = $entry['published_at'] ?? null;
        $title = $entry['title'] ?? null;
        $sections = $entry['sections'] ?? null;

        if (! is_string($version) || trim($version) === '' ||
            ! is_string($publishedAt) || ! $this->isValidDate($publishedAt) ||
            ! is_string($title) || trim($title) === '' ||
            ! is_array($sections) || $sections === []) {
            return null;
        }

        $validatedSections = [];
        foreach ($sections as $section) {
            if (! is_array($section) ||
                ! is_string($section['title'] ?? null) || trim($section['title']) === '' ||
                ! is_string($section['content'] ?? null) || trim($section['content']) === '') {
                return null;
            }

            $validatedSections[] = [
                'title' => trim($section['title']),
                'content' => trim($section['content']),
            ];
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
}
