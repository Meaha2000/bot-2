import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Key, MessageSquare, Activity, AlertCircle, ArrowUpRight, Server, Database, Cpu } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BotLog {
  id: string;
  model_used?: string;
  created_at: string;
  response_payload: string;
}

interface BotStats {
  totalRequests: number;
  activeKeys: number;
  totalMemories: number;
  errorsToday: number;
  currentModel?: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<BotStats>({
    totalRequests: 0,
    activeKeys: 0,
    totalMemories: 0,
    errorsToday: 0
  });
  const [recentLogs, setRecentLogs] = useState<BotLog[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [dbStatus, setDbStatus] = useState<string>('Checking...');

  useEffect(() => {
    if (!user) return;
    
    const fetchData = async () => {
      try {
        const [statsData, logsData, settingsData, healthData] = await Promise.all([
          apiFetch('/api/stats'),
          apiFetch('/api/logs?limit=5'),
          apiFetch('/api/settings/user'),
          apiFetch('/api/health')
        ]);
        setStats(statsData);
        setRecentLogs(Array.isArray(logsData) ? logsData.slice(0, 5) : []);
        setSettings(settingsData);
        setDbStatus(healthData.database === 'connected' ? 'Online' : 'Offline');
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setDbStatus('Error');
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [user]);

  const cards = [
    { title: 'Total Requests', value: stats.totalRequests, icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { title: 'Active Keys', value: stats.activeKeys, icon: Key, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    { title: 'Current Model', value: stats.currentModel || settings.preferredModel || 'Auto', icon: Cpu, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
    { title: 'System Errors', value: stats.errorsToday, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  ];

  return (
    <div className="space-y-6 animate-fade-in p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-mono font-bold tracking-tight">System Overview</h1>
        <p className="text-muted-foreground font-mono text-sm">Real-time performance and resource monitoring.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title} className={`shadow-none transition-all duration-200 hover:scale-[1.02] ${card.bg} ${card.border} border`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`p-2 rounded-md bg-background/50 ${card.color}`}>
                <card.icon className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-mono font-bold">{card.value}</div>
              <p className="text-[10px] font-mono text-muted-foreground mt-1 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" />
                Updated just now
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border shadow-none bg-card flex flex-col">
          <CardHeader className="border-b border-border bg-secondary/30">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Telemetry Stream
                </CardTitle>
                <CardDescription className="font-mono text-[10px]">Recent interaction logs from the neural core</CardDescription>
              </div>
              <Badge variant="outline" className="font-mono text-[10px] uppercase bg-background">Live</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
             <ScrollArea className="h-[300px]">
                {recentLogs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-xs p-8">
                    No recent activity recorded.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {recentLogs.map((log) => (
                      <div key={log.id} className="p-4 hover:bg-secondary/10 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="font-mono text-[10px] uppercase h-5">
                              {log.model_used || 'System'}
                            </Badge>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {new Date(log.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                        <p className="font-mono text-xs text-muted-foreground truncate">
                          {log.response_payload || 'No response data'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
             </ScrollArea>
          </CardContent>
        </Card>
        
        <Card className="border-border shadow-none bg-card flex flex-col">
          <CardHeader className="border-b border-border bg-secondary/30">
            <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
              <Server className="w-4 h-4" />
              Node Status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
               <div className="space-y-2">
                 <div className="flex justify-between text-[10px] font-mono text-muted-foreground uppercase font-bold">
                    <span className="flex items-center gap-2"><Cpu className="w-3 h-3" /> API Health</span>
                    <span className="text-green-500">Online</span>
                 </div>
                 <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 w-full animate-pulse" />
                 </div>
               </div>

               <div className="space-y-2">
                 <div className="flex justify-between text-[10px] font-mono text-muted-foreground uppercase font-bold">
                    <span className="flex items-center gap-2"><Database className="w-3 h-3" /> DB Connectivity</span>
                    <span className={dbStatus === 'Online' ? 'text-green-500' : 'text-red-500'}>{dbStatus}</span>
                 </div>
                 <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full w-full ${dbStatus === 'Online' ? 'bg-green-500' : 'bg-red-500'}`} />
                 </div>
               </div>

               <div className="space-y-2">
                 <div className="flex justify-between text-[10px] font-mono text-muted-foreground uppercase font-bold">
                    <span className="flex items-center gap-2"><Activity className="w-3 h-3" /> System Load</span>
                    <span className="text-primary">Low</span>
                 </div>
                 <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[15%]" />
                 </div>
               </div>
            </div>

            <div className="mt-8 p-4 bg-secondary/50 rounded-lg border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold">Environment</span>
                <Badge variant="outline" className="text-[9px] font-mono bg-background">PROD</Badge>
              </div>
              <div className="font-mono text-xs break-all text-muted-foreground">
                <span className="text-primary">●</span> running on localhost:3000
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
