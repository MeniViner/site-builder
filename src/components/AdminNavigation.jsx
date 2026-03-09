import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { useNavigation } from '../context/NavigationContext';
import { useTheme } from '../context/ThemeContext';
import { DynamicIcon } from './DynamicIcon';
import {
    Plus, Trash2, Save, AlertTriangle, ChevronLeft, ChevronDown,
    Folder, FolderOpen, FileText, Link as LinkIcon, Home, Search,
    ExternalLink
} from 'lucide-react';
import IconPickerModal from './IconPickerModal';

export default function AdminNavigation() {
    const { navItems: initialNavItems, loading, error, saveNavigation } = useNavigation();
    const { effectiveMode } = useTheme();
    const [navItems, setNavItems] = useState(initialNavItems || []);
    const [isSaving, setIsSaving] = useState(false);

    // Icon Picker State
    const [iconPicker, setIconPicker] = useState({ isOpen: false, targetPath: null, currentIcon: '' });

    // Navigation State
    const [selectedPath, setSelectedPath] = useState([]); // [] = root, [catId], [catId, subId]
    const [expandedNodes, setExpandedNodes] = useState(new Set(['root'])); // Sidebar tree expansion
    const [searchTerm, setSearchTerm] = useState('');
    const isDarkMode = effectiveMode === 'dark';
    const sidebarScrollbarColor = isDarkMode ? '#333 #0a0a0c' : '#9ca3af #f3f4f6';
    const contentScrollbarColor = isDarkMode ? '#333 #050505' : '#9ca3af #f3f4f6';

    const toggleExpand = (id, e) => {
        e?.stopPropagation();
        const newSet = new Set(expandedNodes);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedNodes(newSet);
    };

    const handleSave = async () => {
        setIsSaving(true);
        const success = await saveNavigation(navItems);
        setIsSaving(false);
        if (success) {
            toast.success('נתוני הניווט נשמרו בהצלחה!');
        } else {
            toast.error('שגיאה בשמירת נתוני הניווט.');
        }
    };

    // Generic Update using deep clone
    const updateNode = (path, field, value) => {
        setNavItems(prev => {
            const copy = JSON.parse(JSON.stringify(prev));
            if (path.length === 1) {
                const cat = copy.find(c => c.id === path[0]);
                if (cat) cat[field] = value;
            } else if (path.length === 2) {
                const cat = copy.find(c => c.id === path[0]);
                const sub = cat?.children?.find(c => c.id === path[1]);
                if (sub) {
                    if (field === 'title' || field === 'label') {
                        sub.title = value;
                        sub.label = value;
                    } else {
                        sub[field] = value;
                    }
                }
            } else if (path.length === 3) {
                const cat = copy.find(c => c.id === path[0]);
                const sub = cat?.children?.find(c => c.id === path[1]);
                const link = sub?.subLinks?.find(l => (l.id || l.label) === path[2]);
                if (link) {
                    if (field === 'title' || field === 'label') {
                        link.label = value;
                    } else {
                        link[field] = value;
                    }
                }
            }
            return copy;
        });
    };

    // Adders
    const addNode = () => {
        if (selectedPath.length === 0) {
            const id = `cat_${Date.now()}`;
            setNavItems([...navItems, { id, label: 'קטגוריה חדשה', icon: 'Folder', url: '', children: [] }]);
        } else if (selectedPath.length === 1) {
            setNavItems(prev => {
                const copy = JSON.parse(JSON.stringify(prev));
                const cat = copy.find(c => c.id === selectedPath[0]);
                if (cat) {
                    if (!cat.children) cat.children = [];
                    cat.children.push({ id: `sub_${Date.now()}`, title: 'תת-קטגוריה חדשה', icon: 'FileText', url: '', subLinks: [] });
                }
                return copy;
            });
        } else if (selectedPath.length === 2) {
            setNavItems(prev => {
                const copy = JSON.parse(JSON.stringify(prev));
                const cat = copy.find(c => c.id === selectedPath[0]);
                const sub = cat?.children?.find(c => c.id === selectedPath[1]);
                if (sub) {
                    if (!sub.subLinks) sub.subLinks = [];
                    sub.subLinks.push({ id: `link_${Date.now()}`, label: 'לינק חדש', icon: 'Link', url: '' });
                }
                return copy;
            });
        }
    };

    // Remover
    const removeNode = (path) => {
        if (!confirm('האם אתה בטוח שברצונך למחוק פריט זה?')) return;
        setNavItems(prev => {
            const copy = JSON.parse(JSON.stringify(prev));
            if (path.length === 1) {
                return copy.filter(c => c.id !== path[0]);
            } else if (path.length === 2) {
                const cat = copy.find(c => c.id === path[0]);
                if (cat && cat.children) cat.children = cat.children.filter(c => c.id !== path[1]);
            } else if (path.length === 3) {
                const cat = copy.find(c => c.id === path[0]);
                const sub = cat?.children?.find(c => c.id === path[1]);
                if (sub && sub.subLinks) sub.subLinks = sub.subLinks.filter(l => (l.id || l.label) !== path[2]);
            }
            return copy;
        });

        // If we deleted the folder we are currently viewing, go up one level
        if (selectedPath.join(',') === path.join(',')) {
            setSelectedPath(path.slice(0, -1));
        }
    };

    // Derived State
    const currentLevel = selectedPath.length; // 0 = root, 1 = cat, 2 = sub

    let currentChildren = [];
    let currentTitle = 'כל התוכן';
    let currentModel = null;

    if (currentLevel === 0) {
        currentChildren = navItems.map(c => ({ ...c, nodePath: [c.id], type: 'folder', title: c.label }));
    } else if (currentLevel === 1) {
        const cat = navItems.find(c => c.id === selectedPath[0]);
        currentModel = cat;
        currentTitle = cat?.label || 'קטגוריה לֹא יְדוּעָה';
        currentChildren = (cat?.children || []).map(c => ({ ...c, nodePath: [cat.id, c.id], type: 'folder', title: c.title || c.label }));
    } else if (currentLevel === 2) {
        const cat = navItems.find(c => c.id === selectedPath[0]);
        const sub = cat?.children?.find(c => c.id === selectedPath[1]);
        currentModel = sub;
        currentTitle = sub?.title || sub?.label || 'כרטיסייה לֹא יְדוּעָה';
        currentChildren = (sub?.subLinks || []).map(l => ({ ...l, id: l.id || l.label, nodePath: [cat.id, sub.id, l.id || l.label], type: 'file', title: l.label }));
    }

    // Filter children by search
    if (searchTerm) {
        currentChildren = currentChildren.filter(c => c.title.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    if (loading && !navItems.length) {
        return <div className="p-8 text-center text-gray-500 dark:text-gray-400">טוען מבנה ניווט...</div>;
    }

    return (
        <div className="flex h-[calc(100vh-140px)] min-h-[600px] border border-gray-200 dark:border-[#1f1f22] rounded-xl overflow-hidden text-gray-700 dark:text-gray-200 bg-white dark:bg-[#050505] shadow-2xl font-sans" dir="rtl">
            {/* SIDEBAR */}
            <div className="w-64 bg-gray-50 dark:bg-[#0a0a0c] border-l border-gray-200 dark:border-[#1f1f22] flex flex-col shrink-0 custom-scrollbar-thin">
                {/* Header */}
                <div className="h-14 border-b border-gray-200 dark:border-[#1f1f22] flex items-center px-4 gap-2 bg-gray-100 dark:bg-[#0f0f11] shrink-0">
                    <Folder className="text-red-500" size={18} />
                    <span className="font-bold text-sm tracking-wide text-gray-900 dark:text-gray-100">סייר ניווט</span>
                </div>
                {/* Tree */}
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5" style={{ scrollbarWidth: 'thin', scrollbarColor: sidebarScrollbarColor }}>
                    {/* Root Node */}
                    <div
                        className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 rounded-md transition ${selectedPath.length === 0 ? 'bg-red-500/10 text-red-500' : 'text-gray-700 dark:text-gray-300'}`}
                        onClick={() => setSelectedPath([])}
                    >
                        <Home size={16} />
                        <span className="text-sm font-semibold select-none">כל התוכן</span>
                    </div>

                    {/* Categories */}
                    {navItems.map(cat => {
                        const isCatExpanded = expandedNodes.has(cat.id);
                        const isCatSelected = selectedPath.length === 1 && selectedPath[0] === cat.id;
                        const isCatPathActive = selectedPath.length > 0 && selectedPath[0] === cat.id;

                        return (
                            <div key={cat.id}>
                                <div
                                    className={`flex items-center gap-1.5 py-1.5 pr-2 pl-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 rounded-md transition group ${isCatSelected ? 'bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white' : isCatPathActive ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}
                                    onClick={() => setSelectedPath([cat.id])}
                                >
                                    <button
                                        className="p-0.5 hover:bg-gray-200 dark:hover:bg-white/10 rounded transition-colors"
                                        onClick={(e) => toggleExpand(cat.id, e)}
                                    >
                                        <ChevronLeft size={14} className={`transform transition-transform duration-200 ${isCatExpanded ? '-rotate-90' : ''}`} />
                                    </button>
                                    <div className="relative">
                                        <DynamicIcon name={isCatExpanded || isCatSelected ? 'FolderOpen' : 'Folder'} size={14} className={isCatSelected || isCatPathActive ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.5)]' : 'text-blue-500'} />
                                    </div>
                                    <span className="text-sm truncate select-none flex-1 font-medium">{cat.label}</span>
                                    {cat.isDirectLink && (
                                        <ExternalLink size={12} className="text-red-500/60 shrink-0" title="Direct Link" />
                                    )}
                                </div>

                                {/* Subcategories (if expanded) */}
                                {isCatExpanded && cat.children && (
                                    <div className="space-y-0.5 mt-0.5">
                                        {cat.children.map(sub => {
                                            const isSubSelected = selectedPath.length === 2 && selectedPath[1] === sub.id;
                                            return (
                                                <div
                                                    key={sub.id}
                                                    className={`flex items-center gap-2 py-1.5 pr-8 pl-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 rounded-md transition ${isSubSelected ? 'bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                                    onClick={() => setSelectedPath([cat.id, sub.id])}
                                                >
                                                    <DynamicIcon name="FileText" size={14} className={isSubSelected ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'} />
                                                    <span className="text-sm truncate select-none">{sub.title || sub.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-gray-200 dark:border-[#1f1f22] bg-gray-100 dark:bg-[#0f0f11] shrink-0">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full flex justify-center items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-md font-bold transition shadow-lg shadow-red-900/20 text-sm"
                    >
                        <Save size={16} />
                        <span>{isSaving ? 'שומר...' : 'שמור שינויים'}</span>
                    </button>
                </div>
            </div>

            {/* MAIN AREA */}
            <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#050505]">
                {/* Address Bar */}
                <div className="h-14 border-b border-gray-200 dark:border-[#1f1f22] flex items-center justify-between px-4 bg-gray-50 dark:bg-[#0a0a0c] shrink-0">
                    <div className="flex items-center gap-1 text-sm bg-gray-50 dark:bg-[#141418] border border-gray-300 dark:border-[#252528] rounded-md px-2 py-1 shadow-inner h-8 overflow-hidden">
                        <button onClick={() => setSelectedPath([])} className="p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded transition text-gray-500 dark:text-gray-400 hover:text-red-400">
                            <Home size={14} />
                        </button>
                        {selectedPath.length > 0 && (
                            <>
                                <ChevronLeft size={14} className="text-gray-400 dark:text-gray-600 mx-1 shrink-0" />
                                <button
                                    onClick={() => setSelectedPath([selectedPath[0]])}
                                    className={`px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition truncate max-w-[150px] ${selectedPath.length === 1 ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                >
                                    {navItems.find(c => c.id === selectedPath[0])?.label || 'קטגוריה'}
                                </button>
                            </>
                        )}
                        {selectedPath.length > 1 && (
                            <>
                                <ChevronLeft size={14} className="text-gray-400 dark:text-gray-600 mx-1 shrink-0" />
                                <button className="px-2 py-1 rounded text-gray-900 dark:text-white font-medium truncate max-w-[150px]">
                                    {navItems.find(c => c.id === selectedPath[0])?.children?.find(s => s.id === selectedPath[1])?.title || 'כרטיסייה'}
                                </button>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                            <input
                                type="text"
                                placeholder="חיפוש בתיקייה..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-48 bg-gray-50 dark:bg-[#141418] border border-gray-300 dark:border-[#252528] rounded-md pr-8 pl-3 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-red-500 transition shadow-inner"
                            />
                        </div>
                    </div>
                </div>

                {/* ERROR BANNER */}
                {error && (
                    <div className="mx-6 my-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-500/50 rounded-lg flex items-center gap-3 shrink-0">
                        <AlertTriangle size={18} className="text-red-400" />
                        <span className="text-red-700 dark:text-red-200 text-sm">{error}</span>
                    </div>
                )}

                {/* Properties Panel (if not root) */}
                {selectedPath.length > 0 && currentModel && (
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-[#1f1f22] bg-gray-50 dark:bg-[#0a0a0c] flex items-center gap-4 shrink-0 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.5)] z-20 relative">
                        <div className="w-14 h-14 bg-gray-50 dark:bg-[#141418] rounded-2xl flex items-center justify-center border border-gray-300 dark:border-[#252528] shrink-0 p-2 shadow-inner">
                            <DynamicIcon name={currentModel.icon || 'Folder'} size={28} className={currentLevel === 1 ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.4)]' : 'text-gray-700 dark:text-gray-300 drop-shadow-[0_0_8px_rgba(209,213,219,0.2)]'} />
                        </div>
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">שם תצוגה</label>
                                <input
                                    type="text"
                                    value={currentModel.title || currentModel.label || ''}
                                    onChange={(e) => updateNode(selectedPath, currentLevel === 1 ? 'label' : 'title', e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-[#141418] border border-gray-300 dark:border-[#252528] hover:border-gray-600 rounded-md px-3 py-1.5 text-gray-900 dark:text-white focus:outline-none focus:border-red-500 focus:bg-gray-100 dark:focus:bg-[#1a1a1f] text-sm font-semibold transition"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">אייקון (Lucide)</label>
                                <button
                                    onClick={() => setIconPicker({ isOpen: true, targetPath: selectedPath, currentIcon: currentModel.icon || '' })}
                                    className="w-full h-[34px] flex items-center justify-between bg-gray-50 dark:bg-[#141418] border border-gray-300 dark:border-[#252528] hover:border-red-400 dark:hover:border-red-500 rounded-md px-3 py-1.5 text-gray-900 dark:text-white transition focus:outline-none focus:ring-1 focus:ring-red-500"
                                >
                                    <div className="flex items-center gap-2">
                                        <DynamicIcon name={currentModel.icon || 'HelpCircle'} size={16} className="text-blue-500 dark:text-blue-400" />
                                        <span className="text-sm font-medium font-mono truncate">{currentModel.icon || 'בחר אייקון'}</span>
                                    </div>
                                    <ChevronDown size={14} className="text-gray-400" />
                                </button>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">קישור ישיר (URL)</label>
                                <input
                                    type="url"
                                    value={currentModel.url || ''}
                                    onChange={(e) => updateNode(selectedPath, 'url', e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-[#141418] border border-gray-300 dark:border-[#252528] hover:border-gray-600 rounded-md px-3 py-1.5 text-blue-600 dark:text-blue-300 focus:outline-none focus:border-red-500 focus:bg-gray-100 dark:focus:bg-[#1a1a1f] text-sm transition text-left dir-ltr placeholder-gray-500 dark:placeholder-[#333]"
                                    placeholder="https://"
                                    dir="ltr"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* List Header */}
                <div className="px-6 py-4 flex items-center justify-between shrink-0 bg-white dark:bg-[#050505]">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        {currentLevel === 0 ? <Home size={20} className="text-gray-500 dark:text-gray-400" /> : <FolderOpen size={20} className="text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.5)]" />}
                        {currentTitle}
                        <span className="mr-2 text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-[#141418] px-2.5 py-1 rounded-full border border-gray-300 dark:border-[#252528] tracking-widest leading-none translate-y-[1px]">
                            {currentChildren.length} פריטים
                        </span>
                    </h2>
                    <button
                        onClick={addNode}
                        className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-md transition shadow-[0_0_10px_rgba(220,38,38,0.2)] hover:shadow-[0_0_15px_rgba(220,38,38,0.4)] text-sm font-bold"
                    >
                        <Plus size={16} />
                        <span>{currentLevel === 0 ? 'קטגוריה חדשה' : currentLevel === 1 ? 'כרטיסייה חדשה' : 'לינק חדש'}</span>
                    </button>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-y-auto px-6 pb-6 relative" style={{ scrollbarWidth: 'thin', scrollbarColor: contentScrollbarColor }}>
                    {currentChildren.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 pb-20">
                            <FolderOpen size={56} className="text-gray-500 dark:text-gray-700 mb-4" />
                            <p className="text-lg font-medium">התיקייה ריקה.</p>
                            <p className="text-sm mt-1 text-gray-400 dark:text-gray-600">לחץ על כפתור ההוספה כדי ליצור תוכן חדש בנתיב זה.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-right border-collapse">
                            <thead className="sticky top-0 bg-gradient-to-b from-white to-white/95 dark:from-[#050505] dark:to-[#050505]/95 z-10 backdrop-blur-sm">
                                <tr className="border-b border-gray-200 dark:border-[#1f1f22] text-gray-400 dark:text-gray-500">
                                    <th className="pb-3 pt-2 px-2 font-medium w-12 text-center"></th>
                                    <th className="pb-3 pt-2 px-2 font-medium w-1/3">שם התוכן</th>
                                    <th className="pb-3 pt-2 px-2 font-medium w-1/4">אייקון</th>
                                    <th className="pb-3 pt-2 px-2 font-medium">קישור ישיר</th>
                                    <th className="pb-3 pt-2 px-2 font-medium w-24 text-center">פעולות</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-[#1f1f22]/50">
                                {currentChildren.map(child => (
                                    <tr
                                        key={child.id}
                                        className="hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors group cursor-default"
                                        onDoubleClick={() => child.type === 'folder' && setSelectedPath(child.nodePath)}
                                    >
                                        <td className="py-2.5 px-2">
                                            <div className="w-10 h-10 mx-auto rounded-xl bg-gray-50 dark:bg-[#141418] flex items-center justify-center border border-gray-300 dark:border-[#252528] group-hover:bg-gray-100 dark:group-hover:bg-[#1a1a1f] group-hover:border-gray-700 transition-colors shadow-inner">
                                                {child.type === 'folder' ? (
                                                    <Folder className="text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.4)]" size={20} />
                                                ) : (
                                                    <LinkIcon className="text-gray-700 dark:text-gray-300 drop-shadow-[0_0_5px_rgba(209,213,219,0.3)]" size={18} />
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-2">
                                            <input
                                                type="text"
                                                value={child.title}
                                                onChange={(e) => {
                                                    let field = 'title';
                                                    if (currentLevel === 0) field = 'label';
                                                    else if (currentLevel === 1) field = 'title';
                                                    else if (currentLevel === 2) field = 'label';
                                                    updateNode(child.nodePath, field, e.target.value);
                                                }}
                                                className="bg-transparent border border-transparent hover:border-[#333] focus:border-red-500 focus:bg-gray-50 dark:focus:bg-[#141418] rounded-md pl-2 pr-2 py-1.5 transition w-full text-sm font-bold text-gray-700 dark:text-gray-200 outline-none hover:bg-gray-100 dark:hover:bg-black/20 focus:shadow-inner"
                                            />
                                        </td>
                                        <td className="py-2.5 px-2">
                                            <button
                                                onClick={() => setIconPicker({ isOpen: true, targetPath: child.nodePath, currentIcon: child.icon || '' })}
                                                className="w-full flex items-center justify-between gap-2 bg-transparent border border-transparent hover:border-[#333] hover:bg-gray-100 dark:hover:bg-black/20 focus:border-red-500 focus:bg-gray-50 dark:focus:bg-[#141418] rounded-md transition pl-2 pr-2 py-1.5 focus:shadow-inner"
                                            >
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <div className="w-5 flex justify-center shrink-0">
                                                        <DynamicIcon name={child.icon || 'HelpCircle'} size={16} className="text-gray-500 dark:text-gray-400" />
                                                    </div>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate text-left dir-ltr">
                                                        {child.icon || 'בחר אייקון...'}
                                                    </span>
                                                </div>
                                            </button>
                                        </td>
                                        <td className="py-2.5 px-2">
                                            <input
                                                type="url"
                                                value={child.url || ''}
                                                onChange={(e) => updateNode(child.nodePath, 'url', e.target.value)}
                                                className="bg-transparent border border-transparent hover:border-[#333] focus:border-red-500 focus:bg-gray-50 dark:focus:bg-[#141418] rounded-md pl-2 pr-2 py-1.5 transition w-full text-xs text-blue-600 dark:text-blue-400 outline-none dir-ltr text-left placeholder-gray-500 dark:placeholder-[#333] hover:bg-gray-100 dark:hover:bg-black/20 focus:shadow-inner"
                                                placeholder="https://"
                                                dir="ltr"
                                            />
                                        </td>
                                        <td className="py-2.5 px-2">
                                            <div className="flex items-center gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                {child.type === 'folder' && (
                                                    <button
                                                        onClick={() => setSelectedPath(child.nodePath)}
                                                        className="p-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg transition"
                                                        title="פתח תיקייה"
                                                    >
                                                        <ChevronLeft size={18} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => removeNode(child.nodePath)}
                                                    className="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition"
                                                    title="מחק"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Icon Picker Modal */}
            <IconPickerModal
                isOpen={iconPicker.isOpen}
                onClose={() => setIconPicker({ isOpen: false, targetPath: null, currentIcon: '' })}
                currentIcon={iconPicker.currentIcon}
                onSelect={(iconName) => {
                    if (iconPicker.targetPath) {
                        updateNode(iconPicker.targetPath, 'icon', iconName);
                    }
                }}
            />
        </div>
    );
}
