#!/usr/bin/env node
const knex = require('knex')({ client: 'pg', connection: 'postgres://connectedflow:connectedflow_dev@localhost:5434/connectedflow' });
const { pid, protos, sys, fns } = require('/tmp/fcs_seed_ids.json');

async function seed() {
  // === PORTS ===
  const portDefs = [
    // FCC-1: multiple bus types
    { sys: 'FCC-1', name: 'A429_RX_ADC', proto: 'ARINC 429', dir: 'rx', conn: 'J1' },
    { sys: 'FCC-1', name: 'A429_RX_AHRS', proto: 'ARINC 429', dir: 'rx', conn: 'J1' },
    { sys: 'FCC-1', name: 'A429_RX_GPS', proto: 'ARINC 429', dir: 'rx', conn: 'J1' },
    { sys: 'FCC-1', name: 'A429_TX_PFD', proto: 'ARINC 429', dir: 'tx', conn: 'J1' },
    { sys: 'FCC-1', name: 'A429_TX_FCC2', proto: 'ARINC 429', dir: 'tx', conn: 'J1' },
    { sys: 'FCC-1', name: 'A825_ACE_L', proto: 'ARINC 825', dir: 'bidirectional', conn: 'J2' },
    { sys: 'FCC-1', name: 'A825_ACE_R', proto: 'ARINC 825', dir: 'bidirectional', conn: 'J2' },
    { sys: 'FCC-1', name: 'ANALOG_SSC_PITCH', proto: 'Analog', dir: 'rx', conn: 'J3' },
    { sys: 'FCC-1', name: 'ANALOG_SSC_ROLL', proto: 'Analog', dir: 'rx', conn: 'J3' },
    { sys: 'FCC-1', name: 'ANALOG_TLA', proto: 'Analog', dir: 'rx', conn: 'J3' },
    { sys: 'FCC-1', name: 'DISC_IN_AP_ENGAGE', proto: 'Discrete', dir: 'rx', conn: 'J4' },
    { sys: 'FCC-1', name: 'DISC_OUT_AP_STATUS', proto: 'Discrete', dir: 'tx', conn: 'J4' },
    // FCC-2
    { sys: 'FCC-2', name: 'A429_RX_FCC1', proto: 'ARINC 429', dir: 'rx', conn: 'J1' },
    // ACE-L
    { sys: 'ACE-L', name: 'A825_FCC', proto: 'ARINC 825', dir: 'bidirectional', conn: 'J1' },
    { sys: 'ACE-L', name: 'DISC_OUT_FAULT', proto: 'Discrete', dir: 'tx', conn: 'J2' },
    // ACE-R
    { sys: 'ACE-R', name: 'A825_FCC', proto: 'ARINC 825', dir: 'bidirectional', conn: 'J1' },
    // SSC (Sidestick)
    { sys: 'SSC', name: 'ANALOG_PITCH', proto: 'Analog', dir: 'tx', conn: 'P1' },
    { sys: 'SSC', name: 'ANALOG_ROLL', proto: 'Analog', dir: 'tx', conn: 'P1' },
    { sys: 'SSC', name: 'DISC_TRIM_SW', proto: 'Discrete', dir: 'tx', conn: 'P1' },
    // TLA
    { sys: 'TLA', name: 'ANALOG_THRUST', proto: 'Analog', dir: 'tx', conn: 'P1' },
    // ADC
    { sys: 'ADC', name: 'A429_TX_1', proto: 'ARINC 429', dir: 'tx', conn: 'J1' },
    // AHRS
    { sys: 'AHRS', name: 'A429_TX_1', proto: 'ARINC 429', dir: 'tx', conn: 'J1' },
    // GPS
    { sys: 'GPS', name: 'A429_TX_1', proto: 'ARINC 429', dir: 'tx', conn: 'J1' },
    // PFD
    { sys: 'PFD', name: 'A429_RX_FCC', proto: 'ARINC 429', dir: 'rx', conn: 'J1' },
    { sys: 'PFD', name: 'DISC_IN_AP_STATUS', proto: 'Discrete', dir: 'rx', conn: 'J2' },
  ];
  const ports = {};
  for (const p of portDefs) {
    const [row] = await knex('system_port').insert({ system_id: sys[p.sys], name: p.name, protocol_id: protos[p.proto], direction: p.dir, connector_label: p.conn }).returning('*');
    ports[`${p.sys}.${p.name}`] = row.id;
  }

  // === CONNECTIONS ===
  const connDefs = [
    // A429 connections
    { src: 'ADC.A429_TX_1', dst: 'FCC-1.A429_RX_ADC', proto: 'ARINC 429', name: 'ADC → FCC-1 (A429)' },
    { src: 'AHRS.A429_TX_1', dst: 'FCC-1.A429_RX_AHRS', proto: 'ARINC 429', name: 'AHRS → FCC-1 (A429)' },
    { src: 'GPS.A429_TX_1', dst: 'FCC-1.A429_RX_GPS', proto: 'ARINC 429', name: 'GPS → FCC-1 (A429)' },
    { src: 'FCC-1.A429_TX_PFD', dst: 'PFD.A429_RX_FCC', proto: 'ARINC 429', name: 'FCC-1 → PFD (A429)' },
    { src: 'FCC-1.A429_TX_FCC2', dst: 'FCC-2.A429_RX_FCC1', proto: 'ARINC 429', name: 'FCC-1 → FCC-2 (A429 Cross-talk)' },
    // A825 (CAN) connections to actuators
    { src: 'FCC-1.A825_ACE_L', dst: 'ACE-L.A825_FCC', proto: 'ARINC 825', name: 'FCC-1 ↔ ACE-L (A825 CAN)' },
    { src: 'FCC-1.A825_ACE_R', dst: 'ACE-R.A825_FCC', proto: 'ARINC 825', name: 'FCC-1 ↔ ACE-R (A825 CAN)' },
    // Analog from inceptors
    { src: 'SSC.ANALOG_PITCH', dst: 'FCC-1.ANALOG_SSC_PITCH', proto: 'Analog', name: 'SSC → FCC-1 (Pitch Analog)' },
    { src: 'SSC.ANALOG_ROLL', dst: 'FCC-1.ANALOG_SSC_ROLL', proto: 'Analog', name: 'SSC → FCC-1 (Roll Analog)' },
    { src: 'TLA.ANALOG_THRUST', dst: 'FCC-1.ANALOG_TLA', proto: 'Analog', name: 'TLA → FCC-1 (Thrust Analog)' },
    // Discrete
    { src: 'FCC-1.DISC_OUT_AP_STATUS', dst: 'PFD.DISC_IN_AP_STATUS', proto: 'Discrete', name: 'FCC-1 → PFD (AP Status Discrete)' },
  ];
  const conns = {};
  for (const c of connDefs) {
    const [row] = await knex('connection').insert({ project_id: pid, source_port_id: ports[c.src], dest_port_id: ports[c.dst], protocol_id: protos[c.proto], name: c.name }).returning('*');
    conns[c.name] = row.id;
  }

  const fs = require('fs');
  const ids = JSON.parse(fs.readFileSync('/tmp/fcs_seed_ids.json'));
  ids.ports = ports;
  ids.conns = conns;
  fs.writeFileSync('/tmp/fcs_seed_ids.json', JSON.stringify(ids));
  console.log('Part 2 done:', Object.keys(ports).length, 'ports,', Object.keys(conns).length, 'connections');
}

seed().then(() => process.exit()).catch(e => { console.error(e.message); process.exit(1); });
