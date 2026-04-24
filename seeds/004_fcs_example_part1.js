#!/usr/bin/env node
const knex = require('knex')({ client: 'pg', connection: 'postgres://connectedflow:connectedflow_dev@localhost:5434/connectedflow' });

async function seed() {
  // Create a new project for FCS example
  const [proj] = await knex('project').insert({
    name: 'eVTOL FCS Architecture',
    aircraft_type: 'eVTOL',
    certification_basis: 'FAR Part 23 / SC-VTOL',
    program_phase: 'preliminary'
  }).returning('*');
  const pid = proj.id;

  // Get protocol IDs
  const protos = {};
  for (const p of await knex('protocol_definition').select('id', 'protocol_name')) {
    protos[p.protocol_name] = p.id;
  }

  // === SYSTEMS ===
  const sysDefs = [
    { name: 'FCC-1', system_type: 'lru', manufacturer: 'Enter Aero', ata_chapter: '27', description: 'Flight Control Computer #1 (Primary)' },
    { name: 'FCC-2', system_type: 'lru', manufacturer: 'Enter Aero', ata_chapter: '27', description: 'Flight Control Computer #2 (Redundant)' },
    { name: 'ACE-L', system_type: 'actuator', manufacturer: 'Moog', ata_chapter: '27', description: 'Actuator Control Electronics - Left' },
    { name: 'ACE-R', system_type: 'actuator', manufacturer: 'Moog', ata_chapter: '27', description: 'Actuator Control Electronics - Right' },
    { name: 'SSC', system_type: 'sensor', manufacturer: 'BAE Systems', ata_chapter: '27', description: 'Sidestick Controller (Pilot Inceptor)' },
    { name: 'TLA', system_type: 'sensor', manufacturer: 'BAE Systems', ata_chapter: '27', description: 'Thrust Lever Assembly' },
    { name: 'ADC', system_type: 'sensor', manufacturer: 'Collins', ata_chapter: '34', description: 'Air Data Computer' },
    { name: 'AHRS', system_type: 'sensor', manufacturer: 'Honeywell', ata_chapter: '34', description: 'Attitude Heading Reference System' },
    { name: 'GPS', system_type: 'sensor', manufacturer: 'Garmin', ata_chapter: '34', description: 'GPS Navigation Receiver' },
    { name: 'PFD', system_type: 'lru', manufacturer: 'Garmin', ata_chapter: '31', description: 'Primary Flight Display' },
  ];
  const sys = {};
  for (const s of sysDefs) {
    const [row] = await knex('system').insert({ project_id: pid, ...s }).returning('*');
    sys[s.name] = row.id;
  }

  // === FUNCTIONS ===
  const fnDefs = [
    { sys: 'FCC-1', name: 'Flight Control Law', criticality: 'catastrophic', dal: 'A' },
    { sys: 'FCC-1', name: 'Autopilot', criticality: 'hazardous', dal: 'B' },
    { sys: 'FCC-1', name: 'Envelope Protection', criticality: 'catastrophic', dal: 'A' },
    { sys: 'FCC-2', name: 'Flight Control Law', criticality: 'catastrophic', dal: 'A' },
    { sys: 'ACE-L', name: 'Servo Control', criticality: 'catastrophic', dal: 'A' },
    { sys: 'ACE-R', name: 'Servo Control', criticality: 'catastrophic', dal: 'A' },
    { sys: 'SSC', name: 'Pilot Input Sensing', criticality: 'catastrophic', dal: 'A' },
    { sys: 'TLA', name: 'Thrust Command Sensing', criticality: 'hazardous', dal: 'B' },
    { sys: 'ADC', name: 'Air Data Processing', criticality: 'hazardous', dal: 'B' },
    { sys: 'AHRS', name: 'Attitude Computation', criticality: 'hazardous', dal: 'B' },
    { sys: 'GPS', name: 'Position Computation', criticality: 'major', dal: 'C' },
    { sys: 'PFD', name: 'Flight Data Display', criticality: 'hazardous', dal: 'B' },
  ];
  const fns = {};
  for (const f of fnDefs) {
    const [row] = await knex('system_function').insert({ system_id: sys[f.sys], name: f.name, criticality: f.criticality, dal: f.dal }).returning('*');
    fns[`${f.sys}.${f.name}`] = row.id;
  }

  // Save IDs for part 2
  const fs = require('fs');
  fs.writeFileSync('/tmp/fcs_seed_ids.json', JSON.stringify({ pid, protos, sys, fns }));
  console.log('Part 1 done:', Object.keys(sys).length, 'systems,', Object.keys(fns).length, 'functions');
}

seed().then(() => process.exit()).catch(e => { console.error(e.message); process.exit(1); });
