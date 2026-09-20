import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Folder, FolderOpen, Image as ImageIcon, Settings, Plus, UploadCloud, 
  Copy, ExternalLink, Trash2, CheckCircle2, AlertCircle, Loader2, 
  ChevronRight, ArrowLeft, FileText, Search, ShieldCheck, Lock, LogOut,
  Menu, X
} from 'lucide-react';

const WORKER_URL = 'https://lingering-glade-f145.farazjawed5656.workers.dev';

// --- UTILITY FUNCTIONS ---
const sanitizeFilename = (name) => {
  const extIdx = name.lastIndexOf('.');
  const ext = extIdx !== -1 ? name.substring(extIdx) : '';
  const base = extIdx !== -1 ? name.substring(0, extIdx) : name;
  return base.toLowerCase().replace(/[^a-z0-9]/g, '-') + ext.toLowerCase();
};

const formatBytes = (bytes, decimals = 2) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024, dm = decimals < 0 ? 0 : decimals, sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const getUniqueFilename = (filename, existingFiles, subfolderPath) => {
  const fullPath = subfolderPath ? `${subfolderPath}/${filename}` : filename;
  const exists = existingFiles.find(f => f.name === fullPath);
  if (!exists) return filename;

  const extIdx = filename.lastIndexOf('.');
  const ext = extIdx !== -1 ? filename.substring(extIdx) : '';
  const base = extIdx !== -1 ? filename.substring(0, extIdx) : filename;
  
  let counter = 2;
  let newName = `${base}-${counter}${ext}`;
  let newFullPath = subfolderPath ? `${subfolderPath}/${newName}` : newName;
  
  while (existingFiles.find(f => f.name === newFullPath)) {
    counter++;
    newName = `${base}-${counter}${ext}`;
    newFullPath = subfolderPath ? `${subfolderPath}/${newName}` : newName;
  }
  return newName;
};

const getPublicUrl = (path, publicConfig) => {
  if (publicConfig?.publicAssetBaseUrl) {
    return `${publicConfig.publicAssetBaseUrl.replace(/\/$/, '')}/${path}`;
  }
  return `[Public_URL_Unavailable_Add_Config_To_Worker]/${path}`;
};

// --- CUSTOM HOOKS ---
// Standard React Ref for scrolling (Lenis removed to fix build error)
const useSmoothScroll = () => {
  const scrollRef = useRef(null);
  // We retain the hook structure so the component refs still attach correctly,
  // relying on native browser hardware-accelerated scrolling.
  return scrollRef;
};

