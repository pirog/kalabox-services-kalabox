# docker build -t kalabox/hipache .

FROM kalabox/debian:stable

ENV DEBIAN_FRONTEND noninteractive

VOLUME ["/var/lib/redis"]

RUN \
  apt-get update -y && \
  curl -sL https://deb.nodesource.com/setup_0.12 | bash - && \
  apt-get install -y supervisor nodejs npm redis-server && \
  npm install --prefix=/usr/local -g https://github.com/kalabox/hipache/tarball/0.4.2-kbox --production && \
  mkdir -p /var/log/hipache && \
  apt-get -y clean && \
  apt-get -y autoclean && \
  apt-get -y autoremove && \
  rm -rf /var/lib/apt/* && rm -rf && rm -rf /var/lib/cache/* && rm -rf /var/lib/log/* && rm -rf /tmp/*

COPY ./config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY ./config/redis.conf /src/redis/redis.conf
COPY ./config/hipache.json /src/hipache/config.json
COPY ./config/keys.sh /src/keys/keys.sh

RUN \
  mkdir /certs && chmod +x /src/keys/keys.sh

ENV NODE_ENV production

EXPOSE 80
EXPOSE 443
EXPOSE 8160

CMD ["supervisord", "-n"]
