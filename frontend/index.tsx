import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Chat, Content } from "@google/genai";
import { Brain, FileText, Activity, Users, Database, ChevronRight, ChevronDown, ChevronLeft, BarChart3, AlertCircle, Loader2, Upload, FileUp, CheckCircle2, FileSpreadsheet, Send, Sparkles, MessageSquare, Bot, User, RefreshCw, Clock, Zap, Target, ShieldAlert, TrendingUp, Lightbulb, Compass, MonitorPlay, Layers, ArrowUpRight, Plus, Command, Heart, AlertTriangle, Scale, DollarSign, PieChart, HeartHandshake, Baby, MapPin, Clapperboard, Film, PenTool, LayoutTemplate, X, Play, Scissors, Check, Share2, Download, Pause, Volume2, VolumeX, Maximize, Paperclip, Trash2, Table2, PlayCircle, Circle, Disc, FileSearch, TrendingDown, Stethoscope } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart as RePieChart, Pie, Cell, 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis 
} from 'recharts';

// --- Types ---
declare global {
  interface Window {
    marked: {
      parse: (text: string) => string;
    };
    mermaid: {
      initialize: (config: any) => void;
      run: (config?: any) => Promise<void>;
    };
    alasql?: any;
    Papa?: any;
  }
}

// JSZip Declaration
declare var JSZip: any;

interface SimulationData {
  topEnd: string;
  bottomEnd: string;
  cxImpact: string;
  constraints: string;
  synthesis: string;
}

interface ChartData {
  title: string;
  chartType: 'bar' | 'pie' | 'radar';
  description?: string;
  data: any[];
  config?: {
    xKey?: string;
    yKey?: string; // For Bar
    nameKey?: string; // For Pie/Radar
    valueKey?: string; // For Pie/Radar
    colors?: string[];
  }
}

interface VideoTheme {
  id: number;
  title: string;
  rationale: string;
  emotionalHook: string;
  targetAudience: string;
  shortTag?: string; // e.g. "Cost Anxiety"
}

interface ScriptSegment {
  seq: number;
  duration: string;
  visual: string;
  audio: string;
}

interface Attachment {
  name: string;
  content: string;
  isCsv: boolean;
  isLarge: boolean;
  tableName?: string;
  collectionName?: string;
  headers?: string[];
  columnTypes?: Record<string, string>;
  rowCount?: number;
}

interface PlaylistItem {
  url: string;
  segment: ScriptSegment;
}

// --- Constants ---
const MAX_TEXT_PAYLOAD_SIZE = 30000; // Reduced to 30KB to be safe with quotas. CSVs will use Schema only.
const SAMPLE_VIDEO_URL = "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4";
const CHART_COLORS = ['#db2777', '#059669', '#d97706', '#7c3aed', '#2563eb', '#dc2626']; // Pink, Emerald, Amber, Violet, Blue, Red

// --- Nomenclature Definition ---
const DATA_LAYERS = [
  {
    id: 'acquisition',
    title: 'A. ACQUISITION LAYER',
    subtitle: 'Marketing Inflow & Attribution',
    icon: Users,
    color: 'bg-blue-500',
    textColor: 'text-blue-600',
    borderColor: 'border-blue-100',
    files: ['CRM leads.csv', 'META Instant Form Leads.csv', 'Source Medium.csv', 'Channel.csv', 'landing page.csv']
  },
  {
    id: 'demographic',
    title: 'B. DEMOGRAPHIC LAYER',
    subtitle: 'Slicing Dimensions',
    icon: MapPin,
    color: 'bg-emerald-500',
    textColor: 'text-emerald-600',
    borderColor: 'border-emerald-100',
    files: ['Region.csv', 'city.csv', 'Date.csv', 'Hour.csv', 'Gender.csv', 'Device and Inpur.csv']
  },
  {
    id: 'quality',
    title: 'C. QUALITY LAYER',
    subtitle: 'The "Empathy Filter"',
    icon: Heart,
    color: 'bg-pink-500',
    textColor: 'text-pink-600',
    borderColor: 'border-pink-100',
    files: ['Call_Center_Audit.csv']
  },
  {
    id: 'operational',
    title: 'D. OPERATIONAL LAYER',
    subtitle: 'Conversion & Revenue',
    icon: Activity,
    color: 'bg-amber-500',
    textColor: 'text-amber-600',
    borderColor: 'border-amber-100',
    files: ['Footfall Data.csv', 'File to ICSI.csv']
  },
  {
    id: 'competitive',
    title: 'E. COMPETITIVE LAYER',
    subtitle: 'Market Intelligence',
    icon: Target,
    color: 'bg-rose-500',
    textColor: 'text-rose-600',
    borderColor: 'border-rose-100',
    files: ['Nova H1 Opu data.csv', 'Market Share Analysis.csv', 'Competetion.csv']
  }
];

// --- Helpers ---

// Circular JSON replacer for safe stringification
const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (key: any, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
};

// Safe string converter to prevent [object Object] and circular errors
const safeString = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return String(val);
    if (val instanceof Error) return val.message || String(val);
    
    if (typeof val === 'object') {
        // Try to find a text property if it exists (common in API responses)
        if (val.text) return String(val.text);
        
        // Fallback to stringify but avoid [object Object] and circular refs
        try {
            const str = JSON.stringify(val, getCircularReplacer(), 2);
            return str === '{}' ? '' : str; // Hide empty objects
        } catch (e) {
            return '[Complex Object]';
        }
    }
    return String(val);
};

const safeRenderMarkdown = (content: any): { __html: string } => {
  // Use safeString to ensure we don't crash on circular objects or nulls
  const text = typeof content === 'string' ? content : safeString(content);
  
  if (typeof window !== 'undefined' && window.marked) {
    try {
       // Check for modern marked (parse method)
       if (typeof window.marked.parse === 'function') {
          const html = window.marked.parse(text);
          if (typeof html === 'string') {
             return { __html: html };
          }
       }
       // Check for legacy marked (function)
       else if (typeof window.marked === 'function') {
          const html = (window.marked as any)(text);
          if (typeof html === 'string') {
             return { __html: html };
          }
       }
    } catch (e) {
       console.error("Markdown render error:", e);
    }
  }
  
  // Fallback: Treat as plain text, preserving newlines
  return { __html: text.replace(/\n/g, '<br/>') };
};

// Custom Hook for Local Storage Persistence
function usePersistentState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      if (typeof window !== 'undefined') {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : initialValue;
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
    return initialValue;
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        // Use circular replacer to be safe when saving state
        window.localStorage.setItem(key, JSON.stringify(state, getCircularReplacer()));
      }
    } catch (error) {
      console.warn(`Error saving localStorage key "${key}":`, error);
    }
  }, [key, state]);

  return [state, setState];
}

// --- Components ---

const WindowControls = () => (
  <div className="flex gap-1.5">
    <div className="w-2.5 h-2.5 rounded-full bg-red-400 hover:bg-red-500 transition-colors"></div>
    <div className="w-2.5 h-2.5 rounded-full bg-amber-400 hover:bg-amber-500 transition-colors"></div>
    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 hover:bg-emerald-500 transition-colors"></div>
  </div>
);

// --- NEW COMPONENT: BiChartsWidget ---
const BiChartsWidget = ({ data }: { data: ChartData }) => {
  const colors = data.config?.colors || CHART_COLORS;
  
  // Parse numeric values if they came as strings
  const processedData = data.data.map(item => {
     const newItem = { ...item };
     if (data.chartType === 'bar' && data.config?.yKey) {
        const parsed = parseFloat(newItem[data.config.yKey]);
        newItem[data.config.yKey] = isNaN(parsed) ? 0 : parsed;
     }
     if ((data.chartType === 'pie' || data.chartType === 'radar') && data.config?.valueKey) {
        const parsed = parseFloat(newItem[data.config.valueKey]);
        newItem[data.config.valueKey] = isNaN(parsed) ? 0 : parsed;
     }
     return newItem;
  });

  // Safe tooltip formatter to avoid [object Object]
  const tooltipFormatter = (value: any, name: any, props: any) => {
      if (typeof value === 'object') return JSON.stringify(value);
      return [value, name];
  };

  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 shadow-lg p-6 overflow-hidden relative group">
       <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 via-rose-400 to-amber-400"></div>
       
       <div className="flex justify-between items-start mb-6">
           <div>
               <h3 className="text-lg font-bold text-slate-800">{safeString(data.title)}</h3>
               {data.description && <p className="text-sm text-slate-500 mt-1">{safeString(data.description)}</p>}
           </div>
           <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
               {data.chartType === 'bar' && <BarChart3 size={20} />}
               {data.chartType === 'pie' && <PieChart size={20} />}
               {data.chartType === 'radar' && <Target size={20} />}
           </div>
       </div>

       <div className="w-full h-[350px]">
           <ResponsiveContainer width="100%" height="100%">
               {data.chartType === 'bar' ? (
                   <BarChart data={processedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                       <XAxis 
                         dataKey={data.config?.xKey || 'name'} 
                         axisLine={false} 
                         tickLine={false} 
                         tick={{ fill: '#64748b', fontSize: 12 }} 
                         tickFormatter={(val) => safeString(val)}
                         dy={10}
                       />
                       <YAxis 
                         axisLine={false} 
                         tickLine={false} 
                         tick={{ fill: '#64748b', fontSize: 12 }} 
                       />
                       <Tooltip 
                         formatter={tooltipFormatter}
                         cursor={{ fill: '#f8fafc' }}
                         contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                       />
                       <Legend />
                       <Bar 
                         dataKey={data.config?.yKey || 'value'} 
                         fill="#db2777" 
                         radius={[4, 4, 0, 0]} 
                         name={data.config?.yKey ? String(data.config.yKey).replace(/_/g, ' ') : 'Value'}
                       />
                   </BarChart>
               ) : data.chartType === 'pie' ? (
                   <RePieChart>
                        <Pie
                           data={processedData}
                           cx="50%"
                           cy="50%"
                           innerRadius={60}
                           outerRadius={100}
                           fill="#8884d8"
                           paddingAngle={2}
                           dataKey={data.config?.valueKey || 'value'}
                           nameKey={data.config?.nameKey || 'name'}
                           label={({name, percent}) => `${safeString(name)} ${(percent * 100).toFixed(0)}%`}
                        >
                           {processedData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} stroke="white" strokeWidth={2} />
                           ))}
                        </Pie>
                        <Tooltip formatter={tooltipFormatter} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend verticalAlign="bottom" height={36}/>
                   </RePieChart>
               ) : (
                   /* Radar Chart (Spider Chart) */
                   <RadarChart cx="50%" cy="50%" outerRadius="80%" data={processedData}>
                       <PolarGrid stroke="#e2e8f0" />
                       <PolarAngleAxis dataKey={data.config?.nameKey || 'subject'} tick={{ fill: '#64748b', fontSize: 11 }} />
                       <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                       <Radar
                           name="Strategy Score"
                           dataKey={data.config?.valueKey || 'A'}
                           stroke="#db2777"
                           fill="#db2777"
                           fillOpacity={0.5}
                       />
                       <Tooltip formatter={tooltipFormatter} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                       <Legend />
                   </RadarChart>
               )}
           </ResponsiveContainer>
       </div>
    </div>
  );
};

// ... [ThemesWidget, SimulatedPlayer, FileSlot, LayerInputGroup, StrategicCard, SimulationWidget remain unchanged] ...
const ThemesWidget = ({ themes, logic, onThemeSelect }: { themes: VideoTheme[], logic?: string, onThemeSelect: (theme: VideoTheme) => void }) => {
  return (
    <div className="flex flex-col gap-4 w-full">
       <div className="flex items-center gap-2 text-slate-700 mb-1">
          <Clapperboard className="text-pink-600" size={20} />
          <h3 className="font-bold text-lg">Recommended Video Themes</h3>
       </div>
       
       {logic && (
           <div className="bg-pink-50 border border-pink-100 rounded-lg p-4 mb-2 text-sm text-slate-700 leading-relaxed italic animate-in fade-in slide-in-from-top-2">
               <span className="font-semibold text-pink-700 not-italic">Strategic Logic: </span>
               {safeString(logic)}
           </div>
       )}

       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {themes.map((theme) => (
             <div 
               key={theme.id} 
               onClick={() => onThemeSelect(theme)}
               onDoubleClick={() => onThemeSelect(theme)}
               className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-lg hover:border-pink-300 transition-all group relative overflow-hidden cursor-pointer active:scale-95"
             >
                <div className="absolute top-0 right-0 w-16 h-16 bg-pink-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                
                <div className="relative z-10">
                   <div className="flex justify-between items-start mb-2">
                      <span className="inline-block px-2 py-0.5 bg-pink-100 text-pink-700 text-[10px] font-bold uppercase tracking-wider rounded-sm">
                         Theme {theme.id}
                      </span>
                      <ArrowUpRight size={16} className="text-pink-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                   </div>
                   
                   <h4 className="font-bold text-slate-800 text-base mb-2 leading-tight group-hover:text-pink-700 transition-colors">
                      {safeString(theme.title)} 
                      {theme.shortTag && (
                          <span className="ml-2 font-normal text-slate-500 text-sm italic">
                              ({safeString(theme.shortTag)})
                          </span>
                      )}
                   </h4>
                   
                   {/* Full text shown - allow 4 lines */}
                   <p className="text-xs text-slate-600 mb-4 leading-relaxed line-clamp-4 font-medium opacity-90">
                      {safeString(theme.rationale)}
                   </p>
                   
                   <div className="space-y-2 pt-3 border-t border-slate-50">
                      <div className="flex items-start gap-2">
                         <Heart size={12} className="text-rose-500 mt-0.5 shrink-0" />
                         <span className="text-xs text-slate-600 italic">"{safeString(theme.emotionalHook)}"</span>
                      </div>
                      <div className="flex items-start gap-2">
                         <Users size={12} className="text-blue-500 mt-0.5 shrink-0" />
                         <span className="text-xs text-slate-600 font-medium">{safeString(theme.targetAudience)}</span>
                      </div>
                   </div>
                </div>
             </div>
          ))}
       </div>
    </div>
  );
};

const SimulatedPlayer = ({ 
  title, 
  subtitle, 
  playlist,
  onClose,
  autoPlay = false,
}: { 
  title: string, 
  subtitle: string, 
  playlist: PlaylistItem[],
  onClose?: () => void,
  autoPlay?: boolean,
}) => {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(false); // Default unmuted for experience
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const currentItem = playlist[currentIndex];

  // Auto-advance logic
  const handleVideoEnded = () => {
      if (currentIndex < playlist.length - 1) {
          setCurrentIndex(prev => prev + 1);
          setProgress(0);
      } else {
          setIsPlaying(false); // Stop at end
      }
  };

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(e => console.log("Autoplay prevented:", e));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, currentIndex]);

  // Update progress bar
  useEffect(() => {
      const vid = videoRef.current;
      const updateProgress = () => {
          if (vid && vid.duration) {
              setProgress((vid.currentTime / vid.duration) * 100);
          }
      };
      if (vid) {
          vid.addEventListener('timeupdate', updateProgress);
          return () => vid.removeEventListener('timeupdate', updateProgress);
      }
  }, [currentIndex]);


  const handlePlayToggle = () => {
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl flex flex-col group border border-slate-800 animate-in fade-in zoom-in-95 duration-300">
      {/* Close Button if modal */}
      {onClose && (
        <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors border border-white/10"
        >
          <X size={20} />
        </button>
      )}

      {/* Video Layer */}
      <div className="absolute inset-0 bg-black" onClick={handlePlayToggle}>
        <video 
            key={`${currentIndex}-${currentItem?.url}`} // Combine index and url to force remount
            ref={videoRef}
            src={currentItem?.url || SAMPLE_VIDEO_URL}
            className={`w-full h-full object-cover transition-opacity duration-700 ${isPlaying ? 'opacity-100' : 'opacity-40'}`}
            // Removed 'loop' to allow chaining
            muted={isMuted}
            playsInline
            onEnded={handleVideoEnded}
        />
        {/* Dark overlay when paused to make text pop */}
        <div className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${isPlaying ? 'opacity-0' : 'opacity-100'}`}></div>
      </div>

      {/* Main Content Overlay Area - CLEARED FOR CLEAN VIDEO */}
      <div className="flex-1 relative flex flex-col justify-between pointer-events-none z-10">
         
         {/* Top Controls/Info */}
         <div className="p-6 flex justify-between items-start">
             <div className="absolute top-6 right-16 flex gap-1 z-20">
                 {playlist.length > 1 && playlist.map((_, idx) => (
                     <div key={idx} className={`w-3 h-1 rounded-full ${idx === currentIndex ? 'bg-pink-500' : 'bg-white/20'}`}></div>
                 ))}
             </div> 
         </div>

         {/* Center Play Button - Only show when paused */}
         <div className="absolute inset-0 flex items-center justify-center pointer-events-auto" onClick={handlePlayToggle}>
            {!isPlaying && (
            <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 hover:scale-110 transition-transform shadow-xl shadow-pink-500/20 cursor-pointer group-hover:bg-pink-600/80 group-hover:border-pink-500">
                <Play size={36} className="text-white fill-current ml-2" />
            </div>
            )}
         </div>

         {/* NO BOTTOM TEXT OVERLAYS HERE AS REQUESTED */}
      </div>

      {/* Controls Bar - Always available on hover/pause */}
      <div className="h-16 bg-gradient-to-t from-black via-black/80 to-transparent absolute bottom-0 left-0 right-0 flex items-center px-6 gap-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
         <button onClick={(e) => { e.stopPropagation(); handlePlayToggle(); }} className="text-white hover:text-pink-500 transition-colors p-2">
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
         </button>
         
         <div className="text-xs font-mono text-white/90 min-w-[60px] font-medium">
            Scene {currentIndex + 1}
         </div>

         {/* Progress Bar */}
         <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-pink-500 transition-all duration-100 ease-linear shadow-[0_0_15px_rgba(236,72,153,0.8)]" style={{ width: `${progress}%` }}></div>
         </div>

         <div className="flex gap-4 text-white/90 items-center">
             <button 
                onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                className="hover:text-pink-400 transition-colors"
             >
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
             </button>
         </div>
      </div>
    </div>
  );
};

const FileSlot: React.FC<{ 
  fileName: string; 
  isUploaded: boolean; 
  isSelected: boolean; 
  onClick: () => void;
  onToggle: (e: React.MouseEvent) => void;
}> = ({ fileName, isUploaded, isSelected, onClick, onToggle }) => {
  return (
    <div
      className={`
        w-full flex items-center justify-between p-2.5 rounded-md border text-left transition-all duration-200 group relative overflow-hidden
        ${isUploaded 
          ? 'bg-pink-50/50 border-pink-200' 
          : 'bg-white border-slate-200 hover:border-pink-300 hover:shadow-sm'}
      `}
    >
      <button onClick={onClick} className="flex items-center gap-2.5 overflow-hidden z-10 flex-1 text-left">
        <div className={`
          p-1.5 rounded shrink-0 transition-colors
          ${isUploaded ? 'text-pink-600 bg-pink-100' : 'text-slate-400 group-hover:text-pink-500 group-hover:bg-pink-50'}
        `}>
          {isUploaded ? <CheckCircle2 size={14} /> : <Circle size={14} />}
        </div>
        <span className={`text-xs font-medium truncate ${isUploaded ? 'text-pink-900' : 'text-slate-600'}`}>
          {fileName}
        </span>
      </button>

      {isUploaded && (
          <div 
            onClick={onToggle}
            className="cursor-pointer p-1 text-pink-600 hover:text-pink-800 transition-colors"
            title={isSelected ? "Include in Analysis" : "Exclude from Analysis"}
          >
             {isSelected ? <Disc size={16} fill="currentColor" /> : <Circle size={16} />}
          </div>
      )}
    </div>
  );
};

const LayerInputGroup: React.FC<{ 
  layer: typeof DATA_LAYERS[0]; 
  onDataChange: (files: Record<string, string>) => void; 
}> = ({ 
  layer, 
  onDataChange 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = usePersistentState<Record<string, string>>(`files_${layer.id}`, {});
  // Auto-collapse if complete, auto-expand if empty
  const [isExpanded, setIsExpanded] = useState(Object.keys(uploadedFiles).length === 0);
  
  useEffect(() => {
     onDataChange(uploadedFiles);
  }, [uploadedFiles]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Loop through all selected files
      Array.from(files).forEach((file: File) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              setUploadedFiles(prev => ({ ...prev, [file.name]: event.target!.result as string }));
            }
          };
          reader.readAsText(file);
      });
    }
    if (e.target) e.target.value = '';
  };

  const uploadCount = Object.keys(uploadedFiles).length;
  const totalCount = layer.files.length;
  const progress = (uploadCount / totalCount) * 100;
  const isComplete = uploadCount === totalCount;

  return (
    <div className={`bg-white rounded-xl border ${isComplete ? 'border-slate-200' : layer.borderColor} overflow-hidden shadow-sm hover:shadow-md transition-all`}>
       {/* Header */}
       <div 
         className={`px-4 py-3 border-b border-slate-100 flex items-center justify-between cursor-pointer ${isExpanded ? 'bg-opacity-10 ' + layer.color : 'bg-white hover:bg-slate-50'}`}
         onClick={() => setIsExpanded(!isExpanded)}
       >
          <div className="flex items-center gap-3">
             <div className={`p-1.5 rounded-lg ${layer.color} text-white shadow-sm`}>
                <layer.icon size={16} />
             </div>
             <div>
                <h4 className={`text-xs font-bold ${layer.textColor} tracking-wide uppercase`}>{layer.title}</h4>
                <p className="text-[10px] text-slate-500 font-medium">{layer.subtitle}</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
             {isComplete && <CheckCircle2 size={16} className="text-emerald-500" />}
             <div className="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded-full border border-slate-100 shadow-sm">
                {uploadCount}/{totalCount}
             </div>
             <ChevronDown size={16} className={`text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
       </div>
       
       {/* Progress Bar */}
       <div className="h-0.5 w-full bg-slate-100">
          <div className={`h-full transition-all duration-700 ${layer.color}`} style={{ width: `${progress}%` }}></div>
       </div>

       {/* Collapsible Content */}
       <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
           {/* File Slots */}
           <div className="p-3 flex flex-col gap-2">
              {layer.files.map(fileName => (
                 <FileSlot 
                    key={fileName}
                    fileName={fileName}
                    isUploaded={!!uploadedFiles[fileName]}
                    isSelected={true}
                    onClick={() => !uploadedFiles[fileName] && fileInputRef.current?.click()}
                    onToggle={() => {}}
                 />
              ))}
           </div>

           {/* Upload Action */}
           <div className="p-3 border-t border-slate-50 bg-slate-50/50">
              <button 
                 onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                 className="w-full flex items-center justify-center gap-2 text-[10px] font-bold text-slate-500 hover:text-pink-600 bg-white border border-slate-200 hover:border-pink-200 rounded-lg py-2 transition-all active:scale-95 shadow-sm"
              >
                 <Upload size={12} /> UPLOAD LAYER DATA
              </button>
              <input type="file" ref={fileInputRef} className="hidden" multiple accept=".csv,.txt" onChange={handleFileChange} />
           </div>
       </div>
    </div>
  );
};

