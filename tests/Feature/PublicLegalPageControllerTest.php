<?php

namespace Tests\Feature;

use Tests\TestCase;

class PublicLegalPageControllerTest extends TestCase
{
    public function test_contract_draft_is_not_exposed_and_preserves_the_supplied_template(): void
    {
        config(['legal_pages.pages.contrato.status' => 'draft']);
        $this->getJson('/api/public/legal-pages/contrato')->assertNotFound();
        $this->get('/contrato')->assertNotFound()->assertHeader('X-Robots-Tag', 'noindex, nofollow');

        $sections = config('legal_pages.pages.contrato.sections');
        $this->assertCount(12, $sections);
        $content = implode("\n", array_column($sections, 'content'));
        $this->assertStringContainsString('[Código da reserva]', $content);
        $this->assertStringNotContainsString('{{', $content);
        $this->assertStringContainsString('50% do valor deverá ser pago no ato da reserva', $content);
    }

    public function test_published_contract_uses_its_own_document_route(): void
    {
        $this->withSpaIndex('<!doctype html><html><head><title>Generic</title></head><body><div id="root"></div></body></html>');
        $keys = array_column(config('legal_pages.pages.contrato.sections'), 'key');
        config(['legal_pages.pages.contrato' => $this->publishedPage('contrato', 'Contrato de locação por temporada', '2026-11-18', $keys, 'Modelo de teste.')]);

        $this->getJson('/api/public/legal-pages/contrato')->assertOk()->assertJsonPath('page.path', '/contrato');
        $this->get('/contrato')->assertOk()->assertSee('Contrato de locação por temporada | CRCN', false);
    }

    public function test_returns_404_and_noindex_when_legal_pages_are_not_published(): void
    {
        config(['legal_pages.pages.contrato.status' => 'draft']);
        $this->getJson('/api/public/legal-pages')
            ->assertOk()
            ->assertExactJson(['pages' => []]);

        $this->getJson('/api/public/legal-pages/privacidade')->assertNotFound();
        $this->getJson('/api/public/legal-pages/cancelamento')->assertNotFound();
        $this->get('/privacidade')
            ->assertNotFound()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow');
        $this->get('/termos/')
            ->assertNotFound()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow');
        $this->get('/cancelamento')
            ->assertNotFound()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow');
    }

    public function test_supplied_contract_publication_requires_authorization_for_the_exact_content(): void
    {
        $this->getJson('/api/public/legal-pages/contrato')->assertOk()->assertJsonPath('page.slug', 'contrato');
        $this->assertNull(config('legal_pages.pages.contrato.approvals.legal.reviewer'));

        config(['legal_pages.pages.contrato.sections.0.content' => 'Conteúdo alterado depois da autorização.']);
        $this->getJson('/api/public/legal-pages/contrato')->assertNotFound();
    }

    public function test_business_authorization_does_not_publish_other_legal_pages(): void
    {
        $contract = config('legal_pages.pages.contrato');
        $contract['status'] = 'published';
        config(['legal_pages.pages.termos' => $contract]);
        $this->getJson('/api/public/legal-pages/termos')->assertNotFound();
    }

    public function test_exposes_only_fully_reviewed_documents_with_required_sections(): void
    {
        $this->withSpaIndex('<!doctype html><html><head><title>Generic</title></head><body><div id="root"></div></body></html>');
        config([
            'app.url' => 'https://reservas.example.test',
            'legal_pages.pages' => [
                'privacidade' => $this->publishedPage(
                    'privacidade',
                    'Privacidade <script>alert(1)</script>',
                    '2026-10-01',
                    ['controller_contact', 'data_categories', 'purposes_legal_bases', 'sharing_processors',
                        'international_transfers', 'retention_deletion', 'data_subject_rights', 'cookies_tracking',
                        'security_incidents', 'updates'],
                    'Conteúdo em texto simples.\\n\\n<script>alert(2)</script>',
                ),
                'termos' => $this->publishedPage(
                    'termos',
                    'Termos incompletos',
                    '2026-02-31',
                    ['supplier_identity_contact', 'service_roles', 'booking_confirmation', 'price_payment_conditions',
                        'accommodation_conditions', 'payment_terms', 'changes_cancellations_refunds', 'support_complaints',
                        'consumer_rights', 'updates'],
                    'Conteúdo.',
                ),
            ],
        ]);

        $this->getJson('/api/public/legal-pages')
            ->assertOk()
            ->assertJsonCount(1, 'pages')
            ->assertJsonPath('pages.0.slug', 'privacidade')
            ->assertJsonPath('pages.0.path', '/privacidade');

        $this->getJson('/api/public/legal-pages/privacidade')
            ->assertOk()
            ->assertJsonPath('page.sections.0.content', "Conteúdo em texto simples.\n\n<script>alert(2)</script>");
        $this->getJson('/api/public/legal-pages/termos')->assertNotFound();

        $this->get('/privacidade')
            ->assertOk()
            ->assertSee('<title>Privacidade &lt;script&gt;alert(1)&lt;/script&gt; | CRCN</title>', false)
            ->assertSee('<link rel="canonical" href="https://reservas.example.test/privacidade" />', false)
            ->assertDontSee('<script>alert(1)</script>', false)
            ->assertDontSee('<script>alert(2)</script>', false);
    }

