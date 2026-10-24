<?php

use App\Http\Controllers\Api\AccommodationController;
use App\Http\Controllers\Api\BookingController;
use Illuminate\Support\Facades\Route;

Route::get('/external/v1/content/listings', [AccommodationController::class, 'staysListings']);
Route::get('/external/v1/content/listings/{id}', [AccommodationController::class, 'staysListing']);
Route::get('/external/v1/content/listing-rooms/{id}', [AccommodationController::class, 'rooms']);
Route::get('/external/v1/translation/listing-amenities', [AccommodationController::class, 'listingAmenities']);
Route::get('/external/v1/translation/property-amenities', [AccommodationController::class, 'propertyAmenities']);
Route::post('/external/v1/booking/search-listings', [AccommodationController::class, 'searchListings']);
Route::get('/external/v1/calendar/listing/{id}', [AccommodationController::class, 'legacyCalendar']);
Route::post('/external/v1/booking/calculate-price', [BookingController::class, 'staysPrice']);
Route::post('/external/v1/book-request', fn () => response()->json(['error' => 'Use o checkout hospedado da Stays.'], 410));

Route::get('/{path?}', function (?string $path = null) {
    $nonIndexable = is_string($path) && preg_match('~^(?:(?:checkout|reservar|apartamento)/[^/]+|[a-z]{2}/apartment/[^/]+)/?$~i', $path) === 1;
    if (! $nonIndexable) {
        return response()->file(public_path('index.html'));
    }

    $html = file_get_contents(public_path('index.html'));
    if ($html === false) {
        return response('Aplicação indisponível.', 503)->header('X-Robots-Tag', 'noindex, nofollow');
    }

    $html = str_ireplace('</head>', '<meta name="robots" content="noindex, nofollow" /></head>', $html);

    return response($html)->header('Content-Type', 'text/html; charset=utf-8')
        ->header('X-Robots-Tag', 'noindex, nofollow');
})
    ->where('path', '^(?!api(?:/|$)|external(?:/|$)).*');
