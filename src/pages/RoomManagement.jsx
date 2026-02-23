import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
    Home, Save, X, LayoutGrid, Check, Zap, Droplets,
    Search, ChevronDown, Loader2, DoorOpen, User, ExternalLink
} from 'lucide-react';
import Toast, { useToast } from '../components/Toast';
import MainLayout from '../components/MainLayout';
import { getUserApartments } from '../utils/apartmentUtils';

// ─── helpers ──────────────────────────────────────────────────────────────────
const normalizeStatus = (status) => {
    if (status === 'occupied') return 'ไม่ว่าง';
    return status || 'ว่าง';
};

const STATUS_COLORS = {
    'ว่าง': { border: 'border-white/5', topBar: 'bg-brand-gray-700', text: 'text-green-500', dot: 'bg-green-500', bg: 'bg-brand-card/30', label: 'ว่าง' },
    'ไม่ว่าง': { border: 'border-blue-500/10', topBar: 'bg-blue-500/60', text: 'text-blue-500', dot: 'bg-blue-500', bg: 'bg-brand-card', label: 'ไม่ว่าง' },
    'แจ้งซ่อม': { border: 'border-red-500/10', topBar: 'bg-red-500', text: 'text-red-500', dot: 'bg-red-500', bg: 'bg-brand-card', label: 'แจ้งซ่อม' },
    'จอง': { border: 'border-yellow-500/10', topBar: 'bg-yellow-500', text: 'text-yellow-500', dot: 'bg-yellow-500', bg: 'bg-brand-card', label: 'จอง' },
};
const getStatusStyle = (status) => STATUS_COLORS[normalizeStatus(status)] || STATUS_COLORS['ว่าง'];