const StrategicCard = ({ 
  title, 
  description, 
  icon: Icon, 
  onClick, 
  colorClass, 
  textColor
}: { 
  title: string; 
  description: string; 
  icon: any; 
  onClick: () => void; 
  colorClass: string;
  textColor: string; 
}) => (
  <button 
    onClick={onClick}
    className="group flex flex-col items-start text-left bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-pink-200/50 transition-all duration-300 h-full relative overflow-hidden"
  >
    <div className={`
      absolute top-0 right-0 p-20 ${colorClass} bg-opacity-5 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110 duration-500
    `}></div>
    
    <div className={`p-2.5 rounded-xl ${colorClass} bg-opacity-10 mb-4 group-hover:scale-110 transition-transform duration-300 z-10`}>
      <Icon size={20} className={textColor} />
    </div>
    
    <h3 className="font-semibold text-slate-800 mb-2 z-10 flex items-center gap-2">
      {title}
      <ArrowUpRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300 text-slate-400" />
    </h3>
    <p className="text-xs text-slate-500 leading-relaxed z-10">{description}</p>
  </button>
);

const SimulationWidget = ({ data }: { data: SimulationData }) => {
  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Synthesis Header */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-2xl shadow-xl relative overflow-hidden border border-gray-700/50">
        <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl -mr-10 -mt-20"></div>
        
        {/* Header Bar with Dots */}
        <div className="bg-white/5 px-6 py-3 border-b border-white/10 flex items-center justify-between relative z-10">
           <WindowControls />
           <div className="text-[10px] font-medium tracking-widest uppercase text-white/40">Scenario Synthesis</div>
        </div>

        <div className="relative z-10 p-8">
          <div className="flex items-center gap-3 mb-4">
             <div className="p-2 bg-pink-500/20 rounded-lg text-pink-300">
               <HeartHandshake size={24} />
             </div>
             <h3 className="text-2xl font-bold text-white tracking-tight">Executive Summary</h3>
          </div>
          <div 
             className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed [&>p]:mb-4" 
             dangerouslySetInnerHTML={safeRenderMarkdown(data.synthesis)} 
          />
        </div>
      </div>

      {/* 4-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        
        {/* Top End Growth */}
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm flex flex-col overflow-hidden group hover:shadow-md transition-all">
          <div className="bg-emerald-50/50 px-5 py-4 border-b border-emerald-100 flex items-center gap-3">
             <div className="p-2 bg-white rounded-lg text-emerald-600 shadow-sm"><TrendingUp size={18} /></div>
             <h4 className="font-bold text-emerald-900 text-sm">Top-End Growth</h4>
          </div>
          <div className="p-5 flex-1 bg-gradient-to-b from-white to-emerald-50/10">
             <div className="markdown-body text-sm text-slate-600 space-y-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ul>li]:marker:text-emerald-500" dangerouslySetInnerHTML={safeRenderMarkdown(data.topEnd)} />
          </div>
        </div>

        {/* Bottom End Growth */}
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm flex flex-col overflow-hidden group hover:shadow-md transition-all">
          <div className="bg-blue-50/50 px-5 py-4 border-b border-blue-100 flex items-center gap-3">
             <div className="p-2 bg-white rounded-lg text-blue-600 shadow-sm"><PieChart size={18} /></div>
             <h4 className="font-bold text-blue-900 text-sm">Bottom-End Growth</h4>
          </div>
          <div className="p-5 flex-1 bg-gradient-to-b from-white to-blue-50/10">
             <div className="markdown-body text-sm text-slate-600 space-y-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ul>li]:marker:text-blue-500" dangerouslySetInnerHTML={safeRenderMarkdown(data.bottomEnd)} />
          </div>
        </div>

        {/* Customer Experience */}
        <div className="bg-white rounded-2xl border border-pink-100 shadow-sm flex flex-col overflow-hidden group hover:shadow-md transition-all">
          <div className="bg-pink-50/50 px-5 py-4 border-b border-pink-100 flex items-center gap-3">
             <div className="p-2 bg-white rounded-lg text-pink-600 shadow-sm"><Heart size={18} /></div>
             <h4 className="font-bold text-pink-900 text-sm">Patient Empathy & CX</h4>
          </div>
          <div className="p-5 flex-1 bg-gradient-to-b from-white to-pink-50/10">
             <div className="markdown-body text-sm text-slate-600 space-y-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ul>li]:marker:text-pink-500" dangerouslySetInnerHTML={safeRenderMarkdown(data.cxImpact)} />
          </div>
        </div>

        {/* Constraints & Risks */}
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm flex flex-col overflow-hidden group hover:shadow-md transition-all">
          <div className="bg-amber-50/50 px-5 py-4 border-b border-amber-100 flex items-center gap-3">
             <div className="p-2 bg-white rounded-lg text-amber-600 shadow-sm"><Scale size={18} /></div>
             <h4 className="font-bold text-amber-900 text-sm">Challenges & Anxiety</h4>
          </div>
          <div className="p-5 flex-1 bg-gradient-to-b from-white to-amber-50/10">
             <div className="markdown-body text-sm text-slate-600 space-y-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ul>li]:marker:text-amber-500" dangerouslySetInnerHTML={safeRenderMarkdown(data.constraints)} />
          </div>
        </div>

      </div>
    </div>
  );
};

// ... [CityContentStudio, App remain mostly unchanged except for Header button removal] ...
const CityContentStudio = ({ 
  onGenerateThemes, 
  onGenerateScript,
  isLoading,
  dataContext
}: { 
  onGenerateThemes: (city: string, strategy: string, dataContext: string) => Promise<{ themes: VideoTheme[], selectionLogic?: string } | null>;
  onGenerateScript: (theme: VideoTheme, city: string) => Promise<ScriptSegment[] | null>;
  isLoading: boolean;
  dataContext: string;
}) => {
  const [city, setCity] = usePersistentState('studio_city', '');
  const [strategy, setStrategy] = usePersistentState('studio_strategy', '');
  const [themes, setThemes] = usePersistentState<VideoTheme[] | null>('studio_themes', null);
  const [scriptSegments, setScriptSegments] = usePersistentState<ScriptSegment[] | null>('studio_scripts', null);
  const [selectedTheme, setSelectedTheme] = usePersistentState<VideoTheme | null>('studio_selected_theme', null);
  const [selectionLogic, setSelectionLogic] = usePersistentState('studio_logic', '');
  
  const [isPlayingFullStoryboard, setIsPlayingFullStoryboard] = useState(false);
  const [previewSegment, setPreviewSegment] = useState<ScriptSegment | null>(null);
  
  // Per-segment video generation state - Changed to Record for independence
  const [segmentVideos, setSegmentVideos] = useState<Record<number, string>>({});
  const [generatingSegments, setGeneratingSegments] = useState<Record<number, boolean>>({});
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  const handleSearch = async () => {
    if (!city.trim()) return;
    setThemes(null);
    setScriptSegments(null);
    setSelectedTheme(null);
    setSelectionLogic('');
    setIsPlayingFullStoryboard(false);
    setPreviewSegment(null);
    const result = await onGenerateThemes(city, strategy, dataContext);
    if (result) {
        setThemes(result.themes);
        setSelectionLogic(result.selectionLogic || '');
    }
  };

  const handleThemeSelect = async (theme: VideoTheme) => {
    setSelectedTheme(theme);
    setScriptSegments(null);
    setIsPlayingFullStoryboard(false);
    setPreviewSegment(null);
    setSegmentVideos({});
    const result = await onGenerateScript(theme, city);
    if (result) setScriptSegments(result);
  };

  const generateVideoForSegment = async (segment: ScriptSegment): Promise<'SUCCESS' | 'FAILED' | 'QUOTA'> => {
       // Check if we already have it
       if (segmentVideos[segment.seq]) return 'SUCCESS';

       try {
            // Key Selection Logic
            if (typeof window !== 'undefined' && 'aistudio' in window && (window as any).aistudio) {
                const studio = (window as any).aistudio;
                const hasKey = await studio.hasSelectedApiKey();
                if (!hasKey) await studio.openSelectKey();
            }
            
            // Re-instantiate AI to get latest key if environment injected it
            const apiKey = getApiKey();
            if (!apiKey) {
                alert("⚠️ API Key missing. Please set GEMINI_API_KEY in App Runner environment variables.");
                return 'FAILED';
            }
            const ai = new GoogleGenAI({ apiKey });
            
            const prompt = `Cinematic video: ${segment.visual}. High quality, photorealistic, 4k. No text on screen, no typography, clean video footage only. Indian context, empathetic lighting.`;
            
            let operation = await ai.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt: prompt,
                config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
            });
            
            // Polling - FAST VIDEO OPTIMIZATION
            // Reduced to 2s polling for faster responsiveness
            let retries = 0;
            while (!operation.done && retries < 150) { // 5 minutes max (150 * 2s)
                await new Promise(r => setTimeout(r, 2000));
                operation = await ai.operations.getVideosOperation({operation});
                retries++;
            }
            
            const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
            if (uri) {
                // Ensure key is present for fetch
                if (!apiKey) throw new Error("API Key missing for video download");

                const res = await fetch(`${uri}&key=${apiKey}`);
                if (!res.ok) throw new Error(`Video fetch failed: ${res.statusText}`);
                
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                setSegmentVideos(prev => ({...prev, [segment.seq]: url}));
                return 'SUCCESS';
            }
            return 'FAILED';
       } catch (e: any) {
           console.error("Video Gen Error", e);
           
           // Check for quota error
           const errString = JSON.stringify(e);
           if (errString.includes('429') || errString.includes('RESOURCE_EXHAUSTED')) {
               alert("⚠️ Video Generation Quota Exceeded.\n\nPlease wait a minute before trying again, or check your billing plan.");
               return 'QUOTA';
           }
           
           return 'FAILED';
       }
  };

  const handleGenerateSegmentVideo = async (segment: ScriptSegment) => {
    setGeneratingSegments(prev => ({ ...prev, [segment.seq]: true }));
    await generateVideoForSegment(segment);
    setGeneratingSegments(prev => ({ ...prev, [segment.seq]: false }));
  };

  const handleGenerateAllAndPlay = async () => {
    if (!scriptSegments) return;
    setIsGeneratingAll(true);
    
    // Process sequentially to respect rate limits if needed, or parallel if quota allows
    // We'll do sequential to be safer with standard quotas
    for (const seg of scriptSegments) {
        if (!segmentVideos[seg.seq]) {
            setGeneratingSegments(prev => ({ ...prev, [seg.seq]: true }));
            const status = await generateVideoForSegment(seg);
            setGeneratingSegments(prev => ({ ...prev, [seg.seq]: false }));
            
            if (status === 'QUOTA') {
                setIsGeneratingAll(false);
                return; // Stop processing rest of queue
            }
        }
    }
    setIsGeneratingAll(false);
    setIsPlayingFullStoryboard(true);
  };

  // Compile playlist
  const fullPlaylist: PlaylistItem[] = scriptSegments?.map(seg => ({
      segment: seg,
      url: segmentVideos[seg.seq]
  })).filter(item => item.url) || [];

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      {/* 1. Input Section */}
      <div className="bg-white rounded-2xl p-8 border border-pink-100 shadow-sm flex flex-col gap-6">
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
             <div className="flex-1 w-full">
                <label className="block text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
                   <MapPin size={16} className="text-pink-500"/> Target region
                </label>
                <div className="relative">
                   <input 
                     type="text" 
                     value={typeof city === 'string' ? city : ''}
                     onChange={(e) => setCity(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                     placeholder="e.g. Jaipur, Patna, Indore..."
                     className="w-full text-xl font-bold text-slate-800 placeholder-slate-300 bg-slate-50 border-2 border-slate-100 rounded-xl px-6 py-4 focus:outline-none focus:border-pink-500 focus:bg-white transition-all"
                   />
                   <div className="absolute right-4 top-1/2 -translate-y-1/2">
                     {isLoading && !themes && !scriptSegments ? <Loader2 className="animate-spin text-pink-500" /> : <Command size={20} className="text-slate-300" />}
                   </div>
                </div>
             </div>
             
             <div className="flex-1 w-full">
                <label className="block text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
                   <Lightbulb size={16} className="text-amber-500"/> Any additional strategy to benchmark? (optional)
                </label>
                <div className="relative">
                   <input 
                     type="text" 
                     value={typeof strategy === 'string' ? strategy : ''}
                     onChange={(e) => setStrategy(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                     placeholder="e.g. Focus on low cost, donor cycles, or new center launch..."
                     className="w-full text-xl font-bold text-slate-800 placeholder-slate-300 bg-slate-50 border-2 border-slate-100 rounded-xl px-6 py-4 focus:outline-none focus:border-pink-500 focus:bg-white transition-all"
                   />
                </div>
             </div>
         </div>
         
         <button 
           onClick={handleSearch}
           disabled={isLoading || !city.trim()}
           className="w-full px-8 py-5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white font-bold rounded-xl shadow-lg shadow-pink-200 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
         >
            <Sparkles size={20} /> Generate Video Strategy
         </button>
      </div>

      {/* 2. Themes Grid */}
      {themes && !scriptSegments && !isLoading && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
           <ThemesWidget themes={themes} logic={selectionLogic} onThemeSelect={handleThemeSelect} />
        </div>
      )}

      {/* Loading Script State */}
      {isLoading && themes && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 size={40} className="animate-spin text-pink-500 mb-4" />
              <p className="font-medium animate-pulse">Crafting script segments & visual storyboard...</p>
          </div>
      )}

      {/* 3. Script Breakdown & Stitching */}
      {scriptSegments && selectedTheme && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                  <div>
                      <button onClick={() => setScriptSegments(null)} className="text-xs font-bold text-slate-400 hover:text-pink-600 mb-1 flex items-center gap-1">
                          <ArrowUpRight size={12} className="rotate-180" /> Back to Themes
                      </button>
                      <h2 className="text-2xl font-bold text-slate-800">Storyboard: <span className="text-pink-600">{selectedTheme.title}</span></h2>
                  </div>
                  
                  {/* Generate All / Play All Button */}
                  <div className="flex gap-2">
                    {fullPlaylist.length < scriptSegments.length ? (
                         <button 
                            onClick={handleGenerateAllAndPlay}
                            disabled={isGeneratingAll}
                            className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-70"
                          >
                             {isGeneratingAll ? <Loader2 size={18} className="animate-spin" /> : <Film size={18} />}
                             {isGeneratingAll ? `Generating Scenes...` : "Generate All Scenes"}
                          </button>
                    ) : (
                         <button 
                            onClick={() => setIsPlayingFullStoryboard(true)}
                            className="px-6 py-3 bg-pink-600 text-white font-bold rounded-xl shadow-lg hover:bg-pink-700 transition-all active:scale-95 flex items-center gap-2"
                          >
                             <PlayCircle size={18} />
                             Play Full Storyboard
                          </button>
                    )}
                  </div>
              </div>

              {/* End-to-End Player Modal */}
              {isPlayingFullStoryboard && fullPlaylist.length > 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={() => setIsPlayingFullStoryboard(false)}>
                   <div className="w-full max-w-5xl" onClick={e => e.stopPropagation()}>
                      <SimulatedPlayer 
                         title={selectedTheme.title}
                         subtitle={`End-to-End Storyboard • ${city} Edition • Veo 3 Generated`}
                         playlist={fullPlaylist}
                         onClose={() => setIsPlayingFullStoryboard(false)}
                         autoPlay={true}
                      />
                   </div>
                </div>
              )}

              {/* Individual Scene Player Modal */}
              {previewSegment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setPreviewSegment(null)}>
                   <div className="w-full max-w-4xl" onClick={e => e.stopPropagation()}>
                      <SimulatedPlayer 
                         title={`Scene ${previewSegment.seq}`}
                         subtitle={`Single Scene Preview • ${selectedTheme.title}`}
                         playlist={[{ url: segmentVideos[previewSegment.seq], segment: previewSegment }]}
                         onClose={() => setPreviewSegment(null)}
                         autoPlay={true}
                      />
                   </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {scriptSegments.map((seg) => (
                      <div key={seg.seq} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col group hover:shadow-md transition-all relative">
                          
                          {/* Thumbnail Area with Preview Button */}
                          <div className="h-32 bg-slate-100 relative flex items-center justify-center border-b border-slate-100 group-hover:bg-slate-50 transition-colors overflow-hidden">
                              {/* Thumbnail simulation */}
                              <div className="absolute inset-0 bg-gradient-to-br from-slate-200 to-slate-300">
                                  {/* Abstract shapes to look like video thumbnail */}
                                  <div className="absolute top-1/2 left-1/4 w-20 h-20 bg-pink-500/10 rounded-full blur-xl"></div>
                                  <div className="absolute bottom-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-xl"></div>
                              </div>
                              
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center z-10">
                                  <button 
                                    onClick={() => {
                                        if (segmentVideos[seg.seq]) setPreviewSegment(seg);
                                        else handleGenerateSegmentVideo(seg);
                                    }}
                                    disabled={generatingSegments[seg.seq]}
                                    className="opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100 transition-all bg-white/90 text-pink-600 rounded-full p-3 shadow-lg hover:bg-white disabled:opacity-70 disabled:cursor-wait"
                                  >
                                     {generatingSegments[seg.seq] ? <Loader2 size={24} className="animate-spin" /> : <Play size={24} fill="currentColor" />}
                                  </button>
                              </div>
                              
                              <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/50 text-white text-[10px] font-bold rounded backdrop-blur-sm z-20">
                                  {seg.duration}
                              </div>
                              <div className="absolute top-2 right-2 px-2 py-0.5 bg-pink-600 text-white text-[10px] font-bold rounded shadow-sm z-20">
                                  Seq {seg.seq}
                              </div>
                          </div>

                          <div className="p-4 flex flex-col gap-3 flex-1">
                              <div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Visual Scene</p>
                                  <p className="text-xs text-slate-700 font-medium leading-relaxed line-clamp-3" title={seg.visual}>{seg.visual}</p>
                              </div>
                              <div className="pt-3 border-t border-slate-50 mt-auto">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Audio / VO</p>
                                  <p className="text-xs text-slate-600 italic leading-relaxed line-clamp-2">"{seg.audio}"</p>
                              </div>
                              <button 
                                 onClick={() => {
                                    if(segmentVideos[seg.seq]) setPreviewSegment(seg);
                                    else handleGenerateSegmentVideo(seg);
                                 }}
                                 disabled={generatingSegments[seg.seq]}
                                 className={`mt-2 w-full py-2 text-xs font-bold rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-70
                                     ${segmentVideos[seg.seq] ? 'bg-pink-100 text-pink-700 hover:bg-pink-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                                 `}
                              >
                                 {generatingSegments[seg.seq] ? (
                                     <><Loader2 size={12} className="animate-spin" /> Generating Veo Video...</>
                                 ) : (
                                     <><Play size={12} /> {segmentVideos[seg.seq] ? "Play Clip" : "Generate Clip"}</>
                                 )}
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}
    </div>
  );
};

// ============================================
// Authentication API Client
// ============================================
const API_BASE = '/api';

interface AuthUser {
  email: string;
  role: 'admin' | 'user';
  createdAt?: string;
  lastLogin?: string;
}

interface User {
  _id: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
  lastLogin?: string;
  accessibleFiles?: string[];
  fileCount?: number;
}

interface CSVFile {
  _id?: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  uploadedAt: string;
  isActive: boolean;
}

// API Functions
const authAPI = {
  async login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      // Check if response is actually JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Server returned non-JSON response. Make sure the Express server is running on port 5005. Response: ${text.substring(0, 200)}`);
      }
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }));
        throw new Error(error.error || 'Login failed');
      }
      
      return await res.json();
    } catch (err: any) {
      if (err.message && err.message.includes('JSON')) {
        
        throw new Error('Cannot connect to server. Please make sure the Express server is running on port 5005. Run: npm run dev:server');
      }
      throw err;
    }
  },

  async getCurrentUser(): Promise<AuthUser> {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Not authenticated');
    
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        throw new Error('Session expired');
      }
      const error = await res.json();
      throw new Error(error.error || 'Failed to get user');
    }
    return res.json();
  },

  async logout(): Promise<void> {
    const token = localStorage.getItem('auth_token');
    if (token) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {
        // Ignore errors on logout
      }
    }
    localStorage.removeItem('auth_token');
  },

  async getAllUsers(): Promise<User[]> {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Not authenticated');
    
    const res = await fetch(`${API_BASE}/admin/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get users');
    }
    return res.json();
  },

  async addUser(email: string, password: string, role: 'admin' | 'user' = 'user', accessibleFiles: string[] = []): Promise<User> {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Not authenticated');
    
    const res = await fetch(`${API_BASE}/admin/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password, role, accessibleFiles })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to add user');
    }
    return res.json();
  },

  async deleteUser(email: string): Promise<void> {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Not authenticated');
    
    const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to delete user');
    }
  },

  async updateUserRole(email: string, role: 'admin' | 'user'): Promise<void> {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Not authenticated');
    
    const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(email)}/role`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to update user role');
    }
  },

  async getAllFiles(): Promise<CSVFile[]> {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Not authenticated');
    
    const res = await fetch(`${API_BASE}/admin/files`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to load files');
    }
    return res.json();
  },

  async uploadFile(file: File): Promise<CSVFile> {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Not authenticated');
    
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch(`${API_BASE}/admin/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to upload file');
    }
    return res.json();
  },

  async getUserFiles(email: string): Promise<string[]> {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Not authenticated');
    
    const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(email)}/files`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to load user files');
    }
    return res.json();
  },

  async updateUserFiles(email: string, fileNames: string[]): Promise<void> {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Not authenticated');
    
    const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(email)}/files`, {
      method: 'PUT',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileNames })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to update user files');
    }
  },

  async getUserAccessibleFiles(): Promise<string[]> {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return [];
      
      const res = await fetch(`${API_BASE}/user/files`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        // If endpoint doesn't exist or user is admin, return empty array (all files accessible)
        return [];
      }
      
      const files = await res.json();
      // Handle both array of strings and array of objects
      if (Array.isArray(files)) {
        return files.map((f: any) => typeof f === 'string' ? f : (f.fileName || f.name || f));
      }
      return [];
    } catch (err) {
      console.error('Error fetching accessible files:', err);
      return [];
    }
  }
};

