<?php

namespace App\Services;

class PublicPageRegistry
{
    public function origin(): string
    {
        $url = rtrim((string) config('app.url'), '/');
        $parts = parse_url($url);
        if (! is_array($parts) || ! in_array($parts['scheme'] ?? '', ['http', 'https'], true)
            || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])
        ) {
            throw new \LogicException('APP_URL must contain an HTTP(S) host without credentials.');
        }

        return $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');
    }

    /** @return array<string, array{title: string, description: string, heading: string, sections: list<array{title: string, content: string}>, destination?: string}> */
    public function all(): array
    {
        return config('public_pages', []);
    }

    /** @return array{title: string, description: string, heading: string, sections: list<array{title: string, content: string}>, destination?: string}|null */
    public function find(string $path): ?array
    {
        return $this->all()[trim($path, '/')] ?? null;
    }

    public function schemaJson(string $path, string $title, array $entities = []): string
    {
        return json_encode(
            ['@context' => 'https://schema.org', '@graph' => [...$this->structuredData($path, $title), ...$entities]],
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        );
    }

    /** @return list<array<string, mixed>> */
    public function structuredData(string $path, string $title): array
    {
        $origin = $this->origin();
        $organization = ['@type' => 'Organization', '@id' => $origin.'/#organization',
            'name' => 'Central de Reservas Caldas Novas', 'url' => $origin.'/'];
        $website = ['@type' => 'WebSite', '@id' => $origin.'/#website', 'url' => $origin.'/',
            'name' => $organization['name'], 'inLanguage' => 'pt-BR', 'publisher' => ['@id' => $organization['@id']]];
        $page = ['@type' => 'WebPage', '@id' => $origin.$path.'#webpage', 'url' => $origin.$path,
            'name' => $title, 'inLanguage' => 'pt-BR', 'isPartOf' => ['@id' => $website['@id']]];
        $graph = [$organization, $website, $page];
        if ($path !== '/') {
            $graph[] = ['@type' => 'BreadcrumbList', 'itemListElement' => [
                ['@type' => 'ListItem', 'position' => 1, 'name' => 'Início', 'item' => $origin.'/'],
                ['@type' => 'ListItem', 'position' => 2, 'name' => $title, 'item' => $origin.$path],
            ]];
        }

        return $graph;
    }
}
