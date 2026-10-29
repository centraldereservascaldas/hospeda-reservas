#!/bin/sh
set -eu

marker=/tmp/hospeda-migrations-ready
rm -f "$marker"

until php artisan migrate --force; do
    echo 'Database migrations are not ready; retrying in five seconds.' >&2
    sleep 5
done

touch "$marker"
echo 'Database migrations are ready.'

while true; do
    sleep 3600
done
