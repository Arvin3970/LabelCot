#!/bin/bash

echo "=========================================="
echo "  LabelCot Build Script"
echo "=========================================="

set -e

echo ""
echo "[1/4] Installing dependencies..."
npm install

echo ""
echo "[2/4] Running linter..."
npm run lint || true

echo ""
echo "[3/4] Building production bundle..."
npm run build

echo ""
echo "[4/4] Build complete!"
echo ""
echo "Output directory: dist/"
echo ""
echo "To preview the build: npm run preview"
echo "To deploy: copy dist/ folder to your web server"
echo ""
echo "=========================================="
