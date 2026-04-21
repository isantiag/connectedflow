"""ConnectedFlow MCP Server — exposes ICD management API as MCP tools."""
import os, json, re, uuid
import httpx
from mcp.server.fastmcp import FastMCP

API_URL = os.environ.get("CONNECTEDFLOW_API_URL", "http://localhost:4000")

mcp = FastMCP("connectedflow", instructions="ConnectedFlow aerospace ICD management. Manage signals (3-layer: logical, transport, physical), baselines, workflows, and run quality checks across ARINC 429, CAN, MIL-STD-1553, AFDX protocols.")

async def _api(method: str, path: str, body: dict | None = None) -> dict | list:
    async with httpx.AsyncClient() as c:
        r = await c.request(method, f"{API_URL}{path}", json=body, timeout=30)
        r.raise_for_status()
        return r.json()

# ── Signals ───────────────────────────────────────────────────────

@mcp.tool()
async def list_signals(project_id: str = "", status: str = "") -> str:
    """List all signals. Optional filters: project_id, status (draft/active/deprecated)."""
    params = []
    if project_id: params.append(f"projectId={project_id}")
    if status: params.append(f"status={status}")
    qs = f"?{'&'.join(params)}" if params else ""
    return json.dumps(await _api("GET", f"/api/signals{qs}"), indent=2)

@mcp.tool()
async def get_signal(signal_id: str) -> str:
    """Get a signal by ID with all three layers (logical, transport, physical)."""
    return json.dumps(await _api("GET", f"/api/signals/{signal_id}"), indent=2)

@mcp.tool()
async def create_signal(name: str, source_system: str, dest_system: str, protocol: str, data_type: str = "float32", units: str = "", refresh_rate_ms: int = 100, criticality: str = "major") -> str:
    """Create a new signal. Protocol: arinc429, can, milstd1553, afdx."""
    body = {"name": name, "projectId": "default", "criticality": criticality, "status": "draft",
            "logical": {"dataType": data_type, "units": units, "refreshRateMs": refresh_rate_ms, "sourceSystem": source_system, "destSystem": dest_system},
            "transport": {"protocol": protocol}, "physical": {}}
    return json.dumps(await _api("POST", "/api/signals", body), indent=2)

@mcp.tool()
async def bulk_import_signals(signals: str) -> str:
    """Bulk import signals from JSON array string."""
    data = json.loads(signals)
    return json.dumps(await _api("POST", "/api/signals/bulk-import", {"signals": data}), indent=2)

# ── Baselines ─────────────────────────────────────────────────────

@mcp.tool()
async def list_baselines() -> str:
    """List all ICD baselines."""
    return json.dumps(await _api("GET", "/api/baselines"), indent=2)

@mcp.tool()
async def create_baseline(label: str, description: str = "") -> str:
    """Create a new baseline snapshot."""
    return json.dumps(await _api("POST", "/api/baselines", {"label": label, "description": description}), indent=2)

@mcp.tool()
async def freeze_baseline(baseline_id: str) -> str:
    """Freeze a baseline — creates immutable snapshot."""
    return json.dumps(await _api("POST", f"/api/baselines/{baseline_id}/freeze"), indent=2)

# ── Quality Check ─────────────────────────────────────────────────

@mcp.tool()
async def icd_quality_check(signal_name: str, protocol: str, source_system: str, dest_system: str, data_type: str = "", refresh_rate_ms: int = 0) -> str:
    """Run ICD quality checks on a signal definition. Checks cross-layer consistency, protocol compliance, and naming conventions."""
    issues = []
    # Naming convention
    if not re.match(r'^[A-Z][A-Z0-9_]+$', signal_name):
        issues.append({"type": "naming", "severity": "warning", "message": f"Signal name '{signal_name}' should be UPPER_SNAKE_CASE"})
    # Protocol validation
    valid_protocols = ['arinc429', 'can', 'milstd1553', 'afdx']
    if protocol.lower() not in valid_protocols:
        issues.append({"type": "protocol", "severity": "error", "message": f"Unknown protocol '{protocol}'. Valid: {', '.join(valid_protocols)}"})
    # Refresh rate
    if refresh_rate_ms > 0 and protocol.lower() == 'arinc429' and refresh_rate_ms < 10:
        issues.append({"type": "timing", "severity": "warning", "message": f"ARINC 429 refresh rate {refresh_rate_ms}ms may exceed bus capacity at 100kbps"})
    # Missing fields
    if not source_system: issues.append({"type": "incomplete", "severity": "error", "message": "Missing source system"})
    if not dest_system: issues.append({"type": "incomplete", "severity": "error", "message": "Missing destination system"})
    if not data_type: issues.append({"type": "incomplete", "severity": "warning", "message": "Missing data type"})

    errors = sum(1 for i in issues if i["severity"] == "error")
    warnings = sum(1 for i in issues if i["severity"] == "warning")
    score = max(0, 100 - errors * 30 - warnings * 15)

    return json.dumps({"signal": signal_name, "score": score, "issues": issues, "verdict": "PASS" if score >= 80 else "NEEDS_WORK" if score >= 50 else "FAIL"}, indent=2)

# ── Excel ─────────────────────────────────────────────────────────

@mcp.tool()
async def export_template_url(protocol: str = "arinc429") -> str:
    """Get the URL to download an Excel template for a specific protocol."""
    return json.dumps({"url": f"{API_URL}/api/signals/export-template?protocol={protocol}", "protocol": protocol})

@mcp.tool()
async def export_signals_url(project_id: str = "") -> str:
    """Get the URL to download signals as Excel."""
    return json.dumps({"url": f"{API_URL}/api/signals/export?projectId={project_id}"})

# ── Workflows ─────────────────────────────────────────────────────

@mcp.tool()
async def list_workflows() -> str:
    """List approval workflows."""
    return json.dumps(await _api("GET", "/api/workflows"), indent=2)
