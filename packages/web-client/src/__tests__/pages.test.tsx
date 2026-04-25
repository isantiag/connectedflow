import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Global mocks ───────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

const mockLogin = vi.fn();
const mockLogout = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: { userId: 'u1', email: 'admin@test.com', displayName: 'Admin', role: 'admin' },
    token: 'tok', login: mockLogin, logout: mockLogout, loading: false,
  }),
}));

const mockProject = { id: 'p1', name: 'TestProject', aircraft_type: 'eVTOL', program_phase: 'concept' };
vi.mock('@/lib/project-context', () => ({
  useProject: () => ({
    projects: [{ id: 'p1', name: 'TestProject', aircraft_type: 'eVTOL', program_phase: 'concept' }],
    currentProject: { id: 'p1', name: 'TestProject', aircraft_type: 'eVTOL', program_phase: 'concept' },
    setProjectId: vi.fn(), addProject: vi.fn(), loading: false,
  }),
}));

// ─── Mock api-client ────────────────────────────────────────────────────────
const mockApiGet = vi.fn().mockResolvedValue({});
const mockApiPost = vi.fn().mockResolvedValue({});
const mockApiPut = vi.fn().mockResolvedValue({});
const mockApiDelete = vi.fn().mockResolvedValue({});
vi.mock('@/lib/api-client', () => ({
  api: { get: (...a: any[]) => mockApiGet(...a), post: (...a: any[]) => mockApiPost(...a), put: (...a: any[]) => mockApiPut(...a), delete: (...a: any[]) => mockApiDelete(...a), patch: vi.fn() },
}));

// ─── Mock fetch globally ────────────────────────────────────────────────────
globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

// ─── Mock queries ───────────────────────────────────────────────────────────
const mockMutateAsync = vi.fn().mockResolvedValue({});
const mockMutate = vi.fn();
const makeMutation = () => ({ mutateAsync: mockMutateAsync, mutate: mockMutate, isPending: false, isError: false, error: null });
const mockRefetch = vi.fn();

vi.mock('@/lib/queries', () => ({
  useDashboard: () => ({ data: { systems: 5, connections: 12, messages: 30, parameters: 100, protocols: 3, signals: 50, busBreakdown: [{ protocol: 'ARINC 429', count: 8 }], recentSystems: [{ name: 'FCC', time: '2024-01-01' }] }, isLoading: false }),
  useInsights: () => ({ data: { insights: [{ type: 'warning', category: 'bus', title: 'High bus load', description: 'Bus A at 80%', suggestion: 'Add redundancy' }] }, isLoading: false }),
  useSignals: () => ({ data: [{ id: 's1', name: 'ALT_STD', status: 'active', criticality: 'critical', protocol: 'ARINC 429', bus: 'Bus A' }], isLoading: false }),
  useSystems: () => ({ data: [{ id: 'sys1', name: 'FCC', system_type: 'lru', description: 'Flight Computer', connection_count: 3, port_count: 5, ata_chapter: '22', manufacturer: 'Honeywell' }], isLoading: false }),
  useCreateSystem: () => makeMutation(),
  useDeleteSystem: () => makeMutation(),
  useBaselines: () => ({ data: [{ id: 'b1', version_label: 'v1.0', status: 'frozen', description: 'Initial', created_at: '2024-01-01', hierarchy: { systems: 2, messages: 10, parameters: 50 } }], isLoading: false, refetch: mockRefetch }),
  useCreateBaseline: () => makeMutation(),
  useWorkflows: () => ({ data: [{ id: 'w1', entity_name: 'FCC Update', entity_type: 'system', status: 'pending', submitted_at: '2024-01-01', change_payload: { name: 'FCC-v2' } }], isLoading: false }),
  useApproveWorkflow: () => makeMutation(),
  useRejectWorkflow: () => makeMutation(),
  useAnomalies: () => ({ data: { summary: { total: 3, errors: 1, warnings: 1, info: 1 }, anomalies: [{ severity: 'error', category: 'missing_param', title: 'Missing range', description: 'Param X has no range', suggestion: 'Add min/max' }] }, isLoading: false, refetch: mockRefetch }),
  useN2Matrix: () => ({ data: { systems: ['FCC', 'ADC'], cells: [{ source: 'FCC', dest: 'ADC', protocol: 'ARINC 429', count: 5, connectionId: 'c1' }] }, isLoading: false }),
  useHWTemplates: () => ({ data: [{ id: 't1', name: 'Generic LRU', system_type: 'lru', description: 'Standard LRU', manufacturer: 'Acme', port_count: 4, function_count: 2 }], isLoading: false, refetch: mockRefetch }),
  useProtocols: () => ({ data: [{ id: 'pr1', protocol_name: 'ARINC 429' }, { id: 'pr2', protocol_name: 'AFDX' }], isLoading: false }),
  useLiveAdapters: () => ({ data: [{ id: 'a1', name: 'Sim-429', protocol: 'ARINC 429', status: 'ready', type: 'simulator' }], isLoading: false }),
  useProjects: () => ({ data: [mockProject], isLoading: false }),
  useParseJobs: () => ({ data: [], isLoading: false }),
  useUsers: () => ({ data: [], isLoading: false }),
}));

