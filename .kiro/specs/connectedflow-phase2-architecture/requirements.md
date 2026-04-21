# Requirements Document — ConnectedICD Phase 2: Architecture Management & Trade Studies

## Introduction

ConnectedICD Phase 2 extends the existing ICD management platform (Phase 1) with architecture-level capabilities for aerospace systems integration. Phase 1 provides signal CRUD, protocol validation, bus loading analysis, baselines, RBAC, wiring diagram rendering, AI document parsing, and live data monitoring. Phase 2 adds multi-project management, a connector parts database, enhanced bus loading and sizing analysis, power budget and electrical load analysis (ELA), mass properties estimation, cost estimation, architecture comparison with AI-driven trade studies, and aerospace-grade wiring diagram rendering with professional drawing standards.

The primary use case: an engineer manages aircraft configuration WD-001 (1 AHRS + 2 IRS) and creates variant WD-002 (2 AHRS + 1 IRS), then compares both configurations side-by-side across weight, cost, bus loading, and power budget dimensions, using AI analysis to determine the optimal architecture for the certification basis.

## Glossary

- **Project**: A top-level organizational entity representing an aircraft program with its own aircraft type, certification basis, program phase, equipment list, bus configuration, and wiring architecture
- **Project_Configuration**: A named variant of a Project representing a specific equipment arrangement (e.g., WD-001 serial 1 with 1 AHRS + 2 IRS vs WD-002 serial 2 with 2 AHRS + 1 IRS)
- **Project_Dashboard**: A summary view displaying key metrics (signal count, bus count, equipment count, baseline count, bus loading status, power budget status, weight, cost) for a Project
- **Connector_Parts_Database**: A searchable catalog of connector part numbers from multiple aerospace suppliers with electrical, mechanical, and environmental specifications
- **Connector_Entry**: A record in the Connector_Parts_Database containing part number, supplier, type, pin count, pin layout, voltage rating, current rating, environmental rating, weight, and unit price
- **Bus_Loading_Analyzer**: The service that computes bandwidth utilization, signal count limits, and bus length validation for each supported protocol type
- **Bus_Sizing_Validator**: The component that evaluates whether a bus is correctly sized based on signal count limits, bandwidth margins, and physical length constraints
- **Power_Budget_Service**: The service that computes electrical load analysis by aggregating power consumption across equipment, duty cycles, and power sources
- **Equipment**: An LRU (Line Replaceable Unit) or avionics box installed on the aircraft with defined power consumption, weight, and cost attributes
- **Power_Source**: A generator, battery, TRU (Transformer Rectifier Unit), or other electrical power provider with defined capacity
- **Power_Bus**: An electrical distribution bus or panel that routes power from Power_Sources to Equipment
- **ELA_Report**: An Electrical Load Analysis report showing total load vs available capacity per power bus and phase, with margin analysis
- **Mass_Properties_Service**: The service that computes weight estimates from connector weights, cable bundle weights, equipment weights, and harness roll-ups
- **Cost_Estimation_Service**: The service that computes cost estimates from connector prices, cable costs, equipment costs, and BOM-level roll-ups
- **Trade_Study_Engine**: The service that performs side-by-side comparison of two Project_Configurations across equipment count, signal count, bus loading, power budget, weight, and cost dimensions
- **Trade_Study_Report**: A generated document containing comparison data, diff views, AI-driven trend analysis, recommendations, and trade-off summary
- **AI_Analysis_Service**: The AI component that analyzes trade study data to identify trends, generate recommendations, and produce trade-off summaries
- **Wiring_Diagram_Renderer**: The enhanced rendering engine that produces aerospace-grade wiring diagrams with proper schematic symbols, wire callouts, connector symbols, title blocks, and zone annotations
- **Title_Block**: A professional drawing border containing project name, drawing number, revision, date, approval signatures, and other metadata per aerospace drawing standards
- **Sheet_Manager**: The component that manages multi-sheet wiring diagrams, splitting complex architectures across multiple drawing sheets
- **BOM**: Bill of Materials — a structured list of all components (connectors, cables, equipment) with quantities and costs

## Requirements

### Requirement 1: Project Creation and Management

**User Story:** As a systems engineer, I want to create and manage multiple aircraft projects, so that I can organize architecture data by program and switch between projects.