// ============================================
// Logo Component (Reusable)
// ============================================
// ============================================
// Login Logo Component (with Brain icon fallback)
// ============================================
const LoginLogo = () => {
  const [logoError, setLogoError] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedRef = useRef(false);

  // Check if image is already loaded (cached)
  useEffect(() => {
    if (imgRef.current) {
      if (imgRef.current.complete && imgRef.current.naturalHeight !== 0) {
        hasLoadedRef.current = true;
        setLogoLoaded(true);
        setLogoError(false);
      }
    }
    
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  if (logoError && !hasLoadedRef.current) {
    return (
      <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl">
        <Brain className="w-8 h-8 text-white" />
      </div>
    );
  }

  return (
    <img 
      ref={imgRef}
      src="/assets/indira-logo.avif" 
      alt="INDIRA IVF FERTILITY & IVF CENTRE" 
      className="h-40 object-contain"
      onError={(e) => {
        if (hasLoadedRef.current) return;
        
        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
        }
        
        const img = e.target as HTMLImageElement;
        if (img.complete && img.naturalHeight > 0) {
          hasLoadedRef.current = true;
          setLogoLoaded(true);
          setLogoError(false);
        } else {
          errorTimeoutRef.current = setTimeout(() => {
            if (imgRef.current && !hasLoadedRef.current) {
              if (!imgRef.current.complete || imgRef.current.naturalHeight === 0) {
                setLogoError(true);
              }
            }
          }, 300);
        }
      }}
      onLoad={() => {
        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
          errorTimeoutRef.current = null;
        }
        hasLoadedRef.current = true;
        setLogoLoaded(true);
        setLogoError(false);
      }}
    />
  );
};

// ============================================
// Logo Component (Reusable)
// ============================================
const IndiraLogo = ({ className = "h-12", showFallback = true }: { className?: string; showFallback?: boolean }) => {
  const [logoError, setLogoError] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedRef = useRef(false);

  // Check if image is already loaded (cached)
  useEffect(() => {
    if (imgRef.current) {
      // If image is already loaded (cached), mark as loaded immediately
      if (imgRef.current.complete && imgRef.current.naturalHeight !== 0) {
        hasLoadedRef.current = true;
        setLogoLoaded(true);
        setLogoError(false);
      }
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  // Only show fallback if error occurred AND image never loaded
  if (logoError && !hasLoadedRef.current && showFallback) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex flex-col leading-none">
          <span className="text-2xl font-bold text-[#9D174D] tracking-tight">INDIRA</span>
          <span className="text-sm font-semibold text-slate-600 tracking-wider">FERTILITY & IVF CENTRE</span>
        </div>
        <div className="h-10 w-px bg-pink-200 mx-2"></div>
        <div className="text-xl font-bold text-[#BE185D]">GPT</div>
      </div>
    );
  }

  return (
    <img 
      ref={imgRef}
      src="/assets/indira-logo.avif" 
      alt="INDIRA IVF FERTILITY & IVF CENTRE" 
      className={className + " object-contain"}
      onError={(e) => {
        // If image already loaded successfully, ignore error
        if (hasLoadedRef.current) {
          return;
        }
        
        // Clear any pending timeout
        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
        }
        
        // Only set error if image truly failed (not just loading)
        const img = e.target as HTMLImageElement;
        // Double-check: if image is complete and has height, it actually loaded
        if (img.complete && img.naturalHeight > 0) {
          // Image actually loaded, don't show error
          hasLoadedRef.current = true;
          setLogoLoaded(true);
          setLogoError(false);
        } else {
          // Delay error state to prevent race conditions - longer delay
          errorTimeoutRef.current = setTimeout(() => {
            // Final check before showing error - only if still not loaded
            if (imgRef.current && !hasLoadedRef.current) {
              if (!imgRef.current.complete || imgRef.current.naturalHeight === 0) {
                setLogoError(true);
              }
            }
          }, 300); // Increased delay to 300ms
        }
      }}
      onLoad={() => {
        // Clear any pending error timeout
        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
          errorTimeoutRef.current = null;
        }
        
        // Image loaded successfully - mark as loaded permanently
        hasLoadedRef.current = true;
        setLogoLoaded(true);
        setLogoError(false);
      }}
    />
  );
};

