#!/bin/bash

# Test Script Runner für Template-Version Relations
# Ruft die Test-Route auf

BASE_URL="http://localhost:1337"

# Check if .env exists and load it
if [ -f "../../../.env" ]; then
  echo "Loading environment from .env..."
  export $(cat ../../../.env | grep -v '^#' | xargs)
fi

# Admin credentials
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

if [ -z "$ADMIN_PASSWORD" ]; then
  echo "❌ ADMIN_PASSWORD not set. Please set it in .env or as environment variable."
  exit 1
fi

echo "🔑 Authenticating..."
# Login
AUTH_RESPONSE=$(curl -s -X POST "${BASE_URL}/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}")

TOKEN=$(echo $AUTH_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Authentication failed!"
  echo $AUTH_RESPONSE
  exit 1
fi

echo "✅ Authenticated!"
echo ""
echo "🧪 Running Template-Version Relations Test..."
echo ""

# Run test
curl -X POST "${BASE_URL}/magic-mail/test/relations" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  | jq '.'

echo ""
echo "✅ Test completed!"

