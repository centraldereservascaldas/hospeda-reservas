<?php

namespace App\Http\Controllers;

use App\Services\PublicPageRegistry;
use App\Services\StaysDiscoveryCatalog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class CondominiumPageController extends Controller
{
    public function __construct(private StaysDiscoveryCatalog $catalog, private PublicPageRegistry $pages) {}

    public function index(): Response
    {
        $snapshot = $this->catalog->snapshot();
        abort_if($snapshot === null, 503, 'Estamos atualizando os empreendimentos. Tente novamente em instantes.');
        $properties = array_values(array_filter($snapshot['properties'], fn (array $property): bool => $property['listingIds'] !== []));
        usort($properties, fn (array $a, array $b): int => strnatcasecmp($a['name'], $b['name']));

        return $this->render('seo.condominiums', 'Condomínios e empreendimentos em Caldas Novas e região | CRCN', 'Conheça os empreendimentos, compare estrutura e localização e veja as acomodações de cada um para planejar sua estadia.', '/condominios', $properties !== [], [
            'properties' => $properties, 'catalog' => $this->catalog,
        ]);
    }

    public function show(string $id, ?string $slug = null): Response|RedirectResponse
    {
        $snapshot = $this->catalog->snapshot();
        abort_if($snapshot === null, 503, 'Estamos atualizando os empreendimentos. Tente novamente em instantes.');
        $property = $snapshot['properties'][$id] ?? null;
        if ($property === null) {
            foreach ($snapshot['properties'] as $candidate) {
                if (
                    $id === ($candidate['canonicalSlug'] ?? '')
                    || $id === ($candidate['slug'] ?? '')
                    || in_array($id, $candidate['aliases'] ?? [], true)
                ) {
                    $property = $candidate;
                    break;
                }
            }
        }
        if ($property === null) {
            $matches = array_values(array_filter($snapshot['properties'], fn (array $candidate): bool => ($candidate['shortId'] ?? '') !== '' && strcasecmp($candidate['shortId'], $id) === 0));
            $property = count($matches) === 1 ? $matches[0] : null;
            foreach ($snapshot['properties'] as $candidate) {
                if ($property !== null && $candidate['id'] !== $property['id'] && strcasecmp($candidate['canonicalSlug'] ?? $candidate['slug'], $id) === 0) {
                    $property = null;
                    break;
                }
            }
        }
        abort_if($property === null || $property['listingIds'] === [], 404);
        $path = $this->catalog->propertyPath($property);
        if (request()->getPathInfo() !== $path) {
            $query = http_build_query(request()->query());
            $destination = $this->pages->origin().$path.($query !== '' ? '?'.$query : '');

            return redirect($destination, 301);
        }
        $listings = array_values(array_intersect_key($snapshot['listings'], array_flip($property['listingIds'])));
        $faqs = $this->frequentlyAskedQuestions($property, count($listings));

        return $this->render('seo.condominium', $property['name'].' em '.$property['city'].' | Acomodações CRCN', Str::limit(preg_replace('/\s+/u', ' ', $property['description']) ?? '', 160), $path, $property['indexable'], [
            'property' => $property, 'listings' => $listings,
            'faqs' => $faqs,
            'catalog' => $this->catalog,
            'searchUrl' => '/?'.http_build_query(['propertyId' => $property['id'], 'destination' => $property['name']]).'#stays-apartments-catalog',
        ]);
    }

    /** @param array<string, mixed> $data */
    private function render(string $view, string $title, string $description, string $path, bool $indexable, array $data): Response
    {
        $graph = ['@context' => 'https://schema.org', '@graph' => $this->pages->structuredData($path, $title)];
        if (isset($data['property'])) {
            $property = $data['property'];
            $graph['@graph'][] = [
                '@type' => 'Place', '@id' => $this->pages->origin().$path.'#empreendimento',
                'name' => $property['name'], 'description' => $property['description'],
                'url' => $this->pages->origin().$path, 'image' => $property['images'],
                'address' => ['@type' => 'PostalAddress', 'addressLocality' => $property['city'], 'addressRegion' => $property['state']],
            ];
            if (($data['faqs'] ?? []) !== []) {
                $graph['@graph'][] = [
                    '@type' => 'FAQPage',
                    '@id' => $this->pages->origin().$path.'#perguntas-frequentes',
                    'mainEntity' => array_map(fn (array $faq): array => [
                        '@type' => 'Question',
                        'name' => $faq['question'],
                        'acceptedAnswer' => ['@type' => 'Answer', 'text' => $faq['answer']],
                    ], $data['faqs']),
                ];
            }
        }
        $response = response()->view($view, [...$data, 'title' => $title, 'description' => $description,
            'canonical' => $this->pages->origin().$path, 'indexable' => $indexable,
            'schema' => json_encode($graph, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR),
        ])->header('Content-Type', 'text/html; charset=utf-8');
        if (! $indexable) {
            $response->header('X-Robots-Tag', 'noindex, follow');
        }

        return $response;
    }

    /**
     * @param  array<string, mixed>  $property
     * @return list<array{question: string, answer: string}>
     */
    private function frequentlyAskedQuestions(array $property, int $listingCount): array
    {
        $name = $property['name'];
        $faqs = [[
            'question' => 'Quantas acomodações do '.$name.' posso consultar?',
            'answer' => 'O catálogo da Central de Reservas informa '.($listingCount === 1 ? '1 acomodação' : $listingCount.' acomodações').' vinculada'.($listingCount === 1 ? '' : 's').' ao '.$name.'. A disponibilidade depende das datas escolhidas e deve ser confirmada na busca.',
        ], [
            'question' => 'Como consultar a disponibilidade do '.$name.'?',
            'answer' => 'Escolha as datas da viagem na busca de hospedagens para consultar as acomodações vinculadas ao '.$name.', os valores e a disponibilidade para o período.',
        ]];

        $knownAmenities = [
            ['pattern' => '/wi[\s-]?fi/iu', 'label' => 'Wi-Fi', 'question' => 'O '.$name.' tem Wi-Fi?'],
            ['pattern' => '/piscin/iu', 'label' => 'piscina', 'question' => 'O '.$name.' tem piscina?'],
            ['pattern' => '/hidromass|\bhidro\b/iu', 'label' => 'hidromassagem', 'question' => 'O '.$name.' tem hidromassagem?'],
            ['pattern' => '/ar[\s-]?condicionado/iu', 'label' => 'ar-condicionado', 'question' => 'O '.$name.' oferece ar-condicionado?'],
            ['pattern' => '/estacionamento|vaga de garagem/iu', 'label' => 'estacionamento', 'question' => 'O '.$name.' tem estacionamento?'],
            ['pattern' => '/\bsauna\b/iu', 'label' => 'sauna', 'question' => 'O '.$name.' tem sauna?'],
        ];
        $amenities = implode(' ', $property['amenities'] ?? []);
        foreach ($knownAmenities as $amenity) {
            if (preg_match($amenity['pattern'], $amenities) !== 1) {
                continue;
            }
            $faqs[] = [
                'question' => $amenity['question'],
                'answer' => 'Sim. O cadastro público do '.$name.' informa '.$amenity['label'].' entre as comodidades do empreendimento. Confira também os detalhes da acomodação escolhida, pois os itens disponíveis podem variar entre unidades.',
            ];
        }

        return array_slice($faqs, 0, 6);
    }
}
