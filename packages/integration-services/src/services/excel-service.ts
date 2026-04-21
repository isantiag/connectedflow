/**
 * Excel Round-Trip Service — template generation, export, and import for ConnectedICD signals.
 * Supports protocol-specific columns (ARINC 429, CAN, MIL-STD-1553, AFDX).
 */
import ExcelJS from 'exceljs';
import type { Signal, LogicalLayer, TransportLayer, PhysicalLayer } from '@connectedicd/shared-types';

const PROTOCOL_COLUMNS: Record<string, string[]> = {
  arinc429: ['Label (Octal)', 'SDI', 'SSM', 'Encoding (BNR/BCD/Discrete)', 'Bit Position', 'Bit Length', 'Scale Factor', 'Range Min', 'Range Max'],
  can: ['Arbitration ID (Hex)', 'DLC', 'Byte Offset', 'Bit Offset', 'Bit Length', 'Byte Order', 'Scale Factor', 'Offset', 'Range Min', 'Range Max'],
  milstd1553: ['Remote Terminal', 'Sub-Address', 'Word Count', 'Word Position', 'Bit Position', 'Bit Length'],
  afdx: ['Virtual Link ID', 'BAG (ms)', 'Partition', 'Network (A/B)', 'Byte Offset', 'Bit Length'],
};

const COMMON_COLUMNS = ['Signal Name', 'Source System', 'Destination System', 'Data Type', 'Units', 'Refresh Rate (ms)', 'Criticality', 'Status'];
const PHYSICAL_COLUMNS = ['Connector', 'Pin Number', 'Wire Gauge (AWG)', 'Cable Bundle', 'Shielding'];

export class ExcelService {

  /** Generate a blank Excel template with protocol-specific columns */
  async generateTemplate(protocol: string, projectName?: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ConnectedICD';
    wb.created = new Date();

    const ws = wb.addWorksheet(`${protocol.toUpperCase()} Signals`);

    // Header row
    const cols = [...COMMON_COLUMNS, ...(PROTOCOL_COLUMNS[protocol] ?? []), ...PHYSICAL_COLUMNS];
    ws.addRow(cols);

    // Style header
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    headerRow.alignment = { horizontal: 'center' };

    // Column widths
    cols.forEach((_, i) => { ws.getColumn(i + 1).width = 18; });

    // Add example row
    const example = cols.map(c => {
      if (c === 'Signal Name') return 'AIRSPEED_IAS';
      if (c === 'Source System') return 'ADC';
      if (c === 'Destination System') return 'FCC';
      if (c === 'Data Type') return 'float32';
      if (c === 'Units') return 'knots';
      if (c === 'Refresh Rate (ms)') return '50';
      if (c === 'Criticality') return 'critical';
      if (c === 'Status') return 'draft';
      if (c === 'Label (Octal)') return '206';
      if (c === 'Encoding (BNR/BCD/Discrete)') return 'BNR';
      return '';
    });
    const exRow = ws.addRow(example);
    exRow.font = { italic: true, color: { argb: 'FF999999' } };

    // Instructions sheet
    const instrWs = wb.addWorksheet('Instructions');
    instrWs.addRow(['ConnectedICD — Signal Import Template']);
    instrWs.addRow([`Protocol: ${protocol.toUpperCase()}`]);
    instrWs.addRow([`Project: ${projectName ?? 'N/A'}`]);
    instrWs.addRow(['']);
    instrWs.addRow(['Fill in the signals on the first sheet. The example row (italic) can be deleted.']);
    instrWs.addRow(['Required fields: Signal Name, Source System, Destination System, Data Type']);
    instrWs.addRow(['Import via ConnectedICD → Signals → Import → Upload Excel']);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Export signals to Excel with formatting */
  async exportSignals(signals: any[], protocol?: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ConnectedICD';

    // Group by protocol/bus if no filter
    const groups = new Map<string, any[]>();
    for (const s of signals) {
      const proto = s.transport?.protocol ?? s.protocol ?? 'unknown';
      if (!groups.has(proto)) groups.set(proto, []);
      groups.get(proto)!.push(s);
    }

    for (const [proto, sigs] of groups) {
      const ws = wb.addWorksheet(`${proto.toUpperCase()} (${sigs.length})`);
      const cols = [...COMMON_COLUMNS, ...(PROTOCOL_COLUMNS[proto] ?? []), ...PHYSICAL_COLUMNS];
      ws.addRow(cols);

      // Style header
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cols.forEach((_, i) => { ws.getColumn(i + 1).width = 18; });

      // Data rows
      for (const s of sigs) {
        const row = ws.addRow(cols.map(c => {
          if (c === 'Signal Name') return s.name ?? s.signalName ?? '';
          if (c === 'Source System') return s.logical?.sourceSystem ?? s.sourceSystem ?? '';
          if (c === 'Destination System') return s.logical?.destSystem ?? s.destSystem ?? '';
          if (c === 'Data Type') return s.logical?.dataType ?? s.dataType ?? '';
          if (c === 'Units') return s.logical?.units ?? s.units ?? '';
          if (c === 'Refresh Rate (ms)') return s.logical?.refreshRateMs ?? s.refreshRate ?? '';
          if (c === 'Criticality') return s.criticality ?? '';
          if (c === 'Status') return s.status ?? 'active';
          return '';
        }));

        // Color code by validation status
        if (s.validationErrors?.length > 0) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // red
        } else if (s.validationWarnings?.length > 0) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }; // yellow
        }
      }

      // Auto-filter
      ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + cols.length)}1` };
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Parse an Excel file into signal objects for import */
  async parseExcel(buffer: Buffer): Promise<{ signals: any[]; errors: string[] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const signals: any[] = [];
    const errors: string[] = [];

    for (const ws of wb.worksheets) {
      if (ws.name === 'Instructions') continue;
      const headers = (ws.getRow(1).values as any[]).slice(1).map((v: any) => String(v).trim());
      if (!headers.includes('Signal Name')) { errors.push(`Sheet "${ws.name}": missing "Signal Name" column`); continue; }

      for (let i = 2; i <= ws.rowCount; i++) {
        const row = ws.getRow(i);
        const vals = (row.values as any[]).slice(1);
        if (!vals.some(v => v)) continue; // skip empty rows

        const obj: any = {};
        headers.forEach((h, j) => { if (vals[j]) obj[h] = String(vals[j]).trim(); });

        if (!obj['Signal Name']) { errors.push(`Sheet "${ws.name}" row ${i}: missing Signal Name`); continue; }

        signals.push({
          name: obj['Signal Name'],
          sourceSystem: obj['Source System'] ?? '',
          destSystem: obj['Destination System'] ?? '',
          dataType: obj['Data Type'] ?? 'float32',
          units: obj['Units'] ?? '',
          refreshRate: parseInt(obj['Refresh Rate (ms)'] ?? '0'),
          criticality: obj['Criticality'] ?? 'info',
          status: obj['Status'] ?? 'draft',
          protocol: ws.name.split(' ')[0].toLowerCase(),
          raw: obj,
        });
      }
    }

    return { signals, errors };
  }
}
