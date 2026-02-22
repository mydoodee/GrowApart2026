import React, { useState, useRef, useEffect } from 'react';
import { Building, ChevronDown, Check, LayoutGrid, ArrowLeftRight } from 'lucide-react';

export const SegmentedSwitcher = ({ apartments, activeId, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Only show buildings that were selected at the Picker
    const selectedIds = (() => {
        try {
            const stored = localStorage.getItem('selectedBuildingIds');
            if (stored) return JSON.parse(stored);
        } catch (e) { }
        // Fallback: if no selectedBuildingIds, use activeId
        if (activeId && activeId !== 'all') return [activeId];
        return apartments.map(a => a.id);
    })();

    const visibleApartments = apartments.filter(a => selectedIds.includes(a.id));
    const isSingleMode = visibleApartments.length === 1;
    const isMultiMode = visibleApartments.length > 1;

    const activeApt = apartments.find(a => a.id === activeId);
    const activeIndex = apartments.findIndex(a => a.id === activeId);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (id) => {
        onSelect(id);
        setIsOpen(false);
    };

    // Display label
    const getDisplayLabel = () => {
        if (activeId === 'all') return `รวม ${visibleApartments.length} ตึก`;
        if (activeApt) return activeApt.general?.name || 'ตึกว่าง';
        return 'เลือกตึก';
    };

    const getDisplaySub = () => {
        if (activeId === 'all') return 'ภาพรวม';
        if (activeApt) return `หอที่ ${activeIndex + 1}`;
        return '';
    };

    // Single building mode: just show the name + link back to picker, NO dropdown
    if (isSingleMode) {
        const apt = visibleApartments[0];
        const idx = apartments.findIndex(a => a.id === apt.id);
        return (
            <div className="flex items-center space-x-2">
                <div className="flex items-center px-3 py-1.5 transition-all">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center mr-3 bg-brand-orange-500/10">
                        <Building className="w-4 h-4 text-brand-orange-500" />
                    </div>
                    <div className="text-left">
                        <p className="text-[8px] font-bold uppercase tracking-widest leading-none mb-0.5 text-brand-gray-500">หอที่ {idx + 1}</p>
                        <p className="text-[12px] font-bold text-white uppercase leading-none truncate max-w-[120px]">{apt.general?.name || 'ตึกว่าง'}</p>
                    </div>
                </div>
                <button
                    onClick={() => { window.location.href = '/picker'; }}
                    className="flex items-center justify-center w-9 h-9 rounded-xl text-brand-gray-500 hover:text-brand-orange-500 hover:bg-brand-orange-500/10 transition-all active:scale-90"
                    title="เปลี่ยนตึก"
                >
                    <ArrowLeftRight className="w-4 h-4" />
                </button>
            </div>
        );
    }

    // Multi-building mode: dropdown showing only selected buildings
    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    flex items-center px-3 py-1.5 transition-all duration-200 rounded-xl
                    ${isOpen
                        ? 'bg-brand-orange-500/10 border border-brand-orange-500/50 shadow-lg shadow-brand-orange-500/10'
                        : 'bg-transparent border border-transparent hover:bg-white/5'}
                `}
            >
                <div className={`
                    w-8 h-8 rounded-xl flex items-center justify-center mr-3
                    ${activeId === 'all' ? 'bg-brand-orange-500 text-brand-bg' : 'bg-brand-orange-500/10'}
                `}>
                    {activeId === 'all'
                        ? <LayoutGrid className="w-4 h-4" />
                        : <Building className="w-4 h-4 text-brand-orange-500" />
                    }
                </div>
                <div className="text-left mr-3">
                    <p className="text-[8px] font-bold uppercase tracking-widest leading-none mb-0.5 text-brand-gray-500">
                        {getDisplaySub()}
                    </p>
                    <p className="text-[12px] font-bold text-white uppercase leading-none truncate max-w-[120px]">
                        {getDisplayLabel()}
                    </p>
                </div>
                <ChevronDown className={`w-4 h-4 text-brand-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-brand-card border border-white/10 rounded-xl shadow-lg shadow-black/40 overflow-hidden z-[200] animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 space-y-1">
                        {/* "All selected buildings" option */}
                        <button
                            onClick={() => handleSelect('all')}
                            className={`
                                w-full flex items-center px-4 py-2.5 rounded-xl transition-all group
                                ${activeId === 'all'
                                    ? 'bg-brand-orange-500/10 border border-brand-orange-500/30'
                                    : 'hover:bg-white/5 border border-transparent'}
                            `}
                        >
                            <div className={`
                                w-9 h-9 rounded-xl flex items-center justify-center mr-3
                                ${activeId === 'all' ? 'bg-brand-orange-500 text-brand-bg' : 'bg-white/5 text-brand-gray-400 group-hover:bg-brand-orange-500/10 group-hover:text-brand-orange-500'}
                            `}>
                                <LayoutGrid className="w-4 h-4" />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-[11px] font-bold text-white uppercase">รวมทั้งหมด</p>
                                <p className="text-[9px] font-bold text-brand-gray-500 uppercase tracking-widest">{visibleApartments.length} ตึกที่เลือก</p>
                            </div>
                            {activeId === 'all' && <Check className="w-4 h-4 text-brand-orange-500" />}
                        </button>

                        <div className="border-t border-white/10 mx-2"></div>

                        {/* Only show buildings that were selected at Picker */}
                        {visibleApartments.map((apt, _) => {
                            const isActive = apt.id === activeId;
                            const globalIndex = apartments.findIndex(a => a.id === apt.id);
                            return (
                                <button
                                    key={apt.id}
                                    onClick={() => handleSelect(apt.id)}
                                    className={`
                                        w-full flex items-center px-4 py-2.5 rounded-xl transition-all group
                                        ${isActive
                                            ? 'bg-brand-orange-500/10 border border-brand-orange-500/30'
                                            : 'hover:bg-white/5 border border-transparent'}
                                    `}
                                >
                                    <div className={`
                                        w-9 h-9 rounded-xl flex items-center justify-center mr-3
                                        ${isActive ? 'bg-brand-orange-500 text-brand-bg' : 'bg-white/5 text-brand-gray-400 group-hover:bg-brand-orange-500/10 group-hover:text-brand-orange-500'}
                                    `}>
                                        <Building className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-[11px] font-bold text-white uppercase truncate">{apt.general?.name || 'ตึกว่าง'}</p>
                                        <p className="text-[9px] font-bold text-brand-gray-500 uppercase tracking-widest">หอที่ {globalIndex + 1} • {apt.floors?.length || 0} ชั้น</p>
                                    </div>
                                    {isActive && <Check className="w-4 h-4 text-brand-orange-500" />}
                                </button>
                            );
                        })}
                    </div>

                    <div className="border-t border-white/10 p-2">
                        <button
                            onClick={() => { window.location.href = '/picker'; }}
                            className="w-full flex items-center justify-center px-4 py-2.5 rounded-xl text-brand-gray-500 hover:text-brand-orange-500 hover:bg-brand-orange-500/5 transition-all text-xs font-bold tracking-wide"
                        >
                            <ArrowLeftRight className="w-3.5 h-3.5 mr-2" />
                            กลับหน้าเลือกตึก
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SegmentedSwitcher;