#### Acceptance Criteria

1. WHEN a user provides a project name, aircraft type, certification basis, and program phase, THE Project_Management_Service SHALL create a new Project with a unique identifier and persist the project record
2. WHEN a user requests to switch to a different Project, THE Project_Management_Service SHALL load the target Project context including its equipment list, bus configuration, and wiring architecture
3. THE Project_Management_Service SHALL enforce unique project names within the platform to prevent duplicate project records
4. WHEN a user updates a Project attribute (aircraft type, certification basis, or program phase), THE Project_Management_Service SHALL persist the change and record the modification in the audit trail
5. WHEN a user requests deletion of a Project that contains signals, baselines, or equipment, THE Project_Management_Service SHALL reject the deletion and return a list of dependent entities that must be removed first
6. IF a Project creation request is missing any required field (name, aircraft type, certification basis, program phase), THEN THE Project_Management_Service SHALL reject the request with a validation error specifying the missing fields

### Requirement 2: Project Configurations and Variants

**User Story:** As a systems engineer, I want to create variant configurations of the same aircraft type, so that I can model different equipment arrangements (e.g., 1 AHRS + 2 IRS vs 2 AHRS + 1 IRS) and compare them.

#### Acceptance Criteria

1. WHEN a user creates a new Project_Configuration for an existing Project, THE Project_Management_Service SHALL clone the parent Project architecture (equipment list, bus assignments, signal mappings) into the new configuration with a unique configuration identifier and name
2. WHEN a user modifies equipment assignments in a Project_Configuration, THE Project_Management_Service SHALL update only the target configuration without affecting the parent Project or sibling configurations
3. THE Project_Management_Service SHALL maintain an independent equipment list, bus configuration, and signal mapping for each Project_Configuration
4. WHEN a user requests a list of configurations for a Project, THE Project_Management_Service SHALL return all configurations with their names, identifiers, creation dates, and summary metrics (equipment count, signal count)
5. IF a clone operation fails due to referential integrity constraints, THEN THE Project_Management_Service SHALL roll back the partial clone and return a descriptive error

### Requirement 3: Project Dashboard

**User Story:** As a program manager, I want to see a summary dashboard for each project, so that I can quickly assess the architecture status and key metrics.

#### Acceptance Criteria

1. WHEN a user navigates to the Project_Dashboard, THE Project_Dashboard SHALL display the following metrics: total signal count, total bus count, total equipment count, total baseline count, overall bus loading status (pass/warning/fail), overall power budget status (pass/warning/fail), total estimated weight, and total estimated cost
2. WHEN any underlying data changes (signal added, equipment modified, bus loading recalculated), THE Project_Dashboard SHALL reflect the updated metrics within 5 seconds of the change being persisted
3. THE Project_Dashboard SHALL display the current program phase and certification basis for the active Project

### Requirement 4: Connector Parts Database — Catalog Management

**User Story:** As a wiring engineer, I want a searchable catalog of connector part numbers from multiple suppliers, so that I can select appropriate connectors for my physical layer signal definitions.

#### Acceptance Criteria

1. THE Connector_Parts_Database SHALL store each Connector_Entry with the following attributes: part number, supplier name, connector type (D-Sub, circular, rectangular, coaxial, fiber), pin count, pin layout description, voltage rating (volts), current rating (amps), environmental rating (IP code and MIL-spec designation), weight (grams), and unit price (USD)
2. WHEN a user searches the Connector_Parts_Database by keyword, THE Connector_Parts_Database SHALL return all Connector_Entries where the keyword matches part number, supplier name, or connector type
3. WHEN a user applies filters for supplier, connector type, minimum pin count, maximum pin count, MIL-spec compliance, or environmental rating, THE Connector_Parts_Database SHALL return only Connector_Entries matching all applied filter criteria
4. THE Connector_Parts_Database SHALL support pagination of search results with configurable page size
5. WHEN a user creates a custom Connector_Entry not from a supplier catalog, THE Connector_Parts_Database SHALL store the entry with a "custom" supplier designation

### Requirement 5: Connector Catalog Import

**User Story:** As a wiring engineer, I want to import connector catalogs from CSV or Excel files, so that I can bulk-load supplier data into the parts database.

