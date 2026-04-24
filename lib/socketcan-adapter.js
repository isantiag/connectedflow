/**
 * ConnectedICD — SocketCAN Adapter
 * Real CAN bus capture via Linux SocketCAN interface.
 *
 * Requirements:
 *   - Linux with SocketCAN support (kernel 2.6.25+)
 *   - CAN interface configured: sudo ip link set can0 type can bitrate 500000 && sudo ip link set can0 up
 *   - Or virtual CAN for testing: sudo modprobe vcan && sudo ip link add dev vcan0 type vcan && sudo ip link set vcan0 up
 *
 * Hardware options:
 *   - Peak PCAN-USB ($30-300) — most common, plug-and-play on Linux
 *   - Kvaser Leaf Light ($200) — professional grade
 *   - CANable ($25) — open-source USB-CAN adapter
 *   - Any SocketCAN-compatible adapter
 *
 * Usage:
 *   const adapter = new SocketCANAdapter('can0');
 *   adapter.onMessage((msg) => console.log(msg));
 *   adapter.start();
 */

const { exec, spawn } = require('child_process');
const { EventEmitter } = require('events');

const SAFE_INTERFACE_RE = /^[a-zA-Z0-9_-]{1,16}$/;

class SocketCANAdapter extends EventEmitter {
  constructor(interfaceName = 'can0') {
    super();
    if (!SAFE_INTERFACE_RE.test(interfaceName)) {
      throw new Error('Invalid CAN interface name');
    }
    this.interfaceName = interfaceName;
    this.running = false;
    this.process = null;
    this.frameCount = 0;
  }