// ============================================
// Login Component
// ============================================
const LoginPage = ({ onLogin }: { onLogin: (user: AuthUser) => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { token, user } = await authAPI.login(email, password);
      localStorage.setItem('auth_token', token);
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-white to-rose-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-pink-100">
        <div className="text-center mb-8">
          {/* Official INDIRA IVF Logo */}
          <div className="flex justify-center mb-4">
            <LoginLogo />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">INDIRA GPT</h1>
          <p className="text-sm text-gray-600">Strategy & Empathy Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none transition"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none transition"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-pink-500 to-rose-600 text-white py-3 rounded-lg font-semibold hover:from-pink-600 hover:to-rose-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

// ============================================
// Admin Panel Component
// ============================================
const AdminPanel = ({ currentUser, onLogout, onBack }: { currentUser: AuthUser; onLogout: () => void; onBack: () => void }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [files, setFiles] = useState<CSVFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
  const [newUserFiles, setNewUserFiles] = useState<string[]>([]);
  const [addingUser, setAddingUser] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastSync, setLastSync] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [userList, fileList] = await Promise.all([
        authAPI.getAllUsers(),
        authAPI.getAllFiles()
      ]);
      setUsers(userList);
      setFiles(fileList);
      setLastSync(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Validate all files are CSV
    const invalidFiles = Array.from(files).filter(file => !file.name.endsWith('.csv'));
    if (invalidFiles.length > 0) {
      setError(`Only CSV files are allowed. Invalid files: ${invalidFiles.map(f => f.name).join(', ')}`);
      return;
    }

    const fileArray = Array.from(files);
    const totalFiles = fileArray.length;

    try {
      setUploadingFile(true);
      setError('');
      setUploadProgress({ current: 0, total: totalFiles });
      
      // Upload all files sequentially to show progress
      for (let i = 0; i < fileArray.length; i++) {
        try {
          await authAPI.uploadFile(fileArray[i]);
          setUploadProgress({ current: i + 1, total: totalFiles });
        } catch (err: any) {
          console.error(`Failed to upload ${fileArray[i].name}:`, err);
          // Continue with other files even if one fails
        }
      }
      
      await loadData();
      setLastSync(new Date().toLocaleTimeString());
      setUploadProgress(null);
      
      // Trigger data reload in main app
      localStorage.setItem('dataNeedsReload', 'true');
      window.dispatchEvent(new Event('reloadData'));
    } catch (err: any) {
      setError(err.message || 'Failed to upload files');
      setUploadProgress(null);
    } finally {
      setUploadingFile(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAddingUser(true);

    try {
      await authAPI.addUser(newUserEmail, newUserPassword, newUserRole, newUserFiles);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('user');
      setNewUserFiles([]);
      setShowAddUser(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to add user');
    } finally {
      setAddingUser(false);
    }
  };

  const handleUserSelect = async (user: User) => {
    setSelectedUser(user);
    try {
      const userFiles = await authAPI.getUserFiles(user.email);
      setSelectedUser({ ...user, accessibleFiles: userFiles });
    } catch (err: any) {
      setError(err.message || 'Failed to load user files');
    }
  };

  const handleFileToggle = async (fileName: string) => {
    if (!selectedUser) return;
    
    const currentFiles = selectedUser.accessibleFiles || [];
    const newFiles = currentFiles.includes(fileName)
      ? currentFiles.filter(f => f !== fileName)
      : [...currentFiles, fileName];

    try {
      await authAPI.updateUserFiles(selectedUser.email, newFiles);
      setSelectedUser({ ...selectedUser, accessibleFiles: newFiles });
      await loadData(); // Refresh user list to update file count
    } catch (err: any) {
      setError(err.message || 'Failed to update file access');
    }
  };

  const handleDeleteUser = async (email: string) => {
    if (!confirm(`Are you sure you want to delete user ${email}?`)) return;

    try {
      await authAPI.deleteUser(email);
      if (selectedUser?.email === email) {
        setSelectedUser(null);
      }
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    }
  };

  const handleUpdateRole = async (email: string, newRole: 'admin' | 'user') => {
    try {
      await authAPI.updateUserRole(email, newRole);
      await loadData();
      if (selectedUser?.email === email) {
        setSelectedUser({ ...selectedUser, role: newRole });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update user role');
    }
  };

  const handleLogout = async () => {
    await authAPI.logout();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-pink-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-lg transition mr-2"
              title="Back to main dashboard"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="p-2 bg-pink-500 rounded-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Access Lifecycle</h1>
              <p className="text-xs text-slate-500">CREDENTIAL GOVERNANCE</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-slate-500">Logged in as</p>
              <p className="text-sm font-semibold text-slate-900">{currentUser.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Strategic Knowledge Base Banner */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl shadow-xl p-8 mb-8 text-white">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-3xl font-bold mb-3">Strategic Knowledge Base</h2>
              <p className="text-slate-300 text-lg mb-2">
                Upload master CSV layers to update the system-wide strategic brain. All regional queries leverage this synchronized repository.
              </p>
              <p className="text-slate-400 text-sm">LAST SYNC: {lastSync}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploadingFile}
                />
                <div className={`px-6 py-3 bg-white text-slate-900 rounded-lg font-semibold hover:bg-slate-50 transition flex items-center gap-2 ${uploadingFile ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                  {uploadingFile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {uploadProgress ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...` : 'Uploading...'}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Sync Knowledge Map
                    </>
                  )}
                </div>
              </label>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: User List */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">Users</h3>
              <button
                onClick={() => setShowAddUser(!showAddUser)}
                className="px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-lg hover:from-pink-600 hover:to-rose-700 transition flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add User
              </button>
            </div>

            {showAddUser && (
              <div className="bg-slate-50 rounded-lg p-6 mb-6 border border-slate-200">
                <h4 className="text-lg font-semibold mb-4">Provision Regional Lead</h4>
                <p className="text-xs text-slate-500 mb-4">HQ STRATEGIC AUTHORIZATION</p>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">FULL IDENTITY</label>
                    <input
                      type="text"
                      value={newUserEmail.split('@')[0]}
                      onChange={(e) => setNewUserEmail(e.target.value + '@indira.com')}
                      placeholder="Ex: Dr. Anjali Sharma"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">SYSTEM EMAIL</label>
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="lead@indira.com"
                      required
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ACCESS KEY</label>
                    <input
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="Password"
                      required
                      minLength={6}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">INITIAL INTELLIGENCE ASSIGNMENT</label>
                    <p className="text-xs text-slate-500 mb-2">F. CUSTOM INTELLIGENCE (UPLOADED)</p>
                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3 space-y-2">
                      {files.map((file) => (
                        <label key={file.fileName} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={newUserFiles.includes(file.fileName)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewUserFiles([...newUserFiles, file.fileName]);
                              } else {
                                setNewUserFiles(newUserFiles.filter(f => f !== file.fileName));
                              }
                            }}
                            className="rounded border-slate-300 text-pink-500 focus:ring-pink-500"
                          />
                          <span className="text-sm text-slate-700">{file.fileName}</span>
                        </label>
                      ))}
                      {files.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-4">No files uploaded yet. Upload CSV files first.</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={addingUser}
                    className="w-full px-4 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition disabled:opacity-50 font-semibold flex items-center justify-center gap-2"
                  >
                    {addingUser ? 'Creating...' : 'Finalize Regional Provisioning'}
                  </button>
                </form>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <div
                    key={user._id}
                    onClick={() => handleUserSelect(user)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition ${
                      selectedUser?.email === user.email
                        ? 'border-pink-500 bg-pink-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{user.email.split('@')[0]}</p>
                        <p className="text-sm text-slate-500">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: User Details & File Access */}
          {selectedUser && (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{selectedUser.email.split('@')[0]}</h3>
                  <p className="text-sm text-slate-500">{selectedUser.fileCount || selectedUser.accessibleFiles?.length || 0} layers assigned</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleUpdateRole(selectedUser.email, selectedUser.role === 'admin' ? 'user' : 'admin')}
                    className={`px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 ${
                      selectedUser.role === 'admin'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {selectedUser.role === 'admin' ? 'ADMIN' : 'ACTIVE'}
                  </button>
                  <button
                    onClick={() => handleDeleteUser(selectedUser.email)}
                    disabled={selectedUser.email === currentUser.email}
                    className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-semibold"
                  >
                    <Trash2 className="w-4 h-4" />
                    DELETE PROFILE PERMANENTLY
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
                  <h4 className="font-semibold text-slate-900">F. CUSTOM INTELLIGENCE</h4>
                </div>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {files.map((file) => {
                    const isSelected = selectedUser.accessibleFiles?.includes(file.fileName) || false;
                    return (
                      <label
                        key={file.fileName}
                        className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition ${
                          isSelected
                            ? 'border-slate-900 bg-white'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <span className={`text-sm ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
                          {file.fileName}
                        </span>
                        {isSelected && <Check className="w-4 h-4 text-slate-900" />}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleFileToggle(file.fileName)}
                          className="hidden"
                        />
                      </label>
                    );
                  })}
                  {files.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-8">No files available. Upload CSV files to assign access.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {!selectedUser && (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 flex items-center justify-center min-h-[400px]">
              <div className="text-center text-slate-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Select a user to manage file access</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// Helper function to get API key from runtime-injected values first, then fallback to build-time
  // Expose API key diagnostic to window for debugging
  if (typeof window !== 'undefined') {
    (window as any).checkApiKey = () => {
      const sources = {
        'window.__GEMINI_API_KEY__': (window as any).__GEMINI_API_KEY__,
        'window.process.env.GEMINI_API_KEY': window.process?.env?.GEMINI_API_KEY,
        'window.process.env.API_KEY': window.process?.env?.API_KEY,
        'process.env.API_KEY (build-time)': process.env.API_KEY,
        'process.env.GEMINI_API_KEY (build-time)': process.env.GEMINI_API_KEY,
      };
      
      const activeKey = getApiKey();
      const activeSource = Object.entries(sources).find(([_, value]) => value === activeKey)?.[0] || 'Unknown';
      
      console.log('🔑 API Key Diagnostic:');
      console.log('Active Key:', activeKey ? `${activeKey.substring(0, 10)}... (length: ${activeKey.length})` : 'None');
      console.log('Active Source:', activeSource);
      console.log('All Sources:', sources);
      
      return {
        activeKey: activeKey ? `${activeKey.substring(0, 10)}... (length: ${activeKey.length})` : null,
        activeSource,
        allSources: Object.fromEntries(
          Object.entries(sources).map(([key, value]) => [
            key,
            value ? `${String(value).substring(0, 10)}... (length: ${String(value).length})` : 'Not set'
          ])
        )
      };
    };
  }

  const getApiKey = (): string | null => {
  // Helper to validate API key (not empty, not "undefined" string)
  const isValidKey = (key: any): key is string => {
    return typeof key === 'string' && 
           key !== 'undefined' && 
           key.trim() !== '' && 
           key.length > 10; // Basic validation - API keys are usually longer
  };

  // Check runtime-injected values first (from server.js - for production/Docker)
  if (typeof window !== 'undefined') {
    // Check window.__GEMINI_API_KEY__ (injected by server)
    const runtimeKey = (window as any).__GEMINI_API_KEY__;
    if (isValidKey(runtimeKey)) {
      return runtimeKey;
    }
    // Check window.process.env (injected by server)
    if (window.process?.env?.GEMINI_API_KEY && isValidKey(window.process.env.GEMINI_API_KEY)) {
      return window.process.env.GEMINI_API_KEY;
    }
    if (window.process?.env?.API_KEY && isValidKey(window.process.env.API_KEY)) {
      return window.process.env.API_KEY;
    }
  }
  
  // Fallback to build-time values (for local development with Vite)
  // Vite replaces process.env at build time, so these work in dev mode
  const buildTimeKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (isValidKey(buildTimeKey)) {
    return buildTimeKey;
  }
  
  return null;
};

const App = () => {
  // ============================================
  // ALL HOOKS MUST BE AT THE TOP (React Rules of Hooks)
  // ============================================
  
  // Authentication State
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);

  // App Navigation State
  const [activeTab, setActiveTab] = usePersistentState<'dashboard' | 'city_studio'>('app_active_tab', 'dashboard');

  // Data States
  const [layerData, setLayerData] = usePersistentState<Record<string, string>>('app_layer_data', {});
  
  // Chat States
  const [messages, setMessages] = usePersistentState<Array<{role: 'user' | 'model' | 'error', text: string, type?: 'text' | 'simulation'}>>('chat_messages', [
    { role: 'model', text: "Namaste. I am INDIRA GPT, your partner in fertility strategy.\n\nI am here to help us serve our patients with compassion and scientific excellence.\n\n📊 **Data Pre-loaded**: All CSV files are automatically loaded and ready for analysis. You can ask questions about your data immediately!", type: 'text' }
  ]);
  const [input, setInput] = useState('');
  const [simInput, setSimInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const chatSessionRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Chat File Upload State
  const [chatAttachments, setChatAttachments] = useState<Attachment[]>([]);
  const [sqlTables, setSqlTables] = useState<string[]>([]);
  const [tableSchemas, setTableSchemas] = useState<Record<string, { columns: string[], rowCount: number, fileName: string }>>({});
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [userAccessibleFiles, setUserAccessibleFiles] = useState<string[]>([]);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const isLoadingRef = useRef(false);
  const reloadInProgressRef = useRef(false);

  // Check authentication on mount and load accessible files
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (token) {
          const currentUser = await authAPI.getCurrentUser();
          setUser(currentUser);
          
          // Load user's accessible files
          const accessibleFiles = await authAPI.getUserAccessibleFiles();
          setUserAccessibleFiles(accessibleFiles);
          setFilesLoaded(true);
        } else {
          setFilesLoaded(true); // No auth, but mark as loaded to prevent blocking
        }
      } catch (err) {
        // Not authenticated or token expired
        localStorage.removeItem('auth_token');
        setUser(null);
        setUserAccessibleFiles([]);
        setFilesLoaded(true);
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Clean corrupted messages (null/undefined or missing text) from persisted state on mount
  useEffect(() => {
    setMessages(prev => {
      if (!Array.isArray(prev)) return [{ role: 'model', text: "Namaste. I am INDIRA GPT, your partner in fertility strategy.\n\nI am here to help us serve our patients with compassion and scientific excellence.\n\n📊 **Data Pre-loaded**: All CSV files are automatically loaded and ready for analysis. You can ask questions about your data immediately!", type: 'text' as const }];
      const cleaned = prev.filter(msg => msg != null && typeof (msg as { text?: unknown }).text === 'string');
      return cleaned.length === prev.length ? prev : cleaned;
    });
  }, []);

  // ============================================
  // EVENT HANDLERS
  // ============================================
  
  const handleLogin = (loggedInUser: AuthUser) => {
    setUser(loggedInUser);
    setShowAdmin(false);
  };

  const handleLogout = async () => {
    await authAPI.logout();
    setUser(null);
    setShowAdmin(false);
  };

  const handleLayerDataChange = (layerId: string, files: Record<string, string>) => {
      // Aggregate text from all files in this layer
      const aggregated = Object.entries(files)
          .map(([name, content]) => `--- FILE: ${name} (Layer: ${layerId}) ---\n${content}\n--- END ---`)
          .join('\n\n');
      
      setLayerData(prev => {
          const newData = { ...prev, [layerId]: aggregated };
          // Clear chat session to force re-contextualization with new data
          chatSessionRef.current = null;
          return newData;
      });
  };

  // ... [File Handling Code] ...
  const handleChatFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    setIsTyping(true);
    
    const newFiles: Attachment[] = [];
    const newTables: string[] = [];

    for (const file of files) {
        try {
            if (file.name.toLowerCase().endsWith('.zip')) {
                if (typeof JSZip !== 'undefined') {
                    const zip = await new JSZip().loadAsync(file);
                    for (const filename of Object.keys(zip.files)) {
                        const zipEntry = zip.files[filename];
                        if (!zipEntry.dir && !filename.startsWith('__MACOSX') && !filename.startsWith('.')) {
                             const text = await zipEntry.async("string");
                             await processSingleFile(filename, text, newFiles, newTables);
                        }
                    }
                }
            } else {
                const text = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target?.result as string || '');
                    reader.onerror = reject;
                    reader.readAsText(file);
                });
                await processSingleFile(file.name, text, newFiles, newTables);
            }
        } catch (err) {
            console.error("Error reading file:", file.name, err);
        }
    }

    setChatAttachments(prev => [...prev, ...newFiles]);
    setSqlTables(prev => [...new Set([...prev, ...newTables])]);
    newFiles.forEach(file => {
      if (file.isCsv && file.collectionName && file.headers && file.rowCount) {
        setTableSchemas(prev => ({
          ...prev,
          [file.collectionName!]: {
            columns: file.headers!,
            rowCount: file.rowCount!,
            fileName: file.name
          }
        }));
      }
    });
    if (chatFileInputRef.current) chatFileInputRef.current.value = '';
    setIsTyping(false); 
  };

  // Helper function to detect if content is HTML instead of CSV
  const isHTMLContent = (content: string): boolean => {
    if (!content || content.trim().length === 0) return true;
    const trimmed = content.trim().toLowerCase();
    // Check for common HTML tags
    if (trimmed.startsWith('<!doctype html') || 
        trimmed.startsWith('<html') || 
        trimmed.includes('<html>') ||
        trimmed.includes('</html>') ||
        trimmed.includes('<head>') ||
        trimmed.includes('<body>') ||
        trimmed.includes('<script') ||
        trimmed.includes('<!DOCTYPE')) {
      return true;
    }
    // Check if content has too many HTML-like patterns
    const htmlTagPattern = /<[a-z][\s\S]*>/i;
    const htmlTagCount = (content.match(htmlTagPattern) || []).length;
    // If more than 2 HTML tags, likely HTML
    if (htmlTagCount > 2) return true;
    return false;
  };

  // Helper function to validate CSV data quality
  const isValidCSVData = (parsed: any): boolean => {
    if (!parsed || !parsed.data || !Array.isArray(parsed.data) || parsed.data.length === 0) {
      return false;
    }
    
    // Check if headers are valid (not HTML tags)
    const headers = parsed.meta?.fields || Object.keys(parsed.data[0] || {});
    if (headers.length === 0) return false;
    
    // Check if any header looks like HTML
    const hasHTMLHeaders = headers.some((h: string) => 
      typeof h === 'string' && (h.trim().startsWith('<') || h.trim().toLowerCase().includes('<!doctype'))
    );
    if (hasHTMLHeaders) return false;
    
    // Check first few rows for HTML content
    const sampleRows = parsed.data.slice(0, Math.min(3, parsed.data.length));
    const hasHTMLInRows = sampleRows.some((row: any) => {
      if (typeof row === 'object' && row !== null) {
        return Object.values(row).some((val: any) => {
          if (typeof val === 'string') {
            const valLower = val.trim().toLowerCase();
            return valLower.startsWith('<!doctype') || 
                   valLower.startsWith('<html') || 
                   valLower.includes('<html>') ||
                   (valLower.includes('<') && valLower.includes('>') && valLower.length > 50);
          }
          return false;
        });
      }
      return false;
    });
    
    return !hasHTMLInRows;
  };

  const processSingleFile = async (name: string, content: string, newFiles: Attachment[], newTables: string[]) => {
      const isCsv = name.toLowerCase().endsWith('.csv');
      const isLarge = content.length > MAX_TEXT_PAYLOAD_SIZE; 
      
      let collectionName = '';
      let headers: string[] = [];
      let rowCount = 0;

      if (isCsv) {
          if (isHTMLContent(content)) {
              console.warn(`⚠️ Skipping ${name}: File contains HTML content instead of CSV data`);
              return;
          }
          
          // Derive collection name (matches server-side getCollectionName)
          collectionName = 'data_' + name.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
          
          // Parse headers from first line of CSV
          try {
              const lines = content.split('\n').filter(l => l.trim());
              if (lines.length < 2) {
                  console.warn(`⚠️ Skipping ${name}: Not enough data rows`);
                  return;
              }
              
              // Simple CSV header parsing (handle quoted fields)
              const headerLine = lines[0];
              headers = headerLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
              rowCount = lines.length - 1; // Approximate
              
              if (headers.length === 0 || headers.every(h => !h)) {
                  console.warn(`⚠️ Skipping ${name}: No valid headers found`);
                  return;
              }
              
              newTables.push(collectionName);
              setTableSchemas(prev => ({
                  ...prev,
                  [collectionName]: {
                      columns: headers,
                      rowCount: rowCount,
                      fileName: name
                  }
              }));
          } catch(e) {
              console.error(`Failed to parse ${name}:`, e);
              return;
          }
      }

      if (!isCsv || (isCsv && collectionName && headers.length > 0 && rowCount > 0)) {
          newFiles.push({ 
              name, 
              content: content, 
              isCsv,
              isLarge,
              collectionName: isCsv ? collectionName : undefined,
              headers: headers.length > 0 ? headers : undefined,
              rowCount: rowCount > 0 ? rowCount : undefined
          });
      }
  };

  const removeAttachment = (index: number) => {
    setChatAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Load data schemas from MongoDB via server API (no CSV downloading needed)
  const loadDataFolderFiles = async (forceReload: boolean = false) => {
    if (!forceReload && dataLoaded) {
      return;
    }

    if (!filesLoaded || !user) {
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        console.warn('⚠️ No auth token, skipping data load');
        setDataLoaded(true);
        return;
      }
      
      const isDev = window.location.hostname === 'localhost' && window.location.port === '3000';
      const backendUrl = isDev ? 'http://localhost:5005' : '';
      
      if (forceReload) {
        setSqlTables([]);
        setTableSchemas({});
        setChatAttachments([]);
      }
      
      console.log(`📊 Fetching data schemas from server...`);
      
      const res = await fetch(`${backendUrl}/api/data/schemas`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Failed to fetch schemas: ${res.status} ${res.statusText}`);
      }
      
      const schemas: Array<{
        fileName: string;
        collectionName: string;
        columns: string[];
        columnTypes: Record<string, string>;
        rowCount: number;
      }> = await res.json();
      
      console.log(`✓ Fetched ${schemas.length} data schemas from server`);
      
      const newFiles: Attachment[] = [];
      const newTables: string[] = [];
      
      for (const schema of schemas) {
        const collectionName = schema.collectionName;
        newTables.push(collectionName);
        
        setTableSchemas(prev => ({
          ...prev,
          [collectionName]: {
            columns: schema.columns,
            rowCount: schema.rowCount,
            fileName: schema.fileName
          }
        }));
        
        newFiles.push({
          name: schema.fileName,
          content: '', // No raw CSV content needed
          isCsv: true,
          isLarge: schema.rowCount > 1000,
          collectionName,
          headers: schema.columns,
          columnTypes: schema.columnTypes,
          rowCount: schema.rowCount
        });
        
        console.log(`✓ Schema loaded: ${schema.fileName} → ${collectionName} (${schema.rowCount} rows, ${schema.columns.length} cols)`);
      }
      
      if (newFiles.length > 0) {
        setChatAttachments(prev => {
          if (forceReload) return newFiles;
          const existingNames = new Set(prev.map(f => f.name));
          const uniqueNew = newFiles.filter(f => !existingNames.has(f.name));
          return [...prev, ...uniqueNew];
        });
        setSqlTables(prev => forceReload ? newTables : [...new Set([...prev, ...newTables])]);
        console.log(`✓ Loaded ${newFiles.length} data schemas${forceReload ? ' (reloaded)' : ''}`);
        setDataLoaded(true);
        
        if (forceReload) {
          chatSessionRef.current = null;
        }
      } else {
        console.warn('⚠️ No data schemas available');
        setDataLoaded(true);
      }
    } catch (err) {
      console.error('Error loading data schemas:', err);
      setDataLoaded(true);
    } finally {
      isLoadingRef.current = false;
    }
  };

  // ... [scrollToBottom, useEffects, resetChat, getSystemInstruction, wait, sanitizeSQL, handleSend, parse functions] ...
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const runMermaid = async () => {
      if (window.mermaid) {
        const mermaidBlocks = document.querySelectorAll('pre code.language-mermaid');
        const nodesToProcess: HTMLElement[] = [];
        
        mermaidBlocks.forEach((block) => {
          const pre = block.parentElement;
          if (pre && !pre.getAttribute('data-processed')) {
            pre.setAttribute('data-processed', 'true'); // Mark as processed immediately to avoid races
            const div = document.createElement('div');
            div.className = 'mermaid';
            // Simple textContent extraction. 
            div.textContent = block.textContent || '';
            pre.replaceWith(div);
            nodesToProcess.push(div);
          }
        });

        if (nodesToProcess.length > 0) {
          try {
             await window.mermaid.run({ nodes: nodesToProcess });
          } catch (err) {
             console.error("Mermaid Error:", err);
             // Fallback UI for broken diagrams
             nodesToProcess.forEach(node => {
                 node.innerHTML = `
                    <div class="flex flex-col items-center justify-center p-4 border border-red-200 bg-red-50 rounded-lg text-center">
                        <p class="text-xs font-bold text-red-600 mb-2">Diagram Rendering Failed</p>
                        <pre class="text-[10px] text-slate-500 bg-white p-2 rounded border border-slate-200 overflow-auto max-w-full text-left w-full">${node.textContent}</pre>
                    </div>
                 `;
             });
          }
        }
      }
    };

    const timeoutId = setTimeout(runMermaid, 500); // Increased debounce to 500ms
    scrollToBottom();
    return () => clearTimeout(timeoutId);
  }, [messages, isTyping, retryCount]);

  // Auto-load data schemas from server on app startup
  useEffect(() => {
    if (!dataLoaded && filesLoaded && !isLoadingRef.current && user) {
      isLoadingRef.current = true;
      loadDataFolderFiles().finally(() => {
        isLoadingRef.current = false;
      });
    }
  }, [dataLoaded, filesLoaded, user]);

  // Listen for data reload events (triggered when files are uploaded)
  useEffect(() => {
    const handleDataReload = () => {
      // Prevent multiple simultaneous reloads
      if (reloadInProgressRef.current) {
        console.log('⚠️ Reload already in progress, skipping...');
        return;
      }
      
      console.log('🔄 Reloading data after file upload...');
      reloadInProgressRef.current = true;
      setDataLoaded(false);
      // Use setTimeout to ensure state update is processed
      setTimeout(() => {
        loadDataFolderFiles(true).finally(() => {
          reloadInProgressRef.current = false;
        });
      }, 100);
    };

    // Listen for custom event
    window.addEventListener('reloadData', handleDataReload);
    
    // Also check localStorage periodically for reload flag
    const checkReload = setInterval(() => {
      const shouldReload = localStorage.getItem('dataNeedsReload');
      if (shouldReload === 'true' && !reloadInProgressRef.current) {
        localStorage.removeItem('dataNeedsReload');
        handleDataReload();
      }
    }, 1000);

    return () => {
      window.removeEventListener('reloadData', handleDataReload);
      clearInterval(checkReload);
    };
  }, []); // Empty dependencies - only set up once on mount

  useEffect(() => {
    if (window.mermaid) {
      window.mermaid.initialize({ 
        startOnLoad: false, 
        theme: 'neutral',
        logLevel: 'error',
        securityLevel: 'loose',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        themeVariables: {
            fontSize: '14px',
            fontFamily: 'Plus Jakarta Sans',
            primaryColor: '#FCE7F3', // Pink 100
            primaryTextColor: '#9D174D', // Pink 800
            primaryBorderColor: '#BE185D', // Pink 700
            lineColor: '#BE185D',
            secondaryColor: '#ECFCCB', // Lime 100
            tertiaryColor: '#FEF3C7', // Amber 100
        }
      });
    }
  }, []);

  const resetChat = () => {
    chatSessionRef.current = null;
    setMessages([{ role: 'model', text: "Chat history cleared. Ready to partner in the journey again." }]);
    if (typeof window !== 'undefined') {
        localStorage.removeItem('chat_messages');
        localStorage.removeItem('studio_city');
        localStorage.removeItem('studio_themes');
        localStorage.removeItem('studio_scripts');
        localStorage.removeItem('studio_selected_theme');
    }
  };

  // Validate if user question references unauthorized files
  const validateQuestionAccess = (question: string): { allowed: boolean; unauthorizedFiles: string[] } => {
    if (userAccessibleFiles.length === 0) {
      // Admin has access to all files
      return { allowed: true, unauthorizedFiles: [] };
    }
    
    // Get all file names from loaded schemas
    const allFileNames = new Set<string>();
    Object.values(tableSchemas).forEach(schema => {
      if (schema.fileName) allFileNames.add(schema.fileName);
    });
    
    const questionLower = question.toLowerCase();
    const unauthorizedFiles: string[] = [];
    
    // Check if question mentions any unauthorized files
    Array.from(allFileNames).forEach(fileName => {
      // Check if question mentions this file but user doesn't have access
      if (!userAccessibleFiles.includes(fileName)) {
        const fileNameWithoutExt = fileName.replace('.csv', '').toLowerCase();
        const fileNameWithUnderscores = fileNameWithoutExt.replace(/\s+/g, '_');
        const fileNameWithSpaces = fileNameWithoutExt.replace(/_/g, ' ');
        const fileNameWithDashes = fileNameWithoutExt.replace(/_/g, '-');
        
        // Check multiple variations of the file name
        // Also check for partial matches (e.g., "ICSI" matches "File to ICSI")
        const fileNameWords = fileNameWithoutExt.split(/[\s_-]+/).filter(w => w.length > 2);
        const hasPartialMatch = fileNameWords.some(word => questionLower.includes(word));
        
        if (questionLower.includes(fileNameWithoutExt) || 
            questionLower.includes(fileNameWithUnderscores) ||
            questionLower.includes(fileNameWithSpaces) ||
            questionLower.includes(fileNameWithDashes) ||
            questionLower.includes(fileName.toLowerCase()) ||
            hasPartialMatch) {
          unauthorizedFiles.push(fileName);
        }
      }
    });
    
    return {
      allowed: unauthorizedFiles.length === 0,
      unauthorizedFiles
    };
  };

  // Validate if AI response mentions unauthorized files
  const validateResponseAccess = (response: string): { valid: boolean; unauthorizedReferences: string[] } => {
    if (userAccessibleFiles.length === 0) {
      // Admin has access to all files
      return { valid: true, unauthorizedReferences: [] };
    }
    
    const responseLower = response.toLowerCase();
    const unauthorizedReferences: string[] = [];
    
    // Check all loaded files
    Object.values(tableSchemas).forEach(schema => {
      if (schema.fileName && !userAccessibleFiles.includes(schema.fileName)) {
        const fileNameWithoutExt = schema.fileName.replace('.csv', '').toLowerCase();
        const fileNameWithUnderscores = fileNameWithoutExt.replace(/\s+/g, '_');
        const fileNameWithSpaces = fileNameWithoutExt.replace(/_/g, ' ');
        
        // Check if response mentions this unauthorized file in any variation
        if (responseLower.includes(fileNameWithoutExt) || 
            responseLower.includes(fileNameWithUnderscores) ||
            responseLower.includes(fileNameWithSpaces) ||
            responseLower.includes(schema.fileName.toLowerCase())) {
          unauthorizedReferences.push(schema.fileName);
        }
      }
    });
    
    return {
      valid: unauthorizedReferences.length === 0,
      unauthorizedReferences
    };
  };

  const getSystemInstruction = () => {
    const contextData = Object.values(layerData).join('\n');
    
    // Filter tables and schemas to only include accessible files
    const accessibleTableNames = sqlTables.filter(tableName => {
      const schema = tableSchemas[tableName];
      if (!schema) return false;
      // If userAccessibleFiles is empty (admin), include all
      if (userAccessibleFiles.length === 0) return true;
      // Otherwise, only include tables from accessible files
      return userAccessibleFiles.includes(schema.fileName);
    });
    
    const accessibleSchemas = Object.fromEntries(
      Object.entries(tableSchemas).filter(([tableName, schema]) => {
        if (userAccessibleFiles.length === 0) return true;
        return userAccessibleFiles.includes(schema.fileName);
      })
    );
    
    return `
**Role & Persona:**
You are **INDIRA GPT**, an elite Strategy Consultant for Indira IVF. You are not just a data analyst; you are a compassionate partner in the parenthood journey. 

**MANDATORY STRATEGIC DIRECTIVE:**
You must synthesize answers from **ALL available sources** (Acquisition, Demographic, Quality, Operational, Competitive) to provide a holistic view.
**CITATION RULE:** You MUST explicitly quote your sources. Example: "As seen in [Table: Call_Center, Row: 5], patient anxiety peaks on Mondays..." or "CRM data indicates a 20% drop..."

**CAPABILITIES:**
1. **MongoDB Data Engine:** You have access to MongoDB collections with structured data. If data analysis is needed, output a MongoDB aggregation pipeline in a \`\`\`mongodb ... \`\`\` code block.
   - Collections available: ${accessibleTableNames.length > 0 ? accessibleTableNames.map(cn => {
    const schema = accessibleSchemas[cn];
    return schema ? `${cn} (${schema.fileName})` : cn;
  }).join(', ') : 'None yet'}.
   - **STRICT PIPELINE RULE:** Output valid JSON aggregation pipeline arrays. Use $match, $group, $sort, $project, $limit, $unwind, $count, $addFields stages only.

**VISUALIZATION & BI DASHBOARDING:**
When users ask for "analysis", "audit", or "plan", **PRIORITIZE** visual thinking.
1. **Charts (Power BI Style):** Use the JSON Chart format (bar/pie/radar) for quantitative data.
   **JSON Schema:**
   \`\`\`json
   {
      "chartType": "bar" | "pie" | "radar",
      "title": "Chart Title",
      "description": "Short description",
      "data": [{"name": "Label 1", "value": 10}, {"name": "Label 2", "value": 20}],
      "config": {"xKey": "name", "yKey": "value", "nameKey": "name", "valueKey": "value"}
   }
   \`\`\`
   Do not use "datasets" or "labels" arrays (Chart.js style). Use flat data arrays (Recharts style).

2. **Flowcharts (Mermaid):** Use \`graph TD\` or \`graph LR\` for process flows, design thinking journeys, and mind maps.
3. **Boxes/Matrix:** Use Markdown tables to create "Pros vs Cons", "Impact vs Effort", or "Red Flag" matrices.

**STRATEGIC PILLARS (Use these for brainstorming):**
1. **Top-End Growth:** Revenue, Market Share, New Center Launches.
2. **Bottom-End Growth:** Cost Optimization, Efficiency, Conversion Rates.
3. **Customer Experience (CX):** Patient Empathy, Anxiety Reduction, Trust Building.
4. **Compliance & Risk:** Medical Ethics, Legal Nuances, "Red Flags".

**CORE PHILOSOPHY & EMPATHY DIRECTIVE:**
IVF is still considered taboo in many parts of India. Patients carry immense **anxiety, depression, and trauma**.
*   **Your Tone:** Professional yet deeply compassionate, warm, and supportive.

**SYSTEM CONTEXT: INDIRA IVF INTELLIGENCE ENGINE (Glossary)**
DOMAIN: IVF Healthcare, Reproductive Strategy, Patient Journey Optimization. 
CORE OBJECTIVE: Optimize the funnel from "Digital Lead" to "ICSI Treatment Start" while monitoring Competitor (Nova) activity.

1. **DATA DICTIONARY & FILE ROLES**
A. THE ACQUISITION LAYER (Marketing Inflow)
- **CRM leads.csv**: PRIMARY SOURCE OF TRUTH. Master list of patient enquiries.
- **META Instant Form Leads**: High Volume / Low Intent. Requires aggressive filtration.
- **Source Medium.csv & Channel.csv**: Attribution data. Calculate Cost Per Lead (CPL) and Channel ROI.
- **landing page.csv**: Patient Intent Indicator. Pages visited define anxiety level.

B. THE DEMOGRAPHIC LAYER (Slicing Dimensions)
- **Region.csv & city.csv**: Geospatial logic. "Nova Threats" vs. "Indira Strongholds".
- **Date.csv, Hour.csv**: Temporal logic. Use Hour.csv to identify peak anxiety times.
- **Gender.csv**: Patient segmentation (Male vs. Female factor).
- **Device and Inpur.csv**: User Experience (UX) technical data.

C. THE QUALITY LAYER (The "Empathy Filter")
- **Call_Center_Audit.csv**: CRITICAL QUALITY METRIC.
- **Key Columns**: Customer Emotion, Agent Emotion, Fatal Count.
- **Logic**: High "Fatal Count" or Low "Empathy Score" correlates to "Footfall" drop-offs.

D. THE OPERATIONAL LAYER (Conversion & Revenue)
- **Footfall Data_[Month].csv**: Physical Center Visits. Measures "Show Rate".
- **File to ICSI [Date].csv**: THE GOLDEN METRIC. Tracks conversion from File Generation to ICSI. Low Ratio indicates "Counseling Failure," not "Marketing Failure."
- **Revenue.csv**: Financial performance data. Use for revenue analysis, regional revenue, and financial insights.

E. THE COMPETITIVE LAYER (Market Intelligence)
- **Nova H1 Opu data...csv**: PRIMARY THREAT. Tracks Nova IVF's "OPU" volume. Benchmark for market share.
- **Market Share Analysis...csv**: Macro-level dominance data.
- **Competetion.csv**: General landscape data.

2. **LOGIC HIERARCHY & RELATIONAL RULES**
- **The Funnel Logic**: [CRM Leads] -> [Call Center Audit] -> [Footfall] -> [File to ICSI]
  - *Rule*: Never analyze "Leads" in isolation. Always weigh against "ICSI" conversion.
- **The "Nova" Benchmark**:
  - *Rule*: When analyzing Regional performance, ALWAYS cross-reference Nova H1 Opu data. If Indira growth is flat but Nova is rising, flag as a "RED ALERT".
- **The Attribution Rule**:
  - *Rule*: If source is Meta Instant Form, assign lower "Lead Score" probability than Google Organic.
- **The Empathy Correlation**:
  - *Rule*: High "Agent Emotion: Negative" in Call_Center_Audit.csv is a leading indicator for lower Footfall.

3. **KEY METRICS & FORMULAS**
- Conversion Rate (Sales): (Footfall Count / CRM Lead Count) * 100
- Conversion Rate (Clinical/Revenue): (ICSI Count / File Count) * 100 (Most Critical)
- Market Share Gap: (Indira OPU Volume - Nova OPU Volume)
- Fatal Error Rate: (Sum of Fatal Counts / Total Calls Audited)

**AVAILABLE DATA SOURCES (MongoDB Collections):**
${accessibleTableNames.length > 0 ? accessibleTableNames.map(collName => {
  const schema = accessibleSchemas[collName];
  if (schema && schema.rowCount > 0) {
    const businessName = schema.fileName.replace('.csv', '').replace(/_/g, ' ');
    return `- **${businessName}** → Collection: \`${collName}\` | ${schema.columns.length} columns: ${schema.columns.slice(0, 8).join(', ')}${schema.columns.length > 8 ? '...' : ''} | ${schema.rowCount.toLocaleString()} records`;
  }
  return null;
}).filter(Boolean).join('\n') : 'No data sources currently available. Please wait for data to load.'}

**CRITICAL FILE SELECTION RULES (MANDATORY):**
- **REVENUE queries** → Use "Revenue.csv" file ONLY (NOT CRM leads.csv or other files)
- **CALL/CALL CENTER queries** → Use "Call_Center_Audit.csv" file
- **LEAD/CRM queries** → Use "CRM leads.csv" file
- **CONVERSION/TREATMENT queries** → Use files with "conversion", "treatment", or "ICSI" in the name
- **MARKET SHARE/COMPETITION queries** → Use "Market Share Analysis.csv" or "Competetion.csv" files
- **REGIONAL/GEOGRAPHIC queries** → Use "Region.csv" or "city.csv" files (NOT Revenue.csv unless explicitly asking for revenue by region)
- **ALWAYS match the user's query topic to the correct CSV file name**
- **DO NOT assume or guess which files to use - match the query keywords to file names**

**MANDATORY DATA USAGE RULES (CRITICAL - NO EXCEPTIONS):**
- ALL listed data sources are stored in MongoDB and READY TO QUERY
- YOU MUST ALWAYS USE THE ACTUAL DATA from MongoDB collections - NEVER use generic data, benchmarks, or industry standards
- **CRITICAL: For ANY revenue/aggregation calculation, you MUST use TWO-PHASE approach:**
  * **PHASE 1**: Generate ONLY MongoDB aggregation pipelines (no numbers, no analysis, no insights)
  * **PHASE 2**: After receiving query results, provide analysis using EXACT numbers from results
- **ACCURACY REQUIREMENT: When calculating totals, sums, or aggregates:**
  * ALWAYS generate a MongoDB aggregation pipeline FIRST
  * WAIT for query execution result
  * USE the EXACT number from the query result in your response
  * DO NOT estimate or use partial data
- **CRITICAL: For ANY analysis request, you MUST generate MongoDB aggregation pipelines FIRST**
- NEVER say "data was not provided" or "using industry benchmarks" - USE MongoDB queries to get actual data
- NEVER use placeholder numbers - ALWAYS use MongoDB queries to get actual data values
- For ANY quantitative question, use MongoDB aggregation to get accurate numbers
- When generating charts, use the ACTUAL data values from query results

**HOW TO GENERATE MONGODB QUERIES:**
When you need to query data, output a \`\`\`mongodb code block containing a JSON object with "collection" and "pipeline" keys:
\`\`\`mongodb
{
  "collection": "data_revenue",
  "pipeline": [
    { "$match": { "District": "Thane" } },
    { "$group": { "_id": null, "total": { "$sum": "$Total Revenue" } } }
  ]
}
\`\`\`
- The "collection" field must be one of the collection names listed above
- The "pipeline" field must be a valid MongoDB aggregation pipeline array
- Use $match for filtering, $group for aggregation (SUM, AVG, COUNT), $sort for ordering, $limit for top-N, $project for field selection
- Field names in $group must be prefixed with "$" (e.g., "$Total Revenue")
- For COUNT: use { "$count": "total" } or { "$group": { "_id": null, "count": { "$sum": 1 } } }
- For SUM: use { "$group": { "_id": null, "total": { "$sum": "$fieldName" } } }
- For GROUP BY: use { "$group": { "_id": "$groupField", "total": { "$sum": "$valueField" } } }
- For TOP-N: add { "$sort": { "total": -1 } } then { "$limit": 10 }

**Instructions:**
- If user wants a "Strategic Audit", "Top 10 Initiatives", or "Simulation", perform a deep **Design Thinking** exercise.
- If user wants **VISUALS**, use the JSON Chart format or Mermaid.
- Always weigh **Pros and Cons** for every recommendation.
- Always write for a C-suite audience: clear, strategic, actionable
- Use business language, not technical language
- Structure every analysis with executive format: Executive Summary, Business Impact, Key Metrics, Findings, Concerns, Recommendations, Next Steps
- Include visual charts for all quantitative findings
- Focus on "what this means for the business" not "what the data shows"
- Be mature, confident, and professional - you're a trusted strategic advisor
- When user asks for analysis, audit, or insights, use the structured executive format
- Always include actual chart JSON when presenting data - never just mention it
- **If user asks "is the data real?" or "is this simulated?": Respond clearly: "Yes, the data provided is real, not simulated. All CSV files contain actual operational data from our business systems."**

**Datasets Provided (Legacy Text Context):**
${contextData.substring(0, 15000)}...

    `;
  };

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper to remove MongoDB queries from responses (users should never see queries)
  const removeQueryFromResponse = (text: string): string => {
    if (!text) return text;
    let cleaned = text.replace(/```mongodb[\s\S]*?```/gi, '');
    cleaned = cleaned.replace(/```json[\s\S]*?"pipeline"[\s\S]*?```/gi, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    return cleaned;
  };

  // Find fileName from collection name referenced in a pipeline
  const findFileNameFromPipeline = (pipeline: any[]): string | null => {
    // Check chatAttachments for matching collection name
    for (const file of chatAttachments) {
      if (file.collectionName) {
        return file.name;
      }
    }
    const firstCsv = chatAttachments.find(f => f.isCsv);
    if (firstCsv) return firstCsv.name;
    return null;
  };

  // Execute MongoDB aggregation pipeline via server
  const executeMongoQuery = async (pipeline: any[], fileName?: string, collectionName?: string): Promise<any> => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      throw new Error('Not authenticated');
    }
    
    const targetFile = fileName || findFileNameFromPipeline(pipeline);
    
    const isDev = window.location.hostname === 'localhost' && window.location.port === '3000';
    const backendUrl = isDev ? 'http://localhost:5005' : '';
    
    const res = await fetch(`${backendUrl}/api/data/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        pipeline, 
        fileName: targetFile || undefined,
        collectionName: collectionName || undefined
      })
    });
    
    if (!res.ok) {
      let errorMessage = 'MongoDB query failed';
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        errorMessage = `Server returned ${res.status}: ${res.statusText}`;
      }
      throw new Error(errorMessage);
    }
    
    const result = await res.json();
    console.log(`✓ MongoDB query executed: ${result.rowCount} rows in ${result.queryTime}`);
    return result.data;
  };

  // File matching function: Maps user query keywords to actual CSV file names
  const matchFilesToQuery = (query: string, availableFiles: Attachment[]): Attachment[] => {
    const queryLower = query.toLowerCase();
    const matchedFiles: Attachment[] = [];
    const matchedFileNames = new Set<string>();
    
    // CRITICAL: Revenue queries MUST use Revenue.csv ONLY
    const isRevenueQuery = /revenue|revenues|financial|income|earnings|money|rupees|rs\.|₹|generated|contribution|contributing/i.test(queryLower);
    if (isRevenueQuery) {
      const revenueFile = availableFiles.find(f => f.name.toLowerCase().includes('revenue') && !f.name.toLowerCase().includes('lead'));
      if (revenueFile) {
        // For revenue queries, ONLY return Revenue.csv - exclude all other files
        return [revenueFile];
      }
    }
    
    // Explicit keyword-to-file mappings
    const fileMappings: { keywords: string[]; filePatterns: string[] }[] = [
      {
        keywords: ['revenue', 'revenues', 'financial', 'income', 'earnings', 'money', 'rupees', 'rs.', '₹'],
        filePatterns: ['revenue', 'Revenue']
      },
      {
        keywords: ['call', 'calls', 'call center', 'call centre', 'audit', 'transcript', 'conversation', 'customer service'],
        filePatterns: ['call', 'Call', 'audit', 'Audit', 'transcript', 'Transcript']
      },
      {
        keywords: ['lead', 'leads', 'crm', 'inquiry', 'inquiries', 'enquiry', 'enquiries'],
        filePatterns: ['lead', 'Lead', 'crm', 'CRM']
      },
      {
        keywords: ['conversion', 'conversions', 'treatment', 'treatments', 'patient conversion'],
        filePatterns: ['conversion', 'Conversion', 'treatment', 'Treatment']
      },
      {
        keywords: ['icsi', 'ivf', 'fertility', 'treatment'],
        filePatterns: ['icsi', 'ICSI', 'ivf', 'IVF']
      },
      {
        keywords: ['market share', 'market', 'competition', 'competitor', 'competitive'],
        filePatterns: ['market', 'Market', 'competition', 'Competition', 'Competetion']
      },
      {
        keywords: ['region', 'regional', 'city', 'cities', 'geography', 'geographic', 'location', 'locations'],
        filePatterns: ['region', 'Region', 'city', 'City']
      },
      {
        keywords: ['source', 'sources', 'channel', 'channels', 'marketing', 'medium', 'media'],
        filePatterns: ['source', 'Source', 'channel', 'Channel', 'medium', 'Medium']
      },
      {
        keywords: ['landing page', 'landing', 'page', 'pages'],
        filePatterns: ['landing', 'Landing']
      },
      {
        keywords: ['revenue', 'revenues'],
        filePatterns: ['revenue', 'Revenue']
      }
    ];
    
    // Find matching files based on keywords
    for (const mapping of fileMappings) {
      const hasKeyword = mapping.keywords.some(keyword => queryLower.includes(keyword));
      if (hasKeyword) {
        for (const file of availableFiles) {
          if (!matchedFileNames.has(file.name)) {
            const fileNameLower = file.name.toLowerCase();
            const matchesPattern = mapping.filePatterns.some(pattern => 
              fileNameLower.includes(pattern.toLowerCase())
            );
            if (matchesPattern) {
              matchedFiles.push(file);
              matchedFileNames.add(file.name);
            }
          }
        }
      }
    }
    
    // If no specific matches, return all available files (let Gemini decide)
    if (matchedFiles.length === 0) {
      return availableFiles;
    }
    
    return matchedFiles;
  };

  // Shared Send Logic
  const handleSend = async (text: string = input, isSimulation: boolean = false, isVideoThemeRequest: boolean = false, isScriptRequest: boolean = false) => {
    const cleanText = text.trim();
    if (!cleanText && chatAttachments.length === 0) return;
    
    // PRE-VALIDATION: Check if question references unauthorized files
    const accessCheck = validateQuestionAccess(cleanText);
    if (!accessCheck.allowed) {
      const unauthorizedList = accessCheck.unauthorizedFiles
        .map(f => f.replace('.csv', '').replace(/_/g, ' '))
        .filter((v, i, a) => a.indexOf(v) === i) // Remove duplicates
        .join(', ');
      
      const accessibleList = userAccessibleFiles.length > 0 
        ? userAccessibleFiles.map(f => f.replace('.csv', '').replace(/_/g, ' ')).join(', ')
        : 'All data sources (Admin access)';
      
      setMessages(prev => [...prev, {
        role: 'user',
        text: cleanText,
        type: 'text'
      }, {
        role: 'model',
        text: `⚠️ **Access Restricted**\n\nI don't have access to the following data sources: **${unauthorizedList}**\n\n**Your Question:** "${cleanText}"\n\n**Why this is restricted:** You're asking about data sources that your administrator has not granted you access to.\n\n**What you can do:**\n- Ask questions about the data sources you have access to: ${accessibleList}\n- Contact your administrator to request access to: ${unauthorizedList}\n\n**Your current access:** ${accessibleList}`,
        type: 'text'
      }]);
      setInput('');
      scrollToBottom();
      return;
    }
    
    // Match files to user query (needed for SQL detection and data reminder)
    const csvFiles = chatAttachments.filter(att => att.isCsv);
    const relevantFiles = matchFilesToQuery(cleanText, csvFiles);
    
    // CRITICAL: For revenue queries, check for Revenue.csv (exclude CRM leads files)
    // Declare early so it can be used in dataReminder
    const isRevenueQueryCheck = /revenue|revenues|financial|income|earnings|money|rupees|rs\.|₹|generated|contribution|contributing/i.test(cleanText);
    const hasRevenueFileCheck = csvFiles.some(f => f.name.toLowerCase().includes('revenue') && !f.name.toLowerCase().includes('lead'));
    
    // Add data usage reminder if we have loaded data
    let dataReminder = '';
    if (csvFiles.length > 0) {
      if (isRevenueQueryCheck && hasRevenueFileCheck) {
        // CRITICAL: Revenue queries MUST use Revenue.csv ONLY
        const revenueFile = csvFiles.find(f => f.name.toLowerCase().includes('revenue') && !f.name.toLowerCase().includes('lead'));
        if (revenueFile) {
          dataReminder = `\n\n🚨 **CRITICAL FILE SELECTION FOR REVENUE QUERY** 🚨\n`;
          dataReminder += `**YOU ARE ASKED ABOUT REVENUE - YOU MUST USE "Revenue.csv" FILE ONLY**\n\n`;
          dataReminder += `**DO NOT use "CRM leads.csv", "CRM leads 2.csv", or any other file**\n`;
          dataReminder += `**ONLY use "Revenue.csv" for revenue-related queries**\n\n`;
          dataReminder += `**The user asked: "${cleanText}"**\n`;
          dataReminder += `**You MUST analyze data from: ${revenueFile.name}**\n\n`;
          dataReminder += `⚠️ CRITICAL: If you mention any other CSV file (like CRM leads), you are WRONG. Use ONLY Revenue.csv.\n\n`;
        }
      } else if (relevantFiles.length > 0 && relevantFiles.length < csvFiles.length) {
        // Specific files matched - tell Gemini to use these
        const fileNames = relevantFiles.map(f => f.name).join(', ');
        dataReminder = `\n\n🎯 **CRITICAL FILE SELECTION**: Based on your query "${cleanText}", you MUST use the following CSV file(s) for your analysis: **${fileNames}**\n\n`;
        dataReminder += `**DO NOT use other files** unless they are explicitly relevant. Focus your analysis on: ${fileNames}\n\n`;
        dataReminder += `⚠️ CRITICAL: You have access to ${csvFiles.length} CSV data file(s) with real data. For this specific query, you MUST analyze the actual CSV data from: ${fileNames}\n\n`;
      } else {
        dataReminder = `\n\n⚠️ CRITICAL: You have access to ${csvFiles.length} CSV data file(s) with real data. The CSV data is provided directly in the conversation below. You MUST analyze the actual CSV data to answer the user's question. DO NOT use generic data, benchmarks, or say "data was not provided". Use the actual data values from the CSV files provided.\n\n`;
      }
    } else if (dataLoaded && sqlTables.length === 0) {
      // No valid CSV files loaded - inform the AI
      dataReminder = `\n\n⚠️ **DATA STATUS**: No valid CSV files are currently loaded. `;
      dataReminder += `This may be because files uploaded via Admin Panel contain HTML instead of CSV data, or files need to be re-uploaded as valid CSV files. `;
      dataReminder += `I will provide insights based on general knowledge, but for accurate analysis, valid CSV data is required.\n\n`;
      // Also log to console for debugging
      console.warn('⚠️ Chatbot has no CSV data available. Response will be simulated/generic.');
    }
    
    let finalPrompt = cleanText + dataReminder;
    
    const isAnalysisRequest = /insights|analysis|analyze|evaluate|performance|metrics|statistics|summary|findings|audit|review|report/i.test(cleanText);
    const isAggregationQuery = /revenue|sum|total|aggregate|calculate|amount|rupees|₹|rs\.|crore|lakh|contribution|contributing|sum of|total of|how much/i.test(cleanText);
    const needsQuery = (isAnalysisRequest || isAggregationQuery) && csvFiles.length > 0;

    if (needsQuery) {
      finalPrompt += `\n\n🚨 **CRITICAL: TWO-PHASE ACCURACY REQUIREMENT** 🚨\n`;
      finalPrompt += `**PHASE 1: Generate ONLY MongoDB aggregation pipelines in \`\`\`mongodb code blocks - NO NUMBERS OR ANALYSIS**\n`;
      finalPrompt += `**PHASE 2: After receiving query results, provide analysis using EXACT numbers from results**\n\n`;
      
      finalPrompt += `**Example of CORRECT Phase 1 response:**\n`;
      finalPrompt += `\`\`\`mongodb\n{"collection": "data_revenue", "pipeline": [{"$match": {"District": "Thane"}}, {"$group": {"_id": null, "total": {"$sum": "$Total Revenue"}}}]}\n\`\`\`\n`;
      finalPrompt += `**Example of WRONG Phase 1 response (DO NOT DO THIS):**\n`;
      finalPrompt += `"The Thane region generated ₹2.71 Crore"\n\n`;
    }
    
    if (chatAttachments.length > 0) {
        finalPrompt += `\n\n=== AVAILABLE DATA SOURCES (MongoDB Collections) ===\n`;
        finalPrompt += `Data is stored in MongoDB. Generate \`\`\`mongodb code blocks to query it.\n\n`;
        
        let filesToShow: Attachment[];
        if (isRevenueQueryCheck && hasRevenueFileCheck) {
          const revenueFile = csvFiles.find(f => f.name.toLowerCase().includes('revenue') && !f.name.toLowerCase().includes('lead'));
          filesToShow = revenueFile ? [revenueFile] : csvFiles;
          finalPrompt += `🚨 **REVENUE QUERY - USE ONLY Revenue.csv collection** 🚨\n\n`;
        } else {
          filesToShow = relevantFiles.length > 0 && relevantFiles.length < csvFiles.length 
            ? [...relevantFiles, ...csvFiles.filter(f => !relevantFiles.some(rf => rf.name === f.name))]
            : csvFiles;
        }
        
        filesToShow.forEach((att, index) => {
          if (att.isCsv) {
            const collName = att.collectionName || 'data_' + att.name.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
            finalPrompt += `\n--- DATA SOURCE ${index + 1}: ${att.name} ---\n`;
            finalPrompt += `**MongoDB Collection:** \`${collName}\`\n`;
            finalPrompt += `**Rows:** ${(att.rowCount || 0).toLocaleString()}\n`;
            if (att.headers) {
              finalPrompt += `**Columns:** ${att.headers.join(', ')}\n`;
            }
            finalPrompt += `**Query Example:**\n`;
            finalPrompt += `\`\`\`mongodb\n{"collection": "${collName}", "pipeline": [{"$group": {"_id": null, "count": {"$sum": 1}}}]}\n\`\`\`\n`;
            finalPrompt += `--- END DATA SOURCE ${index + 1} ---\n`;
          } else if (!att.isLarge && att.content && att.content.length < MAX_TEXT_PAYLOAD_SIZE) {
            finalPrompt += `\n--- FILE ${index + 1}: ${att.name} ---\n${att.content}\n--- END FILE ---\n`;
          }
        });
        
        finalPrompt += `\n=== MONGODB QUERY INSTRUCTIONS ===\n`;
        finalPrompt += `**Generate queries in \`\`\`mongodb code blocks. Format: JSON with "collection" and "pipeline" keys.**\n`;
        finalPrompt += `**The system executes them and returns results. Users NEVER see the queries.**\n`;
        finalPrompt += `**Present results as: "Our analysis shows..." or "The data reveals..."**\n\n`;
        finalPrompt += `User Question: ${cleanText || "Analyze the attached data."}`;
    }

    if (isSimulation) {
        finalPrompt = `PERFORM A WHAT-IF SIMULATION FOR THIS SCENARIO: "${cleanText}".
        
        You represent the 'Indira IVF Intelligence Engine'.
        
        CRITICAL OUTPUT FORMAT:
        Return a STRICT JSON object (no markdown formatting outside the values) with these specific keys:
        {
          "synthesis": "Executive summary markdown string",
          "topEnd": "Analysis of Revenue, Market Share, and Volume Growth (Markdown list)",
          "bottomEnd": "Analysis of Cost Efficiency, Conversion Rates, and OPEX (Markdown list)",
          "cxImpact": "Analysis of Patient Empathy, Anxiety Reduction, and Brand Trust (Markdown list)",
          "constraints": "Analysis of Risks, Compliance, and Operational Challenges (Markdown list)"
        }
        `;
    } else if (isVideoThemeRequest) {
        finalPrompt = `Generate 5 Hyper-Local Video Themes for ${cleanText}. Ensure each theme object has 'title', 'rationale', 'emotionalHook' (e.g. 'Pride of the city'), and 'targetAudience' (e.g. 'Young couples'). Return result STRICTLY as a JSON object with a 'themes' array.`;
    } else if (isScriptRequest) {
        finalPrompt = `Generate a segmented video script. For the 'visual' field, provide extremely detailed scene logic, describing the action, lighting, and camera movement. Return strictly as a JSON object with a 'segments' array. Request: ${cleanText}`;
    }

    let displayMessage = cleanText;
    if (isSimulation) displayMessage = `🎲 Simulation Request: ${cleanText}`;
    else if (isVideoThemeRequest) displayMessage = `🎬 Generating Video Strategy for: ${cleanText}`;
    else if (isScriptRequest) displayMessage = `📝 Generating Script for: ${cleanText}`;
    
    if (chatAttachments.length > 0) {
        const fileNames = chatAttachments.map(f => f.name).join(', ');
        const attachmentLabel = `[📎 Attached ${chatAttachments.length} file(s): ${fileNames}]`;
        displayMessage = displayMessage ? `${attachmentLabel}\n${displayMessage}` : attachmentLabel;
    }

    const newMessages = [...messages, { role: 'user' as const, text: displayMessage, type: 'text' as const }];
    setMessages(newMessages);
    
    setInput('');
    setSimInput('');
    setChatAttachments([]);
    setIsTyping(true);
    setRetryCount(0);

    // Get API key from runtime-injected values first, then fallback
    const apiKey = getApiKey();
    
    // Diagnostic: Log which API key source is being used
    const apiKeySource = (() => {
      if (typeof window !== 'undefined') {
        const runtimeKey = (window as any).__GEMINI_API_KEY__;
        if (runtimeKey && runtimeKey.length > 10) {
          return `window.__GEMINI_API_KEY__ (Runtime - Server injected, length: ${runtimeKey.length}, first 10: ${runtimeKey.substring(0, 10)}...)`;
        }
        if (window.process?.env?.GEMINI_API_KEY && window.process.env.GEMINI_API_KEY.length > 10) {
          return `window.process.env.GEMINI_API_KEY (Runtime - Server injected, length: ${window.process.env.GEMINI_API_KEY.length}, first 10: ${window.process.env.GEMINI_API_KEY.substring(0, 10)}...)`;
        }
        if (window.process?.env?.API_KEY && window.process.env.API_KEY.length > 10) {
          return `window.process.env.API_KEY (Runtime - Server injected, length: ${window.process.env.API_KEY.length}, first 10: ${window.process.env.API_KEY.substring(0, 10)}...)`;
        }
      }
      const buildTimeKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (buildTimeKey && buildTimeKey.length > 10) {
        return `process.env (Build-time - Vite, length: ${buildTimeKey.length}, first 10: ${buildTimeKey.substring(0, 10)}...)`;
      }
      return 'None found';
    })();
    
    console.log('🔑 API Key Source:', apiKeySource);
    console.log('🔑 API Key Status:', apiKey ? `✅ Using key (length: ${apiKey.length}, first 10: ${apiKey.substring(0, 10)}...)` : '❌ No key found');
    
    if (!apiKey) {
        // Debug: Log what we found (only in development)
        if (process.env.NODE_ENV === 'development') {
            console.debug('API Key Debug:', {
                windowKey: typeof window !== 'undefined' ? (window as any).__GEMINI_API_KEY__ : 'N/A',
                windowProcessEnv: typeof window !== 'undefined' ? window.process?.env : 'N/A',
                buildTimeAPI_KEY: process.env.API_KEY ? 'Set (hidden)' : 'Not set',
                buildTimeGEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'Set (hidden)' : 'Not set'
            });
        }
        const errorMessage = typeof window !== 'undefined' && (window as any).__GEMINI_API_KEY__ !== undefined
            ? '⚠️ **API Key Missing**: Please set GEMINI_API_KEY environment variable in App Runner configuration.'
            : '⚠️ **API Key Missing**: Please set GEMINI_API_KEY in your .env.local file and restart the dev server.';
        setMessages(prev => [...prev, { 
            role: 'error' as const, 
            text: errorMessage, 
            type: 'text' 
        }]);
        setIsTyping(false);
        return;
    }
    
    // Validate API key format (Google API keys typically start with "AIza")
    if (!apiKey.startsWith('AIza') && apiKey.length < 20) {
        setMessages(prev => [...prev, { 
            role: 'error' as const, 
            text: '⚠️ **Invalid API Key Format**: The API key format appears incorrect. Google API keys typically start with "AIza". Please verify your GEMINI_API_KEY in .env.local.', 
            type: 'text' 
        }]);
        setIsTyping(false);
        return;
    }

    const ai = new GoogleGenAI({ apiKey });

    if (!chatSessionRef.current) {
      const history: Content[] = messages
        .filter(m => m.role !== 'error')
        .map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }));

      chatSessionRef.current = ai.chats.create({
        model: 'gemini-3-flash-preview',
        history: history.length > 0 ? history : undefined,
        config: {
          systemInstruction: getSystemInstruction(),
          thinkingConfig: { thinkingBudget: 4096 },
        },
      });
    }

    const maxRetries = 5;
    const messageIndex = newMessages.length;
    
    setMessages(prev => [...prev, { role: 'model', text: '_🔍 Fetching data from SQL Table..._', type: 'text' }]);

    const runGeneration = async (prompt: string, currentAttempt: number = 0): Promise<string> => {
        try {
            const resultStream = await chatSessionRef.current.sendMessageStream({ message: prompt });
            let streamedText = '';
            for await (const chunk of resultStream) {
                const chunkText = chunk.text;
                if (chunkText) {
                    streamedText += chunkText;
                    setMessages(prev => {
                        const updated = [...prev];
                        updated[messageIndex] = { role: 'model', text: streamedText, type: 'text' };
                        return updated;
                    });
                }
            }
            return streamedText;
        } catch (err: any) {
            console.error("API Error", err);
            
            // Extract error message from various possible locations
            let errMsg = '';
            if (err?.message) errMsg = err.message;
            else if (err?.cause?.message) errMsg = err.cause.message;
            else if (typeof err === 'string') errMsg = err;
            else errMsg = JSON.stringify(err);
            
            // Also check the error stack and toString - get full error context
            const errorStack = err?.stack || '';
            const errorToString = err?.toString() || '';
            const fullErrorString = (errorStack + ' ' + errorToString + ' ' + errMsg).toLowerCase();
            const errString = fullErrorString;
            
            // Check for certificate errors in multiple places (console errors, network errors, etc.)
            // The browser console shows: "net::ERR_CERT_AUTHORITY_INVALID" which might be in the error object
            const hasCertErrorInConsole = errorStack.includes('ERR_CERT') || 
                                         errorToString.includes('ERR_CERT') ||
                                         errMsg.includes('ERR_CERT');
            
            const isQuotaError = errString.includes('429') || errString.includes('503') || errString.includes('resource_exhausted') || errString.includes('quota');
            
            // Check for certificate errors - including ERR_CERT_AUTHORITY_INVALID from console
            // Check in multiple places: error message, stack trace, toString, and console output
            const isCertError = hasCertErrorInConsole ||
                               errString.includes('cert_authority_invalid') || 
                               errString.includes('certificate') || 
                               errString.includes('ssl') || 
                               errString.includes('err_cert') ||
                               errString.includes('certificate validation') ||
                               errString.includes('failed to fetch') ||
                               errString.includes('network error') ||
                               errString.includes('typeerror') ||
                               (errString.includes('fetch') && errString.includes('typeerror')) ||
                               (err?.name === 'TypeError' && errMsg.includes('fetch')) ||
                               (err?.name === 'TypeError' && errorStack.includes('ERR_CERT'));
            
            if (isCertError) {
                const errorMessage = `🔒 **SSL Certificate Error**\n\n**Problem:** The browser cannot verify Google's SSL certificate. This is typically caused by:\n\n1. **Corporate Firewall/Proxy** - Your network may be intercepting SSL connections\n2. **System Certificates** - Outdated or missing root certificates\n3. **Network Configuration** - VPN or security software interfering\n\n**Solutions to Try:**\n\n✅ **Quick Fixes:**\n- Try a different network (mobile hotspot, home WiFi)\n- Disable VPN if active\n- Check if your corporate firewall allows generativelanguage.googleapis.com\n\n✅ **System Fixes:**\n- Update Windows certificates: Run Windows Update\n- Check system date/time is correct\n- Try a different browser\n\n✅ **For IT Administrators:**\n- Whitelist *.googleapis.com in firewall\n- Install proper root certificates\n- Configure proxy to allow Google AI API\n\n**Note:** This is a network/infrastructure issue, not a code problem. The API key appears to be set correctly.`;
                setMessages(prev => {
                    const updated = [...prev];
                    updated[messageIndex] = { role: 'error' as const, text: errorMessage, type: 'text' };
                    return updated;
                });
                setIsTyping(false);
                return '';
            }
            
            if (isQuotaError && currentAttempt < maxRetries) {
                const waitTime = 2000 * Math.pow(2, currentAttempt);
                setRetryCount(currentAttempt + 1);
                setMessages(prev => {
                    const updated = [...prev];
                    updated[messageIndex] = { role: 'model', text: `_System at capacity. Retrying in ${waitTime/1000}s (Attempt ${currentAttempt + 1}/${maxRetries})..._`, type: 'text' };
                    return updated;
                });
                await wait(waitTime);
                return runGeneration(prompt, currentAttempt + 1);
            }
            throw err;
        }
    };

    const processResponseWithMongo = async (prompt: string, attemptCount: number): Promise<void> => {
        try {
            const fullResponse = await runGeneration(prompt, 0);
            
            const responseCheck = validateResponseAccess(fullResponse);
            if (!responseCheck.valid) {
                const deniedMessage = `⚠️ **Access Restricted**\n\nI apologize, but my response referenced data sources you don't have access to: **${responseCheck.unauthorizedReferences.map(f => f.replace('.csv', '').replace(/_/g, ' ')).join(', ')}**\n\nPlease contact your administrator if you need access to additional data sources.\n\nYou currently have access to: ${userAccessibleFiles.length > 0 ? userAccessibleFiles.map(f => f.replace('.csv', '').replace(/_/g, ' ')).join(', ') : 'All data sources (Admin access)'}`;
                setMessages(prev => {
                    const updated = [...prev];
                    updated[messageIndex] = { role: 'model', text: deniedMessage, type: 'text' };
                    return updated;
                });
                scrollToBottom();
                return;
            }
            
            // Detect MongoDB aggregation pipeline in response
            const mongoMatch = fullResponse.match(/```mongodb\s*([\s\S]*?)\s*```/);
            
            if (mongoMatch) {
                let friendlyMessage = "_🔍 Consulting the data engine..._";
                const textWithoutQuery = removeQueryFromResponse(fullResponse);
                if (textWithoutQuery && textWithoutQuery.length > 10) {
                    friendlyMessage = textWithoutQuery + "\n\n_🔍 Querying SQL Table for accurate data..._";
                }

                setMessages(prev => {
                     const updated = [...prev];
                     updated[messageIndex].text = friendlyMessage;
                     return updated;
                });
                
                try {
                    const queryJSON = JSON.parse(mongoMatch[1].trim());
                    const collectionName = queryJSON.collection;
                    const pipeline = queryJSON.pipeline;
                    
                    if (!collectionName || !pipeline || !Array.isArray(pipeline)) {
                        throw new Error("Invalid MongoDB query format: needs 'collection' and 'pipeline' fields");
                    }
                    
                    // Find fileName for this collection
                    const fileInfo = chatAttachments.find(f => f.collectionName === collectionName);
                    const fileName = fileInfo?.name || null;
                    
                    const result = await executeMongoQuery(pipeline, fileName || undefined, collectionName);
                    
                    // Extract exact numeric value for accuracy enforcement
                    let exactValue: number | null = null;
                    let exactValueKey: string | null = null;
                    if (result && Array.isArray(result) && result.length > 0) {
                        const firstRow = result[0];
                        if (firstRow && typeof firstRow === 'object') {
                            for (const [key, value] of Object.entries(firstRow)) {
                                if (key === '_id') continue;
                                if (typeof value === 'number' && value > 0) {
                                    exactValue = value as number;
                                    exactValueKey = key;
                                    break;
                                }
                            }
                        }
                    }
                    
                    const resultStr = JSON.stringify(result, getCircularReplacer(), 2);
                    const truncatedResult = resultStr.length > 50000 ? resultStr.substring(0, 50000) + "...[Truncated]" : resultStr;
                    let nextPrompt = `MongoDB Query Result:\n${truncatedResult}\n\nPlease interpret this data and answer the original user question.`;
                    
                    if (exactValue !== null && exactValueKey) {
                        const exactValueFormatted = exactValue.toLocaleString('en-IN');
                        const exactValueCrore = (exactValue / 10000000).toFixed(2);
                        nextPrompt += `\n\n🚨 **USE THIS EXACT NUMBER: ${exactValueFormatted} (₹${exactValueCrore} Crore)** 🚨\n`;
                        nextPrompt += `DO NOT use any other number. The query result shows ${exactValueKey}: ${exactValueFormatted}\n`;
                    }
                    
                    await processResponseWithMongo(nextPrompt, attemptCount);

                } catch (queryErr: any) {
                    console.error("MongoDB Query Failed", queryErr);
                    const errMsg = queryErr.message || String(queryErr);
                    
                    if (errMsg.includes('Access denied')) {
                        setMessages(prev => {
                            const updated = [...prev];
                            updated[messageIndex] = { 
                                role: 'model', 
                                text: `⚠️ **Access Restricted**\n\n${errMsg}`, 
                                type: 'text' 
                            };
                            return updated;
                        });
                        return;
                    } else if (attemptCount < 2) {
                        setMessages(prev => {
                             const updated = [...prev];
                             updated[messageIndex].text = friendlyMessage + "\n_⚠️ Retrying with adjusted query..._";
                             return updated;
                        });
                        const availableCollections = sqlTables.join(', ');
                        const repairPrompt = `The MongoDB query failed with error: "${errMsg}". Available collections are: ${availableCollections || 'None'}. Please generate a corrected \`\`\`mongodb query or answer without querying.`;
                        await processResponseWithMongo(repairPrompt, attemptCount + 1);
                    } else {
                        setMessages(prev => {
                             const updated = [...prev];
                             updated[messageIndex].text = friendlyMessage + `\n\n_⚠️ Query failed: ${errMsg.substring(0, 100)}. Answering based on available context._`;
                             return updated;
                        });
                        const fallbackPrompt = `The MongoDB query failed with error: "${errMsg}". Please answer based on general knowledge and context. Do NOT generate a MongoDB query again.`;
                        await processResponseWithMongo(fallbackPrompt, attemptCount + 1);
                    }
                }
            } else {
                 const responseCheck = validateResponseAccess(fullResponse);
                 if (!responseCheck.valid) {
                     const deniedMessage = `⚠️ **Access Restricted**\n\nI apologize, but my response referenced data sources you don't have access to: **${responseCheck.unauthorizedReferences.map(f => f.replace('.csv', '').replace(/_/g, ' ')).join(', ')}**\n\nYou currently have access to: ${userAccessibleFiles.length > 0 ? userAccessibleFiles.map(f => f.replace('.csv', '').replace(/_/g, ' ')).join(', ') : 'All data sources (Admin access)'}`;
                     setMessages(prev => {
                         const updated = [...prev];
                         updated[messageIndex] = { role: 'model', text: deniedMessage, type: 'text' };
                         return updated;
                     });
                     scrollToBottom();
                     return;
                 }
                 
                 let msgType: 'text' | 'simulation' = 'text';
                 if (isSimulation && (fullResponse.includes('```json') || fullResponse.trim().startsWith('{')) && fullResponse.includes('}')) {
                     if(fullResponse.includes('topEnd') || fullResponse.includes('cxImpact')) {
                        msgType = 'simulation';
                     }
                 }
                 setMessages(prev => {
                     const updated = [...prev];
                     const cleanResponse = removeQueryFromResponse(fullResponse);
                     updated[messageIndex] = { role: 'model', text: cleanResponse, type: msgType };
                     return updated;
                 });
            }
        } catch (err: any) {
            let errorMessage = "I encountered an issue processing your request.";
            let rawErrString = "";
            if (typeof err === 'string') rawErrString = err;
            else if (err instanceof Error) rawErrString = err.message;
            else if (typeof err === 'object' && err !== null) {
                try { rawErrString = JSON.stringify(err, getCircularReplacer()); } catch { rawErrString = "[Complex Error]"; }
            }

            if (rawErrString.includes('429') || rawErrString.includes('RESOURCE_EXHAUSTED')) {
                const match = rawErrString.match(/retry in ([\d\.]+)s/);
                const seconds = match ? Math.ceil(parseFloat(match[1])) : 5;
                errorMessage = `⚠️ **Quota Exceeded**: Please wait ${seconds} seconds or clear context before trying again.`;
            } else {
                errorMessage = err.message ? `Error: ${err.message}` : `Error: ${rawErrString.substring(0, 300)}`;
            }

            setMessages(prev => {
                const updated = [...prev];
                updated[messageIndex] = { role: 'error' as const, text: errorMessage, type: 'text' };
                return updated;
            });
        }
    };

    await processResponseWithMongo(finalPrompt, 0);

    setIsTyping(false);
    setRetryCount(0);
  };

  const parseSimulationJSON = (text: string): SimulationData | null => {
    try {
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
      const jsonString = jsonMatch ? jsonMatch[1] : text;
      // Heuristic cleaning if raw JSON
      const cleanJsonString = jsonString.trim().startsWith('{') ? jsonString : jsonString.substring(jsonString.indexOf('{'), jsonString.lastIndexOf('}') + 1);
      
      const parsed = JSON.parse(cleanJsonString);
      if (parsed.topEnd || parsed.synthesis) {
        return {
           topEnd: typeof parsed.topEnd === 'string' ? parsed.topEnd : JSON.stringify(parsed.topEnd || ''),
           bottomEnd: typeof parsed.bottomEnd === 'string' ? parsed.bottomEnd : JSON.stringify(parsed.bottomEnd || ''),
           cxImpact: typeof parsed.cxImpact === 'string' ? parsed.cxImpact : JSON.stringify(parsed.cxImpact || ''),
           constraints: typeof parsed.constraints === 'string' ? parsed.constraints : JSON.stringify(parsed.constraints || ''),
           synthesis: typeof parsed.synthesis === 'string' ? parsed.synthesis : JSON.stringify(parsed.synthesis || ''),
        };
      }
    } catch (e) { return null; }
    return null;
  };
  
  const parseChartJSON = (text: string): { data: ChartData, raw: string } | null => {
    try {
      // 1. Look for markdown code blocks with json or without language specifier
      let jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?"chartType"[\s\S]*?\})\s*```/);
      
      // 2. Look for raw JSON object if it has chartType property (fallback for when model forgets code block)
      if (!jsonMatch) {
          // Try multiple strategies to find JSON
          // Strategy A: Find all JSON-like objects that contain "chartType"
          const jsonPattern = /\{[\s\S]*?"chartType"[\s\S]*?\}/g;
          const matches = text.match(jsonPattern);
          
          if (matches) {
              for (const match of matches) {
                  try {
                      const parsed = JSON.parse(match);
                      if (parsed.chartType && (parsed.chartType === 'bar' || parsed.chartType === 'pie' || parsed.chartType === 'radar')) {
                          return { data: adaptChartData(parsed), raw: match };
                      }
                  } catch(e) {
                      // Try to find well-formed JSON by matching braces
                      const startIndex = match.indexOf('{');
                      if (startIndex !== -1) {
                          let open = 0;
                          let endIndex = -1;
                          for (let i = startIndex; i < match.length; i++) {
                              if (match[i] === '{') open++;
                              if (match[i] === '}') open--;
                              if (open === 0) {
                                  endIndex = i + 1;
                                  break;
                              }
                          }
                          if (endIndex !== -1) {
                              const rawJson = match.substring(startIndex, endIndex);
                              try {
                                  const parsed = JSON.parse(rawJson);
                                  if (parsed.chartType && (parsed.chartType === 'bar' || parsed.chartType === 'pie' || parsed.chartType === 'radar')) {
                                      return { data: adaptChartData(parsed), raw: rawJson };
                                  }
                              } catch(e2) {}
                          }
                      }
                  }
              }
          }
          
          // Strategy B: Find JSON object starting with { and containing chartType
          const startIndex = text.indexOf('{');
          if (startIndex !== -1 && text.includes('"chartType"')) {
             // Find the matching closing brace more carefully
             let open = 0;
             let endIndex = -1;
             let inString = false;
             let escapeNext = false;
             
             for (let i = startIndex; i < text.length; i++) {
                 const char = text[i];
                 
                 if (escapeNext) {
                     escapeNext = false;
                     continue;
                 }
                 
                 if (char === '\\') {
                     escapeNext = true;
                     continue;
                 }
                 
                 if (char === '"' && !escapeNext) {
                     inString = !inString;
                     continue;
                 }
                 
                 if (!inString) {
                     if (char === '{') open++;
                     if (char === '}') {
                         open--;
                 if (open === 0) {
                     endIndex = i + 1;
                     break;
                 }
             }
                 }
             }
             
             if (endIndex !== -1) {
                 const rawJson = text.substring(startIndex, endIndex);
                 try {
                     const parsed = JSON.parse(rawJson);
                     if (parsed.chartType && (parsed.chartType === 'bar' || parsed.chartType === 'pie' || parsed.chartType === 'radar')) {
                         return { data: adaptChartData(parsed), raw: rawJson };
                     }
                 } catch(e) {}
             }
          }
      } else {
          // Found in code block
          const jsonString = jsonMatch[1];
          try {
          const parsed = JSON.parse(jsonString);
              if (parsed.chartType) {
          return { data: adaptChartData(parsed), raw: jsonMatch[0] };
      }
          } catch(e) {}
      }
    } catch (e) { 
      console.error('Chart parsing error:', e);
      return null; 
    }
    return null;
  };

  const adaptChartData = (parsed: any): ChartData => {
      // --- ADAPTER: Convert Chart.js style to Recharts style if needed ---
      if ((parsed.type === 'GPT' || parsed.type) && parsed.data && parsed.data.datasets) {
         // It looks like Chart.js format
         const labels = parsed.data.labels || [];
         const datasets = parsed.data.datasets || [];
         const transformedData = labels.map((label: string, i: number) => {
            const row: any = { name: label };
            datasets.forEach((ds: any) => {
               row[ds.label || 'Value'] = ds.data[i];
            });
            return row;
         });
         
         const chartType = parsed.type === 'GPT' ? 'bar' : (parsed.type === 'bar' ? 'bar' : parsed.type === 'pie' || parsed.type === 'doughnut' ? 'pie' : 'radar');

         return {
            title: parsed.options?.plugins?.title?.text || parsed.title || "Analysis Chart",
            description: parsed.description || parsed.options?.plugins?.subtitle?.text,
            chartType: chartType,
            data: transformedData,
            config: {
               xKey: "name",
               yKey: datasets[0]?.label || 'Value', // Default to first dataset
               nameKey: "name",
               valueKey: datasets[0]?.label || 'Value',
               colors: datasets.map((d: any) => d.backgroundColor || d.borderColor).flat()
            }
         };
      }
      
      // Handle direct format (already in Recharts format)
      // Ensure config has proper defaults
      if (parsed.chartType && parsed.data && Array.isArray(parsed.data)) {
          return {
              title: parsed.title || "Analysis Chart",
              description: parsed.description,
              chartType: parsed.chartType,
              data: parsed.data,
              config: {
                  xKey: parsed.config?.xKey || (parsed.data[0] ? Object.keys(parsed.data[0])[0] : 'name'),
                  yKey: parsed.config?.yKey || (parsed.data[0] ? Object.keys(parsed.data[0])[1] : 'value'),
                  nameKey: parsed.config?.nameKey || parsed.config?.xKey || (parsed.data[0] ? Object.keys(parsed.data[0])[0] : 'name'),
                  valueKey: parsed.config?.valueKey || parsed.config?.yKey || (parsed.data[0] ? Object.keys(parsed.data[0])[1] : 'value'),
                  colors: parsed.config?.colors || CHART_COLORS
              }
          };
      }
      
      return parsed as ChartData;
  }

  const parseThemesJSON = (text: string): { themes: VideoTheme[], selectionLogic?: string, raw: string } | null => {
    try {
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
      if (!jsonMatch) {
          // Fallback for raw Themes JSON
          if (text.includes('"themes"') && text.includes('[')) {
             try {
                 const start = text.indexOf('{');
                 const end = text.lastIndexOf('}') + 1;
                 const raw = text.substring(start, end);
                 const parsed = JSON.parse(raw);
                 if (parsed.themes && Array.isArray(parsed.themes)) return { themes: parsed.themes, selectionLogic: parsed.selectionLogic, raw };
             } catch(e){}
          }
          return null;
      }
      const jsonString = jsonMatch[1] || jsonMatch[0];
      const raw = jsonMatch[0];
      const parsed = JSON.parse(jsonString);
      if (parsed.themes && Array.isArray(parsed.themes) && parsed.themes.length > 0) {
          return { themes: parsed.themes, selectionLogic: parsed.selectionLogic, raw };
      }
    } catch (e) { return null; }
    return null;
  };

  const handleGenerateThemes = async (city: string, strategy: string, dataContext: string): Promise<{ themes: VideoTheme[], selectionLogic?: string } | null> => {
      const prompt = `Generate 5 Hyper-Local Video Themes for ${city}. \n\nStrategic Context: "${strategy || "None provided."}" \n\nData Context: ${dataContext || "No specific data provided."}\n\nCRITICAL INSTRUCTION: You MUST use the provided Data Context points to identify regional nuances for ${city}. Return STRICTLY as a JSON object with a 'themes' array and a 'selectionLogic' string explaining why these themes were chosen based on the data. Ensure each theme object has 'title', 'rationale', 'emotionalHook', 'targetAudience', and a 'shortTag' (2-3 words summarizing the core anxiety/driver, e.g. "Cost Barriers").`;
      const apiKey = getApiKey();
      if (!apiKey) {
          console.error("API Key missing - Please set GEMINI_API_KEY in App Runner environment variables");
          return null;
      }
      const ai = new GoogleGenAI({ apiKey });
      if (!chatSessionRef.current) {
        const history: Content[] = messages.filter(m => m.role !== 'error').map(m => ({ role: m.role, parts: [{ text: m.text }] }));
        chatSessionRef.current = ai.chats.create({ model: 'gemini-3-flash-preview', history: history.length > 0 ? history : undefined, config: { systemInstruction: getSystemInstruction(), thinkingConfig: { thinkingBudget: 4096 } } });
      }
      try {
          const result = await chatSessionRef.current.sendMessage({ message: prompt });
          const response = result.text || "";
          const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/```\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
              return { themes: parsed.themes, selectionLogic: parsed.selectionLogic };
          }
      } catch (e) { console.error(e); }
      return null;
  };

  const handleGenerateScript = async (theme: VideoTheme, city: string): Promise<ScriptSegment[] | null> => {
      const prompt = `Write a segmented video script for theme: "${theme.title}". City: ${city}. Context: ${theme.rationale}. Keep it empathetic. \n\nCRITICAL: Provide detailed scene logic for 'visual'. Ensure each segment has a UNIQUE and distinct visual description to create a varied storyboard. The VO for 'audio' must be Indian accent, mixing English and Hindi. Return strictly as JSON object with 'segments' array.`;
      const apiKey = getApiKey();
      if (!apiKey) {
          console.error("API Key missing - Please set GEMINI_API_KEY in App Runner environment variables");
          return null;
      }
      const ai = new GoogleGenAI({ apiKey });
      if (!chatSessionRef.current) {
        const history: Content[] = messages.filter(m => m.role !== 'error').map(m => ({ role: m.role, parts: [{ text: m.text }] }));
        chatSessionRef.current = ai.chats.create({ model: 'gemini-3-flash-preview', history: history.length > 0 ? history : undefined, config: { systemInstruction: getSystemInstruction(), thinkingConfig: { thinkingBudget: 4096 } } });
      }
      try {
          const result = await chatSessionRef.current.sendMessage({ message: prompt });
          const response = result.text || "";
          const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/```\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
              return parsed.segments;
          }
      } catch (e) { console.error(e); }
      return null;
  };
  
  const handleThemeSelect = (theme: VideoTheme) => {
    const prompt = `Generate a script for the theme: "${theme.title}". \nRationale: ${theme.rationale}\nAudience: ${theme.targetAudience}`;
    handleSend(prompt, false, false, true);
  };

  // ============================================
  // CONDITIONAL RENDERING (after all hooks)
  // ============================================
  
  // Show loading spinner while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-white to-rose-50">
        <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
      </div>
    );
  }

  // Show login page if not authenticated
  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Show admin panel if admin and showAdmin is true
  if (user.role === 'admin' && showAdmin) {
    return <AdminPanel currentUser={user} onLogout={handleLogout} onBack={() => {
      setShowAdmin(false);
      // Trigger data reload when returning from admin panel (in case files were uploaded)
      setTimeout(() => {
        localStorage.setItem('dataNeedsReload', 'true');
        window.dispatchEvent(new Event('reloadData'));
      }, 300);
    }} />;
  }

  // ============================================
  // MAIN APP RENDERING
  // ============================================

  return (
    <div className="min-h-screen bg-pink-50/20 font-sans text-slate-900 flex flex-col selection:bg-pink-100 selection:text-pink-900">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-pink-100 shadow-sm transition-all">
        <div className="max-w-[1600px] mx-auto px-6 h-20 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {/* Official INDIRA IVF Logo */}
              <IndiraLogo className="h-24" />
            </div>
            <div className="hidden md:flex bg-pink-50/50 p-1 rounded-xl border border-pink-100 ml-8">
               <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'dashboard' ? 'bg-white text-pink-700 shadow-sm border border-pink-100' : 'text-slate-500 hover:text-pink-600'}`}>Strategic Dashboard</button>
               <button onClick={() => setActiveTab('city_studio')} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'city_studio' ? 'bg-white text-pink-700 shadow-sm border border-pink-100' : 'text-slate-500 hover:text-pink-600'}`}><Clapperboard size={14} /> City Content Studio</button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => handleSend("Generate a 'Data Input Summary' based on the INDIRA IVF INTELLIGENCE ENGINE protocols. List all active datasets, categorize them by layer (Acquisition, Demographic, Quality, Operational, Competitive), and identify any critical missing data layers based on the Data Dictionary.")}
              className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all active:scale-95 border border-slate-200 hover:border-pink-200 hover:text-pink-700"
            >
               <FileSearch size={16} />
               <span>Input Summary</span>
            </button>
            <button onClick={resetChat} className="group flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-pink-700 hover:bg-pink-50 transition-all active:scale-95 border border-pink-100 hover:border-pink-200"><RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" /><span>Reset Context</span></button>
            {user.role === 'admin' && (
              <button 
                onClick={() => setShowAdmin(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-blue-700 hover:bg-blue-50 transition-all active:scale-95 border border-blue-100 hover:border-blue-200"
              >
                <Users size={16} />
                <span>Admin</span>
              </button>
            )}
            <div className="flex items-center gap-2 px-3 py-2 rounded-full text-sm text-gray-600 border border-gray-200 bg-gray-50">
              <User size={14} />
              <span className="hidden md:inline">{user.email}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-red-600 hover:bg-red-50 transition-all active:scale-95 border border-red-100 hover:border-red-200"
            >
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-6 py-8 flex flex-col gap-10 h-[calc(100vh-100px)]">
        {activeTab === 'city_studio' ? (
           <CityContentStudio 
              onGenerateThemes={handleGenerateThemes}
              onGenerateScript={handleGenerateScript}
              isLoading={isTyping}
              dataContext={Object.values(layerData).join('\n').substring(0, 10000)}
           />
        ) : (
           <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 h-full animate-in fade-in duration-500">
              
              {/* Left Column: 5-Layer Data Architecture */}
              <div className="xl:col-span-4 flex flex-col gap-4 h-full overflow-hidden flex-shrink-0">
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="p-2 bg-pink-100 rounded-lg text-pink-700"><Database size={20} /></div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 leading-none">Data Engine</h2>
                        <p className="text-xs text-slate-500 font-medium mt-1">5-Layer Intelligence Stack</p>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto pr-2 space-y-4 pb-4">
                      {DATA_LAYERS.map(layer => (
                          <LayerInputGroup 
                              key={layer.id} 
                              layer={layer} 
                              onDataChange={(files) => handleLayerDataChange(layer.id, files)}
                          />
                      ))}
                  </div>
              </div>

              {/* Right Column: Strategic Nexus & Chat */}
              <div className="xl:col-span-8 flex flex-col gap-4 h-full overflow-hidden">
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="p-2 bg-purple-100 rounded-lg text-purple-700"><Compass size={20} /></div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 leading-none">Strategic Nexus</h2>
                        <p className="text-xs text-slate-500 font-medium mt-1">AI-Driven Insights & Simulation</p>
                    </div>
                  </div>

                  {/* Strategic Quick Actions Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
                      <StrategicCard 
                        title="Empathy Audit" 
                        description="Analyze fatal errors & agent emotion." 
                        icon={Stethoscope} 
                        colorClass="bg-pink-500" 
                        textColor="text-pink-600"
                        onClick={() => handleSend("Analyze the 'Call Center Audit' data. Focus on 'Fatal Count' and 'Agent Emotion'. Correlate this with 'Footfall' trends. Are we losing patients due to lack of empathy?")}
                      />
                      <StrategicCard 
                        title="Nova Threat" 
                        description="Compare OPU Volumes & Market Share." 
                        icon={Target} 
                        colorClass="bg-rose-500" 
                        textColor="text-rose-600"
                        onClick={() => handleSend("Compare Indira vs Nova using 'Nova H1 Opu data' and 'Region.csv'. Identify 'Red Alert' zones where Nova is rising while Indira is flat.")}
                      />
                      <StrategicCard 
                        title="Funnel Leakage" 
                        description="Check File-to-ICSI Conversion." 
                        icon={TrendingDown} 
                        colorClass="bg-amber-500" 
                        textColor="text-amber-600"
                        onClick={() => handleSend("Calculate the 'File to ICSI' conversion ratio. Identify bottlenecks in the Operational Layer. Is this a counseling failure?")}
                      />
                      <StrategicCard 
                        title="Top 10 Plan" 
                        description="Synthesize a master strategy." 
                        icon={Lightbulb} 
                        colorClass="bg-indigo-500" 
                        textColor="text-indigo-600"
                        onClick={() => handleSend("Synthesize all layers into a 'Top 10 Strategic Initiatives' plan. Balance Business Growth with Patient Compassion.")}
                      />
                  </div>

                  {/* Main Chat Interface */}
                  <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
                      
                      {/* Chat Messages */}
                      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30 scrollbar-hide">
                          {(messages || []).filter((msg): msg is { role: 'user' | 'model' | 'error'; text: string; type?: 'text' | 'simulation' } => msg != null && typeof (msg as { text?: unknown })?.text === 'string').map((msg, idx) => {
                              // Parsing data once
                              const chartData = parseChartJSON(msg.text);
                              const themesData = parseThemesJSON(msg.text);
                              
                              // Clean text logic: Remove raw JSON blocks if widgets are found
                              let displayContent = msg.text;
                              if (chartData && chartData.raw) {
                                  // Remove JSON from display - handle both code blocks and raw JSON
                                  displayContent = displayContent.replace(chartData.raw, '');
                                  // Also remove markdown code blocks if present
                                  displayContent = displayContent.replace(/```(?:json)?\s*\{[\s\S]*?"chartType"[\s\S]*?\}\s*```/g, '');
                                  // Clean up any extra whitespace/newlines
                                  displayContent = displayContent.replace(/\n{3,}/g, '\n\n').trim();
                              }
                              if (themesData && themesData.raw) {
                                  displayContent = displayContent.replace(themesData.raw, '');
                              }

                              return (
                              <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                 <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-gradient-to-br from-slate-700 to-slate-900 text-white' : (msg.role === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-gradient-to-br from-pink-500 to-rose-600 text-white')}`}>
                                     {msg.role === 'user' ? <User size={16} /> : (msg.role === 'error' ? <AlertTriangle size={16} /> : <Bot size={16} />)}
                                 </div>
                                 <div className={`flex flex-col max-w-[85%] gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                     <div className={`rounded-2xl p-5 shadow-sm 
                                        ${msg.role === 'user' 
                                            ? 'bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-tr-sm shadow-md' 
                                            : (msg.role === 'error' 
                                                ? 'bg-red-50 text-red-900 border border-red-200 rounded-tl-sm' 
                                                : 'bg-white/95 border border-pink-100/50 text-slate-700 rounded-tl-sm ring-1 ring-slate-900/5 backdrop-blur-sm')
                                        }
                                     `}>
                                         {msg.type === 'simulation' ? (
                                             parseSimulationJSON(msg.text) ? (
                                                 <SimulationWidget data={parseSimulationJSON(msg.text)!} />
                                             ) : (
                                                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={safeRenderMarkdown(msg.text)} />
                                             )
                                         ) : (
                                             <>
                                                <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'prose-invert text-slate-100' : ''}`} dangerouslySetInnerHTML={safeRenderMarkdown(displayContent)} />
                                                {/* Check for Charts */}
                                                {chartData && (
                                                    <div className="mt-6 w-full max-w-3xl mx-auto animate-in fade-in duration-500">
                                                        <BiChartsWidget data={chartData.data} />
                                                    </div>
                                                )}
                                                {/* Check for Themes */}
                                                {themesData && (
                                                    <div className="mt-6 w-full animate-in fade-in duration-500">
                                                        <ThemesWidget 
                                                            themes={themesData.themes} 
                                                            logic={themesData.selectionLogic}
                                                            onThemeSelect={(t) => handleThemeSelect(t)}
                                                        />
                                                    </div>
                                                )}
                                             </>
                                         )}
                                     </div>
                                 </div>
                              </div>
                          )})}
                          {isTyping && (
                              <div className="flex gap-4 animate-pulse">
                                  <div className="w-8 h-8 rounded-full bg-pink-50 text-pink-400 flex items-center justify-center"><Bot size={16} /></div>
                                  <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-6 py-4 text-slate-400 text-xs font-medium flex items-center gap-2 shadow-sm">
                                      <Loader2 size={14} className="animate-spin" /> 
                                      {retryCount > 0 ? `Retrying connection (Attempt ${retryCount})...` : "Processing 5-Layer Intelligence..."}
                                  </div>
                              </div>
                          )}
                          <div ref={messagesEndRef} />
                      </div>

                      {/* Simulation Bar (Embedded in Chat) */}
                      <div className="px-6 pb-2 pt-2 bg-gradient-to-b from-transparent to-white border-t border-slate-50">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-2 px-1">
                              <Zap size={12} className="text-amber-400" />
                              <span>Simulation Mode</span>
                          </div>
                          <div className="relative group">
                             <div className="absolute inset-0 bg-gradient-to-r from-amber-200 to-amber-100 rounded-xl blur opacity-25 group-hover:opacity-40 transition-opacity"></div>
                             <input 
                                type="text" 
                                value={simInput}
                                onChange={(e) => setSimInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && simInput.trim() && handleSend(simInput, true)}
                                placeholder="What if we increased ad spend in Pune by 20%? (Analyzes: Top/Bottom Growth, CX, Risks)"
                                className="w-full relative bg-white border border-slate-200 text-slate-700 text-sm rounded-xl px-4 py-4 pr-32 focus:outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 transition-all shadow-sm placeholder-slate-400 font-medium"
                             />
                             <button 
                                onClick={() => handleSend(simInput, true)}
                                disabled={!simInput.trim() && !isTyping}
                                className="absolute right-2 top-2 bottom-2 px-4 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1 disabled:opacity-50 shadow-md shadow-amber-200"
                             >
                                Simulate
                             </button>
                          </div>
                      </div>

                      {/* Main Input Area */}
                      <div className="p-4 bg-white border-t border-slate-100">
                          {/* Attachments Preview */}
                          {chatAttachments.length > 0 && (
                              <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
                                  {chatAttachments.map((att, i) => (
                                      <div key={i} className="flex items-center gap-2 bg-pink-50 text-pink-700 px-3 py-1.5 rounded-lg text-xs font-medium border border-pink-100 whitespace-nowrap shadow-sm">
                                          <FileText size={12} /> <span className="max-w-[100px] truncate">{att.name}</span>
                                          <button onClick={() => removeAttachment(i)} className="hover:text-pink-900 ml-1"><X size={12} /></button>
                                      </div>
                                  ))}
                              </div>
                          )}
                          
                          <div className="flex gap-3 items-end">
                              <button 
                                 onClick={() => chatFileInputRef.current?.click()}
                                 className="p-4 text-slate-400 hover:text-pink-600 hover:bg-pink-50 rounded-xl transition-all border border-slate-100 hover:border-pink-100"
                                 title="Attach Ad-hoc Files"
                              >
                                 <Paperclip size={20} />
                              </button>
                              <input type="file" multiple ref={chatFileInputRef} className="hidden" onChange={handleChatFileSelect} />
                              
                              <div className="flex-1 relative">
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                    placeholder="Ask a strategic question about your data layers..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 pr-12 focus:outline-none focus:border-pink-500 focus:bg-white transition-all placeholder-slate-400 text-sm resize-none min-h-[56px] max-h-[120px]"
                                    rows={1}
                                />
                              </div>
                              
                              <button 
                                  onClick={() => handleSend()}
                                  disabled={!input.trim() && chatAttachments.length === 0}
                                  className="p-4 bg-gradient-to-r from-pink-600 to-rose-600 text-white rounded-xl hover:shadow-lg hover:shadow-pink-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                              >
                                  <Send size={20} />
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
           </div>
        )}
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);