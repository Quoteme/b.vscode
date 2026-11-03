#!/usr/bin/env bash
# Copies the server's jar to `out` for one vsix target. prob-java ships probcli for Linux, macOS and
# Windows and unpacks the one it runs on when it starts; this keeps only the target's, and adds Z3 to
# it, which prob-java's copy lacks: ProB's z3interface from the official ProB release (whose probcli
# is the same binary) and the libz3 it was built against, both loaded from probcli's lib/.
# ProB's Windows release has no Z3, so the Windows probcli stays as it is.
#
#   scripts/prepare-server-jar.sh b-language-server-all.jar linux-x64|darwin-arm64|darwin-x64|win32-x64 out.jar
set -euo pipefail

jar=$(realpath "$1")
target=$2
out=$(realpath -m "$3")

prob_url=https://stups.hhu-hosting.de/downloads/prob/tcltk/releases/1.16.1
z3_url=https://github.com/Z3Prover/z3/releases/download/z3-5.0.0
prob='' prob_sha='' z3='' z3_sha='' interface='' library=''
case $target in
  linux-x64)
    zip=probcli_linux64.zip
    prob=ProB.linux64.tar.gz prob_sha=e9f0c74a6bbf177c9146d01869afa1c4276f5fc8d3b670f31b0230f035753bef
    z3=z3-5.0.0-x64-glibc-2.39.zip z3_sha=d4922cebc9f0a55629231ec0c62f0bbedf8006eddaed4e68199ad19626b697f6
    interface=z3interface.so library=libz3.so ;;
  darwin-arm64)
    zip=probcli_macos.zip
    prob=ProB.macos.zip prob_sha=93cb8e8581ac15b327800d423c6588b134b589e87ea34abc51d6d00a7b8cedc3
    z3=z3-5.0.0-arm64-osx-13.3.zip z3_sha=28b21e9e64b50c1f45535ae9c0e35e5a5f0d0770afd9a7df939edd88051c2bdc
    interface=z3interface.bundle library=libz3.dylib ;;
  darwin-x64)
    zip=probcli_macos.zip
    prob=ProB.macos.zip prob_sha=93cb8e8581ac15b327800d423c6588b134b589e87ea34abc51d6d00a7b8cedc3
    z3=z3-5.0.0-x64-osx-13.3.zip z3_sha=bb13ae2cf3953187b67f06053ff78fef461339c14ad65c497c5d0ec6c12a6dc6
    interface=z3interface.bundle library=libz3.dylib ;;
  win32-x64)
    zip=probcli_windows64.zip ;;
  *) echo "unknown target $target" >&2; exit 1 ;;
esac
entry=de/prob/cli/binaries/$zip

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

cp "$jar" "$out"
unzip -Z1 "$out" "$entry" > /dev/null
drop=$(unzip -Z1 "$out" 'de/prob/cli/binaries/probcli_*.zip' | grep -v "/$zip\$" || true)
if [ -n "$drop" ]; then
  # The names are fixed and contain no spaces.
  # shellcheck disable=SC2086
  zip -q -d "$out" $drop
fi

if [ -n "$prob" ]; then
  fetch() {
    curl -sSfL --retry 3 -o "$work/$2" "$1/$2"
    echo "$3  $work/$2" | sha256sum -c --quiet -
  }
  fetch "$prob_url" "$prob" "$prob_sha"
  fetch "$z3_url" "$z3" "$z3_sha"

  mkdir -p "$work/probcli/lib" "$work/jar/$(dirname "$entry")"
  case $prob in
    *.tar.gz) tar -xzf "$work/$prob" -C "$work" "ProB/lib/$interface" ;;
    *.zip) unzip -q "$work/$prob" "ProB/lib/$interface" -d "$work" ;;
  esac
  cp "$work/ProB/lib/$interface" "$work/probcli/lib/"
  unzip -q -j "$work/$z3" "*/bin/$library" -d "$work/probcli/lib"
  unzip -q -p "$work/$z3" "*/LICENSE.txt" > "$work/probcli/lib/Z3-LICENSE.txt"

  unzip -q -p "$out" "$entry" > "$work/jar/$entry"
  (cd "$work/probcli" && zip -q "$work/jar/$entry" lib/*)
  (cd "$work/jar" && zip -q "$out" "$entry")
fi

unzip -Z1 "$out" 'de/prob/cli/binaries/*.zip'
unzip -p "$out" "$entry" > "$work/probcli.zip"
unzip -Z1 "$work/probcli.zip" 'lib/*z3*' 'lib/Z3*' 2>/dev/null || true
