<?php

namespace Tests\Feature;

use Tests\TestCase;

class PublicLegalPageControllerTest extends TestCase
{
    public function test_returns_404_and_noindex_when_legal_pages_are_not_approved(): void
    {
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

    public function test_exposes_only_complete_approved_documents_and_escapes_html_metadata(): void
    {
        $this->withSpaIndex('<!doctype html><html><head><title>Generic</title></head><body><div id="root"></div></body></html>');
        config([
            'app.url' => 'https://reservas.example.test',
            'legal_pages.pages' => [
                'privacidade' => [
                    'approved' => true,
                    'version' => '1.0',
                    'published_at' => '2026-10-01',
                    'title' => 'Privacidade <script>alert(1)</script>',
                    'sections' => [['title' => 'Dados', 'content' => 'Conteúdo em texto simples. <script>alert(2)</script>']],
                ],
                'termos' => [
                    'approved' => true,
                    'version' => '2.0',
                    'published_at' => '2026-02-31',
                    'title' => 'Termos incompletos',
                    'sections' => [['title' => 'Condições', 'content' => 'Conteúdo.']],
                ],
            ],
        ]);

        $this->getJson('/api/public/legal-pages')
            ->assertOk()
            ->assertJsonCount(1, 'pages')
            ->assertJsonPath('pages.0.slug', 'privacidade')
            ->assertJsonPath('pages.0.path', '/privacidade');

        $this->getJson('/api/public/legal-pages/privacidade')
            ->assertOk()
            ->assertJsonPath('page.sections.0.content', 'Conteúdo em texto simples. <script>alert(2)</script>');
        $this->getJson('/api/public/legal-pages/termos')->assertNotFound();

        $this->get('/privacidade')
            ->assertOk()
            ->assertSee('<title>Privacidade &lt;script&gt;alert(1)&lt;/script&gt; | CRCN</title>', false)
            ->assertSee('<link rel="canonical" href="https://reservas.example.test/privacidade" />', false)
            ->assertDontSee('<script>alert(1)</script>', false)
            ->assertDontSee('<script>alert(2)</script>', false);
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
