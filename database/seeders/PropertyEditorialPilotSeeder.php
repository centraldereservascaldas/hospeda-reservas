<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class PropertyEditorialPilotSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            throw new RuntimeException('Os dados demonstrativos do piloto não devem ser inseridos em produção.');
        }

        $items = [
            [
                'external_id' => 'imobsys-crcn-1-961',
                'title' => 'PIAZZA DIROMA | Apto 00204',
                'description' => '01 quarto, sala e copa (com acesso ao diRoma Acqua Park) Entrada 14h | Saida 10h #geladeira #piscina #tela',
                'draft_description' => "O apartamento 204 fica no Piazza diRoma.\n\nO espaço\n• 1 quarto\n• Sala\n• Copa\n\nAcesso ao parque e horários\nSegundo as informações do parceiro, a hospedagem inclui acesso ao diRoma Acqua Park. A entrada é às 14h e a saída às 10h.",
                'draft_amenities' => ['Geladeira', 'Piscina'],
                'observed_at' => '2026-11-20 23:58:02+00:00',
            ],
            [
                'external_id' => 'imobsys-crcn-1-1038',
                'title' => 'AGUAS DA FONTE | Apto B0205',
                'description' => '01 quarto, banheiro, sala e cozinha Entrada 14h | Saida 10h #fogao #geladeira #piscina #tela',
                'draft_description' => "O apartamento B0205 fica no Águas da Fonte.\n\nO espaço\n• 1 quarto\n• Banheiro\n• Sala\n• Cozinha\n\nHorários\nSegundo as informações do parceiro, a entrada é às 14h e a saída às 10h.",
                'draft_amenities' => ['Fogão', 'Geladeira', 'Piscina'],
                'observed_at' => '2026-11-20 23:00:10+00:00',
            ],
        ];

        foreach ($items as $item) {
            DB::transaction(function () use ($item): void {
                if (DB::table('property_editorial_sources')->where('provider', 'imobsys')->where('external_id', $item['external_id'])->exists()) {
                    return;
                }
                $now = now();
                $propertyId = DB::table('property_editorial_properties')->insertGetId([
                    'internal_label' => $item['title'], 'created_at' => $now, 'updated_at' => $now,
                ]);
                DB::table('property_editorial_sources')->insert([
                    'property_id' => $propertyId, 'provider' => 'imobsys', 'external_id' => $item['external_id'],
                    'source_title' => $item['title'], 'source_description' => $item['description'],
                    'source_amenities' => null, 'observed_at' => $item['observed_at'], 'created_at' => $now, 'updated_at' => $now,
                ]);
                DB::table('property_editorial_revisions')->insert([
                    'property_id' => $propertyId, 'version' => 1, 'status' => 'draft',
                    'title_mode' => 'inherit', 'description_mode' => 'override', 'description' => $item['draft_description'],
                    'amenities_mode' => 'override',
                    'amenities' => json_encode(array_map(static fn (string $label): array => [
                        'label' => $label, 'location' => 'unknown', 'verification' => 'unverified', 'source' => 'imobsys_tag',
                    ], $item['draft_amenities']), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                    'created_by' => 'system:pilot', 'change_note' => 'Proposta baseada no cadastro do fornecedor, aguardando conferência.',
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            });
        }
    }
}
