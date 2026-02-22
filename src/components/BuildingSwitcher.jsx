import React, { useState } from 'react';
import { Building, ChevronDown, CheckCircle2, Plus } from 'lucide-react';

export const BuildingSwitcher = ({ apartments, activeId, onSelect }) => {
    const activeApt = apartments.find(a => a.id === activeId);
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative group/switcher">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center space-x-3 bg-brand-card hover:bg-white/10 px-4 py-2.5 rounded-xl border border-white/10 transition-all active:scale-95 min-w-[200px]"
            >
                <div className="w-8 h-8 bg-brand-orange-500/10 rounded-xl flex items-center justify-center border border-brand-orange-500/20">
                    <Building className="w-4 h-4 text-brand-orange-500" />
                </div>
                <div className="flex-1 text-left">
                    <p className="text-xs font-medium text-brand-gray-400 leading-none mb-1">อาคารปัจจุบัน</p>
                    <p className="text-sm font-bold text-white truncate w-32 uppercase">{activeApt?.general?.name || 'เลือกอาคาร'}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-brand-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-full right-0 mt-2 w-72 bg-brand-card border border-white/10 rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-white/10 bg-white/5">
                            <p className="text-xs font-bold text-brand-gray-400 uppercase tracking-widest px-2">สลับโครงการ</p>
                        </div>
                        <div className="max-h-60 overflow-y-auto p-2">
                            {apartments.map(apt => (
                                <button
                                    key={apt.id}
                                    onClick={() => {
                                        onSelect(apt.id);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full flex items-center p-3 rounded-xl transition-all ${apt.id === activeId ? 'bg-brand-orange-500 text-brand-bg shadow-lg shadow-brand-orange-500/20' : 'text-brand-gray-300 hover:bg-white/5 hover:text-white'}`}
                                >
                                    <Building className={`w-4 h-4 mr-3 ${apt.id === activeId ? 'text-brand-bg' : 'text-brand-orange-500'}`} />
                                    <span className="font-bold text-sm truncate uppercase">{apt.general.name}</span>
                                    {apt.id === activeId && <CheckCircle2 className="w-4 h-4 ml-auto" />}
                                </button>
                            ))}
                        </div>
                        <div className="p-2 border-t border-white/10">
                            <button
                                onClick={() => {
                                    localStorage.removeItem('activeApartmentId');
                                    window.location.href = '/picker';
                                }}
                                className="w-full flex items-center p-3 text-brand-orange-500 hover:bg-brand-orange-500/10 rounded-xl transition-all font-bold text-sm"
                            >
                                <Plus className="w-4 h-4 mr-3" />
                                กลับหน้าหลัก / เพิ่มตึกใหม่
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default BuildingSwitcher;
