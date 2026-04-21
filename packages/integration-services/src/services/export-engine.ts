/**
 * Export Engine — generates export files in various aerospace formats.
 *
 * Supported formats:
 * - CAN DBC: standard DBC file with message/signal definitions
 * - ARINC 429 label table: CSV with label, SDI, SSM, word type, resolution
 * - Wire list: CSV with signal name, connector, pin, wire gauge, cable bundle
 * - Simulink model: simplified XML representation of signal interfaces
 * - Certification package: JSON traceability + change history bundle
 */

import type { Signal, TransportLayer, PhysicalLayer } from '@connectedflow/shared-types';
import type { CanBusAttrs, Arinc429Attrs } from '@connectedflow/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TestBenchFormat = 'can_dbc' | 'arinc429_label_table';
export type HarnessFormat = 'wire_list';
export type CertStandard = 'DO-178C' | 'DO-254' | 'ARP4754A';

export interface ExportFile {
  filename: string;
  mimeType: string;
  content: string;
}

export interface ExportSignalData {
  signal: Signal;
  transport?: TransportLayer;
  physical?: PhysicalLayer;
}

export interface CertPackageInput {
  baselineId: string;
  standard: CertStandard;
  signals: ExportSignalData[];
  traceLinks: Array<{
    signalId: string;
    externalRequirementId: string;
    requirementText: string;
  }>;
  changeHistory: Array<{
    signalId: string;
    action: string;
    timestamp: string;
    userId: string;
  }>;
}

// ---------------------------------------------------------------------------
// Export Engine
// ---------------------------------------------------------------------------

export class ExportEngine {
  /**
   * Export signals as a CAN DBC or ARINC 429 label table for test bench use.
   */
  exportTestBenchConfig(signals: ExportSignalData[], format: TestBenchFormat): ExportFile {
    switch (format) {
      case 'can_dbc':
        return this.exportCanDbc(signals);
      case 'arinc429_label_table':
        return this.exportArinc429LabelTable(signals);
      default:
        throw new Error(`Unsupported test bench format: ${format}`);
    }
  }

