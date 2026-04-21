/**
 * Wiring Diagram Engine
 *
 * Generates and renders interactive wiring diagrams from physical-layer ICD data.
 * Supports SVG and PDF export formats.
 */

import type {
  SignalId,
  ConnectorId,
  CableBundleId,
  Signal,
  PhysicalLayer,
  Connector,
  CableBundle,
} from '@connectedflow/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A node in the wiring diagram representing a connector with pin slots. */
export interface DiagramNode {
  id: string;
  connectorId: ConnectorId;
  label: string;
  connectorType: string;
  location: string;
  pins: PinSlot[];
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A pin slot within a connector node. */
export interface PinSlot {
  pinNumber: string;
  signalId: SignalId;
  signalName: string;
  wireColor: string;
  wireGauge: string;
}

/** An edge in the wiring diagram representing a wire run between connector pins. */
export interface DiagramEdge {
  id: string;
  sourceNodeId: string;
  sourcePin: string;
  targetNodeId: string;
  targetPin: string;
  cableBundleId: CableBundleId;
  cableBundleLabel: string;
  signalId: SignalId;
  signalName: string;
  wireColor: string;
  wireGauge: string;
}

/** Metadata about the generated diagram. */
export interface DiagramMetadata {
  generatedAt: Date;
  signalCount: number;
  connectorCount: number;
  cableBundleCount: number;
  wireRunCount: number;
}

/** The complete wiring diagram model. */
export interface WiringDiagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  metadata: DiagramMetadata;
}

/** Configuration for interactive diagram viewing (React Flow). */
export interface DiagramViewConfig {
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; label?: string; data?: Record<string, unknown> }>;
  fitView: boolean;
  minZoom: number;
  maxZoom: number;
}

/** Describes a physical layer change event. */
export interface PhysicalChange {
  signalId: SignalId;
  changeType: 'added' | 'modified' | 'removed';
  before?: PhysicalLayer;
  after?: PhysicalLayer;
}

/** Input signal data enriched with connector/cable info for diagram generation. */
export interface DiagramSignalInput {
  signal: Signal;
  connector?: Connector;
  cableBundle?: CableBundle;
}


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_WIDTH = 180;
const NODE_HEIGHT_BASE = 60;
const NODE_HEIGHT_PER_PIN = 24;
const NODE_SPACING_X = 300;
const NODE_SPACING_Y = 40;
const NODES_PER_COLUMN = 6;

// ---------------------------------------------------------------------------
// WiringDiagramEngine
// ---------------------------------------------------------------------------

export class WiringDiagramEngine {
  private changeListeners: Array<(change: PhysicalChange) => void> = [];

