#!/bin/sh
set -eu

rm -f /tmp/hospeda-migrations-ready
exec /usr/bin/supervisord --nodaemon --configuration /etc/supervisor/supervisord.conf