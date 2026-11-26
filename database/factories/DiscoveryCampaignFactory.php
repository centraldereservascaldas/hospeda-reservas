<?php

namespace Database\Factories;

use App\Models\DiscoveryCampaign;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DiscoveryCampaign>
 */
class DiscoveryCampaignFactory extends Factory
{
    protected $model = DiscoveryCampaign::class;

    public function definition(): array
    {
        $start = now()->addDays(fake()->numberBetween(10, 60));
        $end = (clone $start)->addDays(3);

        return [
            'slug' => fake()->unique()->slug(),
            'title' => fake()->sentence(3),
            'eyebrow' => 'EVENTO EM CALDAS',
            'description' => fake()->paragraph(),
            'check_in' => $start->format('Y-m-d'),
            'check_out' => $end->format('Y-m-d'),
            'kind' => 'event',
            'is_active' => true,
            'weight' => fake()->numberBetween(1, 10),
            'display_from' => now()->subDay()->format('Y-m-d'),
            'display_until' => $start->format('Y-m-d'),
        ];
    }
}
