#!/usr/bin/env bash
# Builds the self-hosted WOFF2 files of this folder from the fonts' own distributions (design D3 ·
# AD-VIS-05 · FE-PERF-06). Run once when a font changes; the WOFF2 output is committed, the sources
# are not. Needs Python 3 with fonttools and brotli: `pip install fonttools brotli`.
#
#   packages/ui/fonts/build-subsets.sh <folder with the source files below>
#
# Sources, checked against their SHA-256 before anything is built:
#   github.com/google/fonts at bd8f81ddb5c74d5c8897b36ad88b440266245103 (Google Fonts, OFL):
#     ofl/manrope/Manrope[wght].ttf · ofl/inter/Inter[opsz,wght].ttf ·
#     ofl/archivoblack/ArchivoBlack-Regular.ttf · ofl/roboto/Roboto[wdth,wght].ttf
#   mcf.org.mm/pyidaungsu-font (MCF): Pyidaungsu-2.5.3_Regular.ttf · Pyidaungsu-2.5.3_Bold.ttf
#     (licence: LICENSE-Pyidaungsu.txt)
#
# Latin families: one variable file each, the weight axis cut to 400–700 (the weights of AD-VIS-06),
# Inter's optical size and Roboto's width pinned to their defaults, and the Latin subset of Google
# Fonts. Pyidaungsu: the whole Myanmar block U+1000–U+109F (so the digits ၀–၉ stay), U+200B, and
# the Latin digits and punctuation. Every name record is kept, so each file still carries its
# copyright and licence notice (OFL).
set -euo pipefail

src=${1:?usage: build-subsets.sh <source folder>}
out=$(cd "$(dirname "$0")" && pwd)
python=${PYTHON:-python3}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

check() {
  local file=$1 sum=$2
  echo "$sum  $src/$file" | sha256sum --check --quiet - || {
    echo "build-subsets: $file does not match its checksum" >&2
    exit 1
  }
}
check 'Manrope[wght].ttf' 3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6
check 'Inter[opsz,wght].ttf' 29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031
check 'ArchivoBlack-Regular.ttf' dd9a89a019b4849f66ab75455fe7bdf931311042cbb0f0f97acc061539703180
check 'Roboto[wdth,wght].ttf' d7598e12c5dbef095ff8272cfc55da0250bd07fbdecbac8a530b9b277872a134
check 'Pyidaungsu-2.5.3_Regular.ttf' df7106c15da76f6a24c10821b43da51f54961f6bc6791fb1fcf21c6c60bb2e10
check 'Pyidaungsu-2.5.3_Bold.ttf' 6fd7f1d3f70c5cb9f663d46d7a940e18c2e9247acbed70ac8612239621586d8b

# The latin subset of Google Fonts.
latin='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
# Myanmar block, zero-width space, Latin digits and ASCII punctuation.
myanmar='U+1000-109F,U+200B,U+0020-0040,U+005B-0060,U+007B-007E,U+00A0'

subset() {
  local input=$1 unicodes=$2 name=$3
  "$python" -m fontTools.subset "$input" --unicodes="$unicodes" --layout-features='*' \
    --name-IDs='*' --name-languages='*' --flavor=woff2 --output-file="$out/$name"
  echo "build-subsets: $name $(wc -c <"$out/$name") bytes"
}

instance() {
  local input=$1 output=$2
  shift 2
  "$python" -m fontTools.varLib.instancer --quiet -o "$output" "$input" "$@"
}

instance "$src/Manrope[wght].ttf" "$work/manrope.ttf" wght=400:700
instance "$src/Inter[opsz,wght].ttf" "$work/inter.ttf" wght=400:700 opsz=drop
instance "$src/Roboto[wdth,wght].ttf" "$work/roboto.ttf" wght=400:700 wdth=drop

subset "$work/manrope.ttf" "$latin" manrope-latin.woff2
subset "$work/inter.ttf" "$latin" inter-latin.woff2
subset "$src/ArchivoBlack-Regular.ttf" "$latin" archivo-black-latin.woff2
subset "$work/roboto.ttf" "$latin" roboto-latin.woff2
subset "$src/Pyidaungsu-2.5.3_Regular.ttf" "$myanmar" pyidaungsu-regular.woff2
subset "$src/Pyidaungsu-2.5.3_Bold.ttf" "$myanmar" pyidaungsu-bold.woff2
