import React, { useState } from 'react';
import { useNavigation } from '../context/NavigationContext';
import { DynamicIcon } from './DynamicIcon';
import { Plus, Trash2, Save, AlertTriangle, ChevronDown, ChevronUp, Link as LinkIcon, Folder } from 'lucide-react';

export default function AdminNavigation() {
    const { navItems: initialNavItems, loading, error, saveNavigation } = useNavigation();
    const [navItems, setNavItems] = useState(initialNavItems || []);
    const [isSaving, setIsSaving] = useState(false);
    const [expandedNodes, setExpandedNodes] = useState(new Set());

    const toggleExpand = (id) => {
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
            alert('נתוני הניווט נשמרו בהצלחה!');
        } else {
            alert('שגיאה בשמירת נתוני הניווט.');
        }
    };

    // Generic updater
    const updateItem = (parentId, childId, subChildId, field, value) => {
        setNavItems(prev => {
            const newNav = [...prev];

            // Level 1: Category
            if (parentId !== null && childId === null) {
                const catIndex = newNav.findIndex(c => c.id === parentId);
                if (catIndex > -1) newNav[catIndex][field] = value;
            }
            // Level 2: Subcategory (FlipCard)
            else if (parentId !== null && childId !== null && subChildId === null) {
                const catIndex = newNav.findIndex(c => c.id === parentId);
                if (catIndex > -1) {
                    const childIndex = newNav[catIndex].children.findIndex(c => c.id === childId);
                    if (childIndex > -1) newNav[catIndex].children[childIndex][field] = value;
                }
            }
            // Level 3: Link inside Subcategory
            else if (parentId !== null && childId !== null && subChildId !== null) {
                const catIndex = newNav.findIndex(c => c.id === parentId);
                if (catIndex > -1) {
                    const childIndex = newNav[catIndex].children.findIndex(c => c.id === childId);
                    if (childIndex > -1) {
                        const linkIndex = newNav[catIndex].children[childIndex].subLinks.findIndex(l => l.label === subChildId || l.id === subChildId); // ID fallback for new links
                        if (linkIndex > -1) newNav[catIndex].children[childIndex].subLinks[linkIndex][field] = value;
                    }
                }
            }

            return newNav;
        });
    };

    // Adders
    const addCategory = () => {
        const id = `cat_${Date.now()}`;
        setNavItems([...navItems, { id, label: 'קטגוריה חדשה', icon: 'Folder', url: '', children: [] }]);
        toggleExpand(id);
    };

    const addSubcategory = (parentId) => {
        setNavItems(prev => {
            const newNav = [...prev];
            const catIndex = newNav.findIndex(c => c.id === parentId);
            if (catIndex > -1) {
                if (!newNav[catIndex].children) newNav[catIndex].children = [];
                const id = `sub_${Date.now()}`;
                newNav[catIndex].children.push({ id, title: 'תת-קטגוריה חדשה', icon: 'FileText', url: '', subLinks: [] });
                toggleExpand(id);
            }
            return newNav;
        });
    };

    const addLink = (parentId, childId) => {
        setNavItems(prev => {
            const newNav = [...prev];
            const catIndex = newNav.findIndex(c => c.id === parentId);
            if (catIndex > -1) {
                const childIndex = newNav[catIndex].children.findIndex(c => c.id === childId);
                if (childIndex > -1) {
                    if (!newNav[catIndex].children[childIndex].subLinks) newNav[catIndex].children[childIndex].subLinks = [];
                    newNav[catIndex].children[childIndex].subLinks.push({ id: `link_${Date.now()}`, label: 'לינק חדש', icon: 'Link', url: '' });
                }
            }
            return newNav;
        });
    };

    // Removers
    const removeItem = (parentId, childId = null, subChildId = null) => {
        if (!confirm('האם אתה בטוח שברצונך למחוק פריט זה?')) return;

        setNavItems(prev => {
            const newNav = [...prev];
            // Delete Category
            if (childId === null) {
                return newNav.filter(c => c.id !== parentId);
            }
            // Delete Subcategory
            else if (subChildId === null) {
                const catIndex = newNav.findIndex(c => c.id === parentId);
                if (catIndex > -1) {
                    newNav[catIndex].children = newNav[catIndex].children.filter(c => c.id !== childId);
                }
            }
            // Delete Link
            else {
                const catIndex = newNav.findIndex(c => c.id === parentId);
                if (catIndex > -1) {
                    const childIndex = newNav[catIndex].children.findIndex(c => c.id === childId);
                    if (childIndex > -1) {
                        newNav[catIndex].children[childIndex].subLinks = newNav[catIndex].children[childIndex].subLinks.filter(l => l.id !== subChildId && l.label !== subChildId);
                    }
                }
            }
            return newNav;
        });
    };

    if (loading && !navItems.length) {
        return <div className="p-8 text-center text-gray-400">טוען מבנה ניווט...</div>;
    }

    return (
        <div className="space-y-6">

            {error && (
                <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg flex items-center gap-3">
                    <AlertTriangle className="text-red-400" />
                    <span className="text-red-200">{error}</span>
                </div>
            )}

            <div className="flex justify-between items-center bg-gray-900/40 p-4 rounded-xl border border-gray-800">
                <p className="text-sm text-gray-400">ערוך את קטגוריות התפריט ואת כרטיסי המידע (תת-קטגוריות) שבתוכן.</p>
                <button
                    onClick={addCategory}
                    className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition border border-gray-700 hover:border-gray-500 text-sm"
                >
                    <Plus size={16} />
                    <span>הוסף קטגוריה ראשית</span>
                </button>
            </div>

            <div className="space-y-3">
                {navItems.map((cat, catIdx) => {
                    const isCatExpanded = expandedNodes.has(cat.id);
                    return (
                        <div key={cat.id} className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden transition-all">
                            {/* CATEGORY HEADER */}
                            <div className="flex items-center gap-3 p-3 bg-gray-800/30 hover:bg-gray-800/50 transition border-b border-gray-800/50">
                                <button onClick={() => toggleExpand(cat.id)} className="p-1 text-gray-400 hover:text-white transition">
                                    {isCatExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                </button>

                                <div className="p-2 bg-gray-800 rounded-md border border-gray-700">
                                    <DynamicIcon name={cat.icon} size={18} className="text-red-400" />
                                </div>

                                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <input
                                        type="text"
                                        value={cat.label}
                                        onChange={(e) => updateItem(cat.id, null, null, 'label', e.target.value)}
                                        className="bg-black/50 border border-gray-700 rounded-md px-3 py-1.5 text-white focus:outline-none focus:border-red-500 text-sm font-bold"
                                        placeholder="שם הקטגוריה"
                                    />
                                    <input
                                        type="text"
                                        value={cat.icon}
                                        onChange={(e) => updateItem(cat.id, null, null, 'icon', e.target.value)}
                                        className="bg-black/50 border border-gray-700 rounded-md px-3 py-1.5 text-white focus:outline-none focus:border-red-500 text-sm"
                                        placeholder="שם אייקון (Lucide)"
                                        title="Lucide Icon Name (e.g., Rocket, Users, Target)"
                                    />
                                    <input
                                        type="text"
                                        value={cat.url || ''}
                                        onChange={(e) => updateItem(cat.id, null, null, 'url', e.target.value)}
                                        className="bg-black/50 border border-gray-700 rounded-md px-3 py-1.5 text-white focus:outline-none focus:border-red-500 text-sm"
                                        placeholder="URL (אופציונלי - קטגוריה כלינק)"
                                    />
                                </div>

                                <button onClick={() => removeItem(cat.id)} className="p-2 text-gray-500 hover:text-red-500 transition ml-2">
                                    <Trash2 size={18} />
                                </button>
                            </div>

                            {/* SUBCATEGORIES LIST */}
                            {isCatExpanded && !cat.url && (
                                <div className="p-4 bg-black/20 pr-12">
                                    <div className="space-y-4">
                                        {(cat.children || []).map((sub, subIdx) => {
                                            const isSubExpanded = expandedNodes.has(sub.id);
                                            return (
                                                <div key={sub.id} className="bg-gray-900 border border-gray-700 rounded-md overflow-hidden">
                                                    {/* SUBCATEGORY HEADER */}
                                                    <div className="flex items-center gap-3 p-2 bg-gray-800/50 border-b border-gray-700/50">
                                                        <button onClick={() => toggleExpand(sub.id)} className="p-1 text-gray-400 hover:text-white transition">
                                                            {isSubExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                        </button>
                                                        <DynamicIcon name={sub.icon} size={16} className="text-gray-400" />

                                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                                                            <input
                                                                type="text"
                                                                value={sub.title || sub.label || ''} // Fallback for some hardcoded structs
                                                                onChange={(e) => updateItem(cat.id, sub.id, null, 'title', e.target.value)}
                                                                className="bg-black/50 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                                                                placeholder="שם כרטיסייה"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={sub.icon}
                                                                onChange={(e) => updateItem(cat.id, sub.id, null, 'icon', e.target.value)}
                                                                className="bg-black/50 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                                                                placeholder="אייקון"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={sub.url}
                                                                onChange={(e) => updateItem(cat.id, sub.id, null, 'url', e.target.value)}
                                                                className="bg-black/50 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                                                                placeholder="URL (אופציונלי)"
                                                            />
                                                        </div>
                                                        <button onClick={() => removeItem(cat.id, sub.id)} className="p-1 text-gray-500 hover:text-red-500 transition">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>

                                                    {/* LINKS LIST */}
                                                    {isSubExpanded && !sub.url && (
                                                        <div className="p-3 bg-black/40 pr-10 space-y-2">
                                                            {(sub.subLinks || []).map((link, linkIdx) => {
                                                                const linkIdentifier = link.id || link.label;
                                                                return (
                                                                    <div key={linkIdx} className="flex items-center gap-2">
                                                                        <LinkIcon size={14} className="text-gray-500" />
                                                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                                                                            <input
                                                                                type="text"
                                                                                value={link.label}
                                                                                onChange={(e) => updateItem(cat.id, sub.id, linkIdentifier, 'label', e.target.value)}
                                                                                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
                                                                                placeholder="שם הלינק"
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                value={link.icon}
                                                                                onChange={(e) => updateItem(cat.id, sub.id, linkIdentifier, 'icon', e.target.value)}
                                                                                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
                                                                                placeholder="אייקון"
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                value={link.url || ''}
                                                                                onChange={(e) => updateItem(cat.id, sub.id, linkIdentifier, 'url', e.target.value)}
                                                                                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
                                                                                placeholder="URL יעד"
                                                                            />
                                                                        </div>
                                                                        <button onClick={() => removeItem(cat.id, sub.id, linkIdentifier)} className="text-gray-600 hover:text-red-500">
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}
                                                            <button
                                                                onClick={() => addLink(cat.id, sub.id)}
                                                                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2 p-1"
                                                            >
                                                                <Plus size={14} /> הוסף לינק פנימי
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}

                                        <button
                                            onClick={() => addSubcategory(cat.id)}
                                            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded p-2 w-full justify-center transition"
                                        >
                                            <Plus size={16} /> הוסף כרטיסיית מידע (תת-קטגוריה)
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="flex justify-end pt-6 border-t border-gray-800">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-8 py-3 rounded-md font-bold transition shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                >
                    <Save size={20} />
                    <span>{isSaving ? 'שומר...' : 'שמור מבנה ניווט'}</span>
                </button>
            </div>

        </div>
    );
}
