'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Maximize2 } from 'lucide-react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { ConnectorNode } from '@/components/wiring/connector-node';
import { api } from '@/lib/api-client';

const nodeTypes = { connector: ConnectorNode };

interface DiagramData {
  nodes: Node[];
  edges: Edge[];
}

export default function WiringPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<DiagramData>('/wiring/diagram')
      .then((data) => {
        setNodes(data.nodes);
        setEdges(data.edges);
      })
      .catch(() => {
        // Show empty canvas on error
        setNodes([]);
        setEdges([]);
      })
      .finally(() => setLoading(false));
  }, [setNodes, setEdges]);

  const handleExportSVG = useCallback(async () => {
    const blob = await api.get<Blob>('/wiring/export/svg');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wiring-diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="relative flex-1">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            {/* Toolbar */}
            <div className="absolute left-4 top-4 z-10 flex gap-2">
              <Button size="sm" variant="outline" onClick={handleExportSVG}>
                <Download className="mr-1 h-4 w-4" /> Export SVG
              </Button>
              <Button size="sm" variant="outline">
                <Maximize2 className="mr-1 h-4 w-4" /> Fit View
              </Button>
            </div>

            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading diagram…
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                className="bg-background"
              >
                <Background gap={16} size={1} />
                <Controls />
                <MiniMap
                  nodeStrokeWidth={3}
                  className="!bottom-4 !right-4"
                />
              </ReactFlow>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