#### Acceptance Criteria

1. WHEN a user uploads a CSV file with connector data, THE Connector_Import_Service SHALL parse the file and create Connector_Entry records for each valid row
2. WHEN a user uploads an Excel (.xlsx) file with connector data, THE Connector_Import_Service SHALL parse the first sheet and create Connector_Entry records for each valid row
3. IF a row in the import file is missing required fields (part number, supplier, connector type, pin count), THEN THE Connector_Import_Service SHALL skip the invalid row and include the row number and missing fields in the import error report
4. WHEN an import file contains a part number that already exists in the Connector_Parts_Database, THE Connector_Import_Service SHALL update the existing entry with the new data and flag the update in the import report
5. THE Connector_Import_Service SHALL return an import summary containing: total rows processed, rows successfully imported, rows updated, rows skipped with errors, and a list of error details
6. FOR ALL valid Connector_Entry records, importing to CSV then re-importing from that CSV SHALL produce equivalent Connector_Entry records (round-trip property)

### Requirement 6: Connector-to-Signal Linking

**User Story:** As a wiring engineer, I want to link connectors from the parts database to physical layer signal definitions, so that connector specifications are associated with actual wiring.

#### Acceptance Criteria

1. WHEN a user selects a Connector_Entry from the Connector_Parts_Database and assigns it to a signal physical layer, THE Connector_Linking_Service SHALL update the signal physical layer connector reference and persist the association
2. WHEN a Connector_Entry is linked to a signal physical layer, THE Connector_Linking_Service SHALL validate that the assigned pin number does not exceed the connector pin count
3. IF a user attempts to assign a pin number greater than the connector pin count, THEN THE Connector_Linking_Service SHALL reject the assignment with an error specifying the maximum pin count for the selected connector
4. WHEN a user queries which signals are linked to a specific Connector_Entry, THE Connector_Linking_Service SHALL return all signal physical layers referencing that connector


### Requirement 7: Enhanced Bus Loading Analysis — Protocol-Specific Signal Count Limits

**User Story:** As a systems engineer, I want the bus loading analyzer to enforce protocol-specific signal count limits, so that I can verify my bus assignments do not exceed protocol capacity.

#### Acceptance Criteria

1. WHEN analyzing an ARINC 429 bus, THE Bus_Loading_Analyzer SHALL report a failure if the number of assigned labels exceeds 256
2. WHEN analyzing a MIL-STD-1553 bus, THE Bus_Loading_Analyzer SHALL report a failure if the number of assigned remote terminals exceeds 31 or the number of sub-addresses per remote terminal exceeds 30
3. WHEN analyzing a CAN bus, THE Bus_Loading_Analyzer SHALL report a warning if the number of unique message IDs approaches the protocol-defined limit for the configured ID format (11-bit standard: 2048, 29-bit extended: 536870912)
4. WHEN analyzing an AFDX bus, THE Bus_Loading_Analyzer SHALL report a warning if the number of virtual links exceeds the configured virtual link limit for the network switch
5. THE Bus_Loading_Analyzer SHALL include the current signal count and the protocol maximum in the bus loading report for each analyzed bus

### Requirement 8: Enhanced Bus Loading Analysis — Bandwidth Utilization with Configurable Margins

**User Story:** As a systems engineer, I want to configure bandwidth utilization margins per bus, so that I can enforce design rules (e.g., 80% max recommended utilization).

#### Acceptance Criteria

1. WHEN a user configures a bandwidth margin threshold for a bus (e.g., 80%), THE Bus_Loading_Analyzer SHALL use that threshold as the warning level for utilization analysis
2. WHEN the computed bandwidth utilization exceeds the configured margin threshold, THE Bus_Loading_Analyzer SHALL report a warning with the current utilization percentage and the configured threshold
3. WHEN the computed bandwidth utilization exceeds 100%, THE Bus_Loading_Analyzer SHALL report a failure indicating the bus is overloaded
4. WHILE no custom margin threshold is configured for a bus, THE Bus_Loading_Analyzer SHALL use a default margin threshold of 80%
5. THE Bus_Loading_Analyzer SHALL include per-signal bandwidth contribution breakdown in the bus loading report, showing each signal name, bit length, refresh rate, and contribution in bits per second

