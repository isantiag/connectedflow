/**
 * System Hierarchy Service — CRUD, subtree traversal, and budget rollup.
 * §1 Backend: All business logic lives here, not in route handlers.
 */

import { type Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SystemRow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  manufacturer: string;
  part_number: string;
  ata_chapter: string;
  system_type: string;
  canonical_id: string | null;
  parent_system_id: string | null;
  dal_level: string;
  redundancy_group: string;
  location: string;
  mass_kg: number | null;
  power_watts: number | null;
  volume_cm3: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  budget_status: string;
  diagram_x: number;
  diagram_y: number;
  profile_data: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSystemInput {
  projectId: string;
  name: string;
  description?: string;
  manufacturer?: string;
  partNumber?: string;
  ataChapter?: string;
  systemType?: string;
  parentSystemId?: string | null;
  dalLevel?: string;
  redundancyGroup?: string;
  location?: string;
  massKg?: number | null;
  powerWatts?: number | null;
  volumeCm3?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  budgetStatus?: string;
  diagramX?: number;
  diagramY?: number;
  profileData?: Record<string, unknown>;
}

export interface UpdateSystemInput {
  name?: string;
  description?: string;
  manufacturer?: string;
  partNumber?: string;
  ataChapter?: string;
  systemType?: string;
  parentSystemId?: string | null;
  dalLevel?: string;
  redundancyGroup?: string;
  location?: string;
  massKg?: number | null;
  powerWatts?: number | null;
  volumeCm3?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  budgetStatus?: string;
  diagramX?: number;
  diagramY?: number;
  profileData?: Record<string, unknown>;
}

export interface SystemFilter {
  projectId: string;
  systemType?: string;
  dalLevel?: string;
  location?: string;
  redundancyGroup?: string;
}

export interface BudgetRollup {
  systemId: string;
  name: string;
  selfMassKg: number | null;
  selfPowerWatts: number | null;
  selfVolumeCm3: number | null;
  childrenMassKg: number;
  childrenPowerWatts: number;
  childrenVolumeCm3: number;
  totalMassKg: number;
  totalPowerWatts: number;
  totalVolumeCm3: number;
  massRollupComplete: boolean;
  powerRollupComplete: boolean;
  warnings: string[];
  powerModes: PowerModeRollup[];
}

export interface PowerModeRollup {
  mode: string;
  totalPowerWatts: number;
  systems: { systemId: string; name: string; powerWatts: number }[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SystemHierarchyService {
  constructor(private readonly knex: Knex) {}

  async create(input: CreateSystemInput): Promise<SystemRow> {
    const id = uuidv4();
    const canonicalId = `ee-aero.sys.${(input.name || id.substring(0, 8)).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    const [row] = await this.knex('system')
      .insert({
        id,
        project_id: input.projectId,
        name: input.name,
        description: input.description ?? '',
        manufacturer: input.manufacturer ?? '',
        part_number: input.partNumber ?? '',
        ata_chapter: input.ataChapter ?? '',
        system_type: input.systemType ?? 'lru',
        canonical_id: canonicalId,
        parent_system_id: input.parentSystemId ?? null,
        dal_level: input.dalLevel ?? '',
        redundancy_group: input.redundancyGroup ?? '',
        location: input.location ?? '',
        mass_kg: input.massKg ?? null,
        power_watts: input.powerWatts ?? null,
        volume_cm3: input.volumeCm3 ?? null,
        length_mm: input.lengthMm ?? null,
        width_mm: input.widthMm ?? null,
        height_mm: input.heightMm ?? null,
        budget_status: input.budgetStatus ?? 'estimated',
        diagram_x: input.diagramX ?? 0,
        diagram_y: input.diagramY ?? 0,
        profile_data: input.profileData ?? {},
      })
      .returning('*');

    return row as SystemRow;
  }

  async getById(id: string): Promise<SystemRow & { children: SystemRow[] }> {
    const row = await this.knex('system').where({ id }).first();
    if (!row) throw Object.assign(new Error(`System not found: ${id}`), { name: 'NotFoundError' });
    const children = await this.knex('system').where({ parent_system_id: id }).orderBy('name');
    return { ...row, children } as SystemRow & { children: SystemRow[] };
  }

  async list(filter: SystemFilter): Promise<SystemRow[]> {
    let q = this.knex('system').where({ project_id: filter.projectId });
    if (filter.systemType) q = q.where('system_type', filter.systemType);
    if (filter.dalLevel) q = q.where('dal_level', filter.dalLevel);
    if (filter.location) q = q.where('location', filter.location);
    if (filter.redundancyGroup) q = q.where('redundancy_group', filter.redundancyGroup);
    return q.orderBy('name') as Promise<SystemRow[]>;
  }

  async update(id: string, input: UpdateSystemInput): Promise<SystemRow> {
    const data: Record<string, unknown> = { updated_at: new Date() };
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.manufacturer !== undefined) data.manufacturer = input.manufacturer;
    if (input.partNumber !== undefined) data.part_number = input.partNumber;
    if (input.ataChapter !== undefined) data.ata_chapter = input.ataChapter;
    if (input.systemType !== undefined) data.system_type = input.systemType;
    if (input.parentSystemId !== undefined) data.parent_system_id = input.parentSystemId;
    if (input.dalLevel !== undefined) data.dal_level = input.dalLevel;
    if (input.redundancyGroup !== undefined) data.redundancy_group = input.redundancyGroup;
    if (input.location !== undefined) data.location = input.location;
    if (input.massKg !== undefined) data.mass_kg = input.massKg;
    if (input.powerWatts !== undefined) data.power_watts = input.powerWatts;
    if (input.volumeCm3 !== undefined) data.volume_cm3 = input.volumeCm3;
    if (input.lengthMm !== undefined) data.length_mm = input.lengthMm;
    if (input.widthMm !== undefined) data.width_mm = input.widthMm;
    if (input.heightMm !== undefined) data.height_mm = input.heightMm;
    if (input.budgetStatus !== undefined) data.budget_status = input.budgetStatus;
    if (input.diagramX !== undefined) data.diagram_x = input.diagramX;
    if (input.diagramY !== undefined) data.diagram_y = input.diagramY;
    if (input.profileData !== undefined) data.profile_data = input.profileData;

    const [row] = await this.knex('system').where({ id }).update(data).returning('*');
    if (!row) throw Object.assign(new Error(`System not found: ${id}`), { name: 'NotFoundError' });
    return row as SystemRow;
  }

  async getChildren(id: string): Promise<SystemRow[]> {
    return this.knex('system').where({ parent_system_id: id }).orderBy('name') as Promise<SystemRow[]>;
  }

  async getSubtree(id: string, maxDepth: number = 10): Promise<SystemRow[]> {
    // Recursive CTE for subtree traversal
    const rows = await this.knex.raw(
      `WITH RECURSIVE subtree AS (
        SELECT *, 1 AS depth FROM system WHERE parent_system_id = ?
        UNION ALL
        SELECT s.*, st.depth + 1
        FROM system s
        INNER JOIN subtree st ON s.parent_system_id = st.id
        WHERE st.depth < ?
      )
      SELECT * FROM subtree ORDER BY depth, name`,
      [id, maxDepth],
    );
    return rows.rows as SystemRow[];
  }

  async updateDiagramPosition(id: string, x: number, y: number): Promise<SystemRow> {
    const [row] = await this.knex('system')
      .where({ id })
      .update({ diagram_x: x, diagram_y: y, updated_at: new Date() })
      .returning('*');
    if (!row) throw Object.assign(new Error(`System not found: ${id}`), { name: 'NotFoundError' });
    return row as SystemRow;
  }

  async getBudgetRollup(id: string): Promise<BudgetRollup> {
    const parent = await this.knex('system').where({ id }).first() as SystemRow | undefined;
    if (!parent) throw Object.assign(new Error(`System not found: ${id}`), { name: 'NotFoundError' });

    // Get all descendants
    const descendants = await this.getSubtree(id);
    const directChildren = descendants.filter((r) => r.parent_system_id === id);

    let childrenMassKg = 0;
    let childrenPowerWatts = 0;
    let childrenVolumeCm3 = 0;
    let massRollupComplete = true;
    let powerRollupComplete = true;

    for (const child of directChildren) {
      if (child.mass_kg != null) childrenMassKg += Number(child.mass_kg);
      else massRollupComplete = false;
      if (child.power_watts != null) childrenPowerWatts += Number(child.power_watts);
      else powerRollupComplete = false;
      if (child.volume_cm3 != null) childrenVolumeCm3 += Number(child.volume_cm3);
    }

    const selfMass = parent.mass_kg != null ? Number(parent.mass_kg) : null;
    const selfPower = parent.power_watts != null ? Number(parent.power_watts) : null;
    const selfVolume = parent.volume_cm3 != null ? Number(parent.volume_cm3) : null;

    const warnings: string[] = [];
    if (selfMass != null && childrenMassKg > selfMass) {
      warnings.push(`Mass overrun: children total ${childrenMassKg} kg exceeds parent budget ${selfMass} kg`);
    }
    if (selfPower != null && childrenPowerWatts > selfPower) {
      warnings.push(`Power overrun: children total ${childrenPowerWatts} W exceeds parent budget ${selfPower} W`);
    }
    if (selfVolume != null && childrenVolumeCm3 > selfVolume) {
      warnings.push(`Volume overrun: children total ${childrenVolumeCm3} cm³ exceeds parent budget ${selfVolume} cm³`);
    }

    // Power mode rollup from system_power_mode table
    const childIds = directChildren.map((c) => c.id);
    let powerModes: PowerModeRollup[] = [];
    if (childIds.length > 0) {
      const modeRows = await this.knex('system_power_mode')
        .whereIn('system_id', childIds)
        .orderBy('mode');

      const modeMap = new Map<string, { totalPowerWatts: number; systems: { systemId: string; name: string; powerWatts: number }[] }>();
      for (const mr of modeRows) {
        const childName = directChildren.find((c) => c.id === mr.system_id)?.name ?? mr.system_id;
        if (!modeMap.has(mr.mode)) {
          modeMap.set(mr.mode, { totalPowerWatts: 0, systems: [] });
        }
        const entry = modeMap.get(mr.mode)!;
        const pw = Number(mr.power_watts);
        entry.totalPowerWatts += pw;
        entry.systems.push({ systemId: mr.system_id, name: childName, powerWatts: pw });
      }
      powerModes = Array.from(modeMap.entries()).map(([mode, data]) => ({ mode, ...data }));
    }

    return {
      systemId: id,
      name: parent.name,
      selfMassKg: selfMass,
      selfPowerWatts: selfPower,
      selfVolumeCm3: selfVolume,
      childrenMassKg,
      childrenPowerWatts,
      childrenVolumeCm3,
      totalMassKg: (selfMass ?? 0) + childrenMassKg,
      totalPowerWatts: (selfPower ?? 0) + childrenPowerWatts,
      totalVolumeCm3: (selfVolume ?? 0) + childrenVolumeCm3,
      massRollupComplete,
      powerRollupComplete,
      warnings,
      powerModes,
    };
  }
}