  /**
   * Check if the CAN interface exists and is up.
   */
  async checkInterface() {
    return new Promise((resolve) => {
      const proc = spawn('ip', ['link', 'show', this.interfaceName], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.on('close', (code) => {
        if (code !== 0 || !stdout) return resolve({ available: false, reason: `Interface ${this.interfaceName} not found` });
        const isUp = stdout.includes('state UP') || stdout.includes('state UNKNOWN');
        resolve({ available: isUp, reason: isUp ? 'ready' : `Interface ${this.interfaceName} is down. Run: sudo ip link set ${this.interfaceName} up` });
      });
    });
  }

  /**
   * List available CAN interfaces on the system.
   */
  static async listInterfaces() {
    return new Promise((resolve) => {
      exec("ip -o link show type can 2>/dev/null; ip -o link show type vcan 2>/dev/null", (err, stdout) => {
        if (err || !stdout.trim()) return resolve([]);
        const interfaces = stdout.trim().split('\n').map(line => {
          const match = line.match(/^\d+:\s+(\S+):/);
          const name = match ? match[1] : null;
          const isUp = line.includes('state UP') || line.includes('state UNKNOWN');
          const isVirtual = line.includes('vcan');
          return name ? { name, isUp, isVirtual, type: isVirtual ? 'virtual' : 'hardware' } : null;
        }).filter(Boolean);
        resolve(interfaces);
      });
    });
  }

  /**
   * Start capturing CAN frames using candump.
   * candump outputs: (timestamp) interface canid#data
   * Example: (1650000000.000000) can0 18FF0010#0102030405060708
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.frameCount = 0;

    // Use candump for capture — it's part of can-utils package
    this.process = spawn('candump', ['-ta', this.interfaceName], { stdio: ['ignore', 'pipe', 'pipe'] });

    this.process.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        const frame = this._parseCandumpLine(line);
        if (frame) {
          this.frameCount++;
          this.emit('frame', frame);
        }
      }
    });

    this.process.stderr.on('data', (data) => {
      this.emit('error', new Error(`candump error: ${data.toString()}`));
    });

    this.process.on('close', (code) => {
      this.running = false;
      this.emit('close', code);
    });

    this.emit('started', { interface: this.interfaceName });
  }

  /**
   * Stop capturing.
   */
  stop() {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.running = false;
    this.emit('stopped', { frameCount: this.frameCount });
  }

  /**
   * Send a CAN frame (for stimulus/testing).
   * Uses cansend: cansend can0 18FF0010#0102030405060708
   */
  async send(canId, data) {
    const hexId = this._normalizeCanId(canId);
    const hexData = this._normalizeHexData(data);
    return new Promise((resolve, reject) => {
      const proc = spawn('cansend', [this.interfaceName, `${hexId}#${hexData}`], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) reject(new Error(`cansend failed: ${stderr.trim() || `exit code ${code}`}`));
        else resolve({ sent: true, canId: hexId, data: hexData });
      });
    });
  }

  _normalizeCanId(canId) {
    if (typeof canId === 'number') {
      if (!Number.isInteger(canId) || canId < 0 || canId > 0x1FFFFFFF) {
        throw new Error('Invalid CAN ID number');
      }
      return canId.toString(16).toUpperCase();
    }
    if (typeof canId === 'string') {
      const trimmed = canId.trim();
      if (!/^(?:0x)?[0-9A-Fa-f]{1,8}$/.test(trimmed)) {
        throw new Error('Invalid CAN ID format');
      }
      return trimmed.replace(/^0x/i, '').toUpperCase();
    }
    throw new Error('Invalid CAN ID type');
  }

  _normalizeHexData(data) {
    const hexData = Buffer.isBuffer(data) ? data.toString('hex') : String(data || '');
    const trimmed = hexData.trim();
    if (!/^[0-9A-Fa-f]{0,16}$/.test(trimmed) || trimmed.length % 2 !== 0) {
      throw new Error('Invalid CAN payload data');
    }
    return trimmed.toUpperCase();
  }

  /**
   * Parse a candump output line into a structured frame.
   * Input:  "(1650000000.000000)  can0  18FF0010#0102030405060708"
   * Output: { timestamp, interface, canId, isExtended, dlc, data, dataHex }
   */
  _parseCandumpLine(line) {
    // Format: (timestamp) interface canid#data
    const match = line.match(/\((\d+\.\d+)\)\s+(\S+)\s+([0-9A-Fa-f]+)#([0-9A-Fa-f]*)/);
    if (!match) return null;

    const [, timestamp, iface, canIdHex, dataHex] = match;
    const canId = parseInt(canIdHex, 16);
    const isExtended = canId > 0x7FF;
    const dataBytes = Buffer.from(dataHex, 'hex');

    return {
      timestamp: parseFloat(timestamp),
      timestampISO: new Date(parseFloat(timestamp) * 1000).toISOString(),
      interface: iface,
      canId: canId,
      canIdHex: '0x' + canIdHex.toUpperCase(),
      isExtended,
      dlc: dataBytes.length,
      data: dataBytes,
      dataHex: dataHex.toUpperCase(),
    };
  }

  /**
   * Decode a CAN frame using ICD parameter definitions.
   * Takes a raw frame and a list of parameter definitions, returns decoded values.
   */
  static decodeFrame(frame, parameters) {
    const decoded = [];
    for (const param of parameters) {
      const startBit = param.bit_offset || 0;
      const bitLength = param.bit_length || 1;
      const scaleFactor = param.scale_factor || 1;
      const offsetValue = param.offset_value || 0;

      // Extract bits from data buffer
      let rawValue = 0;
      if (param.byte_order === 'little_endian') {
        // Intel byte order
        for (let i = 0; i < bitLength; i++) {
          const byteIdx = Math.floor((startBit + i) / 8);
          const bitIdx = (startBit + i) % 8;
          if (byteIdx < frame.data.length) {
            rawValue |= ((frame.data[byteIdx] >> bitIdx) & 1) << i;
          }
        }
      } else {
        // Motorola byte order (big endian)
        for (let i = 0; i < bitLength; i++) {
          const srcBit = startBit + i;
          const byteIdx = Math.floor(srcBit / 8);
          const bitIdx = 7 - (srcBit % 8);
          if (byteIdx < frame.data.length) {
            rawValue |= ((frame.data[byteIdx] >> bitIdx) & 1) << (bitLength - 1 - i);
          }
        }
      }

      // Handle signed values
      if (param.encoding === 'signed' || param.encoding === 'BNR') {
        if (rawValue & (1 << (bitLength - 1))) {
          rawValue -= (1 << bitLength);
        }
      }

      // Apply scaling
      const engineeringValue = rawValue * scaleFactor + offsetValue;
      const inRange = (param.min_value == null || engineeringValue >= param.min_value) &&
                      (param.max_value == null || engineeringValue <= param.max_value);

      decoded.push({
        parameter_name: param.name,
        parameter_id: param.id,
        raw_value: rawValue,
        decoded_value: Math.round(engineeringValue * 10000) / 10000,
        units: param.units || '',
        in_range: inRange,
        deviation_severity: inRange ? null : (Math.abs(engineeringValue - (param.max_value || 0)) > ((param.max_value || 0) - (param.min_value || 0)) * 0.2 ? 'error' : 'warning'),
      });
    }
    return decoded;
  }
}

module.exports = { SocketCANAdapter };
