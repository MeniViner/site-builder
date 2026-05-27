import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useNavigation } from '../context/NavigationContext';
import { useTheme } from '../context/ThemeContext';
import {
    Plus, Trash2, AlertTriangle, ChevronLeft, ChevronDown,
    Folder, FolderOpen, FileText, Link as LinkIcon, Home, Search,
    ExternalLink, GripVertical, Image as ImageIcon, Loader2, Upload, Palette
} from 'lucide-react';
import IconPickerModal from './IconPickerModal';
import Tooltip from './Tooltip';
import { confirmToast } from '../utils/confirmToast';
import { AdminPageHelpButton, HelpLabel, HelpTooltipButton } from './AdminHelp';
import { uploadImage } from '../utils/sharepointUtils';
import NavVisual from './NavVisual';
import { normalizeLinkTarget } from '../utils/linkTargets';

function createNodeId(prefix) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function asText(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
}

function normalizeAiLink(link, index, parentId) {
    const label = asText(link?.label || link?.title, `לינק ${index + 1}`);
    return {
        id: asText(link?.id, createNodeId(`link_${parentId}_${index}`)),
        label,
        icon: asText(link?.icon, 'Link'),
        iconUrl: asText(link?.iconUrl || link?.imageUrl || link?.image, ''),
        url: asText(link?.url, ''),
    };
}

function normalizeAiSubCategory(subcategory, index, categoryId) {
    const title = asText(subcategory?.title || subcategory?.label, `כרטיסייה ${index + 1}`);
    const subLinksSource = Array.isArray(subcategory?.subLinks)
        ? subcategory.subLinks
        : (Array.isArray(subcategory?.children) ? subcategory.children : []);

    return {
        id: asText(subcategory?.id, createNodeId(`sub_${categoryId}_${index}`)),
        title,
        label: title,
        icon: asText(subcategory?.icon, 'FileText'),
        iconUrl: asText(subcategory?.iconUrl || subcategory?.imageUrl || subcategory?.image, ''),
        url: asText(subcategory?.url, ''),
        subLinks: subLinksSource.map((link, linkIndex) => normalizeAiLink(link, linkIndex, categoryId)),
    };
}

function normalizeAiNavigationTree(payload) {
    const source = Array.isArray(payload?.navItems) ? payload.navItems : [];
    const normalized = source.map((category, index) => {
        const categoryId = asText(category?.id, createNodeId(`cat_${index}`));
        const children = Array.isArray(category?.children) ? category.children : [];

        return {
            id: categoryId,
            label: asText(category?.label || category?.title, `קטגוריה ${index + 1}`),
            icon: asText(category?.icon, 'Folder'),
            iconUrl: asText(category?.iconUrl || category?.imageUrl || category?.image, ''),
            url: asText(category?.url, ''),
            children: children.map((subCategory, subIndex) => normalizeAiSubCategory(subCategory, subIndex, categoryId)),
        };
    });

    if (!normalized.length) {
        throw new Error('לא התקבל מבנה ניווט תקין מה-AI');
    }

    return normalized;
}

function moveArrayItem(source, fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return source;
    const copy = [...source];
    const [item] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, item);
    return copy;
}

