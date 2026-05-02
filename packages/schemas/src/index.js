/**
 * ConnectedICD — Shared Zod Schemas
 * Single source of truth for input validation.
 * Consumed by backend handlers and frontend forms.
 * All schemas use .strict() — unknown fields are rejected.
 */
const { z } = require('zod');

// === Projects ===
const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  aircraft_type: z.string().max(100).default(''),
  certification_basis: z.string().max(200).default(''),
  program_phase: z.enum(['concept', 'preliminary', 'detailed', 'certification']).default('concept'),
}).strict();

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  aircraft_type: z.string().max(100),
  certification_basis: z.string().max(200),
  program_phase: z.enum(['concept', 'preliminary', 'detailed', 'certification']),
}).strict();

// === Systems ===
const CreateSystemSchema = z.object({
  project_id: z.string().uuid().optional(),
  name: z.string().min(1, 'System name is required').max(50),
  system_type: z.enum(['lru', 'sensor', 'actuator', 'switch', 'bus_coupler']).default('lru'),
  manufacturer: z.string().max(100).default(''),
  part_number: z.string().max(100).default(''),
  ata_chapter: z.string().max(10).default(''),
  description: z.string().max(500).default(''),
}).strict();

const UpdateSystemSchema = z.object({
  name: z.string().min(1).max(50),
  system_type: z.enum(['lru', 'sensor', 'actuator', 'switch', 'bus_coupler']),
  manufacturer: z.string().max(100),
  part_number: z.string().max(100),
  ata_chapter: z.string().max(10),
  description: z.string().max(500),
}).strict();

// === Ports ===
const CreatePortSchema = z.object({
  system_id: z.string().uuid(),
  name: z.string().min(1, 'Port name is required').max(50),
  protocol_id: z.string().uuid().nullable().optional(),
  direction: z.enum(['tx', 'rx', 'bidirectional']).default('tx'),
  connector_label: z.string().max(20).default(''),
}).strict();

const UpdatePortSchema = z.object({
  name: z.string().min(1).max(50),
  protocol_id: z.string().uuid().nullable().optional(),
  direction: z.enum(['tx', 'rx', 'bidirectional']),
  connector_label: z.string().max(20),
}).strict();

// === Functions ===
const CreateFunctionSchema = z.object({
  system_id: z.string().uuid(),
  name: z.string().min(1, 'Function name is required').max(100),
  criticality: z.enum(['catastrophic', 'hazardous', 'major', 'minor', 'no_effect']).default('major'),
  dal: z.string().max(5).default(''),
}).strict();

const UpdateFunctionSchema = z.object({
  name: z.string().min(1).max(100),
  criticality: z.enum(['catastrophic', 'hazardous', 'major', 'minor', 'no_effect']),
  dal: z.string().max(5),
}).strict();

// === Connections ===
const CreateConnectionSchema = z.object({
  project_id: z.string().uuid().optional(),
  source_port_id: z.string().uuid(),
  dest_port_id: z.string().uuid(),
  protocol_id: z.string().uuid(),
  bus_id: z.string().uuid().nullable().optional(),
  name: z.string().max(200).default(''),
}).strict();

// === Messages ===
const CreateMessageSchema = z.object({
  connection_id: z.string().uuid(),
  protocol_id: z.string().uuid().optional(),
  message_id_primary: z.string().min(1, 'Message ID is required').max(50),
  message_id_secondary: z.string().max(50).nullable().optional(),
  name: z.string().max(200).default(''),
  direction: z.enum(['tx', 'rx', 'bidirectional']).default('tx'),
  refresh_rate_hz: z.number().positive().nullable().optional(),
  word_count: z.number().int().positive().nullable().optional(),
  protocol_attrs: z.record(z.unknown()).default({}),
}).strict();

const UpdateMessageSchema = z.object({
  message_id_primary: z.string().min(1).max(50),
  message_id_secondary: z.string().max(50).nullable().optional(),
  name: z.string().max(200),
  direction: z.enum(['tx', 'rx', 'bidirectional']).optional(),
  refresh_rate_hz: z.number().positive().nullable().optional(),
  protocol_attrs: z.record(z.unknown()).default({}),
}).strict();