  /**
   * Generate a wiring diagram model from signal physical layer data.
   *
   * Extracts unique connectors, cable bundles, and pin assignments from the
   * provided signals and builds a graph of connector nodes and wire-run edges.
   */
  generateDiagram(inputs: DiagramSignalInput[]): WiringDiagram {
    // Collect unique connectors and their pin assignments
    const connectorMap = new Map<string, { connector?: Connector; pins: PinSlot[] }>();
    const cableBundleSet = new Set<string>();
    const edges: DiagramEdge[] = [];

    for (const input of inputs) {
      const { signal, connector, cableBundle } = input;
      const physical = signal.physical;
      if (!physical) continue;

      const connId = physical.connectorId as string;
      if (!connectorMap.has(connId)) {
        connectorMap.set(connId, {
          connector,
          pins: [],
        });
      }

      const entry = connectorMap.get(connId)!;
      // Avoid duplicate pin entries for the same signal
      if (!entry.pins.some((p) => p.pinNumber === physical.pinNumber && p.signalId === signal.id)) {
        entry.pins.push({
          pinNumber: physical.pinNumber,
          signalId: signal.id,
          signalName: signal.name,
          wireColor: physical.wireColor,
          wireGauge: physical.wireGauge,
        });
      }

      if (cableBundle) {
        cableBundleSet.add(physical.cableBundleId as string);
      }
    }

    // Build nodes with layout positions
    const nodes: DiagramNode[] = [];
    let index = 0;
    for (const [connId, entry] of connectorMap) {
      const col = Math.floor(index / NODES_PER_COLUMN);
      const row = index % NODES_PER_COLUMN;
      const height = NODE_HEIGHT_BASE + entry.pins.length * NODE_HEIGHT_PER_PIN;

      nodes.push({
        id: `connector-${connId}`,
        connectorId: connId as ConnectorId,
        label: entry.connector?.partNumber ?? connId,
        connectorType: entry.connector?.connectorType ?? 'unknown',
        location: entry.connector?.location ?? '',
        pins: entry.pins,
        x: col * NODE_SPACING_X,
        y: row * (NODE_HEIGHT_BASE + NODES_PER_COLUMN * NODE_HEIGHT_PER_PIN + NODE_SPACING_Y),
        width: NODE_WIDTH,
        height,
      });
      index++;
    }

    // Build edges: wire runs between connectors via cable bundles.
    // Group signals by cable bundle to find connections between different connectors.
    const bundleSignals = new Map<string, DiagramSignalInput[]>();
    for (const input of inputs) {
      const physical = input.signal.physical;
      if (!physical) continue;
      const bundleId = physical.cableBundleId as string;
      if (!bundleSignals.has(bundleId)) {
        bundleSignals.set(bundleId, []);
      }
      bundleSignals.get(bundleId)!.push(input);
    }

    let edgeIndex = 0;
    for (const [bundleId, bundleInputs] of bundleSignals) {
      // For each pair of signals in the same cable bundle on different connectors,
      // create an edge. In practice, signals on the same bundle connect different connectors.
      const byConnector = new Map<string, DiagramSignalInput[]>();
      for (const bi of bundleInputs) {
        const connId = bi.signal.physical!.connectorId as string;
        if (!byConnector.has(connId)) byConnector.set(connId, []);
        byConnector.get(connId)!.push(bi);
      }

      const connectorIds = [...byConnector.keys()];
      // Create edges between each pair of connectors sharing a cable bundle
      for (let i = 0; i < connectorIds.length; i++) {
        for (let j = i + 1; j < connectorIds.length; j++) {
          const srcInputs = byConnector.get(connectorIds[i])!;
          const tgtInputs = byConnector.get(connectorIds[j])!;

          // Match signals by name across connectors in the same bundle
          for (const src of srcInputs) {
            for (const tgt of tgtInputs) {
              if (src.signal.id === tgt.signal.id) continue;
              // Create a wire run edge for signals sharing the same cable bundle
              const bundleLabel = src.cableBundle?.bundleId ?? bundleId;
              edges.push({
                id: `wire-${edgeIndex++}`,
                sourceNodeId: `connector-${connectorIds[i]}`,
                sourcePin: src.signal.physical!.pinNumber,
                targetNodeId: `connector-${connectorIds[j]}`,
                targetPin: tgt.signal.physical!.pinNumber,
                cableBundleId: bundleId as CableBundleId,
                cableBundleLabel: bundleLabel,
                signalId: src.signal.id,
                signalName: src.signal.name,
                wireColor: src.signal.physical!.wireColor,
                wireGauge: src.signal.physical!.wireGauge,
              });
            }
          }
        }
      }

      // If only one connector in this bundle, still create self-referencing edges
      // to represent the wire run (single-ended representation)
      if (connectorIds.length === 1) {
        const singleInputs = byConnector.get(connectorIds[0])!;
        for (const si of singleInputs) {
          const bundleLabel = si.cableBundle?.bundleId ?? bundleId;
          edges.push({
            id: `wire-${edgeIndex++}`,
            sourceNodeId: `connector-${connectorIds[0]}`,
            sourcePin: si.signal.physical!.pinNumber,
            targetNodeId: `connector-${connectorIds[0]}`,
            targetPin: si.signal.physical!.pinNumber,
            cableBundleId: bundleId as CableBundleId,
            cableBundleLabel: bundleLabel,
            signalId: si.signal.id,
            signalName: si.signal.name,
            wireColor: si.signal.physical!.wireColor,
            wireGauge: si.signal.physical!.wireGauge,
          });
        }
      }
    }

    return {
      nodes,
      edges,
      metadata: {
        generatedAt: new Date(),
        signalCount: inputs.filter((i) => i.signal.physical).length,
        connectorCount: connectorMap.size,
        cableBundleCount: cableBundleSet.size,
        wireRunCount: edges.length,
      },
    };
  }


