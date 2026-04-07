#!/bin/bash
# STORMS — štartovací skript
# Použitie: ./start.sh [dev|prod]

MODE=${1:-dev}
cd "$(dirname "$0")"

if [ "$MODE" = "prod" ]; then
  echo "▶ Spúšťam STORMS v produkčnom móde..."
  if [ ! -f .env ]; then
    echo "❌ Chýba .env súbor! Skopíruj .env.example a nastav JWT_SECRET."
    exit 1
  fi
  mkdir -p data backups
  docker compose -f docker-compose.prod.yml up -d --build
  echo "✅ STORMS beží → http://localhost"
  echo "   Logy: docker compose -f docker-compose.prod.yml logs -f"
else
  echo "▶ Spúšťam STORMS v dev móde..."
  docker compose up -d --build
  echo "✅ STORMS beží → http://localhost"
  echo "   Logy: docker compose logs -f"
fi
