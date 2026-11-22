# Ambiente local parecido com a Hostinger: PHP 8.3 + Apache lendo o .htaccess do projeto.
FROM php:8.3-apache

RUN apt-get update \
  && apt-get install -y --no-install-recommends libjpeg62-turbo-dev libpng-dev libwebp-dev libfreetype6-dev \
  && docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
  && docker-php-ext-install -j"$(nproc)" gd pdo_mysql exif \
  && a2enmod rewrite headers expires \
  && rm -rf /var/lib/apt/lists/*

# Limites de envio parecidos com os da Hostinger (fotos de até 8 MB)
RUN printf 'upload_max_filesize = 10M\npost_max_size = 12M\n' > /usr/local/etc/php/conf.d/vivale.ini

# Mesmas pastas do servidor: o .htaccess aponta para /home/u151095779/domains/vivalestore.com.br
ENV PASTA_DO_SITE=/home/u151095779/domains/vivalestore.com.br
COPY docker/apache-site.conf /etc/apache2/sites-available/000-default.conf
RUN mkdir -p "$PASTA_DO_SITE/public_html" "$PASTA_DO_SITE/uploads" \
  && chown -R www-data:www-data "$PASTA_DO_SITE/uploads"
