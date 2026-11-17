#!/bin/sh
set -eu

until [ -f /tmp/hospeda-migrations-ready ]; do
    sleep 2
done

exec /usr/local/bin/apache2-foreground