export default function RoomManagement({ user }) {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { toast, showToast, hideToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [profile, setProfile] = useState(null);
    const [apartments, setApartments] = useState([]);
    const [activeAptId, setActiveAptId] = useState(localStorage.getItem('activeApartmentId'));
    const [rooms, setRooms] = useState([]);
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [pendingAutoSelect, setPendingAutoSelect] = useState(searchParams.get('room'));

    // Filter states
    const [filterFloor, setFilterFloor] = useState('all');
    const [search, setSearch] = useState('');

    // Detail panel sections
    const [showAmenities, setShowAmenities] = useState(false);
    const [showExpenses, setShowExpenses] = useState(false);

    useEffect(() => {
        if (!user) return;

        const profileRef = doc(db, 'users', user.uid);
        getDoc(profileRef).then(snap => {
            if (snap.exists()) setProfile(snap.data());
        });

        let unsubscribe;

        const loadData = async () => {
            try {
                const apps = await getUserApartments(db, user);
                setApartments(apps);

                if (activeAptId && activeAptId !== 'all') {
                    // Fetch tenants for this apartment to cross-reference room occupancy
                    const tenantSnap = await getDocs(query(
                        collection(db, 'users'),
                        where(`apartmentRoles.${activeAptId}.role`, '==', 'tenant')
                    ));
                    const tenantsByRoom = {};
                    tenantSnap.docs.forEach(d => {
                        const data = d.data();
                        const rn = data.apartmentRoles?.[activeAptId]?.roomNumber;
                        if (rn) {
                            tenantsByRoom[rn] = {
                                tenantId: d.id,
                                tenantName: data.name || data.displayName || ''
                            };
                        }
                    });

                    const q = query(collection(db, 'rooms'), where('apartmentId', '==', activeAptId));

                    unsubscribe = onSnapshot(q, (snapshot) => {
                        const firestoreRooms = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        const activeApt = apps.find(a => a.id === activeAptId);
                        let allRooms = [];

                        if (activeApt) {
                            const generated = generateRoomsFromConfig(activeApt);
                            allRooms = generated.map(genRoom => {
                                const existing = firestoreRooms.find(r => r.roomNumber === genRoom.roomNumber);
                                const room = existing ? { ...existing } : { ...genRoom };

                                // Cross-reference with tenant data for accurate status
                                const tenant = tenantsByRoom[room.roomNumber];
                                if (tenant) {
                                    room.status = 'ไม่ว่าง';
                                    room.tenantId = tenant.tenantId;
                                    room.tenantName = tenant.tenantName;
                                } else if (!existing || !room.tenantId) {
                                    // Only reset to vacant if no tenant found AND no tenantId in Firestore
                                    if (normalizeStatus(room.status) === 'ไม่ว่าง' || room.status === 'occupied') {
                                        room.status = 'ว่าง';
                                        room.tenantId = null;
                                        room.tenantName = null;
                                    }
                                }

                                return room;
                            });
                        }
                        setRooms(allRooms);
                        setLoading(false);
                    });
                } else if (activeAptId === 'all') {
                    // Fetch all tenants for all our apartments
                    const tenantSnap = await getDocs(query(
                        collection(db, 'users'),
                        where('role', '==', 'tenant')
                    ));
                    const tenantsByRoom = {}; // key: aptId_roomNum
                    tenantSnap.docs.forEach(d => {
                        const data = d.data();
                        if (data.apartmentRoles) {
                            Object.entries(data.apartmentRoles).forEach(([aptId, roleData]) => {
                                if (roleData.role === 'tenant' && roleData.roomNumber) {
                                    tenantsByRoom[`${aptId}_${roleData.roomNumber}`] = {
                                        tenantId: d.id,
                                        tenantName: data.name || data.displayName || ''
                                    };
                                }
                            });
                        }
                    });

                    const q = collection(db, 'rooms');

                    unsubscribe = onSnapshot(q, (snapshot) => {
                        const firestoreRooms = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        let allRooms = [];

                        for (const app of apps) {
                            const appRooms = firestoreRooms.filter(r => r.apartmentId === app.id);
                            const generated = generateRoomsFromConfig(app);

                            generated.forEach(genRoom => {
                                const existing = appRooms.find(r => r.roomNumber === genRoom.roomNumber);
                                const room = existing ? { ...existing } : { ...genRoom };

                                // Cross-reference
                                const tenant = tenantsByRoom[`${app.id}_${room.roomNumber}`];
                                if (tenant) {
                                    room.status = 'ไม่ว่าง';
                                    room.tenantId = tenant.tenantId;
                                    room.tenantName = tenant.tenantName;
                                } else if (!existing || !room.tenantId) {
                                    if (normalizeStatus(room.status) === 'ไม่ว่าง' || room.status === 'occupied') {
                                        room.status = 'ว่าง';
                                        room.tenantId = null;
                                        room.tenantName = null;
                                    }
                                }
                                allRooms.push(room);
                            });
                        }
                        setRooms(allRooms);
                        setLoading(false);
                    });
                } else {
                    setLoading(false);
                }
            } catch (error) {
                console.error(error);
                showToast('โหลดข้อมูลล้มเหลว', 'error');
                setLoading(false);
            }
        };

        loadData();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [user, activeAptId]);

    // Deep linking: Auto-select room from URL param
    useEffect(() => {
        if (!loading && rooms.length > 0 && (searchParams.get('room') || searchParams.get('tenantId'))) {
            const roomNum = searchParams.get('room');
            const tId = searchParams.get('tenantId');

            const target = rooms.find(r =>
                (roomNum && r.roomNumber === roomNum) ||
                (tId && r.tenantId === tId)
            );

            if (target) {
                setSelectedRoom(target);
                // Ensure the floor filter doesn't hide the selected room
                if (filterFloor !== 'all' && target.floor !== parseInt(filterFloor)) {
                    setFilterFloor('all');
                }
                // Clear params so it doesn't re-select if user closes panel
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('room');
                newParams.delete('tenantId');
                setSearchParams(newParams, { replace: true });
            }
        }
    }, [loading, rooms, searchParams]);

    const generateRoomsFromConfig = (apt) => {
        const generated = [];
        if (apt.floors) {
            apt.floors.forEach(floor => {
                for (let i = 1; i <= floor.roomCount; i++) {
                    const roomNo = `${floor.id}${i.toString().padStart(2, '0')}`;
                    generated.push({
                        apartmentId: apt.id,
                        roomNumber: roomNo,
                        floor: floor.id,
                        status: 'ว่าง',
                        price: apt.utilityRates?.baseRent || 0,
                        amenities: apt.amenities || [],
                        fixedExpenses: apt.fixedExpenses?.map(fe => ({ ...fe, active: true })) || []
                    });
                }
            });
        }
        return generated;
    };

    const handleAptSwitch = (id) => {
        localStorage.setItem('activeApartmentId', id);
        setActiveAptId(id);
        setSelectedRoom(null);
        showToast('สลับตึกเรียบร้อย');
    };

    const handleRoomClick = (room) => {
        if (selectedRoom?.roomNumber === room.roomNumber && selectedRoom?.apartmentId === room.apartmentId) {
            setSelectedRoom(null);
        } else {
            setSelectedRoom({ ...room });
            setShowAmenities(false);
            setShowExpenses(false);
        }
    };

    const handleSaveRoom = async () => {
        setSaving(true);
        try {
            const roomId = selectedRoom.id || `${selectedRoom.apartmentId}_${selectedRoom.roomNumber}`;
            const roomRef = doc(db, 'rooms', roomId);

            const dataToSave = {
                ...selectedRoom,
                status: normalizeStatus(selectedRoom.status),
                updatedAt: serverTimestamp()
            };
            delete dataToSave.id;

            await setDoc(roomRef, dataToSave, { merge: true });

            setRooms(rooms.map(r =>
                (r.roomNumber === selectedRoom.roomNumber && r.apartmentId === selectedRoom.apartmentId)
                    ? { ...selectedRoom, id: roomId, status: normalizeStatus(selectedRoom.status) }
                    : r
            ));

            // Update selectedRoom with saved data
            setSelectedRoom(prev => prev ? { ...prev, id: roomId, status: normalizeStatus(prev.status) } : null);

            showToast('บันทึกข้อมูลห้องพักเรียบร้อย', 'success');
        } catch (error) {
            console.error(error);
            showToast('บันทึกล้มเหลว', 'error');
        }
        setSaving(false);
    };

    // ── display data ──────────────────────────────────────────────────────────
    const currentApt = apartments.find(a => a.id === activeAptId);
    const floorsList = activeAptId === 'all'
        ? Array.from(new Set(rooms.map(r => r.floor))).sort((a, b) => a - b)
        : (currentApt?.floors?.map(f => f.id) || []);

    const sq = search.trim().toLowerCase();

    const filteredRooms = rooms.filter(r => {
        if (filterFloor !== 'all' && r.floor !== parseInt(filterFloor)) return false;
        if (!sq) return true;
        const rn = r.roomNumber?.toLowerCase() || '';
        const status = normalizeStatus(r.status).toLowerCase();
        return rn.includes(sq) || status.includes(sq);
    });

    const occupiedCount = rooms.filter(r => normalizeStatus(r.status) === 'ไม่ว่าง').length;
    const vacantCount = rooms.filter(r => normalizeStatus(r.status) === 'ว่าง').length;
    const totalRooms = rooms.length;

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
                <div className="w-12 h-12 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <MainLayout
            profile={profile}
            apartments={apartments}
            activeAptId={activeAptId}
            onAptSwitch={handleAptSwitch}
            title="จัดการห้องพัก"
        >
            <Toast {...toast} onClose={hideToast} />

            <div className="px-5 lg:px-4 py-2 max-w-[1600px] mx-auto w-full relative z-10">

                {/* ── Floor buttons + stats ──────────────────────────── */}
                <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
                    <div className="flex-1 min-w-0 flex flex-wrap gap-2">
                        {['all', ...floorsList].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilterFloor(f.toString())}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${filterFloor === f.toString()
                                    ? 'bg-brand-orange-500 border-brand-orange-500 text-brand-bg shadow-lg shadow-brand-orange-500/25'
                                    : 'bg-brand-bg/40 border-white/5 text-brand-gray-400 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                {f === 'all' ? 'ทุกชั้น' : `ชั้น ${f}`}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="bg-brand-orange-500/10 px-4 py-2 rounded-xl border border-brand-orange-500/20 flex items-center gap-2 h-10">
                            <p className="text-[9px] font-black text-brand-orange-500 uppercase tracking-widest opacity-80">ห้อง</p>
                            <p className="text-base font-black text-white leading-none">{totalRooms}</p>
                        </div>
                        <div className="bg-blue-500/10 px-4 py-2 rounded-xl border border-blue-500/20 flex items-center gap-2 h-10">
                            <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest opacity-80">ไม่ว่าง</p>
                            <p className="text-base font-black text-white leading-none">{occupiedCount}</p>
                        </div>
                        <div className="bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20 flex items-center gap-2 h-10">
                            <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest opacity-80">ว่าง</p>
                            <p className="text-base font-black text-white leading-none">{vacantCount}</p>
                        </div>
                    </div>
                </div>

                {/* ── Search ────────────────────────────────────────── */}
                <div className="relative mb-4">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-gray-500" />
                    <input
                        type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="ค้นหาเลขห้อง..."
                        className="w-full bg-brand-bg/60 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-sm font-medium text-white placeholder:text-brand-gray-600 outline-none focus:border-brand-orange-500/50 transition-all"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-gray-500 hover:text-white">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* ── Main layout ───────────────────────────────────── */}
                <div className="flex gap-4 items-start">

                    {/* ── Card grid ─────────────────────────────────── */}
                    <div className={`transition-all duration-300 ${selectedRoom ? 'w-1/2 lg:w-[58%]' : 'w-full'}`}>
                        {filteredRooms.length === 0 ? (
                            <div className="text-center py-20 bg-brand-card/50 rounded-3xl border border-dashed border-white/10">
                                <LayoutGrid className="w-10 h-10 text-brand-gray-700 mx-auto mb-3" />
                                <p className="text-white font-bold">ไม่พบข้อมูลห้องพัก</p>
                                <p className="text-brand-gray-500 text-sm mt-1">ลองเปลี่ยนชั้นหรือคำค้นหา</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                                {filteredRooms.map(room => {
                                    const status = normalizeStatus(room.status);
                                    const style = getStatusStyle(room.status);
                                    const isSelected = selectedRoom?.roomNumber === room.roomNumber && selectedRoom?.apartmentId === room.apartmentId;
                                    const isVacant = status === 'ว่าง';

                                    return (
                                        <button
                                            key={`${room.apartmentId}_${room.roomNumber}`}
                                            onClick={() => handleRoomClick(room)}
                                            className={`relative p-3 rounded-xl border transition-all duration-200 flex flex-col gap-2 text-left active:scale-[0.97] ${isSelected
                                                ? 'bg-brand-orange-500/10 border-brand-orange-500/40 shadow-lg shadow-brand-orange-500/10'
                                                : isVacant
                                                    ? `${style.bg} ${style.border} opacity-50 hover:opacity-80`
                                                    : `${style.bg} ${style.border} hover:border-brand-orange-500/25`
                                                }`}
                                        >
                                            <div className={`absolute top-0 left-0 w-full h-[2px] rounded-t-xl ${isSelected ? 'bg-brand-orange-500' : style.topBar}`} />

                                            {/* room + floor */}
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[9px] font-bold uppercase ${isSelected ? 'text-brand-orange-400/70' : 'text-brand-gray-600'}`}>ชั้น {room.floor}</span>
                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-brand-orange-500 text-brand-bg' : 'bg-brand-orange-500/10 text-brand-orange-400'}`}>
                                                    {room.roomNumber}
                                                </span>
                                            </div>

                                            {/* price or status */}
                                            <div className="flex items-center gap-2">
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isVacant ? 'bg-white/5' : 'bg-blue-500/10'}`}>
                                                    <DoorOpen className={`w-3.5 h-3.5 ${isVacant ? 'text-brand-gray-600' : 'text-blue-400'}`} />
                                                </div>
                                                <div className="min-w-0">
                                                    {room.price ? (
                                                        <p className={`font-bold text-xs leading-tight truncate ${isSelected ? 'text-brand-orange-300' : 'text-white'}`}>
                                                            {room.price?.toLocaleString()} บ./เดือน
                                                        </p>
                                                    ) : (
                                                        <p className="font-bold text-xs text-brand-gray-600">ยังไม่ตั้งราคา</p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* footer */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1">
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                                                    <span className={`text-[9px] font-bold ${style.text}`}>{style.label}</span>
                                                </div>
                                                {room.tenantName && (
                                                    <span className="text-[9px] text-brand-gray-500 truncate max-w-[60%]">{room.tenantName}</span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Detail Panel ──────────────────────────────── */}
                    {selectedRoom && (
                        <div className="w-1/2 lg:w-[42%] sticky top-20 animate-in slide-in-from-right-4 fade-in duration-300">
                            <div className="bg-brand-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[calc(100vh-120px)] flex flex-col">

                                {/* header */}
                                <div className="relative px-5 pt-4 pb-3 border-b border-white/8 shrink-0">
                                    <button onClick={() => setSelectedRoom(null)} className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                                        <X className="w-3.5 h-3.5 text-brand-gray-400" />
                                    </button>
                                    <div className="flex items-center gap-3 pr-8">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${normalizeStatus(selectedRoom.status) === 'ว่าง' ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
                                            <Home className={`w-6 h-6 ${normalizeStatus(selectedRoom.status) === 'ว่าง' ? 'text-emerald-400' : 'text-blue-400'}`} />
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-white font-bold text-sm leading-tight">ห้อง {selectedRoom.roomNumber}</h4>
                                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap gap-y-1">
                                                <div className="flex items-center gap-1">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${getStatusStyle(selectedRoom.status).dot}`} />
                                                    <span className={`text-[10px] font-bold uppercase ${getStatusStyle(selectedRoom.status).text}`}>
                                                        {normalizeStatus(selectedRoom.status)}
                                                    </span>
                                                </div>
                                                <span className="bg-brand-orange-500/15 border border-brand-orange-500/25 text-brand-orange-400 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                                    ชั้น {selectedRoom.floor}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* scrollable */}
                                <div className="overflow-y-auto custom-scrollbar flex-1">

                                    {/* Status selector */}
                                    <div className="px-5 py-3 border-b border-white/8">
                                        <p className="text-[10px] font-bold text-brand-gray-600 uppercase tracking-wider mb-2">สถานะห้องพัก</p>
                                        <div className="grid grid-cols-4 gap-1.5">
                                            {['ว่าง', 'ไม่ว่าง', 'แจ้งซ่อม', 'จอง'].map(st => {
                                                const isActive = normalizeStatus(selectedRoom.status) === st;
                                                const stStyle = STATUS_COLORS[st];
                                                return (
                                                    <button
                                                        key={st}
                                                        onClick={() => setSelectedRoom({ ...selectedRoom, status: st })}
                                                        className={`py-2 rounded-lg text-xs font-black transition-all border ${isActive
                                                            ? 'bg-brand-orange-500 border-brand-orange-500 text-brand-bg shadow-lg shadow-brand-orange-500/20'
                                                            : 'bg-white/5 border-white/10 text-brand-gray-300 hover:border-white/20 hover:text-white'
                                                            }`}
                                                    >
                                                        {st}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Price */}
                                    <div className="px-5 py-3 border-b border-white/8">
                                        <p className="text-[10px] font-bold text-brand-gray-600 uppercase tracking-wider mb-2">ค่าเช่ารายเดือน</p>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={selectedRoom.price || ''}
                                                onChange={(e) => setSelectedRoom({ ...selectedRoom, price: parseInt(e.target.value) || 0 })}
                                                className="w-full bg-brand-bg rounded-xl px-4 py-3 border border-white/10 outline-none font-black text-white focus:border-brand-orange-500/50 transition-all text-center text-lg"
                                                placeholder="0"
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-gray-500 font-bold text-xs">บาท</span>
                                        </div>
                                        {currentApt?.utilityRates && (
                                            <div className="mt-2 flex items-center justify-between px-1">
                                                <p className="text-[10px] font-bold text-brand-gray-500 flex items-center gap-1.5">
                                                    <Zap className="w-3 h-3 text-yellow-500" />
                                                    ไฟฟ้า {currentApt.utilityRates.electricity} บ.
                                                </p>
                                                <p className="text-[10px] font-bold text-brand-gray-500 flex items-center gap-1.5">
                                                    <Droplets className="w-3 h-3 text-blue-500" />
                                                    น้ำ {currentApt.utilityRates.water} บ.
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Tenant info */}
                                    {selectedRoom.tenantId && (
                                        <div className="px-5 py-3 border-b border-white/8">
                                            <p className="text-[10px] font-bold text-brand-gray-600 uppercase tracking-wider mb-2">ผู้เช่า</p>
                                            <button
                                                onClick={() => navigate(`/tenants?tenantId=${selectedRoom.tenantId}`)}
                                                className="w-full flex items-center gap-2 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 hover:border-blue-500/30 rounded-xl px-3 py-2.5 transition-all group text-left"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                                    <User className="w-4 h-4 text-blue-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white font-bold text-xs truncate">{selectedRoom.tenantName || 'ไม่ระบุ'}</p>
                                                    <p className="text-[10px] text-brand-gray-500">คลิกเพื่อดูข้อมูลผู้เช่า</p>
                                                </div>
                                                <ExternalLink className="w-3.5 h-3.5 text-brand-gray-600 group-hover:text-blue-400 transition-colors shrink-0" />
                                            </button>
                                        </div>
                                    )}

                                    {/* Fixed Expenses (collapsible) */}
                                    {currentApt?.fixedExpenses && currentApt.fixedExpenses.length > 0 && (
                                        <div className="px-5 py-3 border-b border-white/8">
                                            <button
                                                onClick={() => setShowExpenses(!showExpenses)}
                                                className="w-full flex items-center justify-between group"
                                            >
                                                <span className="text-sm font-black text-white">ค่าบริการเพิ่มเติม</span>
                                                <ChevronDown className={`w-4 h-4 text-brand-gray-500 transition-transform duration-200 ${showExpenses ? 'rotate-180' : ''}`} />
                                            </button>

                                            {showExpenses && (
                                                <div className="mt-3 grid grid-cols-2 gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    {currentApt.fixedExpenses.map((expense, idx) => {
                                                        const isActive = selectedRoom.fixedExpenses?.find(fe => fe.name === expense.name)?.active;
                                                        return (
                                                            <button
                                                                key={idx}
                                                                onClick={() => {
                                                                    const currentFixed = selectedRoom.fixedExpenses || [];
                                                                    const existingIdx = currentFixed.findIndex(fe => fe.name === expense.name);
                                                                    let newFixed;
                                                                    if (existingIdx >= 0) {
                                                                        newFixed = [...currentFixed];
                                                                        newFixed[existingIdx].active = !newFixed[existingIdx].active;
                                                                    } else {
                                                                        newFixed = [...currentFixed, { ...expense, active: true }];
                                                                    }
                                                                    setSelectedRoom({ ...selectedRoom, fixedExpenses: newFixed });
                                                                }}
                                                                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-[11px] font-bold transition-all ${isActive
                                                                    ? 'bg-brand-orange-500/10 border-brand-orange-500/30 text-brand-orange-400'
                                                                    : 'bg-white/3 border-white/8 text-brand-gray-400'
                                                                    }`}
                                                            >
                                                                <span>{expense.name}</span>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span>{expense.amount?.toLocaleString()} บ.</span>
                                                                    <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${isActive ? 'bg-brand-orange-500 border-brand-orange-500' : 'border-white/20'}`}>
                                                                        {isActive && <Check className="w-2 h-2 text-brand-bg" strokeWidth={5} />}
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Amenities (collapsible) */}
                                    {selectedRoom.amenities && selectedRoom.amenities.length > 0 && (
                                        <div className="px-5 py-3 border-b border-white/8">
                                            <button
                                                onClick={() => setShowAmenities(!showAmenities)}
                                                className="w-full flex items-center justify-between group"
                                            >
                                                <span className="text-sm font-black text-white">สิ่งอำนวยความสะดวก</span>
                                                <ChevronDown className={`w-4 h-4 text-brand-gray-500 transition-transform duration-200 ${showAmenities ? 'rotate-180' : ''}`} />
                                            </button>

                                            {showAmenities && (
                                                <div className="mt-3 grid grid-cols-2 gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    {selectedRoom.amenities.map((amenity, idx) => (
                                                        <button
                                                            key={idx}
                                                            onClick={() => {
                                                                const newAms = [...selectedRoom.amenities];
                                                                newAms[idx].status = !newAms[idx].status;
                                                                setSelectedRoom({ ...selectedRoom, amenities: newAms });
                                                            }}
                                                            className={`flex items-center px-3 py-2 rounded-lg border transition-all text-[11px] font-bold ${amenity.status
                                                                ? 'bg-white/10 border-white/20 text-white'
                                                                : 'bg-transparent border-white/5 text-brand-gray-400'
                                                                }`}
                                                        >
                                                            <div className={`w-3 h-3 rounded-md mr-2 flex items-center justify-center border ${amenity.status ? 'bg-brand-orange-500 border-brand-orange-500' : 'border-white/10'}`}>
                                                                {amenity.status && <Check className="w-2 h-2 text-brand-bg" strokeWidth={4} />}
                                                            </div>
                                                            {amenity.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* actions footer */}
                                <div className="px-5 pb-4 pt-4 border-t border-white/8 shrink-0">
                                    <button
                                        onClick={handleSaveRoom}
                                        disabled={saving}
                                        className="w-full py-2.5 bg-brand-orange-500 hover:bg-brand-orange-400 disabled:opacity-40 text-brand-bg rounded-xl text-xs font-black transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-brand-orange-500/20"
                                    >
                                        {saving
                                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังบันทึก...</>
                                            : <><Save className="w-3.5 h-3.5" /> บันทึกข้อมูล</>
                                        }
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