// --- OPTIMIZED MEMOIZED COMPONENTS ---
// This completely eliminates React re-render lag when searching or clicking assets
const MemoizedAssetCard = React.memo(({ file, publicConfig, onSelect, onDelete }) => {
  const url = getPublicUrl(file.path, publicConfig);
  const isImage = /\.(jpe?g|png|webp|gif|svg|avif)$/i.test(file.name);
  const isSvg = /\.svg$/i.test(file.name);
  
  // WebP Proxy optimization for massive uncompressed images
  const thumbnailUrl = (isImage && !isSvg && publicConfig?.publicAssetBaseUrl) 
    ? `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=400&q=70&output=webp` 
    : url;

  return (
    <div 
      onClick={() => onSelect(file)}
      className="cursor-pointer bg-white border border-slate-200/60 rounded-2xl overflow-hidden group shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-slate-300/80 transition-all duration-300 ease-out flex flex-col min-w-0"
    >
      <div className="h-36 bg-slate-50/80 flex items-center justify-center relative overflow-hidden border-b border-slate-100/80">
        {isImage && publicConfig?.publicAssetBaseUrl ? (
          <img
            src={thumbnailUrl}
            alt={file.name}
            className="max-w-full max-h-full object-contain drop-shadow-sm group-hover:scale-[1.04] transition-transform duration-300 ease-out"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <FileText className="w-10 h-10 text-slate-300 transition-transform duration-300 ease-out group-hover:scale-110" />
        )}
        
        {/* Hover Actions - Removed heavy backdrop-blurs to save paint cycles */}
        <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-out flex items-center justify-center gap-3">
          <button 
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(url); }}
            className="p-2.5 bg-white shadow-md rounded-xl text-slate-700 hover:text-blue-600 hover:scale-110 active:scale-95 transition-all duration-200"
            title="Copy Public URL"
          >
            <Copy className="w-4 h-4" />
          </button>
          {publicConfig && (
            <a 
              href={url} 
              onClick={(e) => e.stopPropagation()}
              target="_blank" 
              rel="noopener noreferrer"
              className="p-2.5 bg-white shadow-md rounded-xl text-slate-700 hover:text-blue-600 hover:scale-110 active:scale-95 transition-all duration-200"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
      
      <div className="p-3.5 flex flex-col flex-1 min-w-0">
        <div className="text-[12px] font-mono font-semibold text-slate-800 truncate mb-1.5" title={file.name}>
          {file.name}
        </div>
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-[10px] font-medium text-slate-500 bg-slate-100/80 border border-slate-200/50 px-2 py-0.5 rounded-md truncate max-w-[60%]">
            {formatBytes(file.size)}
          </span>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(file); }}
            className="text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors duration-200 p-1.5 -mr-1.5 rounded-lg active:scale-95"
            title="Delete file"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

export default function MediaManagerApp() {
  const [authStatus, setAuthStatus] = useState('loading'); 
  const [publicConfig, setPublicConfig] = useState(null);
  
  const [currentView, setCurrentView] = useState('projects');
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- SECURE API CLIENT ---
  const handleSessionExpired = useCallback(() => {
    setAuthStatus('login');
    setActiveProject(null);
  }, []);

  const api = useCallback(async (endpoint, options = {}) => {
    const url = `${WORKER_URL.replace(/\/$/, '')}${endpoint}`;
    const headers = { ...options.headers };
    
    if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method.toUpperCase())) {
      headers['X-Media-Manager-Request'] = '1';
    }
    
    if (!(options.body instanceof FormData) && !headers['Content-Type'] && options.method && options.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include' 
    });

    if (res.status === 401) {
      handleSessionExpired();
      throw new Error("Session expired or unauthorized.");
    }

    const isJson = res.headers.get('content-type')?.includes('application/json');
    if (!res.ok) {
      let errorMsg = 'An error occurred';
      if (isJson) {
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch (e) {}
      }
      throw new Error(errorMsg);
    }

    return isJson ? res.json() : res.text();
  }, [handleSessionExpired]);

  const loadPublicConfig = useCallback(async () => {
    try {
      const cfg = await api('/api/config');
      setPublicConfig(cfg);
      return cfg;
    } catch (err) {
      console.warn('Could not load public asset config.', err);
      setPublicConfig(null);
      return null;
    }
  }, [api]);

  // Initial Auth Check
  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        setAuthStatus('loading');
        const res = await api('/api/auth/me');
        if (res.authenticated) {
          if (isMounted) {
            await loadPublicConfig();
          }
          if (isMounted) setAuthStatus('authenticated');
        } else {
          if (isMounted) setAuthStatus('login');
        }
      } catch (err) {
        if (isMounted) setAuthStatus('login');
      }
    };

    checkAuth();
    return () => { isMounted = false; };
  }, [api, loadPublicConfig]);

  // Fetch Projects when authenticated
  const fetchProjects = useCallback(async () => {
    if (authStatus !== 'authenticated') return;
    setLoadingProjects(true);
    setProjectsError(null);
    try {
      const data = await api('/api/projects');
      setProjects(data);
    } catch (err) {
      setProjectsError(err.message);
    } finally {
      setLoadingProjects(false);
    }
  }, [authStatus, api]);

  useEffect(() => {
    if (authStatus === 'authenticated' && currentView === 'projects' && !activeProject) {
      fetchProjects();
    }
  }, [authStatus, currentView, activeProject, fetchProjects]);

  const handleLogout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error("Logout error", e);
    } finally {
      setAuthStatus('login');
      setActiveProject(null);
      setCurrentView('projects');
      setIsMobileMenuOpen(false);
    }
  };

  if (authStatus === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-800 font-sans antialiased">
        <div className="flex flex-col items-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500 drop-shadow-sm" />
          <p className="font-medium tracking-wide text-sm">Checking secure connection...</p>
        </div>
      </div>
    );
  }

  if (authStatus === 'login') {
    return (
      <LoginView
        api={api}
        onSuccess={async () => {
          await loadPublicConfig();
          setAuthStatus('authenticated');
        }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 sm:bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/40 via-slate-50 to-slate-50 text-slate-800 font-sans antialiased selection:bg-blue-200 selection:text-blue-900 overflow-hidden">
      
      {/* MOBILE DRAWER OVERLAY */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity" 
          onClick={() => setIsMobileMenuOpen(false)} 
        />
      )}

      {/* RESPONSIVE SIDEBAR */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white/80 backdrop-blur-2xl border-r border-slate-200/60 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] transform transition-transform duration-300 ease-out md:relative md:translate-x-0 shrink-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-slate-900 font-bold text-lg tracking-tight">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-[0_4px_10px_rgba(16,185,129,0.2)] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white shrink-0" />
            </div>
            <span className="truncate">MediaManager</span>
          </div>
          <button className="md:hidden text-slate-400 hover:bg-slate-100 hover:text-slate-600 p-1.5 rounded-xl transition-colors" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-3 text-[11px] text-slate-400 font-bold uppercase tracking-widest">
          Private Library
        </div>

        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
          <button 
            onClick={() => { setCurrentView('projects'); setActiveProject(null); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 group ${currentView === 'projects' && !activeProject ? 'bg-white shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-slate-200/60 text-blue-600' : 'text-slate-600 hover:bg-slate-50/80 hover:text-slate-900 border border-transparent'}`}
          >
            <FolderOpen className="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110 group-active:scale-95" />
            Projects
          </button>
          
          {activeProject && (
            <div className="ml-6 border-l-2 border-slate-100 pl-3 py-1.5">
              <button className="flex items-center gap-2 text-[13px] text-blue-600 font-medium truncate w-full text-left group">
                <ChevronRight className="w-3.5 h-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
                <span className="truncate min-w-0">{activeProject.name}</span>
              </button>
            </div>
          )}

          <button 
            onClick={() => { setCurrentView('settings'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 group ${currentView === 'settings' ? 'bg-white shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-slate-200/60 text-blue-600' : 'text-slate-600 hover:bg-slate-50/80 hover:text-slate-900 border border-transparent'}`}
          >
            <Settings className="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110 group-active:scale-95" />
            Settings
          </button>
        </nav>

        <div className="p-5">
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100/50 px-3 py-2.5 rounded-xl font-medium shadow-sm">
            <Lock className="w-4 h-4 shrink-0 text-emerald-500" />
            End-to-End Secure
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        
        {/* MOBILE TOP HEADER */}
        <div className="md:hidden flex items-center justify-between bg-white/80 backdrop-blur-xl px-4 py-3 border-b border-slate-200/60 shadow-sm shrink-0 z-10">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-lg tracking-tight">
            <ShieldCheck className="w-6 h-6 text-emerald-500 shrink-0" />
            <span className="truncate">MediaManager</span>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(true)} 
            className="p-2 -mr-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-xl transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        {/* VIEWS */}
        {currentView === 'settings' && (
          <SettingsView 
            api={api} 
            onLogout={handleLogout} 
          />
        )}
        
        {currentView === 'projects' && !activeProject && (
          <ProjectsView 
            projects={projects} 
            loading={loadingProjects} 
            error={projectsError}
            api={api}
            onOpenProject={setActiveProject}
            onRefresh={fetchProjects}
          />
        )}

        {currentView === 'projects' && activeProject && (
          <ProjectDetailView 
            project={activeProject} 
            api={api}
            publicConfig={publicConfig}
            onBack={() => setActiveProject(null)} 
          />
        )}
      </main>
    </div>
  );
}

