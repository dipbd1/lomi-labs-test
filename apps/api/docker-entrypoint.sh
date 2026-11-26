#!/bin/sh
set -e
cd /app/apps/api
./node_modules/.bin/prisma migrate deploy
node dist/seed.js
node dist/main.js
