import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  FolderOpen, Upload, Image, Video, Music, FileText, Download, 
  Trash2, Search, Shield, Brain, HardDrive, Calendar, FileImage, FileVideo, FileAudio 
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { format } from 'date-fns';

// --- Interfaces ---

interface MediaFile {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  category: string;
  file_size: number;
  platform?: string;
  chat_id?: string;
  processed: boolean;
  created_at: string;
  is_permanent?: number;
}

interface DownloadedFile {
  name: string;
  category: string;
  url: string;
  size: number;
  created_at: string;
  modified_at: string;
}

interface FileStats {
  totalFiles: number;
  totalSize: number;
  byCategory: Record<string, { count: number; size: number }>;
}

interface PreviewFile {
  name: string;
  url: string;
  category: string; // 'image' | 'video' | 'audio' | 'document' | 'images' | 'videos' | 'audios'
  type: 'upload' | 'download';
}

// --- Helpers ---

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const getCategoryIcon = (category: string, className = "w-4 h-4") => {
  const c = category.toLowerCase();
  if (c.includes('image')) return <Image className={`${className} text-pink-500`} />;
  if (c.includes('video')) return <Video className={`${className} text-red-500`} />;
  if (c.includes('audio') || c.includes('music')) return <Music className={`${className} text-purple-500`} />;
  return <FileText className={`${className} text-blue-500`} />;
};

// --- Components ---

