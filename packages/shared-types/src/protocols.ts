// Protocol-specific JSONB attribute types for transport layer encoding.

/** ARINC 429 transport attributes. */
export interface Arinc429Attrs {
  label: number;
  sdi: string;
  ssm: string;
  word_type: 'BNR' | 'BCD' | 'discrete';
  resolution: number;
  bus_speed: 'high' | 'low';
}

/** CAN Bus transport attributes. */
export interface CanBusAttrs {
  arbitration_id: string;
  id_format: 'standard_11bit' | 'extended_29bit';
  dlc: number;
  cycle_time_ms: number;
  start_bit: number;
  signal_length: number;
}

/** MIL-STD-1553 transport attributes. */
export interface MilStd1553Attrs {
  remote_terminal: number;
  sub_address: number;
  word_count: number;
  direction: 'RT_to_BC' | 'BC_to_RT' | 'RT_to_RT';
  message_type: 'periodic' | 'aperiodic';
  minor_frame_rate_hz: number;
}

/** ARINC 664 (AFDX) transport attributes. */
export interface Arinc664Attrs {
  virtual_link_id: number;
  bag_ms: number;
  max_frame_size: number;
  partition_id: string;
  sub_virtual_link: number;
  network: 'A' | 'B';
}

/** Union of all protocol-specific attribute types. */
export type ProtocolAttrs =
  | Arinc429Attrs
  | CanBusAttrs
  | MilStd1553Attrs
  | Arinc664Attrs;

/** Known protocol identifiers. */
export type KnownProtocol = 'arinc429' | 'canbus' | 'milstd1553' | 'arinc664';
