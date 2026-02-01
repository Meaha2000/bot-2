import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';
import { Send, Bot, User, Trash2, Image as ImageIcon, Loader2, X, MessageSquare, Plus, Menu } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

interface Message {
  role: 'user' | 'model';
  content: string;
}

interface ChatSession {
  chatId: string;
  messageCount: number;
  lastMessage: string;
}

export default function Playground() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>('playground-default');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      fetchSessions();
      loadHistory(currentChatId);
    }
  }, [user]);

  const fetchSessions = async () => {
    try {
      const data = await apiFetch('/api/playground/sessions');
      if (Array.isArray(data)) {
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const loadHistory = async (chatId: string) => {
    try {
      // First try to load from playground history
      let historyData = await apiFetch(`/api/playground/history/${chatId}`);
      
      // If empty, try legacy chat logs (fallback for old default session)
      if (!historyData || (Array.isArray(historyData) && historyData.length === 0)) {
         const logsData = await apiFetch(`/api/chat-logs?chatId=${chatId}&limit=50`);
         if (Array.isArray(logsData)) {
            const mapped = logsData.reverse().map((log: any) => ({
              role: (log.role === 'model' ? 'model' : 'user') as "user" | "model", // normalize role
              content: log.content
            }));
            setMessages(mapped);
            return;
         }
      }

      if (Array.isArray(historyData)) {
        const mapped = historyData.map((msg: any) => ({
          role: (msg.role === 'assistant' ? 'model' : 'user') as "user" | "model", // normalize role
          content: msg.content
        }));
        setMessages(mapped);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
      setMessages([]);
    }
  };

  const handleSessionSelect = (chatId: string) => {
    setCurrentChatId(chatId);
    loadHistory(chatId);
    // On mobile, close sidebar after selection? Optional.
  };

  const handleNewChat = () => {
    // Generate a proper ID but don't add to list until first message
    const newId = `chat-${Date.now()}`;
    setCurrentChatId(newId);
    setMessages([]);
    // Optionally focus input
    setTimeout(() => {
      document.querySelector('textarea')?.focus();
    }, 100);
  };

  const handleDeleteSession = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat?')) return;

    try {
      await apiFetch(`/api/playground/sessions/${chatId}`, { method: 'DELETE' });
      toast.success('Chat deleted');
      await fetchSessions();
      if (currentChatId === chatId) {
        handleNewChat();
      }
    } catch (err) {
      toast.error('Failed to delete chat');
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if ((!input.trim() && selectedFiles.length === 0) || isLoading || !user) return;

    const userMsg = input.trim();
    setInput('');
    // Optimistic update
    setMessages(prev => [...prev, { role: 'user', content: userMsg || 'Uploaded media' }]);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('prompt', userMsg);
      formData.append('chatId', currentChatId);
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      const token = localStorage.getItem('token');
      const response = await fetch('/api/bot/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'model', content: data.response }]);
      setSelectedFiles([]);
      
      // Refresh sessions list
      fetchSessions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to send message');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };
  
  const formatTime = (iso: string) => {
    try {
        const date = new Date(iso);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (e) {
        return '';
    }
  };

  return (
    <div className="h-[calc(100vh-2rem)] flex gap-4 animate-fade-in p-6">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-72' : 'w-0 opacity-0 overflow-hidden'} transition-all duration-300 flex flex-col gap-4 shrink-0`}>
        <div className="flex items-center justify-between p-1">
            <h2 className="font-mono font-bold text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                History
            </h2>
            <Button variant="outline" size="sm" onClick={handleNewChat} className="h-8 gap-2 font-mono text-xs">
                <Plus className="w-3 h-3" />
                New Chat
            </Button>
        </div>
        
        <Card className="flex-1 bg-card/50 border-border shadow-none overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {sessions.length === 0 && (
                        <div className="text-xs text-muted-foreground font-mono p-8 text-center flex flex-col items-center gap-2 opacity-50">
                            <MessageSquare className="w-8 h-8 mb-2" />
                            No previous chats
                        </div>
                    )}
                    {sessions.map((session) => (
                        <div 
                            key={session.chatId}
                            onClick={() => handleSessionSelect(session.chatId)}
                            className={`group flex items-center justify-between p-3 rounded-md text-sm cursor-pointer transition-all border border-transparent ${
                                currentChatId === session.chatId 
                                ? 'bg-accent text-accent-foreground border-border shadow-sm' 
                                : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <div className="flex flex-col gap-1 overflow-hidden">
                                <span className="font-mono text-xs font-bold truncate opacity-80">
                                    {session.chatId.replace('chat-', '')}
                                </span>
                                <span className="text-[10px] opacity-50 font-mono">
                                    {formatTime(session.lastMessage)} · {session.messageCount} msgs
                                </span>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20 hover:text-destructive"
                                onClick={(e) => handleDeleteSession(e, session.chatId)}
                            >
                                <Trash2 className="w-3 h-3" />
                            </Button>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </Card>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col gap-4 h-full min-w-0">
         <Card className="flex-1 border-border shadow-none bg-card flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/10">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="shrink-0">
                        <Menu className="w-4 h-4" />
                    </Button>
                    <div className="flex flex-col">
                        <span className="font-mono font-bold text-sm">
                            {currentChatId === 'playground-default' ? 'Default Session' : currentChatId}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                             {messages.length} messages · Gemini 1.5 Pro
                        </span>
                    </div>
                </div>
                {messages.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={(e) => handleDeleteSession(e, currentChatId)} className="h-8 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-6 max-w-3xl mx-auto pb-4">
                    {messages.length === 0 && (
                        <div className="h-[40vh] flex flex-col items-center justify-center text-muted-foreground opacity-50 gap-4">
                             <Bot className="w-12 h-12" />
                             <p className="font-mono text-sm">Start a conversation...</p>
                        </div>
                    )}
                    {messages.map((msg, i) => (
                        <div 
                            key={i} 
                            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                                msg.role === 'user' 
                                ? 'bg-primary text-primary-foreground border-primary' 
                                : 'bg-secondary text-secondary-foreground border-border'
                            }`}>
                                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                            </div>
                            <div className={`flex flex-col gap-1 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                                    msg.role === 'user'
                                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                    : 'bg-muted/50 border border-border rounded-tl-sm'
                                }`}>
                                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shrink-0 border border-border">
                                <Bot className="w-4 h-4" />
                            </div>
                            <div className="bg-muted/50 border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                <span className="text-xs text-muted-foreground font-mono">Thinking...</span>
                            </div>
                        </div>
                    )}
                </div>
            </ScrollArea>
            
            {/* Input Area */}
            <div className="p-4 bg-background border-t border-border">
                <div className="max-w-3xl mx-auto flex flex-col gap-2">
                    {selectedFiles.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {selectedFiles.map((file, i) => (
                                <div key={i} className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-md border border-border text-xs font-mono shrink-0">
                                    <ImageIcon className="w-3 h-3" />
                                    <span className="truncate max-w-[150px]">{file.name}</span>
                                    <button onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-destructive">
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-2 relative">
                         <input
                            type="file"
                            multiple
                            className="hidden"
                            ref={fileInputRef}
                            onChange={onFileSelect}
                            accept="image/*,video/*,audio/*,application/pdf"
                         />
                         <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} className="shrink-0 h-10 w-10 rounded-xl" title="Upload files">
                            <ImageIcon className="w-4 h-4" />
                         </Button>
                         <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                            placeholder="Type a message..."
                            className="flex-1 h-10 rounded-xl border-border bg-background focus-visible:ring-1"
                         />
                         <Button onClick={handleSend} disabled={isLoading || (!input.trim() && selectedFiles.length === 0)} className="shrink-0 h-10 w-10 rounded-xl" size="icon">
                            <Send className="w-4 h-4" />
                         </Button>
                    </div>
                    <div className="text-[10px] text-center text-muted-foreground font-mono opacity-50">
                        AI can make mistakes. Check important info.
                    </div>
                </div>
            </div>
         </Card>
      </div>
    </div>
  );
}