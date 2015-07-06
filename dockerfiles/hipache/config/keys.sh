#!/bin/sh

# Set up our certs
if [ ! -f "/certs/binding.pem" ]; then
  openssl genrsa -out /certs/binding.key 2048 && \
  openssl req -new -x509 -key /certs/binding.key -out /certs/binding.crt -days 365 -subj "/C=US/ST=California/L=Oakland/O=Kalabox/OU=KB/CN=*.${DOMAIN}" && \
  cat /certs/binding.crt /certs/binding.key > /certs/binding.pem && \
  mkdir /usr/share/ca-certificates/*.${DOMAIN} && \
  cp /certs/binding.crt /usr/share/ca-certificates/*.${DOMAIN}/binding.crt && \
  echo "*.${DOMAIN}/binding.crt" >> /etc/ca-certificates.conf && \
  update-ca-certificates --fresh
fi