### Requirement 9: Bus Length Validation

**User Story:** As a systems engineer, I want the system to validate bus physical length against protocol limits, so that I can ensure signal integrity.

#### Acceptance Criteria

1. WHEN analyzing an ARINC 429 bus, THE Bus_Sizing_Validator SHALL report a failure if the total bus length exceeds 100 meters
2. WHEN analyzing a CAN bus, THE Bus_Sizing_Validator SHALL report a failure if the total bus length exceeds the maximum length for the configured baud rate (1 Mbps: 40m, 500 kbps: 100m, 250 kbps: 250m, 125 kbps: 500m)
3. WHEN analyzing a MIL-STD-1553 bus, THE Bus_Sizing_Validator SHALL report a failure if any stub length exceeds 300 feet (91.44 meters)
4. WHEN analyzing an AFDX bus, THE Bus_Sizing_Validator SHALL report a failure if any segment length exceeds 100 meters
5. IF the bus length data is not available, THEN THE Bus_Sizing_Validator SHALL report an informational message indicating that length validation was skipped due to missing data

### Requirement 10: Bus Sizing Recommendations

**User Story:** As a systems engineer, I want the system to recommend bus splitting or consolidation, so that I can optimize my bus architecture.

#### Acceptance Criteria

1. WHEN a bus utilization exceeds the configured margin threshold, THE Bus_Loading_Analyzer SHALL generate a recommendation to split the bus, including a suggested signal partition based on functional category or refresh rate grouping
2. WHEN two or more buses of the same protocol type each have utilization below 30%, THE Bus_Loading_Analyzer SHALL generate a recommendation to consolidate those buses, including the projected combined utilization
3. THE Bus_Loading_Analyzer SHALL include all recommendations in the bus loading report with a severity level (suggestion, warning) and a rationale description

### Requirement 11: Equipment Power Consumption Definition

**User Story:** As a systems engineer, I want to define power consumption attributes for each equipment/LRU, so that I can build an accurate electrical load analysis.

#### Acceptance Criteria

1. WHEN a user defines an Equipment record, THE Power_Budget_Service SHALL accept and store the following power attributes: nominal power consumption (watts), peak power consumption (watts), standby power consumption (watts), and duty cycle classification (continuous, intermittent, emergency-only)
2. WHEN a user updates the power attributes of an Equipment record, THE Power_Budget_Service SHALL persist the change and trigger recalculation of the associated power bus load
3. IF an Equipment record is created without power consumption values, THEN THE Power_Budget_Service SHALL default nominal, peak, and standby power to zero and duty cycle to continuous
4. THE Power_Budget_Service SHALL validate that peak power consumption is greater than or equal to nominal power consumption and that standby power consumption is less than or equal to nominal power consumption

### Requirement 12: Power Source and Distribution Modeling

**User Story:** As a systems engineer, I want to define power sources and distribution buses, so that I can model the aircraft electrical system topology.

#### Acceptance Criteria

1. WHEN a user creates a Power_Source, THE Power_Budget_Service SHALL accept and store the source type (generator, battery, TRU), rated capacity (watts or VA), voltage output (volts), and phase configuration (single-phase, three-phase, DC)
2. WHEN a user creates a Power_Bus, THE Power_Budget_Service SHALL accept and store the bus name, associated Power_Source references, and the list of Equipment connected to the bus
3. WHEN a user assigns Equipment to a Power_Bus, THE Power_Budget_Service SHALL validate that the Equipment voltage requirement is compatible with the Power_Bus voltage output
4. IF an Equipment voltage requirement is incompatible with the assigned Power_Bus voltage, THEN THE Power_Budget_Service SHALL reject the assignment with an error specifying the voltage mismatch

### Requirement 13: Electrical Load Analysis Roll-Up and Margin Analysis

**User Story:** As a systems engineer, I want to compute total electrical load vs available capacity per power bus, so that I can verify the electrical system is correctly sized.

#### Acceptance Criteria