export default function AdminNavigation() {
    const navigate = useNavigate();
    const MAX_TOP_LEVEL_NAV_ITEMS = 12;
    const { navItems: initialNavItems, loading, error, saveNavigation } = useNavigation();
    const { effectiveMode } = useTheme();
    const [navItems, setNavItems] = useState(initialNavItems || []);
    const [isSaving, setIsSaving] = useState(false);
    const lastSavedRef = useRef(null);
    const iconImageInputRef = useRef(null);
    const [imageUploadTargetPath, setImageUploadTargetPath] = useState(null);
    const [uploadingIconPathKey, setUploadingIconPathKey] = useState('');

    useEffect(() => {
        if (initialNavItems?.length !== undefined) {
            setNavItems(initialNavItems);
            lastSavedRef.current = JSON.stringify(initialNavItems);
        }
    }, [initialNavItems]);

    useEffect(() => {
        const current = JSON.stringify(navItems);
        if (lastSavedRef.current === null || current === lastSavedRef.current) return;
        const t = setTimeout(async () => {
            setIsSaving(true);
            const success = await saveNavigation(navItems);
            setIsSaving(false);
            if (success) lastSavedRef.current = current;
            else toast.error('שגיאה בשמירת נתוני הניווט.');
        }, 1200);
        return () => clearTimeout(t);
    }, [navItems]);

    // Icon Picker State
    const [iconPicker, setIconPicker] = useState({ isOpen: false, targetPath: null, currentIcon: '', defaultSearchTerm: '' });

    // Navigation State
    const [selectedPath, setSelectedPath] = useState([]); // [] = root, [catId], [catId, subId]
    const [expandedNodes, setExpandedNodes] = useState(new Set(['root'])); // Sidebar tree expansion
    const [searchTerm, setSearchTerm] = useState('');
    const [dragState, setDragState] = useState(null);
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

    const reorderItems = (sourcePath, draggedId, targetId) => {
        if (!draggedId || !targetId || draggedId === targetId) return;
        setNavItems((prev) => {
            const copy = JSON.parse(JSON.stringify(prev));

            if (sourcePath.length === 0) {
                const fromIndex = copy.findIndex((item) => item.id === draggedId);
                const toIndex = copy.findIndex((item) => item.id === targetId);
                return moveArrayItem(copy, fromIndex, toIndex);
            }

            if (sourcePath.length === 1) {
                const category = copy.find((item) => item.id === sourcePath[0]);
                if (!category || !Array.isArray(category.children)) return copy;
                const fromIndex = category.children.findIndex((item) => item.id === draggedId);
                const toIndex = category.children.findIndex((item) => item.id === targetId);
                category.children = moveArrayItem(category.children, fromIndex, toIndex);
                return copy;
            }

            if (sourcePath.length === 2) {
                const category = copy.find((item) => item.id === sourcePath[0]);
                const subCategory = category?.children?.find((item) => item.id === sourcePath[1]);
                if (!subCategory || !Array.isArray(subCategory.subLinks)) return copy;
                const fromIndex = subCategory.subLinks.findIndex((item) => (item.id || item.label) === draggedId);
                const toIndex = subCategory.subLinks.findIndex((item) => (item.id || item.label) === targetId);
                subCategory.subLinks = moveArrayItem(subCategory.subLinks, fromIndex, toIndex);
                return copy;
            }

            return copy;
        });
    };

    const pathKey = (path) => (Array.isArray(path) ? path.join('|') : '');

    const getNodeLabel = (path) => {
        if (!Array.isArray(path)) return '';
        if (path.length === 1) {
            const cat = navItems.find(c => c.id === path[0]);
            return cat?.label || cat?.title || '';
        }
        if (path.length === 2) {
            const cat = navItems.find(c => c.id === path[0]);
            const sub = cat?.children?.find(c => c.id === path[1]);
            return sub?.title || sub?.label || '';
        }
        if (path.length === 3) {
            const cat = navItems.find(c => c.id === path[0]);
            const sub = cat?.children?.find(c => c.id === path[1]);
            const link = sub?.subLinks?.find(l => (l.id || l.label) === path[2]);
            return link?.label || link?.title || '';
        }
        return '';
    };

    const updateNodeFields = (path, fields) => {
        setNavItems(prev => {
            const copy = JSON.parse(JSON.stringify(prev));
            const assignFields = (node) => {
                if (!node) return;
                Object.entries(fields || {}).forEach(([field, value]) => {
                    if (field === 'title' || field === 'label') {
                        node.title = value;
                        node.label = value;
                    } else {
                        node[field] = value;
                    }
                });
            };

            if (path.length === 1) {
                const cat = copy.find(c => c.id === path[0]);
                assignFields(cat);
            } else if (path.length === 2) {
                const cat = copy.find(c => c.id === path[0]);
                const sub = cat?.children?.find(c => c.id === path[1]);
                assignFields(sub);
            } else if (path.length === 3) {
                const cat = copy.find(c => c.id === path[0]);
                const sub = cat?.children?.find(c => c.id === path[1]);
                const link = sub?.subLinks?.find(l => (l.id || l.label) === path[2]);
                assignFields(link);
            }
            return copy;
        });
    };

    // Generic Update using deep clone
    const updateNode = (path, field, value) => {
        updateNodeFields(path, { [field]: value });
    };

    const openIconPicker = (path, currentIcon = '') => {
        setIconPicker({
            isOpen: true,
            targetPath: path,
            currentIcon,
            defaultSearchTerm: getNodeLabel(path),
        });
    };

    const triggerIconImageUpload = (path) => {
        setImageUploadTargetPath(path);
        window.setTimeout(() => iconImageInputRef.current?.click(), 0);
    };

    const handleIconImageUpload = async (event) => {
        const file = event.target.files?.[0];
        const targetPath = imageUploadTargetPath;
        event.target.value = '';
        if (!file || !targetPath) return;

        const key = pathKey(targetPath);
        setUploadingIconPathKey(key);
        try {
            const iconUrl = await uploadImage(file, 'NavigationIcons');
            updateNodeFields(targetPath, { iconUrl, icon: '' });
            toast.success('התמונה הועלתה לאזור אייקון הצד');
        } catch (err) {
            toast.error(err?.message || 'העלאת תמונת האייקון נכשלה');
        } finally {
            setUploadingIconPathKey('');
            setImageUploadTargetPath(null);
        }
    };

    // Adders
    const addNode = () => {
        if (selectedPath.length === 0) {
            if (navItems.length >= MAX_TOP_LEVEL_NAV_ITEMS) {
                toast.warning(`לא ניתן להוסיף יותר מ-${MAX_TOP_LEVEL_NAV_ITEMS} קטגוריות ראשיות.`);
                return;
            }
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
        confirmToast({
            title: 'מחיקת פריט ניווט',
            message: 'האם אתה בטוח שברצונך למחוק פריט זה?',
            confirmText: 'מחק',
            cancelText: 'ביטול',
            type: 'warning',
        }).then((confirmed) => {
            if (!confirmed) return;

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
            setSelectedPath((prevSelected) => {
                if (prevSelected.join(',') !== path.join(',')) return prevSelected;
                return path.slice(0, -1);
            });
        });
    };

    const buildNavigationAiPrompt = (instruction) => {
        const snapshot = navItems.slice(0, 12);
        return [
            'אתה ארכיטקט ניווט לפורטל ארגוני בעברית.',
            'החזר JSON בלבד ללא טקסט נוסף.',
            'סכימה נדרשת:',
            '{',
            '  "navItems": [',
            '    {',
            '      "label": "string",',
            '      "icon": "Folder",',
            '      "url": "optional-url",',
            '      "children": [',
            '        {',
            '          "title": "string",',
            '          "icon": "FileText",',
            '          "url": "optional-url",',
            '          "subLinks": [',
            '            { "label": "string", "icon": "Link", "url": "https://..." }',
            '          ]',
            '        }',
            '      ]',
            '    }',
            '  ]',
            '}',
            'חוקים:',
            '- שמור על עברית ברורה וקצרה.',
            '- אם יש url, שיהיה מלא ומתחיל ב-http/https.',
            '- אל תחזיר שדות מיותרים.',
            `נתונים קיימים: ${JSON.stringify(snapshot)}`,
            `בקשת המשתמש: ${instruction}`,
        ].join('\n');
    };

    const applyAiNavigation = (parsed) => {
        const normalized = normalizeAiNavigationTree(parsed);
        if (normalized.length > MAX_TOP_LEVEL_NAV_ITEMS) {
            toast.error(`מבנה הניווט מכיל ${normalized.length} קטגוריות ראשיות. המקסימום המותר הוא ${MAX_TOP_LEVEL_NAV_ITEMS}.`);
            return;
        }
        const expanded = new Set(['root', ...normalized.map((item) => item.id)]);
        setNavItems(normalized);
        setExpandedNodes(expanded);
        setSelectedPath([]);
        toast.success('הצעת AI הוחלה על מבנה הניווט');
    };

    // Derived State
    const currentLevel = selectedPath.length; // 0 = root, 1 = cat, 2 = sub

    let currentChildren = [];
    let currentTitle = 'כל התוכן';
    let currentModel = null;
    const fallbackNodeIcon = currentLevel === 1 ? 'Folder' : 'FileText';
    // ספירה: אם קטגוריה/תת־קטגוריה מוגדרת כלינק (יש לה URL) — לא סופרים את התוכן שבתוכה
    const navigationStats = navItems.reduce(
        (acc, category) => {
            acc.categories += 1;
            const subcategories = Array.isArray(category.children) ? category.children : [];
            acc.subcategories += subcategories.length;

            const categoryHasUrl = (category.url || '').trim();
            if (categoryHasUrl) {
                acc.activeLinks += 1;
                return acc;
            }

            subcategories.forEach((subcategory) => {
                const subHasUrl = (subcategory.url || '').trim();
                if (subHasUrl) {
                    acc.activeLinks += 1;
                    return;
                }
                const subLinks = Array.isArray(subcategory.subLinks) ? subcategory.subLinks : [];
                const linksWithUrl = subLinks.filter((link) => (link.url || '').trim());
                acc.innerLinks += linksWithUrl.length;
                acc.activeLinks += linksWithUrl.length;
            });

            return acc;
        },
        { categories: 0, subcategories: 0, innerLinks: 0, activeLinks: 0 }
    );

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
    const currentUsesImageVisual = Boolean(currentModel?.iconUrl);

    if (loading && !navItems.length) {
        return <div className="p-8 text-center text-gray-500 dark:text-gray-400">טוען מבנה ניווט...</div>;
    }

    return (
        <div className="flex h-[calc(100vh-40px)] min-h-[600px] border border-gray-200 dark:border-[#1f1f22] rounded-xl overflow-hidden text-gray-700 dark:text-gray-200 bg-white dark:bg-[#050505] shadow-2xl font-sans" dir="rtl">
            {/* SIDEBAR */}
            <div className="w-64 bg-gray-50 dark:bg-[#0a0a0c] border-l border-gray-200 dark:border-[#1f1f22] flex flex-col shrink-0 custom-scrollbar-thin">
                {/* Header */}
                <div className="h-14 border-b border-gray-200 dark:border-[#1f1f22] flex items-center px-4 gap-2 bg-gray-100 dark:bg-[#0f0f11] shrink-0">
                    <Folder className="text-primary-500" size={18} />
                    <span className="font-bold text-sm tracking-wide text-gray-900 dark:text-gray-100">סייר ניווט</span>
                </div>
                {/* Tree */}
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5" style={{ scrollbarWidth: 'thin', scrollbarColor: sidebarScrollbarColor }}>
                    {/* Root Node */}
                    <div
                        className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 rounded-md transition ${selectedPath.length === 0 ? 'bg-primary-500/10 text-primary-500' : 'text-gray-700 dark:text-gray-300'}`}
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
                                        <NavVisual
                                            item={cat}
                                            icon={cat.icon || (isCatExpanded || isCatSelected ? 'FolderOpen' : 'Folder')}
                                            size={14}
                                            className={isCatSelected || isCatPathActive ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.5)]' : 'text-blue-500'}
                                            imageClassName="w-3.5 h-3.5 object-contain"
                                            fallbackIcon={isCatExpanded || isCatSelected ? 'FolderOpen' : 'Folder'}
                                        />
                                    </div>
                                    <span className="text-sm truncate select-none flex-1 font-medium">{cat.label}</span>
                                        <Tooltip text="Direct Link">
                                            <ExternalLink size={12} className="text-primary-500/60 shrink-0" />
                                        </Tooltip>
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
                                                    <NavVisual
                                                        item={sub}
                                                        icon={sub.icon || 'FileText'}
                                                        size={14}
                                                        className={isSubSelected ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}
                                                        imageClassName="w-3.5 h-3.5 object-contain"
                                                        fallbackIcon="FileText"
                                                    />
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

                <div className="p-3 border-t border-gray-200 dark:border-[#1f1f22] bg-gray-100 dark:bg-[#0f0f11] shrink-0 space-y-3">
                    <div className="rounded-lg bg-white dark:bg-[#141418] border border-gray-200 dark:border-[#252528] p-3 space-y-2.5 shadow-inner">
                        <p className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                            <Folder size={14} className="text-blue-500 dark:text-blue-400 shrink-0" />
                            <span>סה"כ <strong className="text-gray-800 dark:text-gray-200">{navigationStats.categories}</strong> קטגוריות, <strong className="text-gray-800 dark:text-gray-200">{navigationStats.subcategories}</strong> תתי קטגוריות ובתוכן <strong className="text-gray-800 dark:text-gray-200">{navigationStats.innerLinks}</strong> לינקים</span>
                        </p>
                        <p className="flex items-center gap-2 text-xs font-medium text-primary-600 dark:text-primary-400 pt-1 border-t border-gray-100 dark:border-[#252528]">
                            <LinkIcon size={14} className="shrink-0" />
                            <span>סה"כ לינקים פעילים: <strong>{navigationStats.activeLinks}</strong></span>
                        </p>
                    </div>
                    {isSaving && <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">שומר...</span>}
                </div>
            </div>

            {/* MAIN AREA */}
            <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#050505]">
                {/* Address Bar */}
                <div className="h-14 border-b border-gray-200 dark:border-[#1f1f22] flex items-center justify-between px-4 bg-gray-50 dark:bg-[#0a0a0c] shrink-0">
                    <div className="flex items-center gap-1 text-sm bg-gray-50 dark:bg-[#141418] border border-gray-300 dark:border-[#252528] rounded-md px-2 py-1 shadow-inner h-8 overflow-hidden">
                        <button onClick={() => setSelectedPath([])} className="p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded transition text-gray-500 dark:text-gray-400 hover:text-primary-400">
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

                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => navigate('/admin/theme?tab=regularLinksLayout')}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 bg-gray-50 px-3 text-xs font-bold text-gray-700 transition hover:border-primary-400 hover:text-primary-500 dark:border-[#252528] dark:bg-[#141418] dark:text-gray-300 dark:hover:text-primary-400"
                        >
                            <Palette size={14} />
                            הגדרות עיצוב
                        </button>
                        <AdminPageHelpButton pageId="navigation" />
                        <div className="relative">
                            <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                            <input
                                type="text"
                                placeholder="חפש לינק מסוים"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-48 bg-gray-50 dark:bg-[#141418] border border-gray-300 dark:border-[#252528] rounded-md pr-8 pl-3 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-primary-500 transition shadow-inner"
                            />
                        </div>
                    </div>
                </div>

                {/* ERROR BANNER */}
                {error && (
                    <div className="mx-6 my-4 p-3 bg-primary-50 dark:bg-primary-900/30 border border-primary-500/50 rounded-lg flex items-center gap-3 shrink-0">
                        <AlertTriangle size={18} className="text-primary-400" />
                        <span className="text-primary-700 dark:text-primary-200 text-sm">{error}</span>
                    </div>
                )}

                {/* Properties Panel (if not root) */}
                {selectedPath.length > 0 && currentModel && (
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-[#1f1f22] bg-gray-50 dark:bg-[#0a0a0c] flex items-center gap-4 shrink-0 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.5)] z-20 relative">
                        <div className="w-14 h-14 bg-gray-50 dark:bg-[#141418] rounded-2xl flex items-center justify-center border border-gray-300 dark:border-[#252528] shrink-0 p-2 shadow-inner">
                            <NavVisual
                                item={currentModel}
                                icon={currentModel.icon || (currentLevel === 1 ? 'Folder' : 'FileText')}
                                size={28}
                                className={currentLevel === 1 ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.4)]' : 'text-gray-700 dark:text-gray-300 drop-shadow-[0_0_8px_rgba(209,213,219,0.2)]'}
                                imageClassName="w-9 h-9 object-contain"
                                fallbackIcon={currentLevel === 1 ? 'Folder' : 'FileText'}
                            />
                        </div>
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div className="space-y-1.5">
                                <HelpLabel
                                    as="span"
                                    className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider"
                                    wrapperClassName="flex items-center gap-2"
                                    helpTitle="שם תצוגה"
                                    helpDescription="זה השם שהמשתמשים יראו בתוך האתר."
                                >
                                    שם תצוגה
                                </HelpLabel>
                                <input
                                    type="text"
                                    value={currentModel.title || currentModel.label || ''}
                                    onChange={(e) => updateNode(selectedPath, currentLevel === 1 ? 'label' : 'title', e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-[#141418] border border-gray-300 dark:border-[#252528] hover:border-gray-600 rounded-md px-3 py-1.5 text-gray-900 dark:text-white focus:outline-none focus:border-primary-500 focus:bg-gray-100 dark:focus:bg-[#1a1a1f] text-sm font-semibold transition"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <HelpLabel
                                    as="span"
                                    className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider"
                                    wrapperClassName="flex items-center gap-2"
                                    helpTitle="אייקון"
                                    helpDescription="האייקון הקטן שמופיע ליד הפריט ועוזר לזהות אותו במהירות."
                                >
                                    אייקון או תמונה
                                </HelpLabel>
                                <div className="flex items-center gap-2 rounded-md border border-gray-300 dark:border-[#252528] bg-gray-50 dark:bg-[#141418] p-1">
                                    <button
                                        type="button"
                                        onClick={() => updateNodeFields(selectedPath, { iconUrl: '' })}
                                        className={`flex-1 h-8 rounded-md text-xs font-bold transition ${!currentUsesImageVisual ? 'bg-white dark:bg-[#1b1f29] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                    >
                                        מצב אייקון
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => triggerIconImageUpload(selectedPath)}
                                        disabled={uploadingIconPathKey === pathKey(selectedPath)}
                                        className={`flex-1 h-8 rounded-md text-xs font-bold transition disabled:cursor-wait disabled:opacity-70 ${currentUsesImageVisual ? 'bg-white dark:bg-[#1b1f29] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                    >
                                        מצב תמונה
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => openIconPicker(selectedPath, currentModel.icon || '')}
                                        className="min-w-0 flex-1 h-[34px] flex items-center justify-between bg-gray-50 dark:bg-[#141418] border border-gray-300 dark:border-[#252528] hover:border-primary-400 dark:hover:border-primary-500 rounded-md px-3 py-1.5 text-gray-900 dark:text-white transition focus:outline-none focus:ring-1 focus:ring-primary-500"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <NavVisual
                                                item={currentModel}
                                                icon={currentModel.icon || fallbackNodeIcon}
                                                size={16}
                                                className="text-blue-500 dark:text-blue-400"
                                                imageClassName="w-4 h-4 object-contain"
                                            />
                                            <span className="text-sm font-medium font-mono truncate">
                                                {!currentUsesImageVisual ? (currentModel.icon || 'בחר אייקון') : 'תמונה פעילה (לא אייקון)'}
                                            </span>
                                        </div>
                                        <ChevronDown size={14} className="text-gray-400 shrink-0" />
                                    </button>
                                    <Tooltip text="העלה תמונה במקום אייקון">
                                        <button
                                            type="button"
                                            onClick={() => triggerIconImageUpload(selectedPath)}
                                            disabled={uploadingIconPathKey === pathKey(selectedPath)}
                                            className="h-[34px] w-10 rounded-md border border-gray-300 dark:border-[#252528] bg-gray-50 dark:bg-[#141418] text-gray-600 dark:text-gray-300 hover:border-primary-400 hover:text-primary-500 disabled:cursor-wait disabled:opacity-70 flex items-center justify-center transition"
                                        >
                                            {uploadingIconPathKey === pathKey(selectedPath) ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                        </button>
                                    </Tooltip>
                                </div>
                                <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                                    בכל רגע נתון פעיל רק סוג אחד: או אייקון או תמונה.
                                </p>
                                <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-300">
                                    מומלץ להעלות סמלים או לוגואים בלבד, ולא תמונות רגילות.
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                <HelpLabel
                                    as="span"
                                    className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider"
                                    wrapperClassName="flex items-center gap-2"
                                    helpTitle="קישור ישיר"
                                    helpDescription="אפשר להזין כתובת אתר מלאה, נתיב Windows כמו z:/public או c:/library, נתיב Mac כמו /Users/name/Documents, או קישור רשת כמו smb://server/share."
                                >
                                    קישור ישיר (URL)
                                </HelpLabel>
                                <input
                                    type="text"
                                    value={currentModel.url || ''}
                                    onChange={(e) => updateNode(selectedPath, 'url', e.target.value)}
                                    onBlur={(e) => updateNode(selectedPath, 'url', normalizeLinkTarget(e.target.value))}
                                    className="w-full bg-gray-50 dark:bg-[#141418] border border-gray-300 dark:border-[#252528] hover:border-gray-600 rounded-md px-3 py-1.5 text-blue-600 dark:text-blue-300 focus:outline-none focus:border-primary-500 focus:bg-gray-100 dark:focus:bg-[#1a1a1f] text-sm transition text-left dir-ltr placeholder-gray-500 dark:placeholder-[#333]"
                                    placeholder="https:// או z:/public או /Users/name/Documents"
                                    dir="ltr"
                                />
                                <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                                    נתיבי Windows ו-Mac יומרו אוטומטית ל-file:// בזמן שמירה.
                                </p>
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
                    <div className="flex items-center gap-2">
                        <HelpTooltipButton
                            title="הוספת פריט"
                            description={currentLevel === 0 ? 'כאן מוסיפים קטגוריה חדשה לרמה הראשית.' : currentLevel === 1 ? 'כאן מוסיפים תת קטגוריה בתוך הקטגוריה הנוכחית.' : 'כאן מוסיפים קישור חדש בתוך הכרטיסייה הנוכחית.'}
                        />
                        <button
                            onClick={addNode}
                            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-md transition shadow-[0_0_10px_rgba(220,38,38,0.2)] hover:shadow-[0_0_15px_rgba(220,38,38,0.4)] text-sm font-bold"
                        >
                            <Plus size={16} />
                            <span>{currentLevel === 0 ? 'קטגוריה חדשה' : currentLevel === 1 ? 'כרטיסייה חדשה' : 'לינק חדש'}</span>
                        </button>
                        {selectedPath.length > 0 && (
                            <button
                                onClick={() => removeNode(selectedPath)}
                                className="flex items-center gap-1.5 bg-primary-500/10 hover:bg-primary-500/20 text-primary-600 dark:text-primary-400 px-4 py-2 rounded-md transition text-sm font-bold border border-primary-500/30"
                            >
                                <Trash2 size={16} />
                                <span>מחק נוכחי</span>
                            </button>
                        )}
                    </div>
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
                                    <th className="pb-3 pt-2 px-2 font-medium w-10 text-center"></th>
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
                                        draggable
                                        onDragStart={(e) => {
                                            e.dataTransfer.effectAllowed = 'move';
                                            setDragState({ sourcePath: [...selectedPath], draggedId: child.id });
                                        }}
                                        onDragOver={(e) => {
                                            if (!dragState || dragState.sourcePath.join('|') !== selectedPath.join('|')) return;
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'move';
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (!dragState || dragState.sourcePath.join('|') !== selectedPath.join('|')) return;
                                            reorderItems(dragState.sourcePath, dragState.draggedId, child.id);
                                            setDragState(null);
                                        }}
                                        onDragEnd={() => setDragState(null)}
                                        className={`hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors group cursor-default ${dragState?.draggedId === child.id ? 'opacity-50' : ''}`}
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
                                            <div className="w-8 h-10 mx-auto flex items-center justify-center text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 cursor-grab active:cursor-grabbing">
                                                <GripVertical size={16} />
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
                                                className="bg-transparent border border-transparent hover:border-[#333] focus:border-primary-500 focus:bg-gray-50 dark:focus:bg-[#141418] rounded-md pl-2 pr-2 py-1.5 transition w-full text-sm font-bold text-gray-700 dark:text-gray-200 outline-none hover:bg-gray-100 dark:hover:bg-black/20 focus:shadow-inner"
                                            />
                                        </td>
                                        <td className="py-2.5 px-2">
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => openIconPicker(child.nodePath, child.icon || '')}
                                                    className="min-w-0 flex-1 flex items-center justify-between gap-2 bg-transparent border border-transparent hover:border-[#333] hover:bg-gray-100 dark:hover:bg-black/20 focus:border-primary-500 focus:bg-gray-50 dark:focus:bg-[#141418] rounded-md transition pl-2 pr-2 py-1.5 focus:shadow-inner"
                                                >
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <div className="w-5 flex justify-center shrink-0">
                                                            <NavVisual
                                                                item={child}
                                                                icon={child.icon || 'HelpCircle'}
                                                                size={16}
                                                                className="text-gray-500 dark:text-gray-400"
                                                                imageClassName="w-4 h-4 object-contain"
                                                            />
                                                        </div>
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate text-left dir-ltr">
                                                            {child.iconUrl ? 'תמונה (במקום אייקון)' : (child.icon || 'בחר אייקון...')}
                                                        </span>
                                                    </div>
                                                </button>
                                                <Tooltip text="העלה תמונה">
                                                    <button
                                                        type="button"
                                                        onClick={() => triggerIconImageUpload(child.nodePath)}
                                                        disabled={uploadingIconPathKey === pathKey(child.nodePath)}
                                                        className="w-8 h-8 shrink-0 rounded-md border border-transparent text-gray-400 hover:border-primary-400 hover:bg-gray-100 hover:text-primary-500 dark:hover:bg-black/20 disabled:cursor-wait disabled:opacity-70 flex items-center justify-center transition"
                                                    >
                                                        {uploadingIconPathKey === pathKey(child.nodePath) ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                                                    </button>
                                                </Tooltip>
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-2">
                                            <input
                                                type="text"
                                                value={child.url || ''}
                                                onChange={(e) => updateNode(child.nodePath, 'url', e.target.value)}
                                                onBlur={(e) => updateNode(child.nodePath, 'url', normalizeLinkTarget(e.target.value))}
                                                className="bg-transparent border border-transparent hover:border-[#333] focus:border-primary-500 focus:bg-gray-50 dark:focus:bg-[#141418] rounded-md pl-2 pr-2 py-1.5 transition w-full text-xs text-blue-600 dark:text-blue-400 outline-none dir-ltr text-left placeholder-gray-500 dark:placeholder-[#333] hover:bg-gray-100 dark:hover:bg-black/20 focus:shadow-inner"
                                                placeholder="https:// או z:/public או /Users/name/Documents"
                                                dir="ltr"
                                            />
                                        </td>
                                        <td className="py-2.5 px-2">
                                            <div className="flex items-center gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Tooltip text="פתח תיקייה">
                                                    <button
                                                        onClick={() => setSelectedPath(child.nodePath)}
                                                        className="p-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg transition"
                                                    >
                                                        <ChevronLeft size={18} />
                                                    </button>
                                                </Tooltip>
                                                <Tooltip text="מחק">
                                                    <button
                                                        onClick={() => removeNode(child.nodePath)}
                                                        className="p-1.5 bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 hover:text-primary-400 rounded-lg transition"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </Tooltip>
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
            <input
                ref={iconImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleIconImageUpload}
            />
            <IconPickerModal
                isOpen={iconPicker.isOpen}
                onClose={() => setIconPicker({ isOpen: false, targetPath: null, currentIcon: '', defaultSearchTerm: '' })}
                currentIcon={iconPicker.currentIcon}
                defaultSearchTerm={iconPicker.defaultSearchTerm}
                onSelect={(iconName) => {
                    if (iconPicker.targetPath) {
                        updateNodeFields(iconPicker.targetPath, { icon: iconName, iconUrl: '' });
                    }
                }}
            />
        </div>
    );
}
