# Build the Vite application with the current Node.js LTS release.
FROM node:24.22.1-bookworm-slim AS frontend

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_GTM_ID
ARG VITE_MERCADO_PAGO_PUBLIC_KEY

ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV VITE_GTM_ID=${VITE_GTM_ID}
ENV VITE_MERCADO_PAGO_PUBLIC_KEY=${VITE_MERCADO_PAGO_PUBLIC_KEY}

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Serve Laravel and the compiled SPA from one PHP/Apache container.
FROM php:8.5.12-apache-bookworm AS runtime

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public \
    APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libpq-dev libpq5 unzip \
    && docker-php-ext-install opcache pdo_pgsql pdo_sqlite \
    && apt-get purge -y --auto-remove libpq-dev \
    && rm -rf /var/lib/apt/lists/* \
    && a2enmod headers rewrite \
    && sed -ri "s!/var/www/html!${APACHE_DOCUMENT_ROOT}!g" /etc/apache2/sites-available/*.conf \
    && printf '%s\n' \
        '<Directory /var/www/html/public>' \
        '    AllowOverride All' \
        '    Require all granted' \
        '</Directory>' \
        > /etc/apache2/conf-available/laravel.conf \
    && a2enconf laravel

WORKDIR /var/www/html

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
COPY --chown=www-data:www-data . .
COPY --from=frontend --chown=www-data:www-data /app/dist/ ./public/

RUN mkdir -p \
        database \
        storage/framework/cache/data \
        storage/framework/sessions \
        storage/framework/views \
        storage/logs \
        bootstrap/cache \
    && touch database/database.sqlite \
    && chown -R www-data:www-data database storage bootstrap/cache

USER www-data
RUN composer install \
    --no-dev \
    --no-interaction \
    --no-progress \
    --optimize-autoloader \
    --prefer-dist

USER root

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1/api/ready || exit 1

CMD ["apache2-foreground"]