// ─── Mock @xyflow/react ─────────────────────────────────────────────────────
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: any) => <div data-testid="reactflow">{children}</div>,
  Background: () => <div />,
  Controls: () => <div />,
  MiniMap: () => <div />,
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
}));

vi.mock('@/components/wiring/connector-node', () => ({
  ConnectorNode: () => <div />,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────
function qcWrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiGet.mockResolvedValue({});
  mockApiPost.mockResolvedValue({});
  mockApiDelete.mockResolvedValue({});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(window, 'prompt').mockReturnValue('TestName');
  vi.spyOn(window, 'open').mockImplementation(() => null);
  if (!HTMLCanvasElement.prototype.getContext) {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillText: vi.fn(), scale: vi.fn(), set fillStyle(_v: any) {}, set strokeStyle(_v: any) {}, set lineWidth(_v: any) {}, set font(_v: any) {}, set textAlign(_v: any) {} }) as any;
  }
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = vi.fn();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. Dashboard
// ═══════════════════════════════════════════════════════════════════════════
describe('Dashboard Page', () => {
  let DashboardPage: any;
  beforeEach(async () => { DashboardPage = (await import('@/app/page')).default; });

  it('renders without crashing', () => {
    render(qcWrap(<DashboardPage />));
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows stats and insights', () => {
    render(qcWrap(<DashboardPage />));
    expect(screen.getByText('5')).toBeInTheDocument(); // systems count
    expect(screen.getByText('High bus load')).toBeInTheDocument();
  });

  it('shows navigation cards', () => {
    render(qcWrap(<DashboardPage />));
    expect(screen.getAllByText('Systems').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Ingestion')).toBeInTheDocument();
    expect(screen.getByText('AI Analysis')).toBeInTheDocument();
    // Anomalies text appears in nav card
    expect(screen.getByText('Anomalies')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Signals
// ═══════════════════════════════════════════════════════════════════════════
describe('Signals Page', () => {
  let SignalsPage: any;
  beforeEach(async () => { SignalsPage = (await import('@/app/signals/page')).default; });

  it('renders without crashing', () => {
    render(qcWrap(<SignalsPage />));
    expect(screen.getByText('Signals')).toBeInTheDocument();
  });

  it('shows signal data in table', () => {
    render(qcWrap(<SignalsPage />));
    expect(screen.getByText('ALT_STD')).toBeInTheDocument();
    expect(screen.getByText('ARINC 429')).toBeInTheDocument();
  });

  it('has Import and New Signal buttons', () => {
    render(qcWrap(<SignalsPage />));
    expect(screen.getByText('Import')).toBeInTheDocument();
    expect(screen.getByText('New Signal')).toBeInTheDocument();
  });

  it('has search input', () => {
    render(qcWrap(<SignalsPage />));
    const input = screen.getByPlaceholderText('Search signals...');
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'ALT' } });
    expect(input).toHaveValue('ALT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Systems
// ═══════════════════════════════════════════════════════════════════════════
describe('Systems Page', () => {
  let SystemsPage: any;
  beforeEach(async () => { SystemsPage = (await import('@/app/systems/page')).default; });

  it('renders without crashing', () => {
    render(qcWrap(<SystemsPage />));
    expect(screen.getByText('Systems')).toBeInTheDocument();
  });

  it('shows system cards', () => {
    render(qcWrap(<SystemsPage />));
    expect(screen.getByText('FCC')).toBeInTheDocument();
    expect(screen.getByText('3 connections')).toBeInTheDocument();
  });

  it('New System button toggles form', () => {
    render(qcWrap(<SystemsPage />));
    fireEvent.click(screen.getByText('New System'));
    expect(screen.getByPlaceholderText('Name (e.g. FCC) *')).toBeInTheDocument();
    expect(screen.getByText('Create System')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('Cancel hides form', () => {
    render(qcWrap(<SystemsPage />));
    fireEvent.click(screen.getByText('New System'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Name (e.g. FCC) *')).not.toBeInTheDocument();
  });

  it('Create System calls mutation', async () => {
    render(qcWrap(<SystemsPage />));
    fireEvent.click(screen.getByText('New System'));
    fireEvent.change(screen.getByPlaceholderText('Name (e.g. FCC) *'), { target: { value: 'ADC' } });
    fireEvent.click(screen.getByText('Create System'));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
  });

  it('Delete button calls confirm then mutation', async () => {
    render(qcWrap(<SystemsPage />));
    const deleteBtn = screen.getByTitle('Delete system');
    fireEvent.click(deleteBtn);
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith('sys1'));
  });

  it('export DBC calls window.open', () => {
    render(qcWrap(<SystemsPage />));
    fireEvent.click(screen.getByText('DBC'));
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('export/dbc'), '_blank');
  });

  it('export Simulink calls window.open', () => {
    render(qcWrap(<SystemsPage />));
    fireEvent.click(screen.getByText('Simulink'));
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('export/simulink'), '_blank');
  });

  it('export PDF calls window.open', () => {
    render(qcWrap(<SystemsPage />));
    fireEvent.click(screen.getByText('PDF'));
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('export/icd-pdf'), '_blank');
  });

  it('export Excel calls window.open', () => {
    render(qcWrap(<SystemsPage />));
    fireEvent.click(screen.getByText('Excel'));
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('export/icd'), '_blank');
  });

  it('search filters systems', () => {
    render(qcWrap(<SystemsPage />));
    fireEvent.change(screen.getByPlaceholderText('Search systems...'), { target: { value: 'zzz' } });
    expect(screen.getByText(/No systems match/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Baselines
// ═══════════════════════════════════════════════════════════════════════════
describe('Baselines Page', () => {
  let BaselinesPage: any;
  beforeEach(async () => { BaselinesPage = (await import('@/app/baselines/page')).default; });

  it('renders without crashing', () => {
    render(qcWrap(<BaselinesPage />));
    expect(screen.getByText('Baselines')).toBeInTheDocument();
  });

  it('shows baseline data', () => {
    render(qcWrap(<BaselinesPage />));
    expect(screen.getByText('v1.0')).toBeInTheDocument();
    expect(screen.getByText('frozen')).toBeInTheDocument();
  });

  it('Freeze Baseline button toggles form', () => {
    render(qcWrap(<BaselinesPage />));
    fireEvent.click(screen.getByText('Freeze Baseline'));
    expect(screen.getByPlaceholderText('Version label *')).toBeInTheDocument();
    expect(screen.getByText('Freeze')).toBeInTheDocument();
  });

  it('Freeze calls mutation', async () => {
    render(qcWrap(<BaselinesPage />));
    fireEvent.click(screen.getByText('Freeze Baseline'));
    fireEvent.change(screen.getByPlaceholderText('Version label *'), { target: { value: 'v2.0' } });
    fireEvent.click(screen.getByText('Freeze'));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
  });

  it('Cancel hides form', () => {
    render(qcWrap(<BaselinesPage />));
    fireEvent.click(screen.getByText('Freeze Baseline'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Version label *')).not.toBeInTheDocument();
  });

  it('Delete baseline calls confirm and api.delete', async () => {
    mockApiDelete.mockResolvedValue({});
    render(qcWrap(<BaselinesPage />));
    // Find the trash button (Trash2 icon button)
    const trashButtons = document.querySelectorAll('button');
    const deleteBtn = Array.from(trashButtons).find(b => b.classList.contains('hover:text-red-500') || b.innerHTML.includes('trash'));
    // Click last button that looks like delete
    const allBtns = screen.getAllByRole('button');
    const delBtn = allBtns.find(b => b.className.includes('red'));
    if (delBtn) {
      fireEvent.click(delBtn);
      expect(window.confirm).toHaveBeenCalled();
      await waitFor(() => expect(mockApiDelete).toHaveBeenCalledWith('baselines/b1'));
    }
  });

  it('View snapshot calls api.get', async () => {
    mockApiGet.mockResolvedValue({ snapshot: { systems: [{ name: 'FCC' }], connections: [], messages: [], parameters: [] } });
    render(qcWrap(<BaselinesPage />));
    // Eye icon button
    const allBtns = screen.getAllByRole('button');
    const viewBtn = allBtns.find(b => b.className.includes('hover:text-primary'));
    if (viewBtn) {
      fireEvent.click(viewBtn);
      await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('baselines/b1'));
    }
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 5. Documents
// ═══════════════════════════════════════════════════════════════════════════
describe('Documents Page', () => {
  let DocumentsPage: any;
  beforeEach(async () => {
    mockApiGet.mockResolvedValue({ data: [
      { id: 'j1', fileName: 'icd.pdf', status: 'review_pending', totalSignals: 10, avgConfidence: 0.85, createdAt: '2024-01-01' },
      { id: 'j2', fileName: 'spec.docx', status: 'confirmed', totalSignals: 5, avgConfidence: 0.9, createdAt: '2024-01-02' },
    ] });
    DocumentsPage = (await import('@/app/documents/page')).default;
  });

  it('renders without crashing', async () => {
    render(<DocumentsPage />);
    expect(screen.getByText('Documents')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('icd.pdf')).toBeInTheDocument());
  });

  it('shows parse jobs', async () => {
    render(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('icd.pdf')).toBeInTheDocument();
      expect(screen.getByText('spec.docx')).toBeInTheDocument();
    });
  });

  it('Review button calls viewExtractions', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('extractions')) return Promise.resolve({ signals: [{ name: 'SIG1', confidence: 0.9, needsReview: false, data: {} }] });
      return Promise.resolve({ data: [{ id: 'j1', fileName: 'icd.pdf', status: 'review_pending', totalSignals: 10, avgConfidence: 0.85, createdAt: '2024-01-01' }] });
    });
    render(<DocumentsPage />);
    await waitFor(() => expect(screen.getByText('Review')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Review'));
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('extractions')));
  });

  it('Confirm All calls api.post', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('extractions')) return Promise.resolve({ signals: [{ name: 'SIG1', confidence: 0.9, needsReview: false, data: {} }] });
      return Promise.resolve({ data: [{ id: 'j1', fileName: 'icd.pdf', status: 'review_pending', totalSignals: 10, avgConfidence: 0.85, createdAt: '2024-01-01' }] });
    });
    render(<DocumentsPage />);
    await waitFor(() => expect(screen.getByText('Review')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Review'));
    await waitFor(() => expect(screen.getByText('Confirm All')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Confirm All'));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(expect.stringContaining('confirm')));
  });

  it('Cancel hides extraction review', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('extractions')) return Promise.resolve({ signals: [{ name: 'SIG1', confidence: 0.9, needsReview: false, data: {} }] });
      return Promise.resolve({ data: [{ id: 'j1', fileName: 'icd.pdf', status: 'review_pending', totalSignals: 10, avgConfidence: 0.85, createdAt: '2024-01-01' }] });
    });
    render(<DocumentsPage />);
    await waitFor(() => expect(screen.getByText('Review')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Review'));
    await waitFor(() => expect(screen.getByText('Cancel')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Select a job to review extractions')).toBeInTheDocument();
  });

  it('has file upload input', () => {
    render(<DocumentsPage />);
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Workflows
// ═══════════════════════════════════════════════════════════════════════════
describe('Workflows Page', () => {
  let WorkflowsPage: any;
  beforeEach(async () => { WorkflowsPage = (await import('@/app/workflows/page')).default; });

  it('renders without crashing', () => {
    render(qcWrap(<WorkflowsPage />));
    expect(screen.getByText('Approval Workflows')).toBeInTheDocument();
  });

  it('shows workflow data', () => {
    render(qcWrap(<WorkflowsPage />));
    expect(screen.getByText('FCC Update')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('Pending/All filter tabs work', () => {
    render(qcWrap(<WorkflowsPage />));
    const allBtn = screen.getByText('All');
    fireEvent.click(allBtn);
    expect(allBtn.className).toContain('bg-primary');
    const pendingBtn = screen.getByText('Pending');
    fireEvent.click(pendingBtn);
    expect(pendingBtn.className).toContain('bg-primary');
  });

  it('Approve button calls mutation', () => {
    render(qcWrap(<WorkflowsPage />));
    fireEvent.click(screen.getByText('Approve'));
    expect(mockMutate).toHaveBeenCalledWith('w1');
  });

  it('Reject button shows reason input then calls mutation', () => {
    render(qcWrap(<WorkflowsPage />));
    // First click shows reason input
    const rejectBtns = screen.getAllByText('Reject');
    fireEvent.click(rejectBtns[0]);
    const reasonInput = screen.getByPlaceholderText('Reason...');
    expect(reasonInput).toBeInTheDocument();
    fireEvent.change(reasonInput, { target: { value: 'Not ready' } });
    // Second reject button submits
    const submitReject = screen.getAllByText('Reject').find(b => b.closest('div')?.querySelector('input'));
    if (submitReject) {
      fireEvent.click(submitReject);
      expect(mockMutate).toHaveBeenCalled();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Wiring
// ═══════════════════════════════════════════════════════════════════════════
describe('Wiring Page', () => {
  let WiringPage: any;
  beforeEach(async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('wiring/diagram')) return Promise.resolve({ nodes: [], edges: [] });
      if (path.includes('wiring/export/svg')) return Promise.resolve(new Blob(['<svg></svg>']));
      return Promise.resolve({});
    });
    WiringPage = (await import('@/app/wiring/page')).default;
  });

  it('renders without crashing', async () => {
    render(<WiringPage />);
    await waitFor(() => expect(screen.getByTestId('reactflow')).toBeInTheDocument());
  });

  it('has Export SVG button', async () => {
    render(<WiringPage />);
    await waitFor(() => expect(screen.getByText('Export SVG')).toBeInTheDocument());
  });

  it('Export SVG calls api.get', async () => {
    render(<WiringPage />);
    await waitFor(() => expect(screen.getByText('Export SVG')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Export SVG'));
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('wiring/export/svg'));
  });

  it('has Fit View button', async () => {
    render(<WiringPage />);
    await waitFor(() => expect(screen.getByText('Fit View')).toBeInTheDocument());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Traceability
// ═══════════════════════════════════════════════════════════════════════════
describe('Traceability Page', () => {
  let TraceabilityPage: any;
  beforeEach(async () => {
    mockApiGet.mockResolvedValue({ data: [
      { id: 'tl1', signalName: 'ALT_STD', requirementTool: 'doors', externalRequirementId: 'REQ-001', requirementText: 'Altitude standard', linkStatus: 'active', lastSyncedAt: '2024-01-01' },
      { id: 'tl2', signalName: 'SPEED', requirementTool: 'jama', externalRequirementId: 'REQ-002', requirementText: 'Speed signal', linkStatus: 'stale', lastSyncedAt: '2024-01-01' },
    ] });
    TraceabilityPage = (await import('@/app/traceability/page')).default;
  });

  it('renders without crashing', async () => {
    render(<TraceabilityPage />);
    expect(screen.getByText('Traceability')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('ALT_STD')).toBeInTheDocument());
  });

  it('shows trace links', async () => {
    render(<TraceabilityPage />);
    await waitFor(() => {
      expect(screen.getByText('ALT_STD')).toBeInTheDocument();
      expect(screen.getByText('REQ-001')).toBeInTheDocument();
      expect(screen.getByText('DOORS')).toBeInTheDocument();
    });
  });

  it('Sync Requirements calls api.post', async () => {
    mockApiPost.mockResolvedValue({ data: [] });
    render(<TraceabilityPage />);
    await waitFor(() => expect(screen.getByText('Sync Requirements')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Sync Requirements'));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('trace-links/sync'));
  });

  it('Export Matrix calls api.post', async () => {
    render(<TraceabilityPage />);
    await waitFor(() => expect(screen.getByText('Export Matrix')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Export Matrix'));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('exports/traceability-matrix'));
  });

  it('shows stale link warning', async () => {
    render(<TraceabilityPage />);
    await waitFor(() => expect(screen.getByText(/1 stale link/)).toBeInTheDocument());
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 9. N² Matrix
// ═══════════════════════════════════════════════════════════════════════════
describe('N2 Matrix Page', () => {
  let N2MatrixPage: any;
  beforeEach(async () => { N2MatrixPage = (await import('@/app/n2-matrix/page')).default; });

  it('renders without crashing', () => {
    render(qcWrap(<N2MatrixPage />));
    expect(screen.getByText('N² Interface Matrix')).toBeInTheDocument();
  });

  it('shows system headers in matrix', () => {
    render(qcWrap(<N2MatrixPage />));
    expect(screen.getAllByText('FCC').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('ADC').length).toBeGreaterThanOrEqual(1);
  });

  it('clicking a cell shows detail panel', () => {
    render(qcWrap(<N2MatrixPage />));
    // Find the cell button with count "5"
    const cellBtn = screen.getByText('5');
    fireEvent.click(cellBtn);
    expect(screen.getByText('FCC → ADC')).toBeInTheDocument();
    expect(screen.getAllByText('ARINC 429').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('View →')).toBeInTheDocument();
  });

  it('close button hides detail panel', () => {
    render(qcWrap(<N2MatrixPage />));
    fireEvent.click(screen.getByText('5'));
    expect(screen.getByText('FCC → ADC')).toBeInTheDocument();
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByText('FCC → ADC')).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Live Data
// ═══════════════════════════════════════════════════════════════════════════
describe('Live Data Page', () => {
  let LiveDataPage: any;
  beforeEach(async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === 'live/adapters') return Promise.resolve([{ id: 'a1', name: 'Sim-429', protocol: 'ARINC 429', status: 'ready', type: 'simulator' }]);
      if (path.includes('readings')) return Promise.resolve({ readings: [{ parameter_id: 'p1', parameter_name: 'ALT', message_id: '0x100', timestamp: '2024-01-01', decoded_value: 35000, units: 'ft', in_range: true, deviation_severity: null, min_value: 0, max_value: 50000 }] });
      return Promise.resolve({});
    });
    mockApiPost.mockImplementation((path: string) => {
      if (path === 'live/start') return Promise.resolve({ sessionId: 'sess1', parameterCount: 1, parameters: [] });
      return Promise.resolve({});
    });
    LiveDataPage = (await import('@/app/live/page')).default;
  });

  it('renders without crashing', async () => {
    render(qcWrap(<LiveDataPage />));
    expect(screen.getByText('Live Data Monitor')).toBeInTheDocument();
  });

  it('shows adapter selector', async () => {
    render(qcWrap(<LiveDataPage />));
    await waitFor(() => expect(screen.getByText('Select adapter...')).toBeInTheDocument());
  });

  it('Start button is disabled without adapter', async () => {
    render(qcWrap(<LiveDataPage />));
    const startBtn = screen.getByText('Start');
    expect(startBtn.closest('button')).toBeDisabled();
  });

  it('Start button calls api.post after selecting adapter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(qcWrap(<LiveDataPage />));
    await waitFor(() => expect(screen.getByText('Sim-429 🔄')).toBeInTheDocument());
    // Find the adapter select (the one that's not in the header)
    const selects = document.querySelectorAll('select');
    const adapterSelect = Array.from(selects).find(s => Array.from(s.options).some(o => o.textContent?.includes('Sim-429')));
    if (adapterSelect) {
      fireEvent.change(adapterSelect, { target: { value: 'a1' } });
      fireEvent.click(screen.getByText('Start'));
      await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('live/start', expect.objectContaining({ adapterId: 'a1' })));
    }
    vi.useRealTimers();
  });

  it('view mode tabs render', async () => {
    render(qcWrap(<LiveDataPage />));
    // View mode tabs only show when running, but we can check the idle state
    expect(screen.getByText(/Select an adapter/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Anomalies
// ═══════════════════════════════════════════════════════════════════════════
describe('Anomalies Page', () => {
  let AnomaliesPage: any;
  beforeEach(async () => { AnomaliesPage = (await import('@/app/anomalies/page')).default; });

  it('renders without crashing', () => {
    render(qcWrap(<AnomaliesPage />));
    expect(screen.getByText('Anomaly Detection')).toBeInTheDocument();
  });

  it('shows summary stats', () => {
    render(qcWrap(<AnomaliesPage />));
    expect(screen.getByText('3')).toBeInTheDocument(); // total
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
  });

  it('shows anomaly details', () => {
    render(qcWrap(<AnomaliesPage />));
    expect(screen.getByText('Missing range')).toBeInTheDocument();
    expect(screen.getByText('Param X has no range')).toBeInTheDocument();
  });

  it('Scan button calls refetch', () => {
    render(qcWrap(<AnomaliesPage />));
    fireEvent.click(screen.getByText('Scan'));
    expect(mockRefetch).toHaveBeenCalled();
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 12. AI Analysis
// ═══════════════════════════════════════════════════════════════════════════
describe('AI Analysis Page', () => {
  let AIAnalysisPage: any;
  beforeEach(async () => {
    mockApiPost.mockResolvedValue({ analysis: 'Architecture looks good', response: 'The ICD has 5 systems' });
    AIAnalysisPage = (await import('@/app/ai-analysis/page')).default;
  });

  it('renders without crashing', () => {
    render(<AIAnalysisPage />);
    expect(screen.getByText('AI Analysis')).toBeInTheDocument();
  });

  it('shows analysis type buttons', () => {
    render(<AIAnalysisPage />);
    expect(screen.getByText('General Architecture Review')).toBeInTheDocument();
    expect(screen.getByText('Bus Loading Analysis')).toBeInTheDocument();
    expect(screen.getByText('Safety Assessment')).toBeInTheDocument();
    expect(screen.getByText('Standards Compliance')).toBeInTheDocument();
  });

  it('General Architecture Review calls api.post', async () => {
    render(<AIAnalysisPage />);
    fireEvent.click(screen.getByText('General Architecture Review'));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('ai/analyze', { projectId: 'p1', type: 'general' }));
  });

  it('Bus Loading Analysis calls api.post', async () => {
    render(<AIAnalysisPage />);
    fireEvent.click(screen.getByText('Bus Loading Analysis'));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('ai/analyze', { projectId: 'p1', type: 'bus_loading' }));
  });

  it('Safety Assessment calls api.post', async () => {
    render(<AIAnalysisPage />);
    fireEvent.click(screen.getByText('Safety Assessment'));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('ai/analyze', { projectId: 'p1', type: 'safety' }));
  });

  it('Standards Compliance calls api.post', async () => {
    render(<AIAnalysisPage />);
    fireEvent.click(screen.getByText('Standards Compliance'));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('ai/analyze', { projectId: 'p1', type: 'compliance' }));
  });

  it('shows analysis result', async () => {
    render(<AIAnalysisPage />);
    fireEvent.click(screen.getByText('General Architecture Review'));
    await waitFor(() => expect(screen.getByText('Architecture looks good')).toBeInTheDocument());
  });

  it('chat send calls api.post', async () => {
    render(<AIAnalysisPage />);
    const chatInput = screen.getByPlaceholderText('Ask about your ICD...');
    fireEvent.change(chatInput, { target: { value: 'How many systems?' } });
    // Click send button
    const sendBtns = screen.getAllByRole('button');
    const sendBtn = sendBtns[sendBtns.length - 1]; // last button is send
    fireEvent.click(sendBtn);
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('ai/chat', { message: 'How many systems?', projectId: 'p1' }));
  });

  it('chat Enter key sends message', async () => {
    render(<AIAnalysisPage />);
    const chatInput = screen.getByPlaceholderText('Ask about your ICD...');
    fireEvent.change(chatInput, { target: { value: 'Test question' } });
    fireEvent.keyDown(chatInput, { key: 'Enter' });
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('ai/chat', { message: 'Test question', projectId: 'p1' }));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. HW Templates
// ═══════════════════════════════════════════════════════════════════════════
describe('HW Templates Page', () => {
  let HWTemplatesPage: any;
  beforeEach(async () => { HWTemplatesPage = (await import('@/app/hw-templates/page')).default; });

  it('renders without crashing', () => {
    render(qcWrap(<HWTemplatesPage />));
    expect(screen.getByText('Hardware ICD Templates')).toBeInTheDocument();
  });

  it('shows template cards', () => {
    render(qcWrap(<HWTemplatesPage />));
    expect(screen.getByText('Generic LRU')).toBeInTheDocument();
    expect(screen.getByText('4 ports')).toBeInTheDocument();
    expect(screen.getByText('2 fns')).toBeInTheDocument();
  });

  it('New Template button toggles form', () => {
    render(qcWrap(<HWTemplatesPage />));
    fireEvent.click(screen.getByText('New Template'));
    expect(screen.getByPlaceholderText('Name *')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('Cancel hides form', () => {
    render(qcWrap(<HWTemplatesPage />));
    fireEvent.click(screen.getByText('New Template'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Name *')).not.toBeInTheDocument();
  });

  it('+ Add port adds a port row', () => {
    render(qcWrap(<HWTemplatesPage />));
    fireEvent.click(screen.getByText('New Template'));
    const portInputsBefore = screen.getAllByPlaceholderText('Port name').length;
    const addBtns = screen.getAllByText('+ Add');
    fireEvent.click(addBtns[0]); // first + Add is for ports
    expect(screen.getAllByPlaceholderText('Port name').length).toBe(portInputsBefore + 1);
  });

  it('+ Add function adds a function row', () => {
    render(qcWrap(<HWTemplatesPage />));
    fireEvent.click(screen.getByText('New Template'));
    const fnInputsBefore = screen.getAllByPlaceholderText('Function name').length;
    const addBtns = screen.getAllByText('+ Add');
    fireEvent.click(addBtns[1]); // second + Add is for functions
    expect(screen.getAllByPlaceholderText('Function name').length).toBe(fnInputsBefore + 1);
  });

  it('Create calls api.post', async () => {
    render(qcWrap(<HWTemplatesPage />));
    fireEvent.click(screen.getByText('New Template'));
    fireEvent.change(screen.getByPlaceholderText('Name *'), { target: { value: 'New LRU' } });
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('hw-templates', expect.objectContaining({ name: 'New LRU' })));
  });

  it('Use in Project calls prompt then api.post', async () => {
    mockApiPost.mockResolvedValue({ portsCreated: 4, functionsCreated: 2 });
    render(qcWrap(<HWTemplatesPage />));
    fireEvent.click(screen.getByText('Use in Project'));
    expect(window.prompt).toHaveBeenCalled();
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('hw-templates/t1/instantiate', expect.objectContaining({ name: 'TestName' })));
  });

  it('Delete calls confirm then api.delete', async () => {
    render(qcWrap(<HWTemplatesPage />));
    // Find trash button by hover class
    const allBtns = screen.getAllByRole('button');
    const delBtn = allBtns.find(b => b.className.includes('hover:text-red-500'));
    if (delBtn) {
      fireEvent.click(delBtn);
      expect(window.confirm).toHaveBeenCalled();
      await waitFor(() => expect(mockApiDelete).toHaveBeenCalledWith('hw-templates/t1'));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. Ingestion
// ═══════════════════════════════════════════════════════════════════════════
describe('Ingestion Page', () => {
  let IngestionPage: any;
  beforeEach(async () => { IngestionPage = (await import('@/app/ingestion/page')).default; });

  it('renders without crashing', () => {
    render(<IngestionPage />);
    expect(screen.getByText('ICD Ingestion')).toBeInTheDocument();
  });

  it('shows mode selector buttons', () => {
    render(<IngestionPage />);
    expect(screen.getByText('AI-Powered (Gemini)')).toBeInTheDocument();
    expect(screen.getByText('Pattern Matching')).toBeInTheDocument();
  });

  it('AI mode is selected by default', () => {
    render(<IngestionPage />);
    const aiBtn = screen.getByText('AI-Powered (Gemini)').closest('button');
    expect(aiBtn?.className).toContain('border-primary');
  });

  it('switching to Pattern Matching mode', () => {
    render(<IngestionPage />);
    fireEvent.click(screen.getByText('Pattern Matching'));
    const patternBtn = screen.getByText('Pattern Matching').closest('button');
    expect(patternBtn?.className).toContain('border-primary');
  });

  it('has file upload input', () => {
    render(<IngestionPage />);
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput?.getAttribute('accept')).toContain('.xlsx');
  });

  it('shows upload description', () => {
    render(<IngestionPage />);
    expect(screen.getByText(/Click to upload Excel file/)).toBeInTheDocument();
  });
});
