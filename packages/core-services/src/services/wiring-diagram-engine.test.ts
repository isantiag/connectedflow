import { describe, it, expect } from 'vitest';
import {
  WiringDiagramEngine,
  type DiagramSignalInput,
  type PhysicalChange,
} from './wiring-diagram-engine.js';
import type {
  Signal,
  Connector,
  CableBundle,
  SignalId,
  ConnectorId,
  CableBundleId,
  ProjectId,
  UserId,
  ProtocolId,
  BusId,
  EquipmentId,
} from '@connectedicd/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignal(overrides: {
  id: string;
  name: string;
  connectorId: string;
  pinNumber: string;
  cableBundleId: string;
  wireColor?: string;
  wireGauge?: string;
}): Signal {
  return {
    id: overrides.id as SignalId,
    name: overrides.name,
    projectId: 'proj-1' as ProjectId,
    status: 'active',
    criticality: 'major',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1' as UserId,
    updatedBy: 'user-1' as UserId,
    version: 1,
    logical: {
      id: `log-${overrides.id}`,
      signalId: overrides.id as SignalId,
      dataType: 'float32',
      minValue: 0,
      maxValue: 100,
      units: 'V',
      description: 'test signal',
      sourceSystem: 'SYS-A',
      destSystem: 'SYS-B',
      refreshRateHz: 50,
      functionalCategory: 'power',
    },
    transport: {
      id: `trn-${overrides.id}`,
      signalId: overrides.id as SignalId,
      protocolId: 'arinc429' as ProtocolId,
      busId: 'bus-1' as BusId,
      protocolAttrs: {},
      bitOffset: 0,
      bitLength: 16,
      encoding: 'unsigned',
      scaleFactor: 1,
      offsetValue: 0,
      byteOrder: 'big_endian',
    },
    physical: {
      id: `phy-${overrides.id}`,
      signalId: overrides.id as SignalId,
      connectorId: overrides.connectorId as ConnectorId,
      pinNumber: overrides.pinNumber,
      cableBundleId: overrides.cableBundleId as CableBundleId,
      wireGauge: overrides.wireGauge ?? '22 AWG',
      wireColor: overrides.wireColor ?? 'red',
      wireType: 'shielded',
      maxLengthM: 10,
      shielding: 'braided',
    },
  };
}

function makeConnector(id: string, totalPins: number = 10): Connector {
  return {
    id: id as ConnectorId,
    partNumber: `PN-${id}`,
    connectorType: 'D-Sub',
    totalPins,
    location: `Bay-${id}`,
    equipmentId: `equip-${id}` as EquipmentId,
  };
}

function makeCableBundle(id: string): CableBundle {
  return {
    id: id as CableBundleId,
    bundleId: `BDL-${id}`,
    routePath: 'A->B',
    totalLengthM: 5,
    bundleType: 'primary',
  };
}