  /**
   * Render a wiring diagram to a well-formed SVG string.
   *
   * Connectors are rendered as rectangles with pin labels inside.
   * Wire runs are rendered as lines/paths between pins with signal name labels.
   */
  renderToSVG(diagram: WiringDiagram): string {
    const padding = 40;
    let maxX = 0;
    let maxY = 0;

    for (const node of diagram.nodes) {
      const right = node.x + node.width;
      const bottom = node.y + node.height;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }

    const svgWidth = maxX + padding * 2;
    const svgHeight = maxY + padding * 2;

    const parts: string[] = [];
    parts.push(
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`,
      `  <style>`,
      `    .connector { fill: #f0f4f8; stroke: #334155; stroke-width: 2; }`,
      `    .connector-label { font-family: sans-serif; font-size: 12px; font-weight: bold; fill: #1e293b; }`,
      `    .pin-label { font-family: monospace; font-size: 10px; fill: #475569; }`,
      `    .wire-run { stroke: #3b82f6; stroke-width: 1.5; fill: none; }`,
      `    .wire-label { font-family: sans-serif; font-size: 9px; fill: #2563eb; }`,
      `  </style>`,
    );

    // Render connector nodes
    for (const node of diagram.nodes) {
      const nx = node.x + padding;
      const ny = node.y + padding;

      parts.push(`  <g id="${escapeXml(node.id)}">`);
      parts.push(`    <rect class="connector" x="${nx}" y="${ny}" width="${node.width}" height="${node.height}" rx="4" />`);
      parts.push(`    <text class="connector-label" x="${nx + 8}" y="${ny + 18}">${escapeXml(node.label)}</text>`);

      // Pin labels
      for (let i = 0; i < node.pins.length; i++) {
        const pin = node.pins[i];
        const pinY = ny + 36 + i * NODE_HEIGHT_PER_PIN;
        parts.push(`    <text class="pin-label" x="${nx + 12}" y="${pinY}">${escapeXml(pin.pinNumber)}: ${escapeXml(pin.signalName)}</text>`);
      }
      parts.push(`  </g>`);
    }

    // Build a lookup for node positions by id
    const nodePositions = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const node of diagram.nodes) {
      nodePositions.set(node.id, { x: node.x + padding, y: node.y + padding, width: node.width, height: node.height });
    }

    // Render wire runs
    for (const edge of diagram.edges) {
      const srcPos = nodePositions.get(edge.sourceNodeId);
      const tgtPos = nodePositions.get(edge.targetNodeId);
      if (!srcPos || !tgtPos) continue;

      const x1 = srcPos.x + srcPos.width;
      const y1 = srcPos.y + srcPos.height / 2;
      const x2 = tgtPos.x;
      const y2 = tgtPos.y + tgtPos.height / 2;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      parts.push(`  <g id="${escapeXml(edge.id)}">`);
      parts.push(`    <path class="wire-run" d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" />`);
      parts.push(`    <text class="wire-label" x="${midX}" y="${midY - 4}">${escapeXml(edge.signalName)}</text>`);
      parts.push(`  </g>`);
    }

    parts.push(`</svg>`);
    return parts.join('\n');
  }

  /**
   * Render a wiring diagram to a valid PDF buffer.
   *
   * Uses a minimal text-based PDF generation approach (no external library).
   * Includes a connector table and wire list.
   */
  renderToPDF(diagram: WiringDiagram): Buffer {
    return buildSimplePdf(diagram);
  }

