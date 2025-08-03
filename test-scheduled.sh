#!/bin/bash
# Test script for scheduled handler

echo "Testing scheduled handler endpoint..."
curl -s "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
echo ""
echo "Check the terminal running 'npm run dev' for console output"