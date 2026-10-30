<?php

use App\Http\Controllers\Api\AccommodationController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\CondominiumPageController;
use App\Http\Controllers\SearchDiscoveryController;
use App\Http\Controllers\SpaController;
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

Route::get('/condominios', [CondominiumPageController::class, 'index'])->name('condominiums.index');
Route::get('/condominios/{id}/{slug?}', [CondominiumPageController::class, 'show'])
    ->where('id', '[a-zA-Z0-9_-]{1,80}')->where('slug', '[a-z0-9-]+')->name('condominiums.show');

Route::get('/robots.txt', [SearchDiscoveryController::class, 'robots'])->name('seo.robots');
Route::get('/sitemap.xml', [SearchDiscoveryController::class, 'sitemap'])->name('seo.sitemap');
Route::get('/{section}/{slug}', [SearchDiscoveryController::class, 'show'])
    ->whereIn('section', ['destinos', 'guias'])->where('slug', '[a-z0-9-]+')->name('seo.page');

Route::get('/blog/{path?}', fn () => abort(404))->where('path', '.*');

Route::get('/{path?}', SpaController::class)
    ->where('path', '^(?!api(?:/|$)|external(?:/|$)).*');
