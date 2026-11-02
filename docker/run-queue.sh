#!/bin/sh
set -eu

until [ -f /tmp/hospeda-migrations-ready ]; do
    sleep 2
done

exec php artisan queue:work database --queue=default --sleep=3 --tries=5 --timeout=60 --max-time=3600