1. WHEN a user requests an ELA computation for a Power_Bus, THE Power_Budget_Service SHALL sum the power consumption of all connected Equipment using the appropriate duty cycle weighting (continuous: nominal power, intermittent: nominal × duty factor, emergency-only: zero under normal conditions)
2. THE Power_Budget_Service SHALL compute the load margin as (available capacity − total load) / available capacity × 100 for each Power_Bus
3. WHEN the load margin for a Power_Bus falls below 10%, THE Power_Budget_Service SHALL report a warning indicating insufficient margin
4. WHEN the total load for a Power_Bus exceeds the available capacity, THE Power_Budget_Service SHALL report a failure indicating the power bus is overloaded
5. THE Power_Budget_Service SHALL generate an ELA_Report containing: per-equipment power contribution, total load per power bus, available capacity per power bus, margin percentage, and pass/warning/fail status
6. THE Power_Budget_Service SHALL support export of the ELA_Report in PDF format for certification documentation


### Requirement 14: Connector and Cable Weight Estimation

**User Story:** As a stress/weights engineer, I want the system to estimate wiring harness weight from connector and cable data, so that I can track mass properties for the aircraft.

#### Acceptance Criteria

1. WHEN a Connector_Entry from the Connector_Parts_Database is linked to a signal physical layer, THE Mass_Properties_Service SHALL include the connector weight (grams) in the mass properties calculation
2. WHEN a CableBundle record has wire gauge, length, and wire count defined, THE Mass_Properties_Service SHALL estimate the cable bundle weight using standard wire weight-per-meter tables for the specified gauge
3. THE Mass_Properties_Service SHALL compute harness weight roll-up per zone or area by summing all connector weights and cable bundle weights assigned to that zone
4. IF a Connector_Entry has no weight value defined, THEN THE Mass_Properties_Service SHALL flag the connector as "weight unknown" in the mass properties report and exclude the connector from the weight total

### Requirement 15: Equipment Weight and Aircraft-Level Mass Properties

**User Story:** As a stress/weights engineer, I want to track equipment weight and see an aircraft-level mass properties summary, so that I can monitor total system weight.

#### Acceptance Criteria

1. WHEN a user defines or updates the weight attribute of an Equipment record, THE Mass_Properties_Service SHALL include the equipment weight in the mass properties calculation
2. THE Mass_Properties_Service SHALL compute an aircraft-level mass properties summary by summing all equipment weights, connector weights, and cable bundle weights for the active Project or Project_Configuration
3. THE Mass_Properties_Service SHALL provide a breakdown of weight by category: equipment, connectors, cable bundles, and harness assemblies
4. WHEN a new baseline is created, THE Mass_Properties_Service SHALL record the total weight at that baseline for weight growth tracking
5. WHEN a user requests weight growth history, THE Mass_Properties_Service SHALL return the total weight at each baseline with the baseline version label and creation date

### Requirement 16: Connector and Cable Cost Estimation

**User Story:** As a program manager, I want to estimate wiring costs from connector prices and cable specifications, so that I can track program costs.

#### Acceptance Criteria

1. WHEN a Connector_Entry from the Connector_Parts_Database is linked to a signal physical layer, THE Cost_Estimation_Service SHALL include the connector unit price (USD) in the cost calculation
2. WHEN a CableBundle record has wire gauge, wire type, and length defined, THE Cost_Estimation_Service SHALL estimate the cable cost using configurable price-per-meter rates for the specified gauge and type
3. THE Cost_Estimation_Service SHALL compute a BOM-level cost roll-up per subsystem by summing all connector costs, cable costs, and equipment costs assigned to that subsystem
4. THE Cost_Estimation_Service SHALL compute an aircraft-level total cost by summing all subsystem costs for the active Project or Project_Configuration
5. IF a Connector_Entry has no unit price defined, THEN THE Cost_Estimation_Service SHALL flag the connector as "price unknown" in the cost report and exclude the connector from the cost total

### Requirement 17: Equipment Cost and Cost Reporting

**User Story:** As a program manager, I want to track equipment costs and export cost reports, so that I can manage program budgets.

#### Acceptance Criteria

1. WHEN a user defines or updates the cost attribute of an Equipment record, THE Cost_Estimation_Service SHALL include the equipment cost in the cost calculation
2. THE Cost_Estimation_Service SHALL generate a cost report containing: per-item cost breakdown (connectors, cables, equipment), subtotals per subsystem, and aircraft-level total cost
3. THE Cost_Estimation_Service SHALL support export of the cost report in PDF and CSV formats
4. WHEN a user requests a cost comparison between two Project_Configurations, THE Cost_Estimation_Service SHALL return a side-by-side cost breakdown showing the delta for each cost category

