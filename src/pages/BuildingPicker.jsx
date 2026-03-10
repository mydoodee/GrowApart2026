import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { auth, db } from '../firebase';
import { getUserApartments } from '../utils/apartmentUtils';
import { Building, Plus, LogOut, Check, ArrowRight } from 'lucide-react';
import { signOut } from 'firebase/auth';

export default function BuildingPicker(props) {
    const { user } = props;
    const navigate = useNavigate();
    const [buildings, setBuildings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState([]); // Array of selected building IDs

    useEffect(() => {
        if (!user) return;

        async function fetchBuildings() {
            try {
                const results = await getUserApartments(db, user);
                setBuildings(results);


            } catch (error) {
                console.error("Error fetching buildings:", error);
            }
            setLoading(false);
        }
        fetchBuildings();
    }, [user]);

    const toggleSelect = (id) => {
        setSelected(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        );
    };

    const selectAll = () => {
        if (selected.length === buildings.length) {
            setSelected([]);
        } else {
            setSelected(buildings.map(b => b.id));
        }
    };

    const handleEnter = async () => {
        if (selected.length === 0) return;

        if (selected.length === 1) {
            localStorage.setItem('activeApartmentId', selected[0]);
            localStorage.setItem('selectedBuildingIds', JSON.stringify(selected));
        } else {
            // Multiple buildings selected → "all" mode
            localStorage.setItem('activeApartmentId', 'all');
            localStorage.setItem('selectedBuildingIds', JSON.stringify(selected));
        }

        // Trigger role refresh in App.jsx to pick up apartment-specific roles
        if (props.refreshUserRole) {
            await props.refreshUserRole();
        }

        navigate('/dashboard');
    };

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/login');
    };

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg text-white">
                <div className="w-12 h-12 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-brand-bg text-white flex flex-col items-center justify-center p-4 bg-[radial-gradient(circle_at_top_right,rgba(230,126,34,0.05),transparent),radial-gradient(circle_at_bottom_left,rgba(230,126,34,0.05),transparent)]">
            <div className="max-w-4xl w-full text-center space-y-10">
                <div className="space-y-4">
                    <div className="inline-flex items-center justify-center mb-4">
                        <img src="/logo.png" alt="Rentara Logo" className="h-16 w-auto object-contain" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight mb-2">ยินดีต้อนรับสู่ <span className="text-brand-orange-500">Rentara</span></h1>
                    <p className="text-brand-gray-400 font-bold">เลือกตึกที่ต้องการจัดการ (เลือกได้มากกว่า 1 ตึก)</p>
                </div>

                {/* Select All button - only show if >1 building */}
                {buildings.length > 1 && (
                    <div className="flex justify-center">
                        <button
                            onClick={selectAll}
                            className={`
                                px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all border
                                ${selected.length === buildings.length
                                    ? 'bg-brand-orange-500 text-brand-bg border-brand-orange-500 shadow-lg shadow-brand-orange-500/20'
                                    : 'bg-transparent text-brand-gray-400 border-white/10 hover:border-brand-orange-500/30 hover:text-white'}
                            `}
                        >
                            {selected.length === buildings.length ? '✓ เลือกทั้งหมดแล้ว' : 'เลือกทั้งหมด'}
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
                    {/* Add new building card */}
                    <button
                        onClick={() => navigate('/settings?tab=general&action=add')}
                        className="group p-5 rounded-xl border-2 border-dashed border-white/10 bg-white/5 hover:bg-brand-orange-500/5 hover:border-brand-orange-500/20 transition-all flex flex-col items-center justify-center space-y-4 h-full"
                    >
                        <div className="w-14 h-14 bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-brand-orange-500 group-hover:text-brand-bg transition-colors">
                            <Plus className="w-6 h-6" />
                        </div>
                        <div className="text-center">
                            <p className="font-bold text-lg">เพิ่มตึกใหม่</p>
                            <p className="text-brand-gray-500 text-sm font-bold">สร้างโครงการใหม่ของคุณ</p>
                        </div>
                    </button>

                    {/* Building cards with selection */}
                    {buildings.map((building, index) => {
                        const isSelected = selected.includes(building.id);
                        return (
                            <button
                                key={building.id}
                                onClick={() => toggleSelect(building.id)}
                                className={`
                                    group p-5 rounded-xl bg-brand-card border-2 transition-all shadow-md flex flex-col items-start space-y-6 relative
                                    ${isSelected
                                        ? 'border-brand-orange-500 shadow-brand-orange-500/20'
                                        : 'border-white/10 hover:border-white/20'}
                                `}
                            >
                                {/* Checkbox indicator */}
                                <div className={`
                                    absolute top-5 right-5 w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all
                                    ${isSelected
                                        ? 'bg-brand-orange-500 border-brand-orange-500 scale-100'
                                        : 'border-white/10 group-hover:border-white/30 scale-90 group-hover:scale-100'}
                                `}>
                                    {isSelected && <Check className="w-4 h-4 text-brand-bg" strokeWidth={3} />}
                                </div>

                                <div className={`
                                    w-14 h-14 rounded-xl flex items-center justify-center border transition-all
                                    ${isSelected
                                        ? 'bg-brand-orange-500/20 border-brand-orange-500/30'
                                        : 'bg-brand-orange-500/10 border-brand-orange-500/20'}
                                `}>
                                    <Building className="w-7 h-7 text-brand-orange-500" />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-brand-gray-400 mb-1">หอที่ {index + 1}</p>
                                    <h3 className={`text-xl font-bold mb-1 transition-colors uppercase ${isSelected ? 'text-brand-orange-500' : 'text-white'}`}>
                                        {building.general?.name || 'ตึกว่าง'}
                                    </h3>
                                    <p className="text-brand-gray-400 text-sm font-bold line-clamp-1">{building.general?.address || 'ยังไม่ได้ระบุที่อยู่'}</p>
                                </div>
                                <div className="pt-4 border-t border-white/10 w-full flex items-center justify-between">
                                    <span className="text-xs font-bold text-brand-gray-500 uppercase tracking-widest">{building.floors?.length || 0} ชั้น</span>
                                    <span className={`text-xs font-bold uppercase tracking-widest transition-colors ${isSelected ? 'text-brand-orange-500' : 'text-brand-gray-700'}`}>
                                        {isSelected ? '✓ เลือกแล้ว' : 'คลิกเพื่อเลือก'}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Enter button */}
                {selected.length > 0 && (
                    <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <button
                            onClick={handleEnter}
                            className="bg-brand-orange-500 hover:bg-brand-orange-400 text-brand-bg font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-brand-orange-500/20 flex items-center space-x-3 text-lg active:scale-95 transition-all"
                        >
                            <span>
                                {selected.length === 1
                                    ? `เข้าจัดการ ${buildings.find(b => b.id === selected[0])?.general?.name || ''}`
                                    : `เข้าจัดการรวม ${selected.length} ตึก`
                                }
                            </span>
                            <ArrowRight className="w-5 h-5" />
                        </button>
                    </div>
                )}

                <div className="pt-6">
                    <button onClick={handleLogout} className="text-brand-gray-500 hover:text-white font-bold text-sm transition-colors flex items-center mx-auto space-x-2">
                        <LogOut className="w-4 h-4" />
                        <span>ออกจากระบบ</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