// === Parameters ===
const CreateParameterSchema = z.object({
  message_id: z.string().uuid(),
  function_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1, 'Parameter name is required').max(100),
  description: z.string().max(500).default(''),
  bit_offset: z.number().int().min(0).default(0),
  bit_length: z.number().int().min(1).max(64).default(1),
  byte_order: z.enum(['big_endian', 'little_endian']).default('big_endian'),
  encoding: z.enum(['BNR', 'BCD', 'discrete', 'unsigned', 'signed', 'float32']).default('unsigned'),
  units: z.string().max(30).default(''),
  min_value: z.number().nullable().optional(),
  max_value: z.number().nullable().optional(),
  resolution: z.number().positive().nullable().optional(),
  scale_factor: z.number().default(1.0),
  offset_value: z.number().default(0.0),
  ssm_convention: z.string().max(20).nullable().optional(),
  protocol_attrs: z.record(z.unknown()).default({}),
  criticality: z.enum(['catastrophic', 'hazardous', 'major', 'minor', 'no_effect']).default('major'),
}).strict();

const UpdateParameterSchema = z.object({
  name: z.string().min(1).max(100),
  bit_offset: z.number().int().min(0),
  bit_length: z.number().int().min(1).max(64),
  encoding: z.enum(['BNR', 'BCD', 'discrete', 'unsigned', 'signed', 'float32']),
  units: z.string().max(30),
  min_value: z.number().nullable().optional(),
  max_value: z.number().nullable().optional(),
  resolution: z.number().positive().nullable().optional(),
  scale_factor: z.number().optional(),
  offset_value: z.number().optional(),
  byte_order: z.enum(['big_endian', 'little_endian']).optional(),
  ssm_convention: z.string().max(20).nullable().optional(),
  protocol_attrs: z.record(z.unknown()).default({}),
  criticality: z.enum(['catastrophic', 'hazardous', 'major', 'minor', 'no_effect']).optional(),
  function_id: z.string().uuid().nullable().optional(),
}).strict();

// === Signals ===
const CreateSignalSchema = z.object({
  name: z.string(),
  projectId: z.string().optional(),
  criticality: z.string().optional(),
  status: z.string().optional(),
  logical: z.record(z.unknown()).optional(),
  transport: z.record(z.unknown()).optional(),
  physical: z.record(z.unknown()).optional(),
}).strict();

// === Comments ===
const CreateCommentSchema = z.object({
  content: z.string(),
  author_id: z.string().optional(),
}).strict();

// === Baselines ===
const CreateBaselineSchema = z.object({
  projectId: z.string().uuid().optional(),
  versionLabel: z.string().min(1, 'Version label is required').max(50),
  description: z.string().max(500).default(''),
}).strict();

// === Auth ===
const LoginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().optional(),
}).strict();

// === Workflows ===
const CreateWorkflowSchema = z.object({
  entity_type: z.enum(['system', 'connection', 'message', 'parameter', 'signal']),
  entity_id: z.string().uuid(),
  entity_name: z.string().max(200).default(''),
  project_id: z.string().uuid().optional(),
  change_payload: z.any().default({}),
}).strict();

const RejectWorkflowSchema = z.object({
  reason: z.string().max(1000).default(''),
}).strict();

module.exports = {
  CreateProjectSchema, UpdateProjectSchema,
  CreateSystemSchema, UpdateSystemSchema,
  CreatePortSchema, UpdatePortSchema,
  CreateFunctionSchema, UpdateFunctionSchema,
  CreateConnectionSchema,
  CreateMessageSchema, UpdateMessageSchema,
  CreateParameterSchema, UpdateParameterSchema,
  CreateSignalSchema,
  CreateCommentSchema,
  CreateBaselineSchema,
  LoginSchema,
  CreateWorkflowSchema, RejectWorkflowSchema,
};