### Requirement 18: Architecture Comparison — Side-by-Side Configuration Comparison

**User Story:** As a systems engineer, I want to compare two project configurations side-by-side, so that I can evaluate architectural trade-offs between equipment arrangements.

#### Acceptance Criteria

1. WHEN a user selects two Project_Configurations for comparison, THE Trade_Study_Engine SHALL compute and display the following metrics for each configuration: total equipment count, total signal count, per-bus loading utilization, total power budget (load vs capacity), total estimated weight, and total estimated cost
2. THE Trade_Study_Engine SHALL present the comparison in a side-by-side tabular format with delta values (absolute and percentage) for each metric
3. WHEN a metric differs between the two configurations, THE Trade_Study_Engine SHALL highlight the difference and indicate which configuration has the more favorable value based on the metric type (lower weight is favorable, lower cost is favorable, lower bus loading is favorable, higher power margin is favorable)
4. THE Trade_Study_Engine SHALL generate a diff view showing which equipment, signals, and bus assignments changed between the two configurations

### Requirement 19: AI-Driven Trade Study Analysis

**User Story:** As a systems engineer, I want AI-driven analysis of architecture trade-offs, so that I can make informed decisions about which configuration is optimal for my certification basis.

#### Acceptance Criteria

1. WHEN a user requests AI analysis of a trade study comparison, THE AI_Analysis_Service SHALL analyze the comparison data and generate a trend summary identifying which configuration performs better across each metric dimension
2. THE AI_Analysis_Service SHALL generate recommendations considering the Project certification basis, identifying potential certification risks or advantages for each configuration
3. THE AI_Analysis_Service SHALL produce a trade-off summary that weighs competing factors (e.g., Configuration A is lighter but Configuration B has better bus loading margins) and provides a reasoned conclusion
4. THE AI_Analysis_Service SHALL include confidence indicators for each recommendation, distinguishing between data-driven conclusions and heuristic-based suggestions
5. IF the comparison data is insufficient for meaningful analysis (e.g., both configurations are identical), THEN THE AI_Analysis_Service SHALL report that no meaningful trade-offs exist and suggest areas where the configurations could be differentiated

### Requirement 20: Trade Study Report Generation

**User Story:** As a systems engineer, I want to generate a trade study report, so that I can document the architectural decision rationale for certification and program reviews.

#### Acceptance Criteria

1. WHEN a user requests a Trade_Study_Report, THE Trade_Study_Engine SHALL generate a document containing: comparison summary table, detailed metric breakdowns, diff view of changes, AI analysis conclusions, and recommendation summary
2. THE Trade_Study_Engine SHALL support export of the Trade_Study_Report in PDF format
3. THE Trade_Study_Report SHALL include metadata: project name, configuration names, report generation date, and the user who generated the report
4. THE Trade_Study_Report SHALL include the certification basis context and any certification-relevant observations from the AI analysis

### Requirement 21: Aerospace-Grade Wiring Diagram — Equipment Symbols and Layout

**User Story:** As a wiring engineer, I want wiring diagrams that use proper aerospace schematic symbols for equipment and LRUs, so that the diagrams comply with industry drawing standards.

#### Acceptance Criteria

1. THE Wiring_Diagram_Renderer SHALL render each Equipment/LRU as a rectangular block containing the equipment part number, equipment name, and a pin table showing all connected pins with signal names
2. THE Wiring_Diagram_Renderer SHALL render connector symbols with pin numbering that matches the Connector_Entry pin layout from the Connector_Parts_Database
3. THE Wiring_Diagram_Renderer SHALL render wire callouts on each wire run showing: wire number, wire gauge, wire color, and bundle ID
4. THE Wiring_Diagram_Renderer SHALL support zone and area annotations on the diagram, allowing the user to define zone boundaries and labels
5. THE Wiring_Diagram_Renderer SHALL arrange equipment blocks and wire runs to minimize wire crossings using an automatic layout algorithm


### Requirement 22: Aerospace-Grade Wiring Diagram — Title Block and Drawing Border

