#!/bin/bash

# Writingway 2.0 Startup Script for Mac/Linux
# This script starts the web server. Configure AI providers in the app.

echo ""
echo "================================"
echo "  Starting Writingway 2.0..."
echo "================================"
echo ""

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "[!] Python 3 not found!"
    echo ""
    echo "Please install Python 3:"
    echo "  Mac: brew install python3"
    echo "  Linux: sudo apt install python3"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

echo "[OK] Python 3 found"
echo ""

echo ""
echo "================================"
echo "   Starting Web Server..."
echo "================================"
echo ""

echo "[*] Starting web server on port 8787..."
echo "[*] Opening Writingway in 3 seconds..."
echo ""
echo "================================"
echo "   Writingway is starting!"
echo "================================"
echo ""
echo "PLEASE NOTE:"
echo "  * The browser window will appear in ~3 seconds"
echo "  * Configure AI from the in-app settings"
echo "  * Keep this terminal open while using Writingway"
echo ""
echo "Web UI: http://localhost:8787/main.html"
echo ""

# Wait 3 seconds before opening browser
sleep 3

echo "[*] Opening browser now..."
echo ""
echo "Press Ctrl+C to stop all servers."
echo "================================"
echo ""

# Open browser (works on Mac and most Linux)
if command -v open &> /dev/null; then
    # macOS
    open "http://localhost:8787/main.html"
elif command -v xdg-open &> /dev/null; then
    # Linux
    xdg-open "http://localhost:8787/main.html" &
fi

# Start Python web server (this blocks)
python3 -m http.server 8787

# Cleanup when Python server stops
echo ""
echo "[*] Shutting down servers..."
echo "[*] All servers stopped."
