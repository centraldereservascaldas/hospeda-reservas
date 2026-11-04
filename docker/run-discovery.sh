#!/bin/sh
set -eu

until [ -f /tmp/hospeda-migrations-ready ]; do
    sleep 2
done

command -v timeout >/dev/null
php artisan stays:queue-catalog-refresh

while true; do
    status=0
    timeout --signal=TERM --kill-after=5s 50s nice -n 10 php artisan queue:work database --queue=discovery --once --stop-when-empty --sleep=3 --tries=2 --timeout=45 --memory=128 || status=$?
    case "$status" in
        0) ;;
        124)
            printf '%s\n' 'Discovery attempt exceeded the process time budget.' >&2
            sleep 3
            ;;
        137)
            printf '%s\n' 'Discovery process was killed before completion.' >&2
            sleep 3
            ;;
        *) exit "$status" ;;
    esac
done
