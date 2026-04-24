'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

interface Project { id: string; name: string; aircraft_type: string; program_phase: string; }

interface ProjectContextType {
  projects: Project[];
  currentProject: Project | null;
  setProjectId: (id: string) => void;
  addProject: (p: Project) => void;
  loading: boolean;
}

const ProjectContext = createContext<ProjectContextType>({ projects: [], currentProject: null, setProjectId: () => {}, addProject: () => {}, loading: true });

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Project[]>('projects')
      .then(p => {
        setProjects(p);
        // Restore last selected project from localStorage
        const saved = typeof window !== 'undefined' ? localStorage.getItem('connectedICD_projectId') : null;
        if (saved && p.find(x => x.id === saved)) setCurrentId(saved);
        else if (p.length) setCurrentId(p[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setProjectId = (id: string) => {
    setCurrentId(id);
    if (typeof window !== 'undefined') localStorage.setItem('connectedICD_projectId', id);
  };

  const addProject = (p: Project) => {
    setProjects(prev => [p, ...prev]);
    setProjectId(p.id);
  };

  const currentProject = projects.find(p => p.id === currentId) || null;

  return (
    <ProjectContext.Provider value={{ projects, currentProject, setProjectId, addProject, loading }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
