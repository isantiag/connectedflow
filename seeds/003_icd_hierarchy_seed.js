#!/usr/bin/env node
/**
 * Seed data: eVTOL avionics 3-level ICD hierarchy
 * Run: node seeds/003_icd_hierarchy_seed.js
 */
const knex = require('knex')({ client: 'pg', connection: process.env.DATABASE_URL || 'postgres://connectedflow:connectedflow_dev@localhost:5434/connectedflow' });

async function seed() {
  const project = await knex('project').first('id');
  const pid = project.id;

  // Get protocol IDs
  const protos = {};
  for (const p of await knex('protocol_definition').select('id', 'protocol_name')) {
    protos[p.protocol_name] = p.id;
  }

  // === SYSTEMS ===
  const sysDefs = [
    { name: 'FCC', system_type: 'lru', manufacturer: 'Enter Aero', ata_chapter: '22', description: 'Flight Control Computer' },
    { name: 'ADC', system_type: 'sensor', manufacturer: 'Collins', ata_chapter: '34', description: 'Air Data Computer' },
    { name: 'AHRS', system_type: 'sensor', manufacturer: 'Honeywell', ata_chapter: '34', description: 'Attitude Heading Reference System' },
    { name: 'BMS', system_type: 'lru', manufacturer: 'Enter Aero', ata_chapter: '24', description: 'Battery Management System' },
    { name: 'EPS', system_type: 'lru', manufacturer: 'Enter Aero', ata_chapter: '24', description: 'Electrical Power System' },
    { name: 'NAV', system_type: 'lru', manufacturer: 'Garmin', ata_chapter: '34', description: 'Navigation Computer' },
  ];
  const systems = {};
  for (const s of sysDefs) {
    const [row] = await knex('system').insert({ project_id: pid, ...s }).returning('*').onConflict(['project_id', 'name']).ignore();
    systems[s.name] = row ? row.id : (await knex('system').where({ project_id: pid, name: s.name }).first()).id;
  }

  // === FUNCTIONS ===
  const fnDefs = [
    { sys: 'FCC', name: 'Flight Control Law', criticality: 'catastrophic', dal: 'A' },
    { sys: 'FCC', name: 'Autopilot', criticality: 'hazardous', dal: 'B' },
    { sys: 'ADC', name: 'Air Data Processing', criticality: 'hazardous', dal: 'B' },
    { sys: 'AHRS', name: 'Attitude Computation', criticality: 'hazardous', dal: 'B' },
    { sys: 'BMS', name: 'Battery Monitoring', criticality: 'hazardous', dal: 'B' },
    { sys: 'EPS', name: 'Power Distribution', criticality: 'major', dal: 'C' },
    { sys: 'NAV', name: 'Position Computation', criticality: 'major', dal: 'C' },
  ];
  const fns = {};
  for (const f of fnDefs) {
    const [row] = await knex('system_function').insert({ system_id: systems[f.sys], name: f.name, criticality: f.criticality, dal: f.dal }).returning('*').onConflict(['system_id', 'name']).ignore();
    fns[`${f.sys}.${f.name}`] = row ? row.id : (await knex('system_function').where({ system_id: systems[f.sys], name: f.name }).first()).id;
  }

  // === PORTS ===
  const portDefs = [
    { sys: 'ADC', name: 'A429_TX_1', protocol: 'ARINC 429', direction: 'tx', connector_label: 'J1' },
    { sys: 'FCC', name: 'A429_RX_ADC', protocol: 'ARINC 429', direction: 'rx', connector_label: 'J2' },
    { sys: 'AHRS', name: 'A429_TX_1', protocol: 'ARINC 429', direction: 'tx', connector_label: 'J1' },
    { sys: 'FCC', name: 'A429_RX_AHRS', protocol: 'ARINC 429', direction: 'rx', connector_label: 'J3' },
    { sys: 'NAV', name: 'A429_TX_1', protocol: 'ARINC 429', direction: 'tx', connector_label: 'J1' },
    { sys: 'FCC', name: 'A429_RX_NAV', protocol: 'ARINC 429', direction: 'rx', connector_label: 'J4' },
    { sys: 'BMS', name: 'ANALOG_OUT_1', protocol: 'Analog', direction: 'tx', connector_label: 'P1' },
    { sys: 'EPS', name: 'ANALOG_IN_1', protocol: 'Analog', direction: 'rx', connector_label: 'P2' },
    { sys: 'BMS', name: 'DISC_OUT_1', protocol: 'Discrete', direction: 'tx', connector_label: 'P1' },
    { sys: 'EPS', name: 'DISC_IN_1', protocol: 'Discrete', direction: 'rx', connector_label: 'P3' },
    { sys: 'FCC', name: 'DISC_OUT_WOW', protocol: 'Discrete', direction: 'tx', connector_label: 'J5' },
    { sys: 'BMS', name: 'DISC_IN_WOW', protocol: 'Discrete', direction: 'rx', connector_label: 'P4' },
  ];
  const ports = {};
  for (const p of portDefs) {
    const [row] = await knex('system_port').insert({ system_id: systems[p.sys], name: p.name, protocol_id: protos[p.protocol], direction: p.direction, connector_label: p.connector_label }).returning('*').onConflict(['system_id', 'name']).ignore();
    ports[`${p.sys}.${p.name}`] = row ? row.id : (await knex('system_port').where({ system_id: systems[p.sys], name: p.name }).first()).id;
  }

  // === CONNECTIONS ===
  const connDefs = [
    { src: 'ADC.A429_TX_1', dst: 'FCC.A429_RX_ADC', proto: 'ARINC 429', name: 'ADC → FCC (A429)' },
    { src: 'AHRS.A429_TX_1', dst: 'FCC.A429_RX_AHRS', proto: 'ARINC 429', name: 'AHRS → FCC (A429)' },
    { src: 'NAV.A429_TX_1', dst: 'FCC.A429_RX_NAV', proto: 'ARINC 429', name: 'NAV → FCC (A429)' },
    { src: 'BMS.ANALOG_OUT_1', dst: 'EPS.ANALOG_IN_1', proto: 'Analog', name: 'BMS → EPS (Analog)' },
    { src: 'BMS.DISC_OUT_1', dst: 'EPS.DISC_IN_1', proto: 'Discrete', name: 'BMS → EPS (Discrete)' },
    { src: 'FCC.DISC_OUT_WOW', dst: 'BMS.DISC_IN_WOW', proto: 'Discrete', name: 'FCC → BMS (WOW Discrete)' },
  ];
  const conns = {};
  for (const c of connDefs) {
    const existing = await knex('connection').where({ source_port_id: ports[c.src], dest_port_id: ports[c.dst] }).first();
    if (existing) { conns[c.name] = existing.id; continue; }
    const [row] = await knex('connection').insert({ project_id: pid, source_port_id: ports[c.src], dest_port_id: ports[c.dst], protocol_id: protos[c.proto], name: c.name }).returning('*');
    conns[c.name] = row.id;
  }

  // === MESSAGES ===
  const msgDefs = [
    // ADC → FCC (A429)
    { conn: 'ADC → FCC (A429)', proto: 'ARINC 429', mid: '0206', name: 'Computed Airspeed', rate: 12.5, attrs: { label_number: '0206', sdi: '00', word_rate_hz: 12.5, word_size_bits: 32 } },
    { conn: 'ADC → FCC (A429)', proto: 'ARINC 429', mid: '0203', name: 'Barometric Altitude', rate: 12.5, attrs: { label_number: '0203', sdi: '00', word_rate_hz: 12.5, word_size_bits: 32 } },
    { conn: 'ADC → FCC (A429)', proto: 'ARINC 429', mid: '0210', name: 'Mach Number', rate: 6.25, attrs: { label_number: '0210', sdi: '00', word_rate_hz: 6.25, word_size_bits: 32 } },
    { conn: 'ADC → FCC (A429)', proto: 'ARINC 429', mid: '0213', name: 'Total Air Temperature', rate: 1.0, attrs: { label_number: '0213', sdi: '00', word_rate_hz: 1.0, word_size_bits: 32 } },
    // AHRS → FCC (A429)
    { conn: 'AHRS → FCC (A429)', proto: 'ARINC 429', mid: '0324', name: 'Pitch Angle', rate: 50, attrs: { label_number: '0324', sdi: '00', word_rate_hz: 50, word_size_bits: 32 } },
    { conn: 'AHRS → FCC (A429)', proto: 'ARINC 429', mid: '0325', name: 'Roll Angle', rate: 50, attrs: { label_number: '0325', sdi: '00', word_rate_hz: 50, word_size_bits: 32 } },
    { conn: 'AHRS → FCC (A429)', proto: 'ARINC 429', mid: '0314', name: 'Magnetic Heading', rate: 25, attrs: { label_number: '0314', sdi: '00', word_rate_hz: 25, word_size_bits: 32 } },
    // NAV → FCC (A429)
    { conn: 'NAV → FCC (A429)', proto: 'ARINC 429', mid: '0310', name: 'Latitude', rate: 5, attrs: { label_number: '0310', sdi: '00', word_rate_hz: 5, word_size_bits: 32 } },
    { conn: 'NAV → FCC (A429)', proto: 'ARINC 429', mid: '0311', name: 'Longitude', rate: 5, attrs: { label_number: '0311', sdi: '00', word_rate_hz: 5, word_size_bits: 32 } },
    // BMS → EPS (Analog)
    { conn: 'BMS → EPS (Analog)', proto: 'Analog', mid: 'CH1', name: 'HV Bus Voltage', rate: 10, attrs: { channel_id: 'CH1', signal_type: 'voltage', excitation: 'none' } },
    { conn: 'BMS → EPS (Analog)', proto: 'Analog', mid: 'CH2', name: 'Battery Temperature', rate: 2, attrs: { channel_id: 'CH2', signal_type: 'voltage', excitation: 'none' } },
    // BMS → EPS (Discrete)
    { conn: 'BMS → EPS (Discrete)', proto: 'Discrete', mid: 'PIN1', name: 'Battery Contactor Cmd', attrs: { pin_id: 'J1-Pin1', voltage_level: '28V', signal_type: 'open_ground' } },
    // FCC → BMS (Discrete)
    { conn: 'FCC → BMS (WOW Discrete)', proto: 'Discrete', mid: 'PIN5', name: 'Weight on Wheels', attrs: { pin_id: 'J5-Pin5', voltage_level: '28V', signal_type: 'open_ground' } },
  ];
  const msgs = {};
  for (const m of msgDefs) {
    const existing = await knex('message').where({ connection_id: conns[m.conn], message_id_primary: m.mid }).first();
    if (existing) { msgs[`${m.conn}:${m.mid}`] = existing.id; continue; }
    const [row] = await knex('message').insert({ connection_id: conns[m.conn], protocol_id: protos[m.proto], message_id_primary: m.mid, name: m.name, direction: 'tx', refresh_rate_hz: m.rate || null, protocol_attrs: m.attrs }).returning('*');
    msgs[`${m.conn}:${m.mid}`] = row.id;
  }

  // === PARAMETERS ===
  const paramDefs = [
    // ADC labels
    { msg: 'ADC → FCC (A429):0206', fn: 'ADC.Air Data Processing', name: 'AIRSPEED_CAS', bit_offset: 10, bit_length: 19, encoding: 'BNR', units: 'knots', min: 0, max: 512, res: 0.0625, ssm: 'BNR', attrs: { msb: 28, lsb: 10, sign_bit: false } },
    { msg: 'ADC → FCC (A429):0203', fn: 'ADC.Air Data Processing', name: 'ALTITUDE_BARO', bit_offset: 10, bit_length: 19, encoding: 'BNR', units: 'feet', min: -1000, max: 50000, res: 1.0, ssm: 'BNR', attrs: { msb: 28, lsb: 10, sign_bit: true } },
    { msg: 'ADC → FCC (A429):0210', fn: 'ADC.Air Data Processing', name: 'MACH_NUMBER', bit_offset: 10, bit_length: 19, encoding: 'BNR', units: 'mach', min: 0, max: 4.096, res: 0.000488, ssm: 'BNR', attrs: { msb: 28, lsb: 10, sign_bit: false } },
    { msg: 'ADC → FCC (A429):0213', fn: 'ADC.Air Data Processing', name: 'TOTAL_AIR_TEMP', bit_offset: 10, bit_length: 19, encoding: 'BNR', units: 'celsius', min: -100, max: 150, res: 0.25, ssm: 'BNR', attrs: { msb: 28, lsb: 10, sign_bit: true } },
    // AHRS labels
    { msg: 'AHRS → FCC (A429):0324', fn: 'AHRS.Attitude Computation', name: 'PITCH_ANGLE', bit_offset: 10, bit_length: 19, encoding: 'BNR', units: 'degrees', min: -90, max: 90, res: 0.01, ssm: 'BNR', attrs: { msb: 28, lsb: 10, sign_bit: true } },
    { msg: 'AHRS → FCC (A429):0325', fn: 'AHRS.Attitude Computation', name: 'ROLL_ANGLE', bit_offset: 10, bit_length: 19, encoding: 'BNR', units: 'degrees', min: -180, max: 180, res: 0.01, ssm: 'BNR', attrs: { msb: 28, lsb: 10, sign_bit: true } },
    { msg: 'AHRS → FCC (A429):0314', fn: 'AHRS.Attitude Computation', name: 'HEADING_MAG', bit_offset: 10, bit_length: 19, encoding: 'BNR', units: 'degrees', min: 0, max: 360, res: 0.01, ssm: 'BNR', attrs: { msb: 28, lsb: 10, sign_bit: false } },
    // NAV labels
    { msg: 'NAV → FCC (A429):0310', fn: 'NAV.Position Computation', name: 'NAV_LATITUDE', bit_offset: 10, bit_length: 20, encoding: 'BNR', units: 'degrees', min: -90, max: 90, res: 0.000172, ssm: 'BNR', attrs: { msb: 29, lsb: 10, sign_bit: true } },
    { msg: 'NAV → FCC (A429):0311', fn: 'NAV.Position Computation', name: 'NAV_LONGITUDE', bit_offset: 10, bit_length: 20, encoding: 'BNR', units: 'degrees', min: -180, max: 180, res: 0.000172, ssm: 'BNR', attrs: { msb: 29, lsb: 10, sign_bit: true } },
    // Analog
    { msg: 'BMS → EPS (Analog):CH1', fn: 'BMS.Battery Monitoring', name: 'HV_BUS_VOLTAGE', bit_offset: 0, bit_length: 16, encoding: 'unsigned', units: 'volts', min: 0, max: 800, res: 0.1, attrs: { range_min: 0, range_max: 10, accuracy_percent: 0.5, sample_rate_hz: 10 } },
    { msg: 'BMS → EPS (Analog):CH2', fn: 'BMS.Battery Monitoring', name: 'BATTERY_TEMP', bit_offset: 0, bit_length: 16, encoding: 'unsigned', units: 'celsius', min: -40, max: 85, res: 0.1, attrs: { range_min: 0, range_max: 5, accuracy_percent: 1.0, sample_rate_hz: 2 } },
    // Discrete
    { msg: 'BMS → EPS (Discrete):PIN1', fn: 'BMS.Battery Monitoring', name: 'BATT_CONTACTOR_CMD', bit_offset: 0, bit_length: 1, encoding: 'discrete', units: '', attrs: { state_0_meaning: 'Open', state_1_meaning: 'Closed', debounce_ms: 50 } },
    { msg: 'FCC → BMS (WOW Discrete):PIN5', fn: 'FCC.Flight Control Law', name: 'WEIGHT_ON_WHEELS', bit_offset: 0, bit_length: 1, encoding: 'discrete', units: '', attrs: { state_0_meaning: 'In Air', state_1_meaning: 'On Ground', debounce_ms: 100 } },
  ];

  for (const p of paramDefs) {
    const msgId = msgs[p.msg];
    const fnId = fns[p.fn] || null;
    const existing = await knex('parameter').where({ message_id: msgId, name: p.name }).first();
    if (existing) continue;
    await knex('parameter').insert({ message_id: msgId, function_id: fnId, name: p.name, bit_offset: p.bit_offset, bit_length: p.bit_length, encoding: p.encoding || 'unsigned', units: p.units || '', min_value: p.min ?? null, max_value: p.max ?? null, resolution: p.res ?? null, scale_factor: 1.0, offset_value: 0.0, byte_order: 'big_endian', ssm_convention: p.ssm || null, protocol_attrs: p.attrs || {}, criticality: 'major' });
  }

  console.log('Seed complete:', Object.keys(systems).length, 'systems,', Object.keys(conns).length, 'connections,', Object.keys(msgs).length, 'messages,', paramDefs.length, 'parameters');
  process.exit();
}

seed().catch(e => { console.error('SEED ERROR:', e.message); process.exit(1); });
