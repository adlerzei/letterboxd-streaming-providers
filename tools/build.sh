#!/usr/bin/env bash
echo "Building Extension"
EXTENSIONNAME="Letterboxd-Streaming-Providers"
DES=builds
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TAG=$(date +"%y%m%d"_%H%M)

FIREFOXFILENAME=${EXTENSIONNAME}_Firefox_Dev_${TAG}
CHROMEFILENAME=${EXTENSIONNAME}_Chrome_Opera_Dev_${TAG}

mkdir -p $DES
cd extension/

# Firefox build: replace service_worker with scripts array
bash "$SCRIPT_DIR/to-firefox-manifest.sh" manifest.json
zip -r ${FIREFOXFILENAME}.xpi *
mv ${FIREFOXFILENAME}.xpi ../$DES/

# Chrome build: replace scripts array back to service_worker
sed -i 's/"scripts": \["worker.js"\]/"service_worker": "worker.js"/' manifest.json
zip -r ${CHROMEFILENAME}.zip *
mv ${CHROMEFILENAME}.zip ../$DES/

echo "Package done."
