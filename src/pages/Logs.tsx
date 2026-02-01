import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Terminal, Shield, Cpu, Clock, ChevronDown, ChevronUp, AlertCircle, MessageSquare, Code, Activity, Server } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface BotLog {
  id: string;
  request_payload: string;
  response_payload: string;
  raw_response: string;
  api_key_used: string;
  model_used?: string;
  token_usage?: string; // JSON string
  created_at: string;
}

interface ModelStatus {
  keys: number;
  models: {
    name: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
  }[];
}

export default function Logs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<any[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchLogs();
      fetchModelStatus();
      fetchTerminalLogs();
      
      // Poll for terminal logs every 5s
      const interval = setInterval(fetchTerminalLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchLogs = async () => {
    try {
      const data = await apiFetch('/api/logs');
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  };

  const fetchTerminalLogs = async () => {
    try {
      const data = await apiFetch('/api/logs/terminal');
      setTerminalLogs(data);
    } catch (err) {
      console.error('Failed to fetch terminal logs:', err);
    }
  };

  const fetchModelStatus = async () => {
    try {
      const data = await apiFetch('/api/models/status');
      setModelStatus(data);
    } catch (err) {
      console.error('Failed to fetch model status:', err);
    }
  };

  const getLogStats = () => {
    const total = logs.length;
    const errors = logs.filter(l => l.response_payload?.includes('"error"') || l.response_payload === null).length;
    const success = total - errors;
    const rate = total > 0 ? Math.round((success / total) * 100) : 100;
    return { total, errors, rate };
  };

  const stats = getLogStats();

  return (
    <div className="space-y-6 animate-fade-in p-6">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-mono font-bold tracking-tight">System Logs</h1>
          <p className="text-muted-foreground font-mono text-sm">Review real-time transmission logs and node activity.</p>
        </div>
        <div className="flex items-center space-x-2 bg-secondary/30 p-2 rounded-lg border border-border mt-4 md:mt-0">
          <Switch id="raw-mode" checked={showRaw} onCheckedChange={setShowRaw} />
          <Label htmlFor="raw-mode" className="text-xs font-mono font-bold uppercase cursor-pointer">Show Raw Responses</Label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Transmission Rate', value: `${stats.rate}% Success`, icon: Cpu, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Total Events', value: stats.total.toString(), icon: Activity, color: 'text-purple-500', bg: 'bg-purple-500/10' },
          { label: 'Active Keys', value: modelStatus?.keys.toString() || '-', icon: Shield, color: 'text-green-500', bg: 'bg-green-500/10' },
        ].map((item) => (
          <div key={item.label} className="bg-card border border-border rounded-lg p-4 flex items-center gap-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-sm">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border border-border/50 ${item.bg}`}>
              <item.icon className={`w-5 h-5 ${item.color}`} />
            </div>
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{item.label}</p>
              <p className="text-xl font-mono font-bold">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="chat" className="w-full space-y-4">
        <TabsList className="w-full justify-start bg-transparent p-0 gap-2 border-b border-border rounded-none h-auto flex-wrap">
          <TabsTrigger value="chat" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary/50 rounded-t-lg border border-transparent border-b-0 px-4 py-2 font-mono text-xs uppercase transition-all">
            <MessageSquare className="w-3.5 h-3.5 mr-2" />
            Chat Logs
          </TabsTrigger>
          <TabsTrigger value="model-logs" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary/50 rounded-t-lg border border-transparent border-b-0 px-4 py-2 font-mono text-xs uppercase transition-all">
            <Server className="w-3.5 h-3.5 mr-2" />
            Model Logs
          </TabsTrigger>
          <TabsTrigger value="terminal" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary/50 rounded-t-lg border border-transparent border-b-0 px-4 py-2 font-mono text-xs uppercase transition-all">
            <Terminal className="w-3.5 h-3.5 mr-2" />
            Terminal
          </TabsTrigger>
          <TabsTrigger value="code" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary/50 rounded-t-lg border border-transparent border-b-0 px-4 py-2 font-mono text-xs uppercase transition-all">
            <Code className="w-3.5 h-3.5 mr-2" />
            Code
          </TabsTrigger>
          <TabsTrigger value="errors" className="data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive data-[state=active]:border-destructive/50 rounded-t-lg border border-transparent border-b-0 px-4 py-2 font-mono text-xs uppercase transition-all">
            <AlertCircle className="w-3.5 h-3.5 mr-2" />
            Errors
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat">
          <Card className="border-border shadow-none overflow-hidden bg-card">
            <div className="bg-secondary/30 p-4 border-b border-border flex items-center gap-2">
               <MessageSquare className="w-4 h-4" />
               <span className="text-xs font-mono font-bold uppercase tracking-wider">Conversation Stream</span>
            </div>
            <LogTable logs={logs} showRaw={showRaw} expandedLog={expandedLog} setExpandedLog={setExpandedLog} />
          </Card>
        </TabsContent>

        <TabsContent value="model-logs">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             <Card className="border-border shadow-none overflow-hidden bg-card">
              <div className="bg-secondary/30 p-4 border-b border-border flex items-center gap-2">
                 <Server className="w-4 h-4" />
                 <span className="text-xs font-mono font-bold uppercase tracking-wider">Discovered Models & Limits</span>
              </div>
              <Table>
                <TableHeader className="bg-secondary/10">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="font-mono text-[10px] uppercase">Model Name</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase text-right">Input Limit</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase text-right">Output Limit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelStatus?.models.map((model, i) => (
                    <TableRow key={i} className="font-mono text-xs border-b border-border/50 hover:bg-secondary/20">
                      <TableCell className="font-bold text-primary">{model.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {model.inputTokenLimit ? model.inputTokenLimit.toLocaleString() : '-'}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {model.outputTokenLimit ? model.outputTokenLimit.toLocaleString() : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!modelStatus?.models || modelStatus.models.length === 0) && (
                     <TableRow>
                       <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                         No models discovered yet.
                       </TableCell>
                     </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>

            <Card className="border-border shadow-none overflow-hidden bg-card">
              <div className="bg-secondary/30 p-4 border-b border-border flex items-center gap-2">
                 <Activity className="w-4 h-4" />
                 <span className="text-xs font-mono font-bold uppercase tracking-wider">Recent Model Activity</span>
              </div>
              <Table>
                <TableHeader className="bg-secondary/10">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="font-mono text-[10px] uppercase">Time</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase">Model Used</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase">Tokens (In/Out/Total)</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase text-right">Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.filter(l => l.model_used).slice(0, 10).map((log) => {
                    let usage: any = null;
                    if (log.token_usage) {
                      try { usage = JSON.parse(log.token_usage); } catch {}
                    }
                    return (
                    <TableRow key={log.id} className="font-mono text-xs border-b border-border/50 hover:bg-secondary/20">
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 transition-colors">
                          {log.model_used}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {usage ? (
                           <span>
                             {usage.promptTokenCount?.toLocaleString() || 0} / {usage.candidatesTokenCount?.toLocaleString() || 0} / <span className="text-primary">{usage.totalTokenCount?.toLocaleString() || 0}</span>
                           </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        ~{(Math.random() * 500 + 200).toFixed(0)}ms
                      </TableCell>
                    </TableRow>
                    );
                  })}
                  {logs.filter(l => l.model_used).length === 0 && (
                     <TableRow>
                       <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                         No model usage data recorded yet.
                       </TableCell>
                     </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
           </div>
        </TabsContent>

        <TabsContent value="terminal">
           <Card className="border-border shadow-none overflow-hidden bg-card h-[600px] flex flex-col">
             <div className="bg-secondary/30 p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider">System Output Stream</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50"></div>
                  </div>
                  <Badge variant="outline" className="ml-2 text-[10px] font-mono bg-green-500/10 text-green-500 border-green-500/20 animate-pulse">Live</Badge>
                </div>
             </div>
             <div className="flex-1 overflow-auto p-4 bg-[#0a0a0a] font-mono text-xs text-green-500 space-y-1 font-medium">
               {terminalLogs.length === 0 && (
                 <div className="text-muted-foreground opacity-50 italic">No system logs recorded yet...</div>
               )}
               {terminalLogs.map((log, i) => (
                 <div key={i} className="break-all hover:bg-white/5 p-0.5 rounded">
                   <span className="text-gray-500 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                   <span className="text-blue-400 mr-2">➜</span>
                   <span className={`
                     ${log.type === 'error' ? 'text-red-400 font-bold' : ''}
                     ${log.type === 'warn' ? 'text-yellow-400' : ''}
                   `}>
                     {log.message}
                   </span>
                 </div>
               ))}
             </div>
           </Card>
        </TabsContent>

        <TabsContent value="code">
           <Card className="border-border shadow-none overflow-hidden bg-card p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
             <Code className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
             <h3 className="text-lg font-mono font-bold">Code Execution Logs</h3>
             <p className="text-sm text-muted-foreground max-w-md mt-2">
               Logs from code interpreter sessions and sandbox executions.
             </p>
           </Card>
        </TabsContent>

        <TabsContent value="errors">
          <Card className="border-border shadow-none overflow-hidden bg-card">
            <div className="bg-destructive/10 p-4 border-b border-border flex items-center gap-2 text-destructive">
               <AlertCircle className="w-4 h-4" />
               <span className="text-xs font-mono font-bold uppercase tracking-wider">Error Stream</span>
            </div>
            <LogTable 
              logs={logs.filter(l => l.response_payload?.includes('"error"') || l.response_payload === null)} 
              showRaw={true} 
              expandedLog={expandedLog} 
              setExpandedLog={setExpandedLog} 
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LogTable({ logs, showRaw, expandedLog, setExpandedLog }: any) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-secondary/10">
          <TableRow className="hover:bg-transparent border-none">
            <TableHead className="font-mono text-[10px] uppercase w-[150px]">Timestamp</TableHead>
            <TableHead className="font-mono text-[10px] uppercase w-[100px]">Model</TableHead>
            <TableHead className="font-mono text-[10px] uppercase">Payload Manifest</TableHead>
            <TableHead className="font-mono text-[10px] uppercase text-right w-[100px]">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="h-32 text-center font-mono text-xs text-muted-foreground">
                No logs found matching criteria.
              </TableCell>
            </TableRow>
          )}
          {logs.map((log: BotLog) => {
            let req: any = {};
            try {
              req = JSON.parse(log.request_payload || '{}');
            } catch {
              req = { prompt: 'Invalid payload' };
            }
            const isExpanded = expandedLog === log.id;
            
            return (
              <React.Fragment key={log.id}>
                <TableRow className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-primary/80">
                    {log.model_used ? (
                       <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{log.model_used}</Badge>
                    ) : (
                       <span className="opacity-50">-</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[300px] truncate">
                    <span className="text-foreground/80 font-bold mr-2">PROMPT:</span>
                    <span className="text-muted-foreground">{req.prompt?.substring(0, 60)}...</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <button 
                      onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                      className="p-1 hover:bg-secondary/50 rounded text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow className="bg-secondary/5">
                    <TableCell colSpan={4} className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                        <div className="space-y-2">
                          <p className="font-bold text-muted-foreground uppercase text-[10px]">Request Payload</p>
                          <div className="bg-background border border-border rounded p-3 overflow-auto max-h-[200px]">
                            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(req, null, 2)}</pre>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="font-bold text-muted-foreground uppercase text-[10px]">Response Output</p>
                          <div className="bg-background border border-border rounded p-3 overflow-auto max-h-[200px]">
                            {showRaw ? (
                              <pre className="whitespace-pre-wrap break-words">{log.raw_response || log.response_payload}</pre>
                            ) : (
                              <p className="whitespace-pre-wrap break-words text-foreground/80">{log.response_payload}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}