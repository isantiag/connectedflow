import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

// === Projects ===
export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => api.get<any[]>('projects') });
}

// === Systems ===
export function useSystems(projectId?: string) {
  return useQuery({ queryKey: ['systems', projectId], queryFn: () => api.get<any[]>('systems', projectId ? { projectId } : undefined), enabled: !!projectId });
}

export function useSystem(id?: string) {
  return useQuery({ queryKey: ['system', id], queryFn: () => api.get<any>(`systems/${id}`), enabled: !!id });
}

export function useSystemConnections(id?: string) {
  return useQuery({ queryKey: ['system-connections', id], queryFn: () => api.get<any[]>(`systems/${id}/connections`), enabled: !!id });
}

export function useSystemPartitions(id?: string) {
  return useQuery({ queryKey: ['system-partitions', id], queryFn: () => api.get<any[]>(`systems/${id}/partitions`), enabled: !!id });
}

// === Connections & Messages ===
export function useConnection(id?: string) {
  return useQuery({ queryKey: ['connection', id], queryFn: () => api.get<any>(`connections/${id}`), enabled: !!id });
}

export function useConnectionMessages(id?: string) {
  return useQuery({ queryKey: ['connection-messages', id], queryFn: () => api.get<any[]>(`connections/${id}/messages`), enabled: !!id });
}

export function useMessage(id?: string) {
  return useQuery({ queryKey: ['message', id], queryFn: () => api.get<any>(`messages/${id}`), enabled: !!id });
}

export function useMessageParameters(id?: string) {
  return useQuery({ queryKey: ['message-parameters', id], queryFn: () => api.get<any[]>(`messages/${id}/parameters`), enabled: !!id });
}

// === Protocols ===
export function useProtocols() {
  return useQuery({ queryKey: ['protocols'], queryFn: () => api.get<any[]>('protocols'), staleTime: 300_000 });
}

// === Dashboard ===
export function useDashboard(projectId?: string) {
  return useQuery({ queryKey: ['dashboard', projectId], queryFn: () => api.get<any>('dashboard', projectId ? { projectId } : undefined), enabled: !!projectId });
}

// === Insights ===
export function useInsights(projectId?: string) {
  return useQuery({ queryKey: ['insights', projectId], queryFn: () => api.get<any>('ai/insights', projectId ? { projectId } : undefined), enabled: !!projectId });
}

// === Anomalies ===
export function useAnomalies(projectId?: string) {
  return useQuery({ queryKey: ['anomalies', projectId], queryFn: () => api.get<any>('anomalies', projectId ? { projectId } : undefined), enabled: !!projectId });
}

// === Baselines ===
export function useBaselines(projectId?: string) {
  return useQuery({ queryKey: ['baselines', projectId], queryFn: () => api.get<any[]>('baselines', projectId ? { projectId } : undefined), enabled: !!projectId });
}

// === Workflows ===
export function useWorkflows(projectId?: string, filter?: string) {
  const endpoint = filter === 'pending' ? 'workflows/pending' : 'workflows';
  return useQuery({ queryKey: ['workflows', projectId, filter], queryFn: () => api.get<any[]>(endpoint, projectId ? { projectId } : undefined), enabled: !!projectId });
}

// === HW Templates ===
export function useHWTemplates() {
  return useQuery({ queryKey: ['hw-templates'], queryFn: () => api.get<any[]>('hw-templates') });
}

// === N2 Matrix ===
export function useN2Matrix(projectId?: string) {
  return useQuery({ queryKey: ['n2-matrix', projectId], queryFn: () => api.get<any>('n2-matrix-v2', projectId ? { projectId } : undefined), enabled: !!projectId });
}

// === Signals ===
export function useSignals(projectId?: string, search?: string) {
  return useQuery({ queryKey: ['signals', projectId, search], queryFn: () => api.get<any[]>('signals', { ...(projectId ? { projectId } : {}), search: search || '', page: '1', limit: '50' }) });
}

// === Live Adapters ===
export function useLiveAdapters() {
  return useQuery({ queryKey: ['live-adapters'], queryFn: () => api.get<any[]>('live/adapters') });
}

// === Parse Jobs ===
export function useParseJobs() {
  return useQuery({ queryKey: ['parse-jobs'], queryFn: () => api.get<any[]>('parse-jobs') });
}

// === Users ===
export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => api.get<any[]>('users') });
}

// === Mutations ===
export function useCreateSystem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => api.post('systems', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['systems'] }) });
}

export function useDeleteSystem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.delete(`systems/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['systems'] }) });
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => api.post('connections', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['system-connections'] }) });
}

export function useCreateMessage() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => api.post('messages', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['connection-messages'] }) });
}

export function useCreateParameter() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => api.post('parameters', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['message-parameters'] }) });
}

export function useCreateBaseline() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => api.post('baselines', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['baselines'] }) });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => api.post('workflows', data), onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }) });
}

export function useApproveWorkflow() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.put(`workflows/${id}/approve`, {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }) });
}

export function useRejectWorkflow() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api.put(`workflows/${id}/reject`, { reason }), onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }) });
}