**User Story:** As a wiring engineer, I want professional drawing borders with title blocks on wiring diagrams, so that the diagrams meet aerospace documentation standards.

#### Acceptance Criteria

1. THE Wiring_Diagram_Renderer SHALL include a professional drawing border on every rendered wiring diagram
2. THE Title_Block SHALL contain the following fields: project name, drawing number, revision letter/number, date, sheet number (e.g., "Sheet 1 of 3"), drawn by, checked by, and approved by signature blocks
3. WHEN a user provides title block metadata (drawing number, revision, approval names), THE Wiring_Diagram_Renderer SHALL populate the Title_Block fields with the provided values
4. IF title block metadata is not provided, THEN THE Wiring_Diagram_Renderer SHALL populate the Title_Block with default values derived from the Project name and auto-generated drawing number

### Requirement 23: Multi-Sheet Wiring Diagram Management

**User Story:** As a wiring engineer, I want to split complex wiring diagrams across multiple sheets, so that large architectures remain readable and printable.

#### Acceptance Criteria

1. WHEN the number of equipment blocks or wire runs exceeds the capacity of a single drawing sheet, THE Sheet_Manager SHALL automatically split the diagram across multiple sheets
2. THE Sheet_Manager SHALL maintain cross-sheet references: when a wire run continues from one sheet to another, the Sheet_Manager SHALL annotate the wire with a "continued on Sheet N" reference on the source sheet and a "continued from Sheet M" reference on the target sheet
3. WHEN a user manually assigns equipment or signals to specific sheets, THE Sheet_Manager SHALL respect the manual assignment and adjust automatic layout for the remaining elements
4. THE Sheet_Manager SHALL update the Title_Block sheet numbering (e.g., "Sheet 1 of 3") to reflect the total sheet count

### Requirement 24: Wiring Diagram Export — PDF and CAD Formats

**User Story:** As a wiring engineer, I want to export wiring diagrams to PDF and DXF/DWG formats, so that I can print them and import them into CAD tools.

#### Acceptance Criteria

1. WHEN a user requests PDF export of a wiring diagram, THE Wiring_Diagram_Renderer SHALL generate a print-ready PDF document at the user-selected paper size (D-size 22×34 inches or A1 594×841 mm)
2. THE PDF export SHALL include all drawing elements: equipment blocks, connector symbols, wire callouts, zone annotations, title block, and drawing border at full resolution
3. WHEN a user requests DXF export of a wiring diagram, THE Wiring_Diagram_Renderer SHALL generate a DXF file containing all drawing elements as CAD-compatible entities (lines, text, blocks)
4. THE DXF export SHALL preserve layer organization: equipment on one layer, wires on another layer, annotations on a third layer, and the title block on a border layer
5. FOR ALL wiring diagrams, exporting to PDF and visually inspecting the output SHALL show all equipment blocks, wire runs, and annotations present in the diagram model (export completeness)

### Requirement 25: Equipment Management for Architecture

**User Story:** As a systems engineer, I want to manage an equipment list (LRUs) for each project, so that I can define the avionics architecture.

#### Acceptance Criteria

1. WHEN a user creates an Equipment record, THE Equipment_Management_Service SHALL accept and store: equipment name, part number, equipment type (LRU category), nominal power (watts), peak power (watts), standby power (watts), duty cycle, weight (grams), unit cost (USD), and assigned zone/area
2. WHEN a user assigns an Equipment record to a Project or Project_Configuration, THE Equipment_Management_Service SHALL associate the equipment with the target project context
3. THE Equipment_Management_Service SHALL support querying all equipment for a given Project or Project_Configuration with filtering by equipment type, zone, or name
4. WHEN a user deletes an Equipment record that has linked connectors or signal physical layers, THE Equipment_Management_Service SHALL reject the deletion and return a list of dependent entities
5. WHEN a user updates an Equipment record, THE Equipment_Management_Service SHALL trigger recalculation of dependent analyses (power budget, mass properties, cost estimation)

### Requirement 26: Bus Configuration Management

**User Story:** As a systems engineer, I want to manage bus configurations per project, so that I can define the data bus architecture including bus lengths and margin thresholds.

#### Acceptance Criteria