    public function test_does_not_publish_without_both_reviews_and_required_sections(): void
    {
        $privacy = $this->publishedPage(
            'privacidade',
            'Privacidade',
            '2026-10-01',
            ['controller_contact', 'data_categories', 'purposes_legal_bases', 'sharing_processors',
                'international_transfers', 'retention_deletion', 'data_subject_rights', 'cookies_tracking',
                'security_incidents', 'updates'],
            'Conteúdo.',
        );
        $privacy['approvals']['legal']['reviewer'] = '';
        $terms = $this->publishedPage('termos', 'Termos', '2026-10-01', ['supplier_identity_contact'], 'Conteúdo.');

        config(['legal_pages.pages' => ['privacidade' => $privacy, 'termos' => $terms]]);

        $this->getJson('/api/public/legal-pages')->assertExactJson(['pages' => []]);
        $this->getJson('/api/public/legal-pages/privacidade')->assertNotFound();
        $this->getJson('/api/public/legal-pages/termos')->assertNotFound();
    }

    public function test_invalidates_reviews_when_document_content_changes_without_a_new_version(): void
    {
        $privacy = $this->publishedPage(
            'privacidade',
            'Privacidade',
            '2026-10-01',
            ['controller_contact', 'data_categories', 'purposes_legal_bases', 'sharing_processors',
                'international_transfers', 'retention_deletion', 'data_subject_rights', 'cookies_tracking',
                'security_incidents', 'updates'],
            'Conteúdo aprovado.',
        );
        $privacy['sections'][0]['content'] = 'Conteúdo alterado depois da revisão.';

        config(['legal_pages.pages' => ['privacidade' => $privacy]]);

        $this->getJson('/api/public/legal-pages/privacidade')->assertNotFound();
    }

    /** @param list<string> $sectionKeys
     * @return array<string, mixed>
     */
    private function publishedPage(string $slug, string $title, string $publishedAt, array $sectionKeys, string $content): array
    {
        $version = '2.0';
        $normalizedContent = trim(str_replace(['\\r\\n', '\\n', '\\r'], "\n", $content));
        $sections = array_map(fn (string $key): array => [
            'key' => $key,
            'title' => $key === ($sectionKeys[0] ?? null) ? 'Dados' : 'Condições',
            'content' => $normalizedContent,
        ], $sectionKeys);
        $contentHash = hash('sha256', json_encode([
            'slug' => $slug,
            'version' => $version,
            'title' => $title,
            'sections' => $sections,
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        return [
            'status' => 'published',
            'version' => $version,
            'published_at' => $publishedAt,
            'approvals' => [
                'business' => ['reviewer' => 'Responsável da empresa', 'version' => $version, 'content_hash' => $contentHash, 'approved_at' => '2026-09-30'],
                'legal' => ['reviewer' => 'Revisão jurídica', 'version' => $version, 'content_hash' => $contentHash, 'approved_at' => '2026-09-30'],
            ],
            'title' => $title,
            'sections' => $sections,
        ];
    }

    private function withSpaIndex(string $html): void
    {
        $indexPath = public_path('index.html');
        $previousHtml = is_file($indexPath) ? file_get_contents($indexPath) : false;
        file_put_contents($indexPath, $html);
        $this->beforeApplicationDestroyed(static function () use ($indexPath, $previousHtml): void {
            if ($previousHtml === false) {
                if (is_file($indexPath)) {
                    unlink($indexPath);
                }

                return;
            }

            file_put_contents($indexPath, $previousHtml);
        });
    }
}