function LoginView({ api, onSuccess }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      if (res.authenticated) {
        onSuccess();
      } else {
        setError("Login failed.");
      }
    } catch (err) {
      setError("Incorrect password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 sm:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-100 via-slate-50 to-slate-50 p-4 font-sans antialiased">
      <div className="bg-white/95 backdrop-blur-2xl p-6 sm:p-10 rounded-[2rem] shadow-[0_8px_40px_rgb(0,0,0,0.04)] border border-slate-200/60 w-full max-w-md relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400 opacity-20"></div>
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-[0_2px_10px_rgba(16,185,129,0.1)]">
            <Lock className="w-8 h-8" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-center text-slate-900 mb-2">Private Media Library</h1>
        <p className="text-center text-slate-500 mb-8 text-[14px]">Please sign in to access your secure repository.</p>
        
        <form onSubmit={handleLogin} className="space-y-5">
          {error && (
            <div className="bg-red-50/80 border border-red-100 text-red-600 p-3 rounded-xl text-[13px] font-medium text-center shadow-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-[13px] font-medium text-slate-600 mb-1.5">Password</label>
            <input 
              type="password" 
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 bg-slate-50/50 shadow-inner border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 disabled:opacity-70 disabled:hover:-translate-y-0 text-white font-medium py-3.5 rounded-xl shadow-[0_4px_14px_0_rgba(15,23,42,0.2)] hover:shadow-[0_6px_20px_rgba(15,23,42,0.2)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 transform-gpu"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading ? 'Authenticating...' : 'Sign In →'}
          </button>
        </form>
      </div>
    </div>
  );
}

function SettingsView({ api, onLogout }) {
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto w-full overflow-y-auto min-w-0">
      <div className="mb-6 md:mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-1.5">Settings</h1>
        <p className="text-slate-500 text-[14px]">Manage your secure session.</p>
      </div>

      <div className="space-y-6">
        <div className="bg-white p-5 md:p-8 rounded-3xl border border-slate-200/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
          <h2 className="text-base font-semibold text-slate-800 mb-5">Account Security</h2>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-slate-50/80 rounded-2xl border border-slate-100 gap-4 shadow-sm">
            <div className="min-w-0 w-full">
              <div className="flex items-center gap-2.5 font-semibold text-slate-900 truncate">
                <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
                Session Active
              </div>
              <p className="text-[13px] text-slate-500 mt-1 truncate">You are currently authenticated securely.</p>
            </div>
            <button 
              onClick={onLogout}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white border border-slate-200 shadow-sm hover:shadow hover:border-red-200 hover:bg-red-50 hover:text-red-600 px-5 py-2.5 rounded-xl text-slate-700 font-medium transition-all active:scale-[0.98] shrink-0 transform-gpu"
            >
              <LogOut className="w-4 h-4" />
              LOG OUT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectsView({ projects, loading, error, api, onOpenProject, onRefresh }) {
  const [showNew, setShowNew] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectSlug, setNewProjectSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const scrollRef = useSmoothScroll(); // Apply Lenis Smooth Scroll

  useEffect(() => {
    setNewProjectSlug(sanitizeFilename(newProjectName));
  }, [newProjectName]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newProjectSlug) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: newProjectName, slug: newProjectSlug })
      });
      setShowNew(false);
      setNewProjectName('');
      onRefresh();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 min-w-0" ref={scrollRef}>
      <div className="w-full min-h-full"> {/* Lenis Wrapper content element */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 md:mb-10 max-w-6xl mx-auto gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 truncate">Projects</h1>
            <p className="text-slate-500 text-[14px] mt-1 truncate">Organize your media repositories</p>
          </div>
          <button 
            onClick={() => setShowNew(true)}
            className="w-full sm:w-auto bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white px-5 py-2.5 rounded-xl font-medium shadow-[0_4px_14px_0_rgba(15,23,42,0.2)] hover:shadow-[0_6px_20px_rgba(15,23,42,0.2)] hover:-translate-y-0.5 active:scale-[0.98] flex items-center justify-center gap-2 transition-all duration-300 shrink-0 transform-gpu"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        <div className="max-w-6xl mx-auto min-w-0">
          {error && (
            <div className="bg-red-50/80 border border-red-100 text-red-700 p-4 rounded-xl mb-6 flex items-start gap-3 shadow-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="min-w-0 break-words text-sm font-medium">{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center p-16 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin drop-shadow-sm" />
            </div>
          ) : projects.length === 0 ? (
            <div className="bg-white/50 border border-dashed border-slate-300 rounded-[2rem] p-12 md:p-16 text-center text-slate-500">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl mx-auto flex items-center justify-center mb-5 shadow-inner">
                <Folder className="w-8 h-8 text-slate-400 shrink-0" />
              </div>
              <p className="text-lg font-medium text-slate-700 mb-1.5 tracking-tight">No projects yet</p>
              <p className="text-[14px]">Create your first project to start uploading media.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 pb-12">
              {projects.map((proj) => (
                <div 
                  key={proj.slug}
                  onClick={() => onOpenProject(proj)}
                  className="bg-white border border-slate-200/60 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] rounded-2xl p-5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:border-slate-300/80 hover:-translate-y-1 cursor-pointer transition-all duration-300 ease-out group min-w-0 transform-gpu will-change-transform"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-indigo-50/80 text-blue-600 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 group-hover:shadow-[0_4px_12px_rgba(37,99,235,0.12)] transition-transform duration-300 shrink-0 transform-gpu">
                    <Folder className="w-6 h-6 fill-current opacity-80" />
                  </div>
                  <h3 className="font-semibold text-slate-900 tracking-tight truncate" title={proj.name}>{proj.name}</h3>
                  <p className="text-[11px] text-slate-500 mt-1.5 font-mono truncate bg-slate-50 px-2 py-0.5 rounded-md inline-block border border-slate-100" title={`/projects/${proj.slug}`}>/projects/{proj.slug}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* NEW PROJECT MODAL */}
      {showNew && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity">
          <div className="bg-white rounded-3xl shadow-[0_24px_48px_rgba(0,0,0,0.1)] border border-slate-200/60 w-full max-w-md overflow-hidden flex flex-col max-h-full transform transition-all scale-100">
            <div className="px-5 md:px-7 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h3 className="font-semibold tracking-tight text-slate-800 text-lg">Create New Project</h3>
              <button onClick={() => setShowNew(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-xl transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 md:p-7 space-y-5 overflow-y-auto">
              {createError && <div className="text-[13px] font-medium text-red-600 bg-red-50 border border-red-100 p-3 rounded-xl min-w-0 break-words shadow-sm">{createError}</div>}
              <div>
                <label className="block text-[13px] font-medium text-slate-600 mb-1.5">Project Name</label>
                <input 
                  type="text" 
                  autoFocus
                  required
                  placeholder="e.g. Law Firm Website"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 shadow-inner border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all duration-300"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-slate-600 mb-1.5">Project Slug (Folder Name)</label>
                <input 
                  type="text" 
                  required
                  value={newProjectSlug}
                  onChange={(e) => setNewProjectSlug(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 shadow-inner border border-slate-200 rounded-xl text-slate-600 font-mono text-[13px] outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-300"
                />
              </div>
              <div className="pt-5 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
                <button 
                  type="button" 
                  onClick={() => setShowNew(false)}
                  className="w-full sm:w-auto px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors text-center active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={creating}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 disabled:opacity-70 disabled:hover:-translate-y-0 text-white font-medium rounded-xl shadow-[0_4px_14px_0_rgba(15,23,42,0.2)] hover:shadow-[0_6px_20px_rgba(15,23,42,0.2)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 transform-gpu"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectDetailView({ project, api, publicConfig, onBack }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subfolder, setSubfolder] = useState('');
  const [uploadQueue, setUploadQueue] = useState([]);
  
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [viewError, setViewError] = useState(null);
  
  // Asset Details Modal State
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [modalCopied, setModalCopied] = useState(false);
  
  const fileInputRef = useRef(null);
  const scrollRef = useSmoothScroll(); // Apply Lenis Smooth Scroll

  const fetchFiles = useCallback(async () => {
    try {
      const data = await api(`/api/projects/${project.slug}`);
      setFiles(data.sort((a, b) => b.path.localeCompare(a.path)));
      setViewError(null);
    } catch (err) {
      setViewError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api, project.slug]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Handle Escape Key to close modal
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setSelectedAsset(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    processFilesForUpload(selected);
    e.target.value = '';
  };

  const processFilesForUpload = (rawFiles) => {
    const newItems = rawFiles.map(file => {
      const safeName = sanitizeFilename(file.name);
      const cleanSubfolder = subfolder.replace(/^\/+|\/+$/g, '').trim();
      const finalName = getUniqueFilename(safeName, files, cleanSubfolder);
      const destinationPath = `projects/${project.slug}${cleanSubfolder ? `/${cleanSubfolder}` : ''}/${finalName}`;
      
      return {
        id: Math.random().toString(36).substring(7),
        file,
        originalName: file.name,
        finalName,
        destinationPath,
        size: file.size,
        type: file.type,
        status: 'pending',
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      };
    });

    setUploadQueue(prev => [...prev, ...newItems]);
    newItems.forEach(item => uploadSingleFile(item));
  };

  const uploadSingleFile = async (item) => {
    updateQueueItem(item.id, { status: 'uploading' });
    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('path', item.destinationPath);

    try {
      await api('/api/upload', {
        method: 'POST',
        body: formData
      });
      updateQueueItem(item.id, { status: 'success' });
      fetchFiles(); 
    } catch (err) {
      updateQueueItem(item.id, { status: 'error', errorMsg: err.message });
    }
  };

  const updateQueueItem = (id, updates) => {
    setUploadQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const removeQueueItem = (id) => {
    setUploadQueue(prev => prev.filter(item => item.id !== id));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const handleModalCopy = (url) => {
    copyToClipboard(url);
    setModalCopied(true);
    setTimeout(() => setModalCopied(false), 2000);
  };

  // Memoized handlers prevent grid re-renders
  const handleSelectAsset = useCallback((file) => {
    setSelectedAsset(file);
  }, []);

  const handleDeleteAsset = useCallback(async (file) => {
    if (!confirm(`Are you sure you want to delete ${file.name}?`)) return;
    try {
      await api('/api/delete', {
        method: 'POST',
        body: JSON.stringify({ path: file.path, sha: file.sha })
      });
      setSelectedAsset(prev => prev?.sha === file.sha ? null : prev);
      fetchFiles();
    } catch (err) {
      setViewError(`Failed to delete: ${err.message}`);
    }
  }, [api, fetchFiles]);

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFilesForUpload(Array.from(e.dataTransfer.files));
    }
  };

  // Debounce the search input to prevent main thread blocking while typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Memoize the filtered files so uploading (which updates uploadQueue state frequently) doesn't re-filter the array
  const filteredFiles = React.useMemo(() => {
    return files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [files, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent min-w-0 relative">
      {/* HEADER */}
      <div className="border-b border-slate-200/60 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between bg-white/60 backdrop-blur-md z-10 sticky top-0 min-w-0 shadow-[0_4px_24px_rgba(0,0,0,0.01)]">
        <div className="flex items-center gap-3 md:gap-4 min-w-0 w-full">
          <button onClick={onBack} className="p-2.5 bg-white border border-slate-200/80 shadow-sm rounded-xl text-slate-500 hover:text-slate-900 hover:shadow hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 shrink-0 transform-gpu">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight truncate" title={project.name}>{project.name}</h1>
            <div className="text-[11px] font-mono text-slate-500 mt-1 bg-slate-100/80 border border-slate-200/50 px-2 py-0.5 rounded-md inline-block max-w-full truncate" title={`/projects/${project.slug}`}>
              /projects/{project.slug}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 min-w-0" ref={scrollRef}>
        <div className="max-w-6xl mx-auto space-y-6 md:space-y-8 min-w-0 pb-12"> {/* Lenis Wrapper content element */}
          
          {viewError && (
             <div className="bg-red-50/80 border border-red-100 text-red-700 p-4 rounded-xl flex items-start gap-3 shadow-sm">
               <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
               <p className="text-sm font-medium min-w-0 break-words">{viewError}</p>
             </div>
          )}

          {/* UPLOAD SECTION */}
          <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 overflow-hidden min-w-0">
            <div className="px-5 md:px-6 py-4 border-b border-slate-100/80 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2 shrink-0">
                <UploadCloud className="w-5 h-5 text-blue-600 shrink-0" />
                Upload Media
              </h2>
              <div className="flex items-center gap-2 text-[13px] w-full sm:w-auto">
                <span className="text-slate-500 font-medium shrink-0">Destination:</span>
                <div className="flex items-center bg-white shadow-inner border border-slate-200 rounded-lg px-2 py-1.5 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all flex-1 sm:w-auto min-w-0">
                  <span className="text-slate-400 select-none shrink-0 font-mono">/</span>
                  <input 
                    type="text" 
                    placeholder="root" 
                    value={subfolder}
                    onChange={(e) => setSubfolder(e.target.value)}
                    className="w-full sm:w-32 bg-transparent outline-none text-slate-700 font-mono text-[12px] min-w-0 px-1"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 md:p-5" onDragOver={handleDragOver} onDrop={handleDrop}>
              <div 
                className="border-2 border-dashed border-slate-300/80 rounded-2xl bg-slate-50/40 hover:bg-blue-50/30 hover:border-blue-400 transition-colors duration-500 ease-out flex flex-col items-center justify-center py-10 md:py-14 px-4 md:px-6 text-center cursor-pointer group m-2 relative"
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  multiple 
                  className="hidden" 
                />
                <div className="w-14 h-14 bg-white shadow-[0_4px_14px_rgba(0,0,0,0.05)] rounded-2xl flex items-center justify-center mb-5 group-hover:-translate-y-1 group-hover:shadow-[0_8px_24px_rgba(59,130,246,0.15)] group-hover:scale-110 transition-all duration-500 ease-out shrink-0 text-blue-500 transform-gpu">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <p className="text-base font-semibold tracking-tight text-slate-700 mb-1.5">Drag and drop files here</p>
                <p className="text-slate-500 text-[14px]">or click to browse your computer</p>
              </div>
            </div>

            {/* UPLOAD QUEUE */}
            {uploadQueue.length > 0 && (
              <div className="border-t border-slate-100 bg-slate-50/30 min-w-0">
                <div className="px-5 md:px-6 py-3.5 bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  Upload Queue ({uploadQueue.filter(q => q.status !== 'success').length} pending)
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2 p-3 md:p-4">
                  {uploadQueue.map(item => (
                    <div key={item.id} className="bg-white border border-slate-100 shadow-sm rounded-xl p-3 md:p-4 flex items-center justify-between hover:shadow-md hover:-translate-y-[1px] transition-all duration-300 group gap-2 md:gap-4 transform-gpu">
                      <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
                        {item.previewUrl ? (
                          <img src={item.previewUrl} alt="" className="w-10 h-10 object-cover rounded-lg border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] shrink-0" />
                        ) : (
                          <div className="w-10 h-10 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-center shrink-0 shadow-inner">
                            <FileText className="w-5 h-5 text-slate-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-slate-900 truncate" title={item.finalName}>{item.finalName}</p>
                          <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5" title={item.destinationPath}>{item.destinationPath}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-end gap-2 md:gap-4 shrink-0">
                        <span className="text-[11px] font-medium text-slate-400 hidden sm:inline-block w-16 text-right truncate">{formatBytes(item.size)}</span>
                        <div className="w-16 md:w-24 flex items-center justify-end shrink-0">
                          {item.status === 'pending' && <span className="text-[11px] font-medium text-slate-400">Waiting...</span>}
                          {item.status === 'uploading' && <Loader2 className="w-4 h-4 md:w-5 md:h-5 text-blue-500 animate-spin" />}
                          {item.status === 'success' && <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-emerald-500 drop-shadow-sm" />}
                          {item.status === 'error' && (
                            <div className="flex items-center gap-1 text-red-500 cursor-help" title={item.errorMsg}>
                              <AlertCircle className="w-4 h-4 md:w-5 md:h-5" />
                              <button onClick={() => uploadSingleFile(item)} className="text-[11px] font-medium underline hover:text-red-700 ml-1">Retry</button>
                            </div>
                          )}
                        </div>
                        {item.status !== 'uploading' && (
                          <button onClick={() => removeQueueItem(item.id)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ASSETS GALLERY */}
          <div className="min-w-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900 truncate">Project Assets <span className="text-slate-400 font-medium ml-1 md:ml-2 text-sm">({files.length})</span></h2>
              <div className="relative w-full sm:w-auto">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Search files..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-white shadow-inner border border-slate-200 rounded-xl text-[13px] outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all w-full sm:w-64"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center p-16"><Loader2 className="w-8 h-8 text-blue-500 animate-spin drop-shadow-sm" /></div>
            ) : filteredFiles.length === 0 ? (
              <div className="text-center p-12 md:p-16 border border-dashed border-slate-300 rounded-[2rem] bg-white/50 text-slate-500">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl mx-auto flex items-center justify-center mb-5 shadow-inner">
                  <ImageIcon className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-[14px] font-medium text-slate-700">No files found in this project.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
                {filteredFiles.map((file) => (
                  <MemoizedAssetCard 
                    key={file.sha}
                    file={file}
                    publicConfig={publicConfig}
                    onSelect={handleSelectAsset}
                    onDelete={handleDeleteAsset}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ASSET DETAILS MODAL */}
      {selectedAsset && (
        <div 
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity"
          onClick={() => setSelectedAsset(null)}
        >
          <div 
            className="bg-white rounded-3xl shadow-[0_24px_48px_rgba(0,0,0,0.1)] border border-slate-200/60 w-full max-w-2xl flex flex-col max-h-[90vh] transform transition-all scale-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 md:px-7 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h3 className="font-semibold tracking-tight text-slate-800 text-lg truncate pr-4">Asset Details</h3>
              <button 
                onClick={() => setSelectedAsset(null)} 
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-xl transition-colors shrink-0"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>
            
            <div className="p-5 md:p-7 overflow-y-auto space-y-6">
              {/* Large Preview */}
              <div className="w-full bg-slate-50/80 rounded-2xl border border-slate-100/80 flex items-center justify-center overflow-hidden relative min-h-[160px] max-h-[40vh]">
                {/\.(jpe?g|png|webp|gif|svg|avif)$/i.test(selectedAsset.name) && publicConfig?.publicAssetBaseUrl ? (
                  <img
                    src={getPublicUrl(selectedAsset.path, publicConfig)}
                    alt={selectedAsset.name}
                    className="max-w-full max-h-[40vh] object-contain drop-shadow-sm p-2"
                    decoding="async"
                  />
                ) : (
                  <FileText className="w-16 h-16 text-slate-300 my-10" />
                )}
              </div>

              {/* Asset Information */}
              <div className="space-y-4">
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Filename</div>
                  <div className="text-[14px] font-semibold text-slate-800 break-words">{selectedAsset.name}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Size</div>
                    <div className="text-[13px] font-medium text-slate-700">{formatBytes(selectedAsset.size)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type</div>
                    <div className="text-[13px] font-medium text-slate-700 uppercase">{selectedAsset.name.split('.').pop() || 'Unknown'}</div>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Repository Path</div>
                  <div className="text-[12px] font-mono font-medium text-slate-600 bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl break-all">
                    {selectedAsset.path}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Public URL</div>
                  <div className="text-[12px] font-mono font-medium text-blue-600 bg-blue-50/50 border border-blue-100 px-3 py-2 rounded-xl break-all">
                    {getPublicUrl(selectedAsset.path, publicConfig)}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-5 md:px-7 py-5 border-t border-slate-100 bg-slate-50/50 shrink-0 flex flex-col-reverse sm:flex-row gap-3 sm:justify-between items-center">
              <button 
                onClick={() => handleDeleteAsset(selectedAsset)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-200 shadow-sm hover:shadow hover:border-red-200 hover:bg-red-50 hover:text-red-600 rounded-xl text-slate-700 font-medium transition-all duration-300 active:scale-[0.98] transform-gpu"
              >
                <Trash2 className="w-4 h-4" />
                Delete Asset
              </button>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                {publicConfig && (
                  <a 
                    href={getPublicUrl(selectedAsset.path, publicConfig)}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-200 shadow-sm hover:shadow hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 rounded-xl text-slate-700 font-medium transition-all duration-300 active:scale-[0.98] transform-gpu"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open
                  </a>
                )}
                <button 
                  onClick={() => handleModalCopy(getPublicUrl(selectedAsset.path, publicConfig))}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white font-medium rounded-xl shadow-[0_4px_14px_0_rgba(15,23,42,0.2)] hover:shadow-[0_6px_20px_rgba(15,23,42,0.2)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 transform-gpu"
                >
                  {modalCopied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {modalCopied ? 'Copied!' : 'Copy URL'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
