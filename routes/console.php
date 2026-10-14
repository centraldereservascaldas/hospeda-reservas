<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('direct-booking:recover-reservations')->everyMinute()->withoutOverlapping(5);
Schedule::command('direct-booking:recover-confirmation-emails')->everyMinute()->withoutOverlapping(5)->onOneServer();
