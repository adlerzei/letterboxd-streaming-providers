#!/usr/bin/env bash
rm run.zip
zip -r run.zip . -x ./.git\* ./build.sh ./.idea\* .gitignore
