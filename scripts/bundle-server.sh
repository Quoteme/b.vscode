#!/usr/bin/env bash
# Puts b-language-server into server/ for the vsix of the platform this runs on: the server's jar
# (see scripts/strip-probcli.sh) and a Java runtime jlinked from the JDK this runs with.
#
#   scripts/bundle-server.sh path/to/b-language-server.jar
set -euo pipefail

rm -rf server
mkdir -p server
cp "$1" server/b-language-server.jar

# The modules jdeps finds, and those it cannot see: TLS and zip file systems.
modules=$(jdeps --print-module-deps --ignore-missing-deps --multi-release 17 server/b-language-server.jar)
jlink \
  --add-modules "$modules,jdk.crypto.ec,jdk.zipfs" \
  --strip-debug --no-header-files --no-man-pages --compress=zip-6 \
  --output server/jre

du -sh server/*