const FilePreviewDialog = ({ file, onClose }: { file: PreviewFile | null, onClose: () => void }) => {
  if (!file) return null;

  const isImage = file.category.includes('image');
  const isVideo = file.category.includes('video');
  const isAudio = file.category.includes('audio');
  
  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-background">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="truncate pr-8 flex items-center gap-2">
            {getCategoryIcon(file.category, "w-5 h-5")}
            {file.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 bg-black/5 flex items-center justify-center p-4 min-h-[300px] overflow-auto">
          {isImage && (
            <img src={file.url} alt={file.name} className="max-w-full max-h-[70vh] object-contain rounded-md shadow-sm" />
          )}
          {isVideo && (
            <video controls className="max-w-full max-h-[70vh] rounded-md shadow-sm" autoPlay>
              <source src={file.url} />
              Your browser does not support the video tag.
            </video>
          )}
          {isAudio && (
            <div className="w-full max-w-md p-6 bg-card rounded-xl shadow-sm border">
              <div className="flex justify-center mb-6">
                <Music className="w-24 h-24 text-primary/50" />
              </div>
              <audio controls className="w-full">
                <source src={file.url} />
                Your browser does not support the audio element.
              </audio>
            </div>
          )}
          {!isImage && !isVideo && !isAudio && (
             <div className="text-center">
               <FileText className="w-20 h-20 mx-auto text-muted-foreground mb-4" />
               <p className="mb-4 text-muted-foreground">Preview not supported in browser.</p>
               <a href={file.url} download className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                 <Download className="w-4 h-4" /> Download File
               </a>
             </div>
          )}
        </div>
        
        <div className="p-4 border-t bg-muted/20 flex justify-end gap-2">
           <a href={file.url} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted transition-colors text-sm font-medium">
             <Download className="w-4 h-4" /> Download
           </a>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function FileStorage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('uploads');
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  // --- Uploads State ---
  const [uploads, setUploads] = useState<MediaFile[]>([]);
  const [stats, setStats] = useState<FileStats | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string>('all');
  const [dragActive, setDragActive] = useState(false);
  const [uploadSearch, setUploadSearch] = useState('');

  // --- Downloads State ---
  const [downloads, setDownloads] = useState<DownloadedFile[]>([]);

  useEffect(() => {
    if (user) {
      if (activeTab === 'uploads') {
        fetchUploads();
        fetchStats();
      } else {
        fetchDownloads();
      }
    }
  }, [user, activeTab, uploadCategory]);

  // --- Uploads Logic ---
  
  const fetchUploads = async () => {
    try {
      const url = uploadCategory === 'all' 
        ? '/api/files' 
        : `/api/files?category=${uploadCategory}`;
      const data = await apiFetch(url);
      setUploads(data);
    } catch (err) {
      console.error('Failed to fetch uploads:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await apiFetch('/api/files/stats');
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | DragEvent) => {
    let fileList: FileList | null = null;
    if (e instanceof Event) {
       // drag event handled separately or assumed passed
    } else if ('target' in e && e.target.files) {
       fileList = e.target.files;
    }

    if (!fileList || fileList.length === 0) return;
    
    setIsUploading(true);
    const formData = new FormData();
    Array.from(fileList).forEach(file => {
      formData.append('files', file);
    });

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');
      
      toast.success(`Uploaded ${fileList.length} files successfully`);
      fetchUploads();
      fetchStats();
    } catch (err) {
      toast.error('Failed to upload files');
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteUpload = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this file?')) return;
    try {
      await apiFetch(`/api/files/${id}`, { method: 'DELETE' });
      toast.success('File deleted');
      setUploads(prev => prev.filter(f => f.id !== id));
      fetchStats();
    } catch (err) {
      toast.error('Failed to delete file');
    }
  };

  const handleTogglePermanent = async (e: React.MouseEvent, id: string, currentStatus: boolean) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/api/files/${id}/permanent`, {
        method: 'PUT',
        body: JSON.stringify({ isPermanent: !currentStatus })
      });
      setUploads(prev => prev.map(f => f.id === id ? { ...f, is_permanent: res.is_permanent } : f));
      toast.success(res.is_permanent ? 'File marked as permanent' : 'File unmarked as permanent');
    } catch (err) {
      toast.error('Failed to update file status');
    }
  };

  const handleProcessKnowledgeUpload = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      toast.loading('Processing file for Knowledge Bank...');
      await apiFetch(`/api/files/${id}/process-knowledge`, { method: 'POST' });
      toast.dismiss();
      toast.success('Added to Knowledge Bank');
    } catch (err) {
      toast.dismiss();
      toast.error('Failed to process file');
      console.error(err);
    }
  };

  // Drag and Drop
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
       const formData = new FormData();
       Array.from(e.dataTransfer.files).forEach(file => {
         formData.append('files', file);
       });
       
       setIsUploading(true);
       const token = localStorage.getItem('token');
       fetch('/api/files/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
       }).then(res => {
          if (!res.ok) throw new Error('Upload failed');
          toast.success('Files uploaded');
          fetchUploads();
          fetchStats();
       }).catch(err => {
          toast.error('Upload failed');
       }).finally(() => setIsUploading(false));
    }
  }, []);

  const filteredUploads = uploads.filter(f => 
    f.original_name.toLowerCase().includes(uploadSearch.toLowerCase()) || 
    f.category.includes(uploadSearch.toLowerCase())
  );

  // --- Downloads Logic ---

  const fetchDownloads = async () => {
    try {
      const data = await apiFetch('/api/downloads');
      setDownloads(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleProcessKnowledgeDownload = async (e: React.MouseEvent, file: DownloadedFile) => {
    e.stopPropagation();
    try {
      toast.loading(`Processing ${file.name} for Knowledge Bank...`);
      await apiFetch('/api/downloads/process-knowledge', {
        method: 'POST',
        body: JSON.stringify({ category: file.category, filename: file.name })
      });
      toast.dismiss();
      toast.success('Added to Knowledge Bank');
    } catch (err) {
      toast.dismiss();
      toast.error('Failed to process file');
      console.error(err);
    }
  };

  return (
    <div className="p-6 animate-fade-in space-y-6 h-full flex flex-col">
      <div className="flex flex-col gap-1 shrink-0">
        <h1 className="text-3xl font-mono font-bold tracking-tight flex items-center gap-2">
            <HardDrive className="w-8 h-8" />
            File Storage
        </h1>
        <p className="text-muted-foreground font-mono text-sm">
           Unified storage for your uploads and bot downloads.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="uploads" className="font-mono text-xs gap-2">
              <Upload className="w-3 h-3" /> Uploads
            </TabsTrigger>
            <TabsTrigger value="downloads" className="font-mono text-xs gap-2">
              <Download className="w-3 h-3" /> Downloads
            </TabsTrigger>
          </TabsList>
        </div>

        {/* --- UPLOADS TAB --- */}
        <TabsContent value="uploads" className="flex-1 overflow-hidden flex flex-col data-[state=inactive]:hidden">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 shrink-0">
              {/* Drop Zone */}
              <Card className="md:col-span-3 border-border bg-card/50 shadow-sm">
                 <CardContent className="p-4">
                    <div 
                      className={`border-2 border-dashed rounded-xl h-24 flex flex-col items-center justify-center transition-all cursor-pointer relative overflow-hidden ${
                          dragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                      }`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('file-upload')?.click()}
                    >
                       <input 
                          id="file-upload" 
                          type="file" 
                          multiple 
                          className="hidden" 
                          onChange={handleFileUpload} 
                       />
                       <div className="flex items-center gap-3">
                         <Upload className={`w-6 h-6 transition-transform duration-300 ${isUploading ? 'animate-bounce text-primary' : 'text-muted-foreground'}`} />
                         <p className="font-mono text-sm text-muted-foreground">
                            {isUploading ? 'Uploading...' : 'Drag & drop or click to upload'}
                         </p>
                       </div>
                    </div>
                 </CardContent>
              </Card>
              
              {/* Stats */}
              <Card className="border-border bg-card/50 shadow-sm">
                  <CardContent className="p-4 flex flex-col justify-center h-full">
                      <div className="text-xl font-mono font-bold">{stats ? formatFileSize(stats.totalSize) : '...'}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                          {stats?.totalFiles || 0} files total
                      </div>
                  </CardContent>
              </Card>
           </div>

           {/* Filter Bar */}
           <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
               <div className="flex gap-2">
                  <Button variant={uploadCategory === 'all' ? 'secondary' : 'ghost'} size="sm" onClick={() => setUploadCategory('all')} className="text-xs font-mono">All</Button>
                  <Button variant={uploadCategory === 'images' ? 'secondary' : 'ghost'} size="sm" onClick={() => setUploadCategory('images')} className="text-xs font-mono">Images</Button>
                  <Button variant={uploadCategory === 'videos' ? 'secondary' : 'ghost'} size="sm" onClick={() => setUploadCategory('videos')} className="text-xs font-mono">Videos</Button>
                  <Button variant={uploadCategory === 'audios' ? 'secondary' : 'ghost'} size="sm" onClick={() => setUploadCategory('audios')} className="text-xs font-mono">Audio</Button>
                  <Button variant={uploadCategory === 'documents' ? 'secondary' : 'ghost'} size="sm" onClick={() => setUploadCategory('documents')} className="text-xs font-mono">Docs</Button>
               </div>
               <div className="relative w-64">
                   <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
                   <Input 
                       placeholder="Search uploads..." 
                       className="pl-8 h-8 text-xs font-mono"
                       value={uploadSearch}
                       onChange={(e) => setUploadSearch(e.target.value)}
                   />
               </div>
           </div>

           {/* File Grid */}
           <ScrollArea className="flex-1 pr-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 pb-20">
                  {filteredUploads.map(file => (
                      <Card 
                        key={file.id} 
                        className="group overflow-hidden border-border bg-card/50 hover:bg-card hover:shadow-md transition-all cursor-pointer"
                        onClick={() => setPreviewFile({
                              name: file.original_name,
                              url: `/api/files/${file.id}/download?token=${localStorage.getItem('token')}`,
                              category: file.category,
                              type: 'upload'
                           })}
                         >
                             <div className="aspect-square bg-muted/30 relative flex items-center justify-center">
                                 {file.category.includes('image') ? (
                                     <img 
                                       src={`/api/files/${file.id}/download?token=${localStorage.getItem('token')}`} 
                                       alt={file.original_name} 
                                       className="w-full h-full object-cover" 
                                       loading="lazy"
                                     />
                                 ) : (
                                  getCategoryIcon(file.category, "w-10 h-10")
                              )}
                              
                              {/* Overlay Actions */}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <Button 
                                    size="icon" 
                                    variant="secondary" 
                                    className="h-8 w-8 rounded-full" 
                                    onClick={(e) => handleProcessKnowledgeUpload(e, file.id)} 
                                    title="Add to Knowledge Bank"
                                  >
                                      <Brain className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="secondary" 
                                    className={`h-8 w-8 rounded-full ${file.is_permanent ? 'text-green-500 bg-green-500/20' : ''}`} 
                                    onClick={(e) => handleTogglePermanent(e, file.id, !!file.is_permanent)}
                                    title={file.is_permanent ? "Make Temporary" : "Make Permanent"}
                                  >
                                      <Shield className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="destructive" 
                                    className="h-8 w-8 rounded-full" 
                                    onClick={(e) => handleDeleteUpload(e, file.id)}
                                  >
                                      <Trash2 className="w-4 h-4" />
                                  </Button>
                              </div>

                              {file.is_permanent === 1 && (
                                  <div className="absolute top-2 right-2 pointer-events-none">
                                      <Badge variant="secondary" className="bg-green-500/20 text-green-500 border-green-500/20 text-[10px] h-5 px-1">
                                          <Shield className="w-3 h-3" />
                                      </Badge>
                                  </div>
                              )}
                          </div>
                          
                          <div className="p-3">
                              <div className="font-medium text-xs truncate" title={file.original_name}>
                                  {file.original_name}
                              </div>
                              <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
                                  <span>{formatFileSize(file.file_size)}</span>
                                  <span className="uppercase">{file.category.replace('s', '')}</span>
                              </div>
                          </div>
                      </Card>
                  ))}
                  {filteredUploads.length === 0 && (
                      <div className="col-span-full text-center py-10 text-muted-foreground font-mono text-sm">
                          No uploaded files found.
                      </div>
                  )}
              </div>
           </ScrollArea>
        </TabsContent>

        {/* --- DOWNLOADS TAB --- */}
        <TabsContent value="downloads" className="flex-1 overflow-hidden flex flex-col data-[state=inactive]:hidden">
           <ScrollArea className="flex-1 pr-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 pb-20">
                {downloads.map((file, i) => (
                  <Card 
                    key={i} 
                    className="group overflow-hidden border-border bg-card/50 hover:bg-card hover:shadow-md transition-all cursor-pointer"
                    onClick={() => setPreviewFile({
                       name: file.name,
                       url: file.url,
                       category: file.category,
                       type: 'download'
                    })}
                  >
                    <div className="aspect-video bg-muted/30 flex items-center justify-center relative overflow-hidden">
                       {file.category === 'image' ? (
                         <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                       ) : (
                         getCategoryIcon(file.category, "w-10 h-10")
                       )}
                       
                       {/* Overlay Actions */}
                       <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                           <Button 
                              size="icon" 
                              variant="secondary" 
                              className="h-8 w-8 rounded-full" 
                              onClick={(e) => handleProcessKnowledgeDownload(e, file)} 
                              title="Add to Knowledge Bank"
                           >
                               <Brain className="w-4 h-4" />
                           </Button>
                           <a 
                              href={file.url} 
                              download 
                              onClick={(e) => e.stopPropagation()}
                              className="h-8 w-8 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center justify-center"
                           >
                               <Download className="w-4 h-4" />
                           </a>
                       </div>
                    </div>
                    
                    <div className="p-3">
                      <div className="font-medium text-xs truncate" title={file.name}>{file.name}</div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                         <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> {formatFileSize(file.size)}</span>
                         <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {format(new Date(file.modified_at), 'MM/dd HH:mm')}</span>
                      </div>
                    </div>
                  </Card>
                ))}
                
                {downloads.length === 0 && (
                  <div className="col-span-full text-center py-20 text-muted-foreground font-mono text-sm">
                    No downloaded files found. Ask the bot to download something!
                  </div>
                )}
              </div>
           </ScrollArea>
        </TabsContent>
      </Tabs>

      <FilePreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
