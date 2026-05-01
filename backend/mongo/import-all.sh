#!/bin/bash

# MongoDB Import Script - Import all collections to MongoDB Atlas
# Usage: ./import-all.sh

# MongoDB Connection String
MONGO_URI="mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel"

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "MongoDB Import Script"
echo "=========================================="
echo ""

# Check if mongoimport is installed
if ! command -v mongoimport &> /dev/null
then
    echo -e "${RED}Error: mongoimport command not found${NC}"
    echo "Please install MongoDB Database Tools:"
    echo "  - Windows: choco install mongodb-database-tools"
    echo "  - macOS: brew install mongodb-database-tools"
    echo "  - Linux: sudo apt-get install mongodb-database-tools"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Counter for success/failure
SUCCESS_COUNT=0
FAIL_COUNT=0

# Function to import a collection
import_collection() {
    local collection=$1
    local file=$2

    echo -n "Importing $collection... "

    if [ ! -f "$file" ]; then
        echo -e "${RED}SKIP (file not found)${NC}"
        ((FAIL_COUNT++))
        return
    fi

    # Check if file is empty or only contains []
    if [ ! -s "$file" ] || [ "$(cat "$file" | tr -d '[:space:]')" = "[]" ]; then
        echo -e "${YELLOW}SKIP (empty)${NC}"
        return
    fi

    if mongoimport --uri="$MONGO_URI" \
                   --collection="$collection" \
                   --file="$file" \
                   --jsonArray \
                   --quiet 2>/dev/null; then
        echo -e "${GREEN}OK${NC}"
        ((SUCCESS_COUNT++))
    else
        echo -e "${RED}FAILED${NC}"
        ((FAIL_COUNT++))
    fi
}

echo "Starting import process..."
echo ""

# Core Collections
echo "=== Core Collections ==="
import_collection "users" "vngo_travel.users.json"
import_collection "zones" "vngo_travel.zones.json"
import_collection "pois" "vngo_travel.pois.json"
import_collection "userwallets" "vngo_travel.userwallets.json"
import_collection "userunlockpois" "vngo_travel.userunlockpois.json"
import_collection "userunlockzones" "vngo_travel.userunlockzones.json"
echo ""

# Admin & Management
echo "=== Admin & Management ==="
import_collection "adminpoiaudits" "vngo_travel.adminpoiaudits.json"
import_collection "poirequests" "vngo_travel.poirequests.json"
import_collection "poichangerequests" "vngo_travel.poichangerequests.json"
import_collection "poicontents" "vngo_travel.poicontents.json"
echo ""

# Analytics Collections
echo "=== Analytics Collections ==="
import_collection "uis_analytics_ingestion_cursors" "vngo_travel.uis_analytics_ingestion_cursors.json"
import_collection "uis_analytics_rollups_daily" "vngo_travel.uis_analytics_rollups_daily.json"
import_collection "uis_analytics_rollups_hourly" "vngo_travel.uis_analytics_rollups_hourly.json"
import_collection "uis_device_profiles" "vngo_travel.uis_device_profiles.json"
import_collection "uis_events_raw" "vngo_travel.uis_events_raw.json"
import_collection "uis_user_profiles" "vngo_travel.uis_user_profiles.json"
import_collection "uis_user_sessions" "vngo_travel.uis_user_sessions.json"
import_collection "uis_identity_edges" "vngo_travel.uis_identity_edges.json"
import_collection "poidailystats" "vngo_travel.poidailystats.json"
import_collection "poihourlystats" "vngo_travel.poihourlystats.json"
echo ""

# Audio Collections
echo "=== Audio Collections ==="
import_collection "audios" "vngo_travel.audios.json"
import_collection "audioassets" "vngo_travel.audioassets.json"
import_collection "audioqueues" "vngo_travel.audioqueues.json"
import_collection "audio_play_events" "vngo_travel.audio_play_events.json"
import_collection "audio_sessions" "vngo_travel.audio_sessions.json"
echo ""

# System Collections
echo "=== System Collections ==="
import_collection "devicesessions" "vngo_travel.devicesessions.json"
import_collection "translationcaches" "vngo_travel.translationcaches.json"
import_collection "credittransactions" "vngo_travel.credittransactions.json"
import_collection "events" "vngo_travel.events.json"
import_collection "languagepacks" "vngo_travel.languagepacks.json"
import_collection "qrtokenusages" "vngo_travel.qrtokenusages.json"
import_collection "revokedtokens" "vngo_travel.revokedtokens.json"
import_collection "systemevents" "vngo_travel.systemevents.json"
import_collection "zonepois" "vngo_travel.zonepois.json"
echo ""

# Summary
echo "=========================================="
echo "Import Summary"
echo "=========================================="
echo -e "Success: ${GREEN}$SUCCESS_COUNT${NC}"
echo -e "Failed:  ${RED}$FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}All collections imported successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start backend: cd ../.. && npm start"
    echo "2. Test API: curl http://localhost:3000/api/v1/zones"
    echo ""
    echo "Login credentials:"
    echo "  Admin: admin@vngo.com / password123"
    echo "  User:  user@vngo.com / password123"
    exit 0
else
    echo -e "${YELLOW}Some collections failed to import. Check errors above.${NC}"
    exit 1
fi
