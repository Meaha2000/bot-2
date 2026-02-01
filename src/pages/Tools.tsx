import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Wrench, Globe, Code2, FileVideo, Plus, Trash2, Globe2, Github, Coins, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

interface CustomTool {
  id: string;
  name: string;
  endpoint: string;
  description: string;
  is_active: number;
  is_admin_only: number;
}

export default function ToolsPage() {
  const { user } = useAuth();
  const [tools, setTools] = useState<CustomTool[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [desc, setDesc] = useState('');
  const [isAdminOnly, setIsAdminOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchTools();
      fetchSettings();
    }
  }, [user]);

  const fetchSettings = async () => {
    try {
      const data = await apiFetch('/api/settings/user');
      setSettings(data);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  const toggleSetting = async (key: string) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    try {
      await apiFetch('/api/settings/user', {
        method: 'PUT',
        body: JSON.stringify(newSettings)
      });
      toast.success('Tool status updated');
    } catch (e) {
      toast.error('Failed to update tool');
      fetchSettings(); // Revert
    }
  };

  const fetchTools = async () => {
    try {
      const data = await apiFetch('/api/tools');
      setTools(data);
    } catch (err) {
      console.error('Failed to fetch tools:', err);
    }
  };

  const addTool = async () => {
    if (!name.trim() || !endpoint.trim() || !user) return;
    setIsLoading(true);
    try {
      await apiFetch('/api/tools', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          endpoint: endpoint.trim(),
          description: desc.trim(),
          is_admin_only: isAdminOnly
        })
      });
      setName('');
      setEndpoint('');
      setDesc('');
      setIsAdminOnly(false);
      toast.success('Custom tool protocol integrated');
      fetchTools();
    } catch (e: any) {
      toast.error(e.message || 'Integration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTool = async (id: string, current: number) => {
    try {
      await apiFetch(`/api/tools/${id}/toggle`, {
        method: 'POST'
      });
      fetchTools();
    } catch (e: any) {
      toast.error('Operation failed');
    }
  };

  const toggleToolAdmin = async (id: string) => {
    try {
      await apiFetch(`/api/tools/${id}/toggle-admin`, {
        method: 'POST'
      });
      fetchTools();
    } catch (e: any) {
      toast.error('Operation failed');
    }
  };

  const deleteTool = async (id: string) => {
    try {
      await apiFetch(`/api/tools/${id}`, {
        method: 'DELETE'
      });
      toast.success('Tool removed');
      fetchTools();
    } catch (e: any) {
      toast.error('Deletion failed');
    }
  };

  const coreTools = [
    { 
      id: 'enableWebSearch',
      name: 'Global Web Search', 
      icon: Globe, 
      status: settings.enableWebSearch ? 'Active' : 'Inactive', 
      desc: 'Real-time indexing and scraping of the public internet.',
      checked: !!settings.enableWebSearch
    },
    { 
      id: 'enableCalculator',
      name: 'Calculator', 
      icon: Code2, 
      status: settings.enableCalculator ? 'Active' : 'Inactive', 
      desc: 'Secure mathematical evaluations.',
      checked: !!settings.enableCalculator
    },
    { 
      id: 'enableWeather',
      name: 'Weather Station', 
      icon: Globe2, 
      status: settings.enableWeather ? 'Active' : 'Inactive', 
      desc: 'Real-time global weather data.',
      checked: !!settings.enableWeather
    },
    { 
      id: 'enableScraper',
      name: 'Web Scraper', 
      icon: FileVideo, 
      status: settings.enableScraper ? 'Active' : 'Inactive', 
      desc: 'Content extraction from external URLs.',
      checked: !!settings.enableScraper
    },
    { 
      id: 'enableGithub',
      name: 'GitHub Repository', 
      icon: Github, 
      status: settings.enableGithub ? 'Active' : 'Inactive', 
      desc: 'Access and analyze public GitHub repositories.',
      checked: !!settings.enableGithub
    },
    { 
      id: 'enableCurrency',
      name: 'Currency Converter', 
      icon: Coins, 
      status: settings.enableCurrency ? 'Active' : 'Inactive', 
      desc: 'Real-time global currency conversion.',
      checked: !!settings.enableCurrency
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-mono font-bold tracking-tight">Extension Matrix</h1>
        <p className="text-muted-foreground font-mono text-sm">Configure native capabilities and external webhook protocols.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {coreTools.map((tool) => (
          <Card key={tool.name} className="border-border shadow-none bg-card transition-all duration-200 hover:scale-[1.02] hover:border-primary/20 group">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between mb-2">
                 <div className="w-8 h-8 bg-primary/5 rounded border border-border flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    <tool.icon className="w-4 h-4 text-primary" />
                 </div>
                 <div className="flex items-center gap-2">
                   <Badge variant="outline" className={`text-[9px] font-mono border-opacity-20 uppercase font-bold tracking-widest ${tool.checked ? 'border-green-500 text-green-600 bg-green-500/5' : 'border-muted text-muted-foreground bg-muted/5'}`}>
                      {tool.status}
                   </Badge>
                   <Switch checked={tool.checked} onCheckedChange={() => toggleSetting(tool.id)} className="scale-75" />
                 </div>
              </div>
              <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider">{tool.name}</CardTitle>
            </CardHeader>
            <CardContent>
               <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">{tool.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-border shadow-none h-fit bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Register External Plugin
            </CardTitle>
            <CardDescription className="font-mono text-[10px] uppercase">Link a third-party API endpoint to the LLM core.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="space-y-1.5">
               <label className="text-[10px] font-mono uppercase text-muted-foreground font-bold">Tool Identifier</label>
               <Input placeholder="e.g. WEATHER_SVC" value={name} onChange={(e) => setName(e.target.value)} className="font-mono text-xs" />
             </div>
             <div className="space-y-1.5">
               <label className="text-[10px] font-mono uppercase text-muted-foreground font-bold">Webhook URL</label>
               <Input placeholder="https://api.example.com/v1" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="font-mono text-xs" />
             </div>
             <div className="space-y-1.5">
               <label className="text-[10px] font-mono uppercase text-muted-foreground font-bold">Protocol Definition</label>
               <Textarea placeholder="Describe parameters and expected JSON output..." value={desc} onChange={(e) => setDesc(e.target.value)} className="font-mono text-xs h-24" />
             </div>
             <div className="flex items-center justify-between pt-2">
               <label className="text-[10px] font-mono uppercase text-muted-foreground font-bold flex items-center gap-2">
                 <Shield className="w-3 h-3" />
                 Admin Only
               </label>
               <Switch checked={isAdminOnly} onCheckedChange={setIsAdminOnly} className="scale-75" />
             </div>
          </CardContent>
          <CardFooter>
            <Button onClick={addTool} disabled={isLoading || !name || !endpoint} className="w-full gap-2 font-mono uppercase tracking-widest text-xs h-10">
              <Wrench className="w-3.5 h-3.5" />
              Initialize Plugin
            </Button>
          </CardFooter>
        </Card>

        <Card className="lg:col-span-2 border-border shadow-none overflow-hidden bg-card">
          <CardHeader className="bg-secondary/30 border-b border-border">
            <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
              <Wrench className="w-4 h-4" /> Custom Extension Pool
            </CardTitle>
          </CardHeader>
          <div className="p-0">
             {tools.length === 0 && (
               <div className="h-60 flex flex-col items-center justify-center gap-4 border-b border-border last:border-0 p-8">
                  <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center border border-border">
                     <Globe2 className="w-6 h-6 text-muted-foreground opacity-50" />
                  </div>
                  <p className="text-xs font-mono text-muted-foreground text-center max-w-xs leading-relaxed">
                     No external webhooks connected. The bot is restricted to native capabilities only.
                  </p>
               </div>
             )}
             {tools.map((t) => (
               <div key={t.id} className="p-4 border-b border-border last:border-0 flex items-center justify-between hover:bg-secondary/20 transition-colors group">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-primary/5 rounded-lg border border-border flex items-center justify-center group-hover:border-primary/30 transition-colors">
                        <Wrench className="w-4 h-4 text-primary" />
                     </div>
                     <div className="space-y-1">
                        <div className="flex items-center gap-2">
                           <h3 className="text-xs font-mono font-bold uppercase group-hover:text-primary transition-colors">{t.name}</h3>
                           <Badge variant="secondary" className="text-[8px] font-mono h-4 uppercase bg-secondary text-muted-foreground border border-border">Webhook</Badge>
                           {t.is_admin_only === 1 && (
                             <Badge variant="outline" className="text-[8px] font-mono h-4 uppercase border-red-500/30 text-red-500 bg-red-500/5">Admin Only</Badge>
                           )}
                        </div>
                        <p className="text-[10px] font-mono text-muted-foreground truncate max-w-md">{t.endpoint}</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-4">
                     <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                           <span className="text-[9px] font-mono text-muted-foreground uppercase">Active</span>
                           <Switch checked={t.is_active === 1} onCheckedChange={() => toggleTool(t.id, t.is_active)} className="scale-75" />
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="text-[9px] font-mono text-muted-foreground uppercase">Admin</span>
                           <Switch checked={t.is_admin_only === 1} onCheckedChange={() => toggleToolAdmin(t.id)} className="scale-75" />
                        </div>
                     </div>
                     <Button variant="ghost" size="icon" onClick={() => deleteTool(t.id)} className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3.5 h-3.5" />
                     </Button>
                  </div>
               </div>
             ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
