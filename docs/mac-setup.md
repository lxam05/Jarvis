# Mac Setup — GarminDB + Sync Agent

This guide configures your MacBook Air to keep Garmin data flowing into JARVIS on Railway.

## Prerequisites

- Python 3.11+
- GarminDB installed and configured ([GarminDB docs](https://github.com/tcgoetz/GarminDB))
- JARVIS backend deployed on Railway with `SYNC_AGENT_API_KEY` set

## 1. Install GarminDB

```bash
pip install garmindb
cp GarminConnectConfig.json.example ~/.GarminDb/GarminConnectConfig.json
# Edit with your Garmin Connect credentials
garmindb_cli.py --all --download --import --analyze
```

GarminDB stores SQLite files at:

- `~/HealthData/DBs/garmin.db` — daily summaries, sleep, HRV, weight
- `~/HealthData/DBs/garmin_activities.db` — activities

## 2. Install the Jarvis Sync Agent

```bash
cd sync-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 3. Configure the Agent

```bash
mkdir -p ~/.jarvis
cp sync-agent.yaml.example ~/.jarvis/sync-agent.yaml
```

Edit `~/.jarvis/sync-agent.yaml`:

```yaml
api_url: https://your-app.up.railway.app
api_key: YOUR_SYNC_AGENT_API_KEY
garmin_db_path: ~/HealthData/DBs/garmin.db
garmin_activities_db_path: ~/HealthData/DBs/garmin_activities.db
cursors_path: ~/.jarvis/cursors.json
agent_version: "1.0.0"
```

## 4. Test Manual Sync

```bash
cd /path/to/Jarvis/sync-agent
source .venv/bin/activate
python agent.py ~/.jarvis/sync-agent.yaml
```

## 5. Schedule with launchd

Create `~/Library/LaunchAgents/com.jarvis.garmin-sync.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.jarvis.garmin-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>
      garmindb_cli.py --all --download --import --analyze --latest &amp;&amp;
      /path/to/Jarvis/sync-agent/.venv/bin/python /path/to/Jarvis/sync-agent/agent.py /Users/YOU/.jarvis/sync-agent.yaml
    </string>
  </array>
  <key>StartInterval</key>
  <integer>1800</integer>
  <key>StandardOutPath</key>
  <string>/tmp/jarvis-sync.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/jarvis-sync.err</string>
</dict>
</plist>
```

Load the agent:

```bash
launchctl load ~/Library/LaunchAgents/com.jarvis.garmin-sync.plist
```

## Architecture Notes

- **GarminDB is never modified** — the sync agent opens SQLite files read-only
- **Only `sync-agent/adapter/`** knows GarminDB table names; the cloud API receives domain DTOs
- Sync is **incremental** using cursors stored in `~/.jarvis/cursors.json`
- Weight from Garmin is also upserted into `body_weight_entries` for nutrition coaching

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `401 Unauthorized` | Check `api_key` matches Railway `SYNC_AGENT_API_KEY` |
| No new records | Run GarminDB `--latest` first; check cursor dates |
| DB not found | Verify paths in `sync-agent.yaml` |
| Schema errors | GarminDB schema changed — raw JSONB preserved; update adapter |
