// BooSend-style automation builder canvas for the DM Automation tool.
// Node components, CustomEdge, and withHoverDelete are ported verbatim from
// the BooSend builder so the canvas looks identical to BooSend's. Editing is
// intentionally lighter than BooSend: node dragging, edge connect/delete,
// node duplicate/delete, and the nodes' own inline editing — no config panels.
//
// Persistence contract: node components mutate their `data` object in place
// (BooSend convention), ReactFlow state tracks positions/edges. The parent
// reads the merged result via ref.getGraph() at publish/edit time.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './tailwind.css';
import './builder-globals.css';

import CustomEdge, { setDeleteEdgeCallback } from './CustomEdge';
import withHoverDelete from './withHoverDelete';

import TriggerNode from './nodes/TriggerNode';
import InstagramNode from './nodes/InstagramNode';
import InstagramReplyCommentNode from './nodes/InstagramReplyCommentNode';
import TelegramNode from './nodes/TelegramNode';
import AINode from './nodes/AINode';
import AIExtractorNode from './nodes/AIExtractorNode';
import AIConditionNode from './nodes/AIConditionNode';
import ChatGPTNode from './nodes/ChatGPTNode';
import GrokNode from './nodes/GrokNode';
import GeminiNode from './nodes/GeminiNode';
import TransferWorkflowNode from './nodes/TransferWorkflowNode';
import ActionNode from './nodes/ActionNode';
import ConditionNode from './nodes/ConditionNode';
import RandomizerNode from './nodes/RandomizerNode';
import SmartDelayNode from './nodes/SmartDelayNode';
import WaitForReplyNode from './nodes/WaitForReplyNode';
import ToolNode from './nodes/ToolNode';
import N8nNode from './nodes/N8nNode';
import GmailNode from './nodes/GmailNode';
import OutlookNode from './nodes/OutlookNode';
import HeyGenNode from './nodes/HeyGenNode';
import AssignContactNode from './nodes/AssignContactNode';

// Generic card for node types v3 may emit that we haven't ported.
function FallbackNode({ data, type }) {
  return (
    <div className="bg-white rounded-3xl border-2 border-gray-200 shadow-[0_4px_20px_rgba(0,0,0,0.08)] min-w-[280px] max-w-[380px] px-5 py-4">
      <Handle type="target" position={Position.Left} className="!w-5 !h-5 !rounded-full !border-4 !border-white !bg-gray-400" />
      <div className="text-sm font-semibold text-gray-800 capitalize">{type || 'Node'}</div>
      {data?.label ? <div className="text-xs text-gray-500 mt-1">{String(data.label)}</div> : null}
      <Handle type="source" position={Position.Right} className="!w-5 !h-5 !rounded-full !border-4 !border-white !bg-gray-400" />
    </div>
  );
}

const baseNodeComponents = {
  trigger: TriggerNode,
  instagram: InstagramNode,
  instagramReplyComment: InstagramReplyCommentNode,
  telegram: TelegramNode,
  ai: AINode,
  aiExtractor: AIExtractorNode,
  aiCondition: AIConditionNode,
  chatgpt: ChatGPTNode,
  grok: GrokNode,
  gemini: GeminiNode,
  transferWorkflow: TransferWorkflowNode,
  action: ActionNode,
  condition: ConditionNode,
  randomizer: RandomizerNode,
  smartDelay: SmartDelayNode,
  waitForReply: WaitForReplyNode,
  tool: ToolNode,
  n8n: N8nNode,
  gmail: GmailNode,
  outlook: OutlookNode,
  heygen: HeyGenNode,
  assignContact: AssignContactNode,
};

const edgeTypes = { default: CustomEdge };

// Strip ReactFlow runtime fields so the published graph matches what BooSend
// stores: nodes keep id/type/position/data, edges keep their wiring fields.
function serializeGraph(nodes, edges) {
  return {
    nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle, type, data }) => {
      const edge = { id, source, target };
      if (sourceHandle != null) edge.sourceHandle = sourceHandle;
      if (targetHandle != null) edge.targetHandle = targetHandle;
      if (type != null && type !== 'default') edge.type = type;
      if (data != null) edge.data = data;
      return edge;
    }),
  };
}

const InnerCanvas = forwardRef(function InnerCanvas({ graph }, ref) {
  const [nodes, setNodes, onNodesChange] = useNodesState(graph?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph?.edges || []);

  // A new AI build (or automation selection) replaces the canvas contents.
  useEffect(() => {
    setNodes(graph?.nodes || []);
    setEdges(graph?.edges || []);
  }, [graph, setNodes, setEdges]);

  useEffect(() => {
    setDeleteEdgeCallback((edgeId) => setEdges((eds) => eds.filter((e) => e.id !== edgeId)));
    return () => setDeleteEdgeCallback(null);
  }, [setEdges]);

  const onConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  useImperativeHandle(ref, () => ({
    getGraph: () => serializeGraph(nodes, edges),
  }), [nodes, edges]);

  const nodeTypes = useMemo(() => {
    const wrapped = Object.fromEntries(
      Object.entries(baseNodeComponents).map(([type, Component]) => [type, withHoverDelete(Component)]),
    );
    // Cover any unknown types present in the current graph with the fallback.
    for (const n of graph?.nodes || []) {
      if (n.type && !wrapped[n.type]) wrapped[n.type] = withHoverDelete(FallbackNode);
    }
    return wrapped;
  }, [graph]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      elevateEdgesOnSelect={false}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.1}
      proOptions={{ hideAttribution: true }}
      className="h-full w-full"
    >
      <Background />
      <Controls className="hidden md:block" />
      <MiniMap className="hidden md:block" />
    </ReactFlow>
  );
});

const BuilderCanvas = forwardRef(function BuilderCanvas({ graph }, ref) {
  return (
    <div className="dm-builder-canvas" style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <InnerCanvas graph={graph} ref={ref} />
      </ReactFlowProvider>
    </div>
  );
});

export default BuilderCanvas;
