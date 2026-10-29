#!/bin/sh
set -eu

until [ -f /tmp/hospeda-migrations-ready ]; do
    sleep 2
done

exec php artisan schedule:work
