#!/usr/bin/env bash
echo "Building Extension"
EXTENSIONNAME="Letterboxd-Streaming-Providers"
DES=builds

TAG=$(date +"%y%m%d"_%H%M)

FIREFOXFILENAME=${EXTENSIONNAME}_Firefox_Dev_${TAG}
CHROMEFILENAME=${EXTENSIONNAME}_Chrome_Opera_Dev_${TAG}

mkdir -p $DES
cd extension/

zip -r ${FIREFOXFILENAME}.xpi *
mv ${FIREFOXFILENAME}.xpi ../$DES/

zip -r ${CHROMEFILENAME}.zip *
mv ${CHROMEFILENAME}.zip ../$DES/

echo "Package done."
