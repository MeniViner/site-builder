import React, { useState } from 'react';
import { Undo2 } from 'lucide-react';
import AdminEvents from './AdminEvents';
import AdminNavigation from './AdminNavigation';

export default function AdminHub({ onClose }) {
    const [activeTab, setActiveTab] = useState('events');

    return (
        <div dir="rtl" className="min-h-screen bg-[#0c0d12] text-white font-heebo p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
                    <h1 className="text-3xl font-black text-white">ממשק משתמש (ניהול)</h1>
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition"
                    >
                        <span>חזרה לאתר</span>
                        <Undo2 size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mb-8 border-b border-gray-800/50 pb-2">
                    <button
                        onClick={() => setActiveTab('events')}
                        className={`px-6 py-2 text-lg font-bold transition-all rounded-t-lg ${activeTab === 'events' ? 'text-white border-b-2 border-red-500 bg-red-900/10' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        ניהול מופעים
                    </button>
                    <button
                        onClick={() => setActiveTab('navigation')}
                        className={`px-6 py-2 text-lg font-bold transition-all rounded-t-lg ${activeTab === 'navigation' ? 'text-white border-b-2 border-red-500 bg-red-900/10' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        ניהול המידע (ניווט)
                    </button>
                </div>

                {/* Content Area */}
                <div className="bg-[#0c0d12] rounded-xl">
                    {activeTab === 'events' ? (
                        // We wrap AdminEvents but we don't need its internal "back to site" button anymore since the hub has it.
                        // It still works. We can hide the internal title in CSS or let it be for now.
                        <div className="admin-events-wrapper">
                            <AdminEvents onClose={onClose} />
                        </div>
                    ) : (
                        <AdminNavigation />
                    )}
                </div>
            </div>
        </div>
    );
}
