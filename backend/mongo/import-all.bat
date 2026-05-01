@echo off
REM MongoDB Import Script for Windows
REM Usage: import-all.bat

SET MONGO_URI=mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel

echo ==========================================
echo MongoDB Import Script
echo ==========================================
echo.

REM Check if mongoimport is installed
where mongoimport >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: mongoimport command not found
    echo Please install MongoDB Database Tools:
    echo   choco install mongodb-database-tools
    echo   Or download from: https://www.mongodb.com/try/download/database-tools
    exit /b 1
)

SET SUCCESS_COUNT=0
SET FAIL_COUNT=0

echo Starting import process...
echo.

echo === Core Collections ===
call :import_collection users vngo_travel.users.json
call :import_collection zones vngo_travel.zones.json
call :import_collection pois vngo_travel.pois.json
call :import_collection userwallets vngo_travel.userwallets.json
call :import_collection userunlockpois vngo_travel.userunlockpois.json
call :import_collection userunlockzones vngo_travel.userunlockzones.json
echo.

echo === Admin ^& Management ===
call :import_collection adminpoiaudits vngo_travel.adminpoiaudits.json
call :import_collection poirequests vngo_travel.poirequests.json
call :import_collection poichangerequests vngo_travel.poichangerequests.json
call :import_collection poicontents vngo_travel.poicontents.json
echo.

echo === Analytics Collections ===
call :import_collection uis_analytics_ingestion_cursors vngo_travel.uis_analytics_ingestion_cursors.json
call :import_collection uis_analytics_rollups_daily vngo_travel.uis_analytics_rollups_daily.json
call :import_collection uis_analytics_rollups_hourly vngo_travel.uis_analytics_rollups_hourly.json
call :import_collection uis_device_profiles vngo_travel.uis_device_profiles.json
call :import_collection uis_events_raw vngo_travel.uis_events_raw.json
call :import_collection uis_user_profiles vngo_travel.uis_user_profiles.json
call :import_collection uis_user_sessions vngo_travel.uis_user_sessions.json
call :import_collection uis_identity_edges vngo_travel.uis_identity_edges.json
call :import_collection poidailystats vngo_travel.poidailystats.json
call :import_collection poihourlystats vngo_travel.poihourlystats.json
echo.

echo === Audio Collections ===
call :import_collection audios vngo_travel.audios.json
call :import_collection audioassets vngo_travel.audioassets.json
call :import_collection audioqueues vngo_travel.audioqueues.json
call :import_collection audio_play_events vngo_travel.audio_play_events.json
call :import_collection audio_sessions vngo_travel.audio_sessions.json
echo.

echo === System Collections ===
call :import_collection devicesessions vngo_travel.devicesessions.json
call :import_collection translationcaches vngo_travel.translationcaches.json
call :import_collection credittransactions vngo_travel.credittransactions.json
call :import_collection events vngo_travel.events.json
call :import_collection languagepacks vngo_travel.languagepacks.json
call :import_collection qrtokenusages vngo_travel.qrtokenusages.json
call :import_collection revokedtokens vngo_travel.revokedtokens.json
call :import_collection systemevents vngo_travel.systemevents.json
call :import_collection zonepois vngo_travel.zonepois.json
echo.

echo ==========================================
echo Import Summary
echo ==========================================
echo Success: %SUCCESS_COUNT%
echo Failed:  %FAIL_COUNT%
echo.

if %FAIL_COUNT% EQU 0 (
    echo All collections imported successfully!
    echo.
    echo Next steps:
    echo 1. Start backend: cd ..\.. ^&^& npm start
    echo 2. Test API: curl http://localhost:3000/api/v1/zones
    echo.
    echo Login credentials:
    echo   Admin: admin@vngo.com / password123
    echo   User:  user@vngo.com / password123
) else (
    echo Some collections failed to import. Check errors above.
)

exit /b 0

:import_collection
set collection=%~1
set file=%~2

echo | set /p="Importing %collection%... "

if not exist "%file%" (
    echo SKIP (file not found^)
    set /a FAIL_COUNT+=1
    goto :eof
)

REM Check if file is empty (size = 0 or only contains [])
for %%A in ("%file%") do set size=%%~zA
if %size% LEQ 3 (
    echo SKIP (empty^)
    goto :eof
)

mongoimport --uri="%MONGO_URI%" --collection="%collection%" --file="%file%" --jsonArray --quiet >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo OK
    set /a SUCCESS_COUNT+=1
) else (
    echo FAILED
    set /a FAIL_COUNT+=1
)

goto :eof
