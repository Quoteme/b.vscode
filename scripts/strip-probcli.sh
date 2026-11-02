#!/usr/bin/env bash
# Copies the server's jar to `out`, keeping only the probcli of platform `os`: prob-java ships
# probcli for Linux, macOS and Windows, and unpacks the one it runs on into ~/.prob on first use.
#
#   scripts/strip-probcli.sh b-language-server-all.jar linux|macos|windows out.jar
set -euo pipefail

jar=$1
os=$2
out=$3
case $os in
  linux) keep=probcli_linux64.zip ;;
  macos) keep=probcli_macos.zip ;;
  windows) keep=probcli_windows64.zip ;;
  *) echo "unknown platform $os" >&2; exit 1 ;;
esac

cp "$jar" "$out"
unzip -Z1 "$out" "de/prob/cli/binaries/$keep" > /dev/null
drop=$(unzip -Z1 "$out" 'de/prob/cli/binaries/probcli_*.zip' | grep -v "/$keep\$" || true)
if [ -n "$drop" ]; then
  # The names are fixed and contain no spaces.
  # shellcheck disable=SC2086
  zip -q -d "$out" $drop
fi
