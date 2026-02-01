import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Brain, Save, Trash2, Sparkles, Activity, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Textarea } from '@/components/ui/textarea';

interface Memory {
  id: string;
  content: string;
  memory_type: 'core' | 'active_learning';
  created_at: string;
}

export default function Personalities() {
  const { user } = useAuth();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newCoreMemory, setNewCoreMemory] = useState('');
  const [newActiveMemory, setNewActiveMemory] = useState('');
  const [knowledgeBankContent, setKnowledgeBankContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchMemories();
      fetchKnowledgeBank();
    }
  }, [user]);

  const fetchKnowledgeBank = async () => {
    try {
      const data = await apiFetch('/api/knowledge-bank');
      setKnowledgeBankContent(data.content);
    } catch (err) {
      console.error('Failed to fetch knowledge bank:', err);
    }
  };

  const saveKnowledgeBank = async () => {
    try {
      await apiFetch('/api/knowledge-bank', {
        method: 'POST',
        body: JSON.stringify({ content: knowledgeBankContent })
      });
      toast.success('Knowledge Bank saved');
    } catch (err) {
      toast.error('Failed to save Knowledge Bank');
    }
  };

  const fetchMemories = async () => {
    try {
      const data = await apiFetch('/api/memories');
      setMemories(data);
    } catch (err) {
      console.error('Failed to fetch memories:', err);
    }
  };

  const addMemory = async (content: string, type: 'core' | 'active_learning') => {
    if (!content.trim()) return;
    setIsLoading(true);
    try {
      await apiFetch('/api/memories', {
        method: 'POST',
        body: JSON.stringify({ content: content.trim(), type })
      });
      if (type === 'core') setNewCoreMemory('');
      else setNewActiveMemory('');
      
      toast.success(type === 'core' ? 'Core memory established' : 'Active learning recorded');
      fetchMemories();
    } catch (e: any) {
      toast.error(e.message || 'Failed to add memory');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteMemory = async (id: string) => {
    try {
      await apiFetch(`/api/memories/${id}`, { method: 'DELETE' });
      toast.success('Memory deleted');
      fetchMemories();
    } catch (e: any) {
      toast.error('Failed to delete memory');
    }
  };

  const coreMemories = memories.filter(m => m.memory_type === 'core' || !m.memory_type); // Default to core for old entries
  const activeMemories = memories.filter(m => m.memory_type === 'active_learning');

  return (
    <div className="space-y-6 animate-fade-in p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-mono font-bold tracking-tight">System Memory</h1>
        <p className="text-muted-foreground font-mono text-sm">Manage the AI's long-term knowledge and experiential learning.</p>
      </div>

      <Tabs defaultValue="core" className="space-y-4">
        <TabsList>
          <TabsTrigger value="core" className="font-mono text-xs gap-2">
            <Brain className="w-3.5 h-3.5" />
            Core Memories
          </TabsTrigger>
          <TabsTrigger value="active" className="font-mono text-xs gap-2">
            <Activity className="w-3.5 h-3.5" />
            Active Learning
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="font-mono text-xs gap-2">
            <BookOpen className="w-3.5 h-3.5" />
            Knowledge Bank
          </TabsTrigger>
        </TabsList>

        <TabsContent value="core" className="space-y-4">
          <Card className="border-border shadow-none bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                Immutable Core Facts
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                Fundamental truths and rules that define the AI's base behavior. These are permanent and override learned experiences.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input 
                  placeholder="Add a fundamental rule (e.g., 'Always verify sources')..." 
                  value={newCoreMemory}
                  onChange={(e) => setNewCoreMemory(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMemory(newCoreMemory, 'core')}
                  className="font-mono text-sm"
                />
                <Button onClick={() => addMemory(newCoreMemory, 'core')} disabled={!newCoreMemory.trim() || isLoading} className="gap-2 font-mono">
                  <Save className="w-4 h-4" />
                  Save Core
                </Button>
              </div>

              <div className="space-y-2 mt-4">
                {coreMemories.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground font-mono text-xs border border-dashed border-border rounded-lg">
                    No core memories established.
                  </div>
                ) : (
                  coreMemories.map((m) => (
                    <div key={m.id} className="flex items-start justify-between p-3 rounded-lg border border-border bg-primary/5 hover:bg-primary/10 transition-colors group">
                      <div className="space-y-1">
                        <p className="font-mono text-sm">{m.content}</p>
                        <p className="text-[10px] font-mono text-muted-foreground uppercase">
                          Established: {new Date(m.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => deleteMemory(m.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-500/10 h-8 w-8"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          <Card className="border-border shadow-none bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Experiential Knowledge
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                Dynamic knowledge acquired from interactions. These evolve over time and adapt based on new experiences.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input 
                  placeholder="Add an observation (e.g., 'Group X prefers technical discussions')..." 
                  value={newActiveMemory}
                  onChange={(e) => setNewActiveMemory(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMemory(newActiveMemory, 'active_learning')}
                  className="font-mono text-sm"
                />
                <Button onClick={() => addMemory(newActiveMemory, 'active_learning')} disabled={!newActiveMemory.trim() || isLoading} className="gap-2 font-mono">
                  <Save className="w-4 h-4" />
                  Add Observation
                </Button>
              </div>

              <div className="space-y-2 mt-4">
                {activeMemories.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground font-mono text-xs border border-dashed border-border rounded-lg">
                    No active learning records found.
                  </div>
                ) : (
                  activeMemories.map((m) => (
                    <div key={m.id} className="flex items-start justify-between p-3 rounded-lg border border-border bg-amber-500/5 hover:bg-amber-500/10 transition-colors group">
                      <div className="space-y-1">
                        <p className="font-mono text-sm">{m.content}</p>
                        <p className="text-[10px] font-mono text-muted-foreground uppercase">
                          Learned: {new Date(m.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => deleteMemory(m.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-500/10 h-8 w-8"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <Card className="border-border shadow-none bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-500" />
                Knowledge Bank
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                A consolidated repository of extracted knowledge from files and documents. This is injected into the AI's context.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea 
                value={knowledgeBankContent}
                onChange={(e) => setKnowledgeBankContent(e.target.value)}
                className="font-mono text-xs min-h-[400px] leading-relaxed"
                placeholder="# Knowledge Bank&#10;Add facts, rules, and document summaries here..."
              />
              <div className="flex justify-end">
                <Button onClick={saveKnowledgeBank} className="gap-2 font-mono">
                  <Save className="w-4 h-4" />
                  Save Knowledge Bank
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}