  /**
   * Export signals as a simplified Simulink model (XML).
   */
  exportSimulinkModel(signals: ExportSignalData[]): ExportFile {
    const signalBlocks = signals
      .map((s) => {
        const t = s.transport;
        return [
          `    <Block type="Signal" name="${escapeXml(s.signal.name)}">`,
          `      <Parameter name="signalId" value="${s.signal.id}" />`,
          t ? `      <Parameter name="bitOffset" value="${t.bitOffset}" />` : '',
          t ? `      <Parameter name="bitLength" value="${t.bitLength}" />` : '',
          t ? `      <Parameter name="scaleFactor" value="${t.scaleFactor}" />` : '',
          t ? `      <Parameter name="offsetValue" value="${t.offsetValue}" />` : '',
          t ? `      <Parameter name="encoding" value="${t.encoding}" />` : '',
          t ? `      <Parameter name="byteOrder" value="${t.byteOrder}" />` : '',
          `    </Block>`,
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n');

    const content = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<SimulinkModel version="1.0">',
      '  <System name="ICD_Interface">',
      signalBlocks,
      '  </System>',
      '</SimulinkModel>',
    ].join('\n');

    return {
      filename: 'icd_interface.xml',
      mimeType: 'application/xml',
      content,
    };
  }

  /**
   * Export signals as a harness design wire list (CSV).
   */
  exportHarnessDesign(signals: ExportSignalData[], _format: HarnessFormat): ExportFile {
    return this.exportWireList(signals);
  }

  /**
   * Export wire list as CSV.
   */
  exportWireList(signals: ExportSignalData[]): ExportFile {
    const header = 'Signal Name,Connector,Pin,Wire Gauge,Cable Bundle';
    const rows = signals
      .filter((s) => s.physical)
      .map((s) => {
        const p = s.physical!;
        return `${csvEscape(s.signal.name)},${csvEscape(p.connectorId)},${csvEscape(p.pinNumber)},${csvEscape(p.wireGauge)},${csvEscape(p.cableBundleId)}`;
      });

    return {
      filename: 'wire_list.csv',
      mimeType: 'text/csv',
      content: [header, ...rows].join('\n'),
    };
  }

  /**
   * Export a certification package as JSON.
   */
  exportCertPackage(input: CertPackageInput): ExportFile {
    const pkg = {
      standard: input.standard,
      baselineId: input.baselineId,
      generatedAt: new Date().toISOString(),
      traceabilityMatrix: input.traceLinks.map((tl) => ({
        signalId: tl.signalId,
        requirementId: tl.externalRequirementId,
        requirementText: tl.requirementText,
      })),
      changeHistory: input.changeHistory,
      signalCount: input.signals.length,
    };

    return {
      filename: `cert_package_${input.standard}.json`,
      mimeType: 'application/json',
      content: JSON.stringify(pkg, null, 2),
    };
  }

  // -----------------------------------------------------------------------
  // Private format generators
  // -----------------------------------------------------------------------

  private exportCanDbc(signals: ExportSignalData[]): ExportFile {
    const lines: string[] = [
      'VERSION ""',
      '',
      'NS_ :',
      '',
      'BS_:',
      '',
      'BU_:',
      '',
    ];

    // Group signals by CAN message (arbitration_id)
    const messageMap = new Map<string, ExportSignalData[]>();
    for (const s of signals) {
      if (!s.transport) continue;
      const attrs = s.transport.protocolAttrs as CanBusAttrs;
      const arbId = attrs?.arbitration_id ?? '0x000';
      if (!messageMap.has(arbId)) messageMap.set(arbId, []);
      messageMap.get(arbId)!.push(s);
    }

    let msgIndex = 0;
    for (const [arbId, msgSignals] of messageMap) {
      const numericId = parseInt(arbId, 16) || msgIndex;
      const dlc = (msgSignals[0]?.transport?.protocolAttrs as CanBusAttrs)?.dlc ?? 8;
      lines.push(`BO_ ${numericId} Msg_${msgIndex}: ${dlc} Vector__XXX`);

      for (const s of msgSignals) {
        const t = s.transport!;
        const byteOrder = t.byteOrder === 'big_endian' ? 1 : 0;
        const sign = t.encoding === 'signed' ? '-' : '+';
        const min = s.signal.logical?.minValue ?? 0;
        const max = s.signal.logical?.maxValue ?? 0;
        const unit = s.signal.logical?.units ?? '';
        lines.push(
          ` SG_ ${sanitizeDbcName(s.signal.name)} : ${t.bitOffset}|${t.bitLength}@${byteOrder}${sign} (${t.scaleFactor},${t.offsetValue}) [${min}|${max}] "${unit}" Vector__XXX`,
        );
      }

      lines.push('');
      msgIndex++;
    }

    return {
      filename: 'signals.dbc',
      mimeType: 'application/octet-stream',
      content: lines.join('\n'),
    };
  }

  private exportArinc429LabelTable(signals: ExportSignalData[]): ExportFile {
    const header = 'Label,SDI,SSM,Word Type,Resolution,Signal Name';
    const rows = signals
      .filter((s) => s.transport)
      .map((s) => {
        const attrs = s.transport!.protocolAttrs as Arinc429Attrs;
        return `${attrs?.label ?? ''},${attrs?.sdi ?? ''},${attrs?.ssm ?? ''},${attrs?.word_type ?? ''},${attrs?.resolution ?? ''},${csvEscape(s.signal.name)}`;
      });

    return {
      filename: 'arinc429_labels.csv',
      mimeType: 'text/csv',
      content: [header, ...rows].join('\n'),
    };
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
    .replace(/"/g, '&quot;');
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function sanitizeDbcName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}
