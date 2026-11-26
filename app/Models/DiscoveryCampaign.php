<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DiscoveryCampaign extends Model
{
    use HasFactory;

    protected $fillable = [
        'slug',
        'title',
        'eyebrow',
        'description',
        'check_in',
        'check_out',
        'kind',
        'is_active',
        'weight',
        'display_from',
        'display_until',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'weight' => 'integer',
            'check_in' => 'date:Y-m-d',
            'check_out' => 'date:Y-m-d',
            'display_from' => 'date:Y-m-d',
            'display_until' => 'date:Y-m-d',
        ];
    }

    /**
     * Scope to only campaigns currently valid to display and with check_in in the future.
     */
    public function scopeActiveForDisplay(Builder $query, ?\DateTimeInterface $referenceDate = null): Builder
    {
        $today = ($referenceDate ?? now())->format('Y-m-d');

        return $query->where('is_active', true)
            ->where('check_in', '>', $today)
            ->where(function (Builder $q) use ($today) {
                $q->whereNull('display_from')
                    ->orWhere('display_from', '<=', $today);
            })
            ->where(function (Builder $q) use ($today) {
                $q->whereNull('display_until')
                    ->orWhere('display_until', '>=', $today);
            })
            ->orderByDesc('weight')
            ->orderBy('check_in');
    }
}