1. WHEN a user creates a Bus record for a Project, THE Bus_Configuration_Service SHALL accept and store: bus name, protocol type, total bandwidth, redundancy mode, physical length (meters), and bandwidth margin threshold (percentage)
2. WHEN a user assigns signals to a Bus, THE Bus_Configuration_Service SHALL validate that the signal transport protocol matches the bus protocol type
3. IF a signal transport protocol does not match the target bus protocol type, THEN THE Bus_Configuration_Service SHALL reject the assignment with an error specifying the protocol mismatch
4. THE Bus_Configuration_Service SHALL support querying all buses for a given Project or Project_Configuration with their current loading status

### Requirement 27: Bus Loading Report Generation

**User Story:** As a systems engineer, I want to generate a comprehensive bus loading report, so that I can document bus sizing decisions for design reviews and certification.

#### Acceptance Criteria

1. WHEN a user requests a bus loading report for a Project, THE Bus_Loading_Analyzer SHALL generate a report containing: per-bus summary (protocol, signal count vs limit, bandwidth utilization vs threshold, length vs limit), per-signal contribution breakdown, pass/warning/fail status for each validation check, and recommendations
2. THE Bus_Loading_Analyzer SHALL support export of the bus loading report in PDF format
3. THE bus loading report SHALL include the configured margin thresholds and protocol-specific limits used for each validation check

### Requirement 28: Data Serialization Round-Trip for Project Configurations

**User Story:** As a developer, I want to ensure that project configuration data can be serialized and deserialized without data loss, so that export/import and backup operations are reliable.

#### Acceptance Criteria

1. FOR ALL valid Project_Configuration records with equipment lists, bus configurations, and signal mappings, serializing the configuration to JSON and deserializing the JSON back SHALL produce an equivalent Project_Configuration with identical equipment, bus, and signal data (round-trip property)
2. FOR ALL valid Connector_Entry records, serializing to JSON and deserializing SHALL produce an equivalent Connector_Entry with identical attribute values (round-trip property)
3. FOR ALL valid ELA_Report records, serializing to JSON and deserializing SHALL produce an equivalent ELA_Report with identical load values, margins, and status indicators (round-trip property)

### Requirement 29: Cross-Analysis Consistency

**User Story:** As a systems engineer, I want all analysis results (bus loading, power budget, weight, cost) to be consistent with the underlying architecture data, so that I can trust the analysis outputs.

#### Acceptance Criteria

1. WHEN the equipment list or signal assignments change in a Project_Configuration, THE platform SHALL mark all dependent analysis results (bus loading, power budget, mass properties, cost estimation) as stale until recalculated
2. WHEN a user requests a trade study comparison, THE Trade_Study_Engine SHALL verify that all analysis results for both configurations are current (not stale) before generating the comparison
3. IF any analysis result is stale at the time of trade study comparison, THEN THE Trade_Study_Engine SHALL either trigger recalculation of stale results or warn the user that the comparison includes stale data

### Requirement 30: Weight Growth Tracking Across Baselines

**User Story:** As a stress/weights engineer, I want to track how total system weight changes across baselines, so that I can identify weight growth trends early.

#### Acceptance Criteria

1. WHEN a new baseline is created for a Project, THE Mass_Properties_Service SHALL compute and store the total weight (equipment + connectors + cables) at that baseline point
2. WHEN a user requests weight growth history for a Project, THE Mass_Properties_Service SHALL return a time-series of total weight values indexed by baseline version label and creation date
3. THE Mass_Properties_Service SHALL compute the weight delta between consecutive baselines and flag any baseline where weight increased by more than 5% compared to the previous baseline

### Requirement 31: Cost Comparison Between Configurations

**User Story:** As a program manager, I want to compare costs between two configurations, so that I can evaluate the financial impact of architectural decisions.

#### Acceptance Criteria

1. WHEN a user selects two Project_Configurations for cost comparison, THE Cost_Estimation_Service SHALL compute and display per-category cost breakdowns (connectors, cables, equipment) for each configuration with delta values
2. THE Cost_Estimation_Service SHALL highlight cost drivers — the specific items or categories that contribute most to the cost difference between configurations
3. THE Cost_Estimation_Service SHALL support export of the cost comparison in PDF and CSV formats