function makeInput(
  signalOverrides: Parameters<typeof makeSignal>[0],
  connectorId?: string,
  cableBundleId?: string,
): DiagramSignalInput {
  return {
    signal: makeSignal(signalOverrides),
    connector: connectorId ? makeConnector(connectorId) : makeConnector(signalOverrides.connectorId),
    cableBundle: cableBundleId ? makeCableBundle(cableBundleId) : makeCableBundle(signalOverrides.cableBundleId),
  };
}


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WiringDiagramEngine', () => {
  const engine = new WiringDiagramEngine();

  // -----------------------------------------------------------------------
  // generateDiagram
  // -----------------------------------------------------------------------
  describe('generateDiagram', () => {
    it('returns empty diagram for empty input', () => {
      const diagram = engine.generateDiagram([]);
      expect(diagram.nodes).toHaveLength(0);
      expect(diagram.edges).toHaveLength(0);
      expect(diagram.metadata.signalCount).toBe(0);
      expect(diagram.metadata.connectorCount).toBe(0);
      expect(diagram.metadata.cableBundleCount).toBe(0);
    });

    it('creates a node for each unique connector', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
        makeInput({ id: 's2', name: 'SIG_B', connectorId: 'c1', pinNumber: '2', cableBundleId: 'b1' }),
        makeInput({ id: 's3', name: 'SIG_C', connectorId: 'c2', pinNumber: '1', cableBundleId: 'b1' }),
      ];

      const diagram = engine.generateDiagram(inputs);
      expect(diagram.nodes).toHaveLength(2);
      expect(diagram.metadata.connectorCount).toBe(2);

      const nodeIds = diagram.nodes.map((n) => n.connectorId);
      expect(nodeIds).toContain('c1');
      expect(nodeIds).toContain('c2');
    });

    it('includes pin slots for every signal on a connector', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
        makeInput({ id: 's2', name: 'SIG_B', connectorId: 'c1', pinNumber: '2', cableBundleId: 'b1' }),
      ];

      const diagram = engine.generateDiagram(inputs);
      const node = diagram.nodes.find((n) => n.connectorId === ('c1' as ConnectorId));
      expect(node).toBeDefined();
      expect(node!.pins).toHaveLength(2);
      expect(node!.pins.map((p) => p.pinNumber)).toEqual(['1', '2']);
      expect(node!.pins.map((p) => p.signalName)).toEqual(['SIG_A', 'SIG_B']);
    });

    it('tracks unique cable bundles in metadata', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
        makeInput({ id: 's2', name: 'SIG_B', connectorId: 'c2', pinNumber: '1', cableBundleId: 'b2' }),
      ];

      const diagram = engine.generateDiagram(inputs);
      expect(diagram.metadata.cableBundleCount).toBe(2);
    });

    it('creates edges for signals sharing a cable bundle across connectors', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
        makeInput({ id: 's2', name: 'SIG_B', connectorId: 'c2', pinNumber: '3', cableBundleId: 'b1' }),
      ];

      const diagram = engine.generateDiagram(inputs);
      expect(diagram.edges.length).toBeGreaterThan(0);
      const edge = diagram.edges[0];
      expect(edge.sourceNodeId).toContain('c1');
      expect(edge.targetNodeId).toContain('c2');
      expect(edge.cableBundleId).toBe('b1');
    });

    it('skips signals without physical layer', () => {
      const signalNoPhysical: Signal = {
        id: 's-nophys' as SignalId,
        name: 'NO_PHYS',
        projectId: 'proj-1' as ProjectId,
        status: 'active',
        criticality: 'minor',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-1' as UserId,
        updatedBy: 'user-1' as UserId,
        version: 1,
      };

      const inputs: DiagramSignalInput[] = [
        { signal: signalNoPhysical },
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
      ];

      const diagram = engine.generateDiagram(inputs);
      expect(diagram.nodes).toHaveLength(1);
      expect(diagram.metadata.signalCount).toBe(1);
    });

    it('populates metadata correctly', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
        makeInput({ id: 's2', name: 'SIG_B', connectorId: 'c2', pinNumber: '1', cableBundleId: 'b1' }),
        makeInput({ id: 's3', name: 'SIG_C', connectorId: 'c3', pinNumber: '1', cableBundleId: 'b2' }),
      ];

      const diagram = engine.generateDiagram(inputs);
      expect(diagram.metadata.signalCount).toBe(3);
      expect(diagram.metadata.connectorCount).toBe(3);
      expect(diagram.metadata.cableBundleCount).toBe(2);
      expect(diagram.metadata.generatedAt).toBeInstanceOf(Date);
    });
  });


  // -----------------------------------------------------------------------
  // renderToSVG
  // -----------------------------------------------------------------------
  describe('renderToSVG', () => {
    it('produces well-formed SVG with XML declaration and namespace', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
      ];
      const diagram = engine.generateDiagram(inputs);
      const svg = engine.renderToSVG(diagram);

      expect(svg).toContain('<?xml version="1.0"');
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    it('contains visual elements for all connectors', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
        makeInput({ id: 's2', name: 'SIG_B', connectorId: 'c2', pinNumber: '1', cableBundleId: 'b1' }),
      ];
      const diagram = engine.generateDiagram(inputs);
      const svg = engine.renderToSVG(diagram);

      // Each connector node should have a rect and label
      expect(svg).toContain('connector-c1');
      expect(svg).toContain('connector-c2');
      expect(svg).toContain('PN-c1');
      expect(svg).toContain('PN-c2');
    });

    it('contains pin labels for all pins', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
        makeInput({ id: 's2', name: 'SIG_B', connectorId: 'c1', pinNumber: '2', cableBundleId: 'b1' }),
      ];
      const diagram = engine.generateDiagram(inputs);
      const svg = engine.renderToSVG(diagram);

      expect(svg).toContain('1: SIG_A');
      expect(svg).toContain('2: SIG_B');
    });

    it('contains wire run paths with signal name labels', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
        makeInput({ id: 's2', name: 'SIG_B', connectorId: 'c2', pinNumber: '1', cableBundleId: 'b1' }),
      ];
      const diagram = engine.generateDiagram(inputs);
      const svg = engine.renderToSVG(diagram);

      // Wire runs should have path elements and signal name labels
      expect(svg).toContain('wire-run');
      expect(svg).toContain('<path');
    });

    it('escapes special XML characters in labels', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG<A>&B', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
      ];
      const diagram = engine.generateDiagram(inputs);
      const svg = engine.renderToSVG(diagram);

      expect(svg).toContain('SIG&lt;A&gt;&amp;B');
      expect(svg).not.toContain('SIG<A>&B');
    });

    it('produces valid SVG for empty diagram', () => {
      const diagram = engine.generateDiagram([]);
      const svg = engine.renderToSVG(diagram);

      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });
  });

  // -----------------------------------------------------------------------
  // renderToPDF
  // -----------------------------------------------------------------------
  describe('renderToPDF', () => {
    it('produces a Buffer starting with %PDF', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
      ];
      const diagram = engine.generateDiagram(inputs);
      const pdf = engine.renderToPDF(diagram);

      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.toString('utf-8').startsWith('%PDF-1.4')).toBe(true);
    });

    it('contains %%EOF marker', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
      ];
      const diagram = engine.generateDiagram(inputs);
      const pdf = engine.renderToPDF(diagram);
      const text = pdf.toString('utf-8');

      expect(text).toContain('%%EOF');
    });

    it('contains connector information in PDF content', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
        makeInput({ id: 's2', name: 'SIG_B', connectorId: 'c2', pinNumber: '3', cableBundleId: 'b1' }),
      ];
      const diagram = engine.generateDiagram(inputs);
      const pdf = engine.renderToPDF(diagram);
      const text = pdf.toString('utf-8');

      // The PDF stream should contain connector labels and signal names
      expect(text).toContain('PN-c1');
      expect(text).toContain('PN-c2');
      expect(text).toContain('SIG_A');
      expect(text).toContain('SIG_B');
    });

    it('contains wire run information in PDF content', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
        makeInput({ id: 's2', name: 'SIG_B', connectorId: 'c2', pinNumber: '3', cableBundleId: 'b1' }),
      ];
      const diagram = engine.generateDiagram(inputs);
      const pdf = engine.renderToPDF(diagram);
      const text = pdf.toString('utf-8');

      expect(text).toContain('Wire Runs');
      expect(text).toContain('BDL-b1');
    });

    it('includes valid PDF structure elements', () => {
      const diagram = engine.generateDiagram([]);
      const pdf = engine.renderToPDF(diagram);
      const text = pdf.toString('utf-8');

      expect(text).toContain('/Type /Catalog');
      expect(text).toContain('/Type /Pages');
      expect(text).toContain('/Type /Page');
      expect(text).toContain('/Type /Font');
      expect(text).toContain('xref');
      expect(text).toContain('trailer');
      expect(text).toContain('startxref');
    });
  });

  // -----------------------------------------------------------------------
  // onPhysicalLayerChange
  // -----------------------------------------------------------------------
  describe('onPhysicalLayerChange', () => {
    it('registers and invokes callback on physical layer change', () => {
      const localEngine = new WiringDiagramEngine();
      const changes: PhysicalChange[] = [];

      localEngine.onPhysicalLayerChange((change) => {
        changes.push(change);
      });

      const change: PhysicalChange = {
        signalId: 's1' as SignalId,
        changeType: 'modified',
        before: undefined,
        after: undefined,
      };

      localEngine.notifyPhysicalLayerChange(change);
      expect(changes).toHaveLength(1);
      expect(changes[0].signalId).toBe('s1');
      expect(changes[0].changeType).toBe('modified');
    });

    it('supports multiple listeners', () => {
      const localEngine = new WiringDiagramEngine();
      let count = 0;

      localEngine.onPhysicalLayerChange(() => { count++; });
      localEngine.onPhysicalLayerChange(() => { count++; });

      localEngine.notifyPhysicalLayerChange({
        signalId: 's1' as SignalId,
        changeType: 'added',
      });

      expect(count).toBe(2);
    });

    it('can trigger diagram regeneration on change', () => {
      const localEngine = new WiringDiagramEngine();
      let regenerated = false;

      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
      ];

      localEngine.onPhysicalLayerChange(() => {
        // Regenerate diagram on change
        const diagram = localEngine.generateDiagram(inputs);
        regenerated = diagram.nodes.length > 0;
      });

      localEngine.notifyPhysicalLayerChange({
        signalId: 's1' as SignalId,
        changeType: 'modified',
      });

      expect(regenerated).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getInteractiveView
  // -----------------------------------------------------------------------
  describe('getInteractiveView', () => {
    it('returns React Flow compatible config', () => {
      const inputs: DiagramSignalInput[] = [
        makeInput({ id: 's1', name: 'SIG_A', connectorId: 'c1', pinNumber: '1', cableBundleId: 'b1' }),
        makeInput({ id: 's2', name: 'SIG_B', connectorId: 'c2', pinNumber: '1', cableBundleId: 'b1' }),
      ];
      const diagram = engine.generateDiagram(inputs);
      const view = engine.getInteractiveView(diagram);

      expect(view.fitView).toBe(true);
      expect(view.minZoom).toBe(0.1);
      expect(view.maxZoom).toBe(4);
      expect(view.nodes).toHaveLength(diagram.nodes.length);
      expect(view.edges).toHaveLength(diagram.edges.length);

      // Nodes should have React Flow structure
      for (const node of view.nodes) {
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('type', 'connectorNode');
        expect(node).toHaveProperty('position');
        expect(node.position).toHaveProperty('x');
        expect(node.position).toHaveProperty('y');
        expect(node).toHaveProperty('data');
      }

      // Edges should have React Flow structure
      for (const edge of view.edges) {
        expect(edge).toHaveProperty('id');
        expect(edge).toHaveProperty('source');
        expect(edge).toHaveProperty('target');
      }
    });
  });
});
