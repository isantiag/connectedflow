"""ConnectedICD MCP Server — exposes ICD management API as MCP tools."""
import os, json, re, uuid
import httpx
from mcp.server.fastmcp import FastMCP

API_URL = os.environ.get("CONNECTEDFLOW_API_URL", "http://localhost:4000")

mcp = FastMCP("connectedicd", instructions="ConnectedICD aerospace ICD management. Manage signals (3-layer: logical, transport, physical), baselines, workflows, and run quality checks across ARINC 429, CAN, MIL-STD-1553, AFDX protocols.")

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

# ── Universal Ingestion ───────────────────────────────────────────

@mcp.tool()
async def ingest_file(file_path: str) -> str:
    """Ingest any ICD file (Excel, Word, PDF, DBC, CSV) — AI extracts signals automatically. Supports Vector CANdb++, Siemens Capital exports, ARINC 429 label tables, any proprietary format."""
    import httpx
    async with httpx.AsyncClient() as c:
        with open(file_path, 'rb') as f:
            r = await c.post(f"{API_URL}/api/ingest", files={"file": (file_path.split('/')[-1], f)}, timeout=120)
            return json.dumps(r.json(), indent=2)

@mcp.tool()
async def preview_ingestion(file_path: str) -> str:
    """Preview what signals would be extracted from a file without importing."""
    import httpx
    async with httpx.AsyncClient() as c:
        with open(file_path, 'rb') as f:
            r = await c.post(f"{API_URL}/api/ingest/preview", files={"file": (file_path.split('/')[-1], f)}, timeout=120)
            return json.dumps(r.json(), indent=2)

@mcp.tool()
async def ai_change_impact(signal_id: str) -> str:
    """Analyze the impact of changing a signal — traces all connected systems, buses, connectors and generates an impact report."""
    # Get the signal
    signal = await _api("GET", f"/api/signals/{signal_id}")
    if not signal: return json.dumps({"error": "Signal not found"})
    
    # Get all signals to find connections
    all_signals = await _api("GET", "/api/signals")
    source = signal.get("logical", {}).get("sourceSystem", signal.get("sourceSystem", ""))
    dest = signal.get("logical", {}).get("destSystem", signal.get("destSystem", ""))
    protocol = signal.get("transport", {}).get("protocol", signal.get("protocol", ""))
    
    # Find all signals on the same bus/interface
    same_bus = [s for s in all_signals if s.get("transport", {}).get("protocol") == protocol and (s.get("logical", {}).get("sourceSystem") == source or s.get("logical", {}).get("destSystem") == dest)]
    # Find all signals involving the same systems
    same_systems = [s for s in all_signals if s.get("logical", {}).get("sourceSystem") in (source, dest) or s.get("logical", {}).get("destSystem") in (source, dest)]
    
    affected_systems = set()
    for s in same_systems:
        affected_systems.add(s.get("logical", {}).get("sourceSystem", ""))
        affected_systems.add(s.get("logical", {}).get("destSystem", ""))
    affected_systems.discard("")
    
    return json.dumps({
        "signal": signal.get("name", signal_id),
        "source_system": source,
        "dest_system": dest,
        "protocol": protocol,
        "same_bus_signals": len(same_bus),
        "affected_systems": list(affected_systems),
        "total_affected_signals": len(same_systems),
        "impact_level": "high" if len(affected_systems) > 3 else "medium" if len(affected_systems) > 1 else "low",
        "recommendation": f"Changing {signal.get('name', '')} affects {len(affected_systems)} systems and {len(same_systems)} signals. Notify: {', '.join(affected_systems)}"
    }, indent=2)

# ── AI Analysis ───────────────────────────────────────────────────

@mcp.tool()
async def analyze_throughput(project_id: str = "") -> str:
    """AI analyzes bus throughput — detects bottlenecks, overloaded buses, recommends optimizations."""
    return json.dumps(await _api("POST", "/api/ai/throughput", {"projectId": project_id or None}), indent=2)

@mcp.tool()
async def propose_routing(source_system: str, dest_system: str, data_requirements: str) -> str:
    """AI proposes optimal signal routing between two systems — considers bus utilization, protocol suitability, redundancy, latency, wire weight."""
    return json.dumps(await _api("POST", "/api/ai/routing", {"sourceSystem": source_system, "destSystem": dest_system, "dataRequirements": data_requirements}), indent=2)

@mcp.tool()
async def analyze_trends(project_id: str = "") -> str:
    """AI analyzes ICD evolution trends across baselines — maturity, growth rate, stability, risks."""
    return json.dumps(await _api("POST", "/api/ai/trends", {"projectId": project_id or None}), indent=2)

@mcp.tool()
async def validate_constraints(project_id: str = "") -> str:
    """AI validates all protocol constraints — bus limits, timing, naming, duplicates, orphans."""
    return json.dumps(await _api("POST", "/api/ai/constraints", {"projectId": project_id or None}), indent=2)

@mcp.tool()
async def architecture_insights(project_id: str = "") -> str:
    """AI provides architecture-level insights — coupling analysis, redundancy gaps, consolidation opportunities, single points of failure."""
    return json.dumps(await _api("POST", "/api/ai/architecture", {"projectId": project_id or None}), indent=2)

@mcp.tool()
async def detect_anomalies(project_id: str = "") -> str:
    """AI detects anomalies beyond rule-based checks — unusual patterns, duplicates, missing reciprocals, protocol mismatches."""
    return json.dumps(await _api("POST", "/api/ai/anomalies", {"projectId": project_id or None}), indent=2)
