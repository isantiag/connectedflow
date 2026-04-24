#!/usr/bin/env node
const knex = require('knex')({ client: 'pg', connection: 'postgres://connectedflow:connectedflow_dev@localhost:5434/connectedflow' });
const { protos, fns, conns } = require('/tmp/fcs_seed_ids.json');

async function seed() {
  // === MESSAGES & PARAMETERS ===

  // Helper
  async function addMsg(connName, proto, mid, name, rate, attrs) {
    const [m] = await knex('message').insert({ connection_id: conns[connName], protocol_id: protos[proto], message_id_primary: mid, name, direction: 'tx', refresh_rate_hz: rate, protocol_attrs: attrs }).returning('*');
    return m.id;
  }
  async function addParam(msgId, fnKey, name, offset, len, enc, units, min, max, res, attrs) {
    await knex('parameter').insert({ message_id: msgId, function_id: fns[fnKey] || null, name, bit_offset: offset, bit_length: len, encoding: enc, units, min_value: min, max_value: max, resolution: res, scale_factor: 1, offset_value: 0, byte_order: 'big_endian', ssm_convention: enc === 'BNR' ? 'BNR' : null, protocol_attrs: attrs || {}, criticality: 'major' });
  }

  // --- ADC → FCC-1 (A429) ---
  let mid = await addMsg('ADC → FCC-1 (A429)', 'ARINC 429', '0206', 'Computed Airspeed', 12.5, { label_number: '0206', sdi: '00', word_rate_hz: 12.5 });
  await addParam(mid, 'ADC.Air Data Processing', 'CAS', 10, 19, 'BNR', 'knots', 0, 512, 0.0625, { msb: 28, lsb: 10 });

  mid = await addMsg('ADC → FCC-1 (A429)', 'ARINC 429', '0203', 'Baro Altitude', 12.5, { label_number: '0203', sdi: '00', word_rate_hz: 12.5 });
  await addParam(mid, 'ADC.Air Data Processing', 'BARO_ALT', 10, 19, 'BNR', 'feet', -1000, 50000, 1.0, { msb: 28, lsb: 10, sign_bit: true });

  mid = await addMsg('ADC → FCC-1 (A429)', 'ARINC 429', '0205', 'Static Pressure', 6.25, { label_number: '0205', sdi: '00', word_rate_hz: 6.25 });
  await addParam(mid, 'ADC.Air Data Processing', 'PS', 10, 19, 'BNR', 'mbar', 0, 1100, 0.05, { msb: 28, lsb: 10 });

  // --- AHRS → FCC-1 (A429) ---
  mid = await addMsg('AHRS → FCC-1 (A429)', 'ARINC 429', '0324', 'Pitch Angle', 50, { label_number: '0324', sdi: '00', word_rate_hz: 50 });
  await addParam(mid, 'AHRS.Attitude Computation', 'PITCH', 10, 19, 'BNR', 'degrees', -90, 90, 0.01, { msb: 28, lsb: 10, sign_bit: true });

  mid = await addMsg('AHRS → FCC-1 (A429)', 'ARINC 429', '0325', 'Roll Angle', 50, { label_number: '0325', sdi: '00', word_rate_hz: 50 });
  await addParam(mid, 'AHRS.Attitude Computation', 'ROLL', 10, 19, 'BNR', 'degrees', -180, 180, 0.01, { msb: 28, lsb: 10, sign_bit: true });

  mid = await addMsg('AHRS → FCC-1 (A429)', 'ARINC 429', '0314', 'Magnetic Heading', 25, { label_number: '0314', sdi: '00', word_rate_hz: 25 });
  await addParam(mid, 'AHRS.Attitude Computation', 'HDG_MAG', 10, 19, 'BNR', 'degrees', 0, 360, 0.01, { msb: 28, lsb: 10 });

  mid = await addMsg('AHRS → FCC-1 (A429)', 'ARINC 429', '0326', 'Body Pitch Rate', 50, { label_number: '0326', sdi: '00', word_rate_hz: 50 });
  await addParam(mid, 'AHRS.Attitude Computation', 'PITCH_RATE', 10, 19, 'BNR', 'deg/s', -100, 100, 0.01, { msb: 28, lsb: 10, sign_bit: true });

  // --- GPS → FCC-1 (A429) ---
  mid = await addMsg('GPS → FCC-1 (A429)', 'ARINC 429', '0310', 'Latitude', 5, { label_number: '0310', sdi: '00', word_rate_hz: 5 });
  await addParam(mid, 'GPS.Position Computation', 'LAT', 10, 20, 'BNR', 'degrees', -90, 90, 0.000172, { msb: 29, lsb: 10, sign_bit: true });

  mid = await addMsg('GPS → FCC-1 (A429)', 'ARINC 429', '0311', 'Longitude', 5, { label_number: '0311', sdi: '00', word_rate_hz: 5 });
  await addParam(mid, 'GPS.Position Computation', 'LON', 10, 20, 'BNR', 'degrees', -180, 180, 0.000172, { msb: 29, lsb: 10, sign_bit: true });

  // --- FCC-1 ↔ ACE-L (A825 CAN) ---
  mid = await addMsg('FCC-1 ↔ ACE-L (A825 CAN)', 'ARINC 825', '0x18FF0010', 'Elevator Command', 100, { can_id: '0x18FF0010', dlc: 8, transmission_type: 'peer_to_peer' });
  await addParam(mid, 'FCC-1.Flight Control Law', 'ELEV_CMD_DEG', 0, 16, 'signed', 'degrees', -30, 30, 0.001, { start_bit: 0, length: 16, scale: 0.001, offset: 0 });
  await addParam(mid, 'FCC-1.Flight Control Law', 'ELEV_CMD_RATE', 16, 16, 'signed', 'deg/s', -60, 60, 0.01, { start_bit: 16, length: 16, scale: 0.01, offset: 0 });

  mid = await addMsg('FCC-1 ↔ ACE-L (A825 CAN)', 'ARINC 825', '0x18FF0011', 'Aileron Command', 100, { can_id: '0x18FF0011', dlc: 8, transmission_type: 'peer_to_peer' });
  await addParam(mid, 'FCC-1.Flight Control Law', 'AIL_CMD_DEG', 0, 16, 'signed', 'degrees', -25, 25, 0.001, { start_bit: 0, length: 16, scale: 0.001, offset: 0 });

  mid = await addMsg('FCC-1 ↔ ACE-R (A825 CAN)', 'ARINC 825', '0x18FF0010', 'Elevator Command', 100, { can_id: '0x18FF0010', dlc: 8, transmission_type: 'peer_to_peer' });
  await addParam(mid, 'FCC-1.Flight Control Law', 'ELEV_CMD_DEG', 0, 16, 'signed', 'degrees', -30, 30, 0.001, { start_bit: 0, length: 16, scale: 0.001, offset: 0 });

  // --- SSC → FCC-1 (Analog) ---
  mid = await addMsg('SSC → FCC-1 (Pitch Analog)', 'Analog', 'CH1', 'Pitch Stick Position', null, { channel_id: 'CH1', signal_type: 'voltage', excitation: 'none' });
  await addParam(mid, 'SSC.Pilot Input Sensing', 'STICK_PITCH', 0, 16, 'unsigned', 'degrees', -20, 20, 0.01, { range_min: 0.5, range_max: 4.5, accuracy_percent: 0.5 });

  mid = await addMsg('SSC → FCC-1 (Roll Analog)', 'Analog', 'CH2', 'Roll Stick Position', null, { channel_id: 'CH2', signal_type: 'voltage', excitation: 'none' });
  await addParam(mid, 'SSC.Pilot Input Sensing', 'STICK_ROLL', 0, 16, 'unsigned', 'degrees', -20, 20, 0.01, { range_min: 0.5, range_max: 4.5, accuracy_percent: 0.5 });

  // --- TLA → FCC-1 (Analog) ---
  mid = await addMsg('TLA → FCC-1 (Thrust Analog)', 'Analog', 'CH1', 'Thrust Lever Position', null, { channel_id: 'CH1', signal_type: 'voltage', excitation: 'none' });
  await addParam(mid, 'TLA.Thrust Command Sensing', 'THRUST_CMD', 0, 16, 'unsigned', 'percent', 0, 100, 0.1, { range_min: 0.5, range_max: 4.5, accuracy_percent: 0.25 });

  // --- FCC-1 → PFD (A429) ---
  mid = await addMsg('FCC-1 → PFD (A429)', 'ARINC 429', '0350', 'FCC Status Word', 10, { label_number: '0350', sdi: '00', word_rate_hz: 10 });
  await addParam(mid, 'FCC-1.Flight Control Law', 'FCC_MODE', 10, 3, 'discrete', '', 0, 7, null, {});
  await addParam(mid, 'FCC-1.Autopilot', 'AP_ENGAGED', 13, 1, 'discrete', '', 0, 1, null, {});
  await addParam(mid, 'FCC-1.Envelope Protection', 'ENV_PROT_ACTIVE', 14, 1, 'discrete', '', 0, 1, null, {});

  // --- FCC-1 → PFD (Discrete) ---
  mid = await addMsg('FCC-1 → PFD (AP Status Discrete)', 'Discrete', 'PIN1', 'AP Engaged Annunciator', null, { pin_id: 'J4-Pin1', voltage_level: '28V', signal_type: 'open_ground' });
  await addParam(mid, 'FCC-1.Autopilot', 'AP_ENGAGED_DISC', 0, 1, 'discrete', '', null, null, null, { state_0_meaning: 'AP Off', state_1_meaning: 'AP Engaged' });

  console.log('Part 3 done: messages and parameters seeded');
}

seed().then(() => process.exit()).catch(e => { console.error(e.message); process.exit(1); });