  /**
   * Get an interactive view configuration suitable for React Flow.
   */
  getInteractiveView(diagram: WiringDiagram): DiagramViewConfig {
    return {
      nodes: diagram.nodes.map((n) => ({
        id: n.id,
        type: 'connectorNode',
        position: { x: n.x, y: n.y },
        data: {
          label: n.label,
          connectorType: n.connectorType,
          location: n.location,
          pins: n.pins,
        },
      })),
      edges: diagram.edges.map((e) => ({
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        label: e.signalName,
        data: {
          cableBundle: e.cableBundleLabel,
          wireColor: e.wireColor,
          wireGauge: e.wireGauge,
        },
      })),
      fitView: true,
      minZoom: 0.1,
      maxZoom: 4,
    };
  }

  /**
   * Register a callback to be invoked when physical layer data changes.
   * This allows the diagram to be regenerated on modifications.
   */
  onPhysicalLayerChange(callback: (change: PhysicalChange) => void): void {
    this.changeListeners.push(callback);
  }

  /**
   * Notify all registered listeners of a physical layer change.
   * Typically called by the signal service when physical layer data is modified.
   */
  notifyPhysicalLayerChange(change: PhysicalChange): void {
    for (const listener of this.changeListeners) {
      listener(change);
    }
  }
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build a minimal valid PDF containing connector table and wire list.
 *
 * This produces a bare-bones PDF 1.4 document with text content.
 * No external library is required.
 */
function buildSimplePdf(diagram: WiringDiagram): Buffer {
  const lines: string[] = [];

  // Title
  lines.push('Wiring Diagram Report');
  lines.push(`Generated: ${diagram.metadata.generatedAt.toISOString()}`);
  lines.push(`Signals: ${diagram.metadata.signalCount}  Connectors: ${diagram.metadata.connectorCount}  Cable Bundles: ${diagram.metadata.cableBundleCount}  Wire Runs: ${diagram.metadata.wireRunCount}`);
  lines.push('');

  // Connector table
  lines.push('=== Connectors ===');
  for (const node of diagram.nodes) {
    lines.push(`  ${node.label} (${node.connectorType}) - ${node.location}`);
    for (const pin of node.pins) {
      lines.push(`    Pin ${pin.pinNumber}: ${pin.signalName} [${pin.wireColor}, ${pin.wireGauge}]`);
    }
  }
  lines.push('');

  // Wire list
  lines.push('=== Wire Runs ===');
  for (const edge of diagram.edges) {
    lines.push(`  ${edge.signalName}: ${edge.sourceNodeId}:${edge.sourcePin} -> ${edge.targetNodeId}:${edge.targetPin} via ${edge.cableBundleLabel} [${edge.wireColor}, ${edge.wireGauge}]`);
  }

  const textContent = lines.join('\n');

  // Build minimal PDF 1.4 structure
  const objectOffsets: number[] = [];
  let body = '';

  const addObj = (content: string): number => {
    const num = objectOffsets.length + 1;
    objectOffsets.push(body.length);
    body += `${num} 0 obj\n${content}\nendobj\n`;
    return num;
  };

  // 1: Catalog
  addObj('<< /Type /Catalog /Pages 2 0 R >>');

  // 2: Pages
  addObj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');

  // 4: Font (define before page so we know the ref)
  // We'll add page as obj 3, font as obj 4, content as obj 5
  // But we need to add them in order. Let's pre-plan:
  // obj 1 = catalog, obj 2 = pages, obj 3 = page, obj 4 = font, obj 5 = stream

  // Encode text content as PDF text stream
  const escapedText = textContent
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

  const streamLines = escapedText.split('\n');
  let streamContent = 'BT\n/F1 10 Tf\n36 756 Td\n12 TL\n';
  for (const sl of streamLines) {
    streamContent += `(${sl}) Tj T*\n`;
  }
  streamContent += 'ET';

  // 3: Page
  addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>`);

  // 4: Font
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

  // 5: Content stream
  const streamBytes = Buffer.from(streamContent, 'utf-8');
  addObj(`<< /Length ${streamBytes.length} >>\nstream\n${streamContent}\nendstream`);

  // Build full PDF
  const header = '%PDF-1.4\n';
  const xrefOffset = header.length + body.length;

  let xref = `xref\n0 ${objectOffsets.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (const offset of objectOffsets) {
    xref += `${String(offset + header.length).padStart(10, '0')} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objectOffsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, 'utf-8');
}
