import sqlite3
import os
import json
import uuid
from datetime import datetime, timezone

db_path = os.path.expanduser('~/.n8n/database.sqlite')
db = sqlite3.connect(db_path)
cur = db.cursor()

with open('whatsapp-automation/n8n-workflows/01_TurfFlow_WhatsApp_PuneMetro_Style.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

wf_id = wf['id']
name = wf['name']
nodes_json = json.dumps(wf['nodes'])
connections_json = json.dumps(wf['connections'])
settings_json = json.dumps(wf.get('settings', {}))
now = datetime.now(timezone.utc).isoformat()
version_id = str(uuid.uuid4())

# 1. Update workflow_entity
cur.execute("""
INSERT OR REPLACE INTO workflow_entity (id, name, active, nodes, connections, settings, staticData, pinData, versionId, triggerCount, meta, createdAt, updatedAt, isArchived, versionCounter, description, activeVersionId)
VALUES (?, ?, 1, ?, ?, ?, '{}', '{}', ?, 1, '{}', ?, ?, 0, 1, 'Pune Metro Guided Chatbot for TurfFlow', ?)
""", (wf_id, name, nodes_json, connections_json, settings_json, version_id, now, now, version_id))

# 2. Update workflow_history
cur.execute("""
INSERT OR REPLACE INTO workflow_history (versionId, workflowId, authors, createdAt, updatedAt, nodes, connections, name, autosaved, description, nodeGroups)
VALUES (?, ?, '[]', ?, ?, ?, ?, ?, 0, 'Pune Metro Guided Flow', '[]')
""", (version_id, wf_id, now, now, nodes_json, connections_json, name))

# 3. Update workflow_published_version
cur.execute("""
INSERT OR REPLACE INTO workflow_published_version (workflowId, publishedVersionId, createdAt, updatedAt)
VALUES (?, ?, ?, ?)
""", (wf_id, version_id, now, now))

# 4. Register in webhook_entity with clean path
# Path: 'turfflow-whatsapp' and also workflowId-scoped 'turfflow-agent-001/webhook/turfflow-whatsapp'
cur.execute("DELETE FROM webhook_entity WHERE workflowId = ?", (wf_id,))
cur.execute("""
INSERT INTO webhook_entity (workflowId, webhookPath, method, node, webhookId, pathLength)
VALUES (?, 'turfflow-agent-001/webhook/turfflow-whatsapp', 'POST', 'Webhook', NULL, NULL)
""", (wf_id,))

db.commit()
print("Workflow synced to n8n database with versionId:", version_id)
db.close()
