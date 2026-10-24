<?php

use App\Http\Controllers\Api\AccommodationController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\CheckoutPaymentController;
use App\Http\Controllers\Api\GuestReservationController;
use App\Http\Controllers\Api\MercadoPagoWebhookController;
use App\Http\Controllers\Api\OwnerAccessController;
use App\Http\Controllers\Api\OwnerAdminController;
use App\Http\Controllers\Api\OwnerDashboardController;
use App\Http\Controllers\Api\SofiaController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['success' => true, 'service' => 'hospeda-reservas-api']));

Route::get('/resorts', [AccommodationController::class, 'resorts']);
Route::get('/accommodations', [AccommodationController::class, 'index']);
Route::get('/accommodations/{id}', [AccommodationController::class, 'show']);
Route::post('/search', [AccommodationController::class, 'search']);
Route::get('/accommodations/{id}/calendar', [AccommodationController::class, 'calendar']);
Route::post('/price', [BookingController::class, 'price']);
Route::get('/stays/status', [BookingController::class, 'staysStatus']);

Route::middleware('supabase.guest')->group(function (): void {
    Route::post('/auth/sync-stays', [GuestReservationController::class, 'sync']);
    Route::get('/my-reservations', [GuestReservationController::class, 'index']);
    Route::get('/my-direct-booking-orders', [GuestReservationController::class, 'directBookingOrders'])
        ->middleware('throttle:direct-booking-orders');
    Route::get('/my-direct-booking-orders/{publicReference}/checkout', [BookingController::class, 'resumeCheckout'])->middleware('throttle:checkout-resume');
    Route::post('/my-direct-booking-orders/{publicReference}/checkout/payments', [CheckoutPaymentController::class, 'store'])->middleware('throttle:5,1');
    Route::post('/my-direct-booking-orders/{publicReference}/cancel', [GuestReservationController::class, 'requestDirectBookingCancellation'])->middleware('throttle:5,1');
    Route::post('/my-reservations/{reservationId}/cancel', [GuestReservationController::class, 'cancel']);
    Route::get('/owner/access', [OwnerAccessController::class, 'show']);
    Route::post('/owner/access/request', [OwnerAccessController::class, 'requestAccess']);
    Route::get('/owner/dashboard', [OwnerDashboardController::class, 'show']);
});
Route::post('/sofia/chat', [SofiaController::class, 'chat']);
Route::get('/owner/admin/status', [OwnerAdminController::class, 'status'])->middleware('supabase.guest');
Route::middleware(['supabase.guest', 'owner.admin'])->prefix('owner/admin')->group(function (): void {
    Route::get('/requests', [OwnerAdminController::class, 'requests']);
    Route::get('/direct-booking-orders', [OwnerAdminController::class, 'directBookingOrders']);
    Route::post('/direct-booking-webhooks/{webhookId}/retry', [OwnerAdminController::class, 'retryDirectBookingWebhook'])->middleware('throttle:10,1');
    Route::post('/direct-booking-orders/{publicReference}/start-manual-cancellation', [OwnerAdminController::class, 'startManualDirectBookingCancellation'])->middleware('throttle:10,1');
    Route::post('/direct-booking-orders/{publicReference}/verify-manual-stays-cancellation', [OwnerAdminController::class, 'verifyManualDirectBookingStaysCancellation'])->middleware('throttle:10,1');
    Route::post('/direct-booking-orders/{publicReference}/verify-manual-gateway-refund', [OwnerAdminController::class, 'verifyManualDirectBookingGatewayRefund'])->middleware('throttle:10,1');
    Route::post('/direct-booking-orders/{publicReference}/revoke-resume-token', [OwnerAdminController::class, 'revokeDirectBookingResumeToken'])->middleware('throttle:10,1');
    Route::get('/stays-owners', [OwnerAdminController::class, 'staysOwners']);
    Route::post('/approve', [OwnerAdminController::class, 'approve']);
});
Route::post('/checkout', [BookingController::class, 'createCheckoutOrder'])->middleware('throttle:5,1');
Route::get('/checkout/terms/{listingId}', [BookingController::class, 'checkoutTerms'])->middleware('throttle:30,1');
Route::get('/checkout/readiness/{listingId}', [BookingController::class, 'checkoutReadiness'])->middleware('throttle:30,1');
Route::get('/checkout/{publicReference}', [BookingController::class, 'resumeCheckout'])->middleware('throttle:checkout-resume');
Route::post('/checkout/{publicReference}/payments', [CheckoutPaymentController::class, 'store'])->middleware('throttle:5,1');
Route::post('/webhooks/mercadopago', MercadoPagoWebhookController::class)->middleware('throttle:120,1');

Route::get('/external/v1/content/listings', [AccommodationController::class, 'staysListings']);
Route::get('/external/v1/content/listings/{id}', [AccommodationController::class, 'staysListing']);
Route::get('/accommodations/{id}/rooms', [AccommodationController::class, 'rooms']);
Route::get('/external/v1/content/listing-rooms/{id}', [AccommodationController::class, 'rooms']);
Route::get('/external/v1/translation/listing-amenities', [AccommodationController::class, 'listingAmenities']);
Route::get('/external/v1/translation/property-amenities', [AccommodationController::class, 'propertyAmenities']);
Route::post('/external/v1/booking/search-listings', [AccommodationController::class, 'searchListings']);
Route::get('/external/v1/calendar/listing/{id}', [AccommodationController::class, 'legacyCalendar']);
Route::post('/external/v1/booking/calculate-price', [BookingController::class, 'staysPrice']);
Route::post('/external/v1/book-request', fn () => response()->json(['error' => 'Use o checkout hospedado da Stays.'], 410));
