import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Search, Brain, User, Users, Monitor, Clock, MessageSquare } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Badge } from "@/components/ui/badge";

interface ChatLogEntry {
  id: string;
  user_id: string;
  chat_id: string;
  platform: string;
  role: 'user' | 'model';
  content: string;
  created_at: string;
  chat_type?: string;
  group_id?: string;
  sender_id?: string;
  sender_name?: string;
}

export default function MemoryPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const data = await apiFetch(`/api/memories/search?q=${encodeURIComponent(query)}`);
      setResults(data);
      setSearched(true);
    } catch (err) {
      console.error('Failed to search memories:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-mono font-bold tracking-tight">Memory Bank</h1>
        <p className="text-muted-foreground font-mono text-sm">Search and review conversation history across all platforms and contexts.</p>
      </div>

      <Card className="p-6 border-border bg-card">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by User ID, Group ID, Name, or Content..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 font-mono"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </form>
      </Card>

      {searched && (
        <Card className="border-border shadow-none overflow-hidden bg-card">
          <div className="bg-secondary/30 p-4 border-b border-border flex items-center gap-2">
            <Brain className="w-4 h-4" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider">Search Results ({results.length})</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-secondary/10">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="font-mono text-[10px] uppercase w-[180px]">Context</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase w-[150px]">Sender</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase">Content</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase w-[150px] text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((log) => (
                  <TableRow key={log.id} className="font-mono text-xs border-b border-border/50 hover:bg-secondary/20">
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1.5">
                        <Badge variant="outline" className="w-fit bg-primary/5 border-primary/20 text-primary">
                          <Monitor className="w-3 h-3 mr-1" />
                          {log.platform}
                        </Badge>
                        <Badge variant="secondary" className="w-fit">
                          {log.chat_type === 'group' ? <Users className="w-3 h-3 mr-1" /> : <User className="w-3 h-3 mr-1" />}
                          {log.chat_type || 'private'}
                        </Badge>
                        {log.group_id && (
                          <div className="text-[10px] text-muted-foreground break-all">
                            Grp: {log.group_id}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-bold">{log.sender_name || 'Unknown'}</div>
                      <div className="text-[10px] text-muted-foreground break-all">{log.sender_id}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="whitespace-pre-wrap">{log.content}</div>
                    </TableCell>
                    <TableCell className="align-top text-right text-muted-foreground">
                      <div className="flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {results.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      No memories found matching your query.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
