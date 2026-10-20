<?php

use App\Http\Controllers\Api\AccommodationController;
use App\Http\Controllers\Api\BookingController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->file(public_path('index.html'));
});

Route::get('/external/v1/content/listings', [AccommodationController::class, 'staysListings']);
Route::get('/external/v1/content/listings/{id}', [AccommodationController::class, 'staysListing']);
Route::get('/external/v1/content/listing-rooms/{id}', [AccommodationController::class, 'rooms']);
Route::get('/external/v1/translation/listing-amenities', [AccommodationController::class, 'listingAmenities']);
Route::get('/external/v1/translation/property-amenities', [AccommodationController::class, 'propertyAmenities']);
Route::post('/external/v1/booking/search-listings', [AccommodationController::class, 'searchListings']);
Route::get('/external/v1/calendar/listing/{id}', [AccommodationController::class, 'legacyCalendar']);
Route::post('/external/v1/booking/calculate-price', [BookingController::class, 'staysPrice']);
Route::post('/external/v1/book-request', fn () => response()->json(['error' => 'Use o checkout hospedado da Stays.'], 410));

Route::get('/{path}', function () {
    return response()->file(public_path('index.html'));
})->where('path', '^(?!api(?:/|$)|external/v1(?:/|$)).*');
