import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
    Home, Save, X, LayoutGrid, Check, Zap, Droplets, List,
    Search, ChevronDown, Loader2, DoorOpen, User, ExternalLink,
    CheckCircle2, ChevronRight, Building2, Map
} from 'lucide-react';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import MainLayout from '../components/MainLayout';
import { getUserApartments } from '../utils/apartmentUtils';

// ─── helpers ─────────────────────────────────────────────────────────────────
const normalizeStatus = (status) => {
    if (status === 'occupied') return 'ไม่ว่าง';
    if (status === 'vacant') return 'ว่าง';
    if (status === 'repair') return 'แจ้งซ่อม';
    if (status === 'reserved') return 'จอง';
    return status || 'ว่าง';
};

const STATUS_COLORS = {
    'ว่าง': { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400', badgeBg: 'bg-emerald-500/10', cardBorder: 'border-emerald-500/20', label: 'ว่าง' },
    'ไม่ว่าง': { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', dot: 'bg-blue-400', badgeBg: 'bg-blue-500/10', cardBorder: 'border-blue-500/20', label: 'ไม่ว่าง' },
    'แจ้งซ่อม': { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-400', badgeBg: 'bg-red-500/10', cardBorder: 'border-red-500/20', label: 'แจ้งซ่อม' },
    'จอง': { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-400', badgeBg: 'bg-amber-500/10', cardBorder: 'border-amber-500/20', label: 'จอง' },
};

const getStatusStyle = (status) => {
    const s = normalizeStatus(status);
    return STATUS_COLORS[s] || { bg: 'bg-zinc-800', border: 'border-zinc-700', text: 'text-zinc-400', dot: 'bg-zinc-500', badgeBg: 'bg-zinc-800', cardBorder: 'border-zinc-700', label: 'ไม่ระบุ' };
};

// ─── StatusPill ───────────────────────────────────────────────────────────────
const StatusPill = ({ status }) => {
    const style = getStatusStyle(status);
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${style.bg} ${style.text} border ${style.border}`}>
            <span className={`w-1 h-1 rounded-full ${style.dot}`} />
            {style.label}
        </span>
    );
};

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

    const [filterFloor, setFilterFloor] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [search, setSearch] = useState('');
    const [viewTab, setViewTab] = useState(localStorage.getItem('roomViewTab') || 'datagrid');

    const [showAmenities, setShowAmenities] = useState(false);



    const handleTabChange = (tab) => {
        setViewTab(tab);
        localStorage.setItem('roomViewTab', tab);
    };

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

    useEffect(() => {
        if (!user) return;
        const profileRef = doc(db, 'users', user.uid);
        getDoc(profileRef).then(snap => { if (snap.exists()) setProfile(snap.data()); });

        let unsubscribe;
        const loadData = async () => {
            await Promise.resolve();
            try {
                const apps = await getUserApartments(db, user);
                setApartments(apps);

                if (activeAptId && activeAptId !== 'all') {
                    const activeApt = apps.find(a => a.id === activeAptId);
                    const tenantQ = query(collection(db, 'users'), where(`apartmentRoles.${activeAptId}.role`, '==', 'tenant'));
                    const unsubTenants = onSnapshot(tenantQ, (tenantSnap) => {
                        const tenantsByRoom = {};
                        tenantSnap.docs.forEach(d => {
                            const data = d.data();
                            const rn = data.apartmentRoles?.[activeAptId]?.roomNumber;
                            if (rn) tenantsByRoom[rn] = { tenantId: d.id, tenantName: data.name || data.displayName || '' };
                        });
                        const roomsQ = query(collection(db, 'rooms'), where('apartmentId', '==', activeAptId));
                        const unsubRooms = onSnapshot(roomsQ, (snapshot) => {
                            const firestoreRooms = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                            const generated = generateRoomsFromConfig(activeApt);
                            const allRooms = generated.map(genRoom => {
                                const existing = firestoreRooms.find(r => r.roomNumber === genRoom.roomNumber);
                                const room = existing ? { ...existing } : { ...genRoom };
                                const tenant = tenantsByRoom[room.roomNumber];
                                if (tenant) { room.status = 'ไม่ว่าง'; room.tenantId = tenant.tenantId; room.tenantName = tenant.tenantName; }
                                else if (!existing || !room.tenantId) {
                                    if (normalizeStatus(room.status) === 'ไม่ว่าง' || room.status === 'occupied') { room.status = 'ว่าง'; room.tenantId = null; room.tenantName = null; }
                                }
                                return room;
                            });
                            setRooms(allRooms);
                            setLoading(false);
                        });
                        unsubscribe = () => { unsubRooms(); unsubTenants(); };
                    });
                } else if (activeAptId === 'all') {
                    const tenantSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'tenant')));
                    const tenantsByRoom = {};
                    tenantSnap.docs.forEach(d => {
                        const data = d.data();
                        if (data.apartmentRoles) {
                            Object.entries(data.apartmentRoles).forEach(([aptId, roleData]) => {
                                if (roleData.role === 'tenant' && roleData.roomNumber)
                                    tenantsByRoom[`${aptId}_${roleData.roomNumber}`] = { tenantId: d.id, tenantName: data.name || data.displayName || '' };
                            });
                        }
                    });
                    unsubscribe = onSnapshot(collection(db, 'rooms'), (snapshot) => {
                        const firestoreRooms = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        let allRooms = [];
                        for (const app of apps) {
                            const appRooms = firestoreRooms.filter(r => r.apartmentId === app.id);
                            const generated = generateRoomsFromConfig(app);
                            generated.forEach(genRoom => {
                                const existing = appRooms.find(r => r.roomNumber === genRoom.roomNumber);
                                const room = existing ? { ...existing } : { ...genRoom };
                                const tenant = tenantsByRoom[`${app.id}_${room.roomNumber}`];
                                if (tenant) { room.status = 'ไม่ว่าง'; room.tenantId = tenant.tenantId; room.tenantName = tenant.tenantName; }
                                else if (!existing || !room.tenantId) {
                                    if (normalizeStatus(room.status) === 'ไม่ว่าง' || room.status === 'occupied') { room.status = 'ว่าง'; room.tenantId = null; room.tenantName = null; }
                                }
                                allRooms.push(room);
                            });
                        }
                        setRooms(allRooms);
                        setLoading(false);
                    });
                } else { setLoading(false); }
            } catch (error) { console.error(error); showToast('โหลดข้อมูลล้มเหลว', 'error'); setLoading(false); }
        };
        loadData();
        return () => { if (unsubscribe) unsubscribe(); };
    }, [user, activeAptId, showToast]);

    useEffect(() => {
        if (!loading && rooms.length > 0 && (searchParams.get('room') || searchParams.get('tenantId'))) {
            const roomNum = searchParams.get('room');
            const tId = searchParams.get('tenantId');
            const target = rooms.find(r => (roomNum && r.roomNumber === roomNum) || (tId && r.tenantId === tId));
            if (target) {
                setTimeout(() => setSelectedRoom(prev => (prev?.roomNumber === target.roomNumber && prev?.apartmentId === target.apartmentId) ? prev : target), 0);
                if (filterFloor !== 'all' && target.floor !== parseInt(filterFloor)) {
                    setTimeout(() => setFilterFloor('all'), 0);
                }
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('room'); newParams.delete('tenantId');
                setSearchParams(newParams, { replace: true });
            }
        }
    }, [loading, rooms, searchParams, filterFloor, setSearchParams]);

    const handleAptSwitch = (id) => { localStorage.setItem('activeApartmentId', id); setActiveAptId(id); setSelectedRoom(null); showToast('สลับตึกเรียบร้อย'); };
    const handleRoomClick = (room) => {
        if (selectedRoom?.roomNumber === room.roomNumber && selectedRoom?.apartmentId === room.apartmentId) setSelectedRoom(null);
        else { setSelectedRoom({ ...room }); setShowAmenities(false); }
    };

    const handleSaveRoom = async () => {
        setSaving(true);
        try {
            const roomId = selectedRoom.id || `${selectedRoom.apartmentId}_${selectedRoom.roomNumber}`;
            const roomRef = doc(db, 'rooms', roomId);
            const dataToSave = { ...selectedRoom, status: normalizeStatus(selectedRoom.status), waterMeter: parseFloat(selectedRoom.waterMeter) || 0, electricityMeter: parseFloat(selectedRoom.electricityMeter) || 0, updatedAt: serverTimestamp() };
            delete dataToSave.id;
            await setDoc(roomRef, dataToSave, { merge: true });
            setRooms(rooms.map(r => (r.roomNumber === selectedRoom.roomNumber && r.apartmentId === selectedRoom.apartmentId) ? { ...selectedRoom, id: roomId, status: normalizeStatus(selectedRoom.status) } : r));
            setSelectedRoom(prev => prev ? { ...prev, id: roomId, status: normalizeStatus(prev.status) } : null);
            showToast('บันทึกข้อมูลห้องพักเรียบร้อย', 'success');
        } catch (error) { console.error(error); showToast('บันทึกล้มเหลว', 'error'); }
        setSaving(false);
    };

    const currentApt = apartments.find(a => a.id === activeAptId);
    const floorsList = activeAptId === 'all' ? Array.from(new Set(rooms.map(r => r.floor))).sort((a, b) => a - b) : (currentApt?.floors?.map(f => f.id) || []);
    const sq = search.trim().toLowerCase();
    const filteredRooms = rooms.filter(r => {
        if (filterFloor !== 'all' && r.floor !== parseInt(filterFloor)) return false;

        const normStatus = normalizeStatus(r.status);
        if (filterStatus !== 'all') {
            if (filterStatus === 'occupied' && normStatus !== 'ไม่ว่าง') return false;
            if (filterStatus === 'vacant' && normStatus !== 'ว่าง') return false;
            if (filterStatus === 'repair' && (normStatus !== 'แจ้งซ่อม' && normStatus !== 'จอง')) return false;
        }

        if (!sq) return true;
        return (r.roomNumber?.toLowerCase() || '').includes(sq) || normStatus.toLowerCase().includes(sq) || (r.tenantName?.toLowerCase() || '').includes(sq);
    });

    const occupiedCount = rooms.filter(r => normalizeStatus(r.status) === 'ไม่ว่าง').length;
    const vacantCount = rooms.filter(r => normalizeStatus(r.status) === 'ว่าง').length;
    const repairCount = rooms.filter(r => normalizeStatus(r.status) === 'แจ้งซ่อม').length;
    const totalRooms = rooms.length;
    const occupancyRate = totalRooms > 0 ? Math.round((occupiedCount / totalRooms) * 100) : 0;

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
                <div className="w-10 h-10 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <MainLayout profile={profile} apartments={apartments} activeAptId={activeAptId} onAptSwitch={handleAptSwitch} title="จัดการห้องพัก">
            <Toast {...toast} onClose={hideToast} />

            <div className="px-3 sm:px-5 py-3 max-w-[1600px] mx-auto w-full">

                {/* ── Stats Bar ─────────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                    {[
                        { id: 'all', label: 'ทั้งหมด', val: totalRooms, icon: <Building2 className="w-4 h-4" />, color: 'text-zinc-300', iconBg: 'bg-white/5' },
                        { id: 'occupied', label: 'มีผู้เช่า', val: occupiedCount, icon: <User className="w-4 h-4" />, color: 'text-blue-400', iconBg: 'bg-blue-500/10' },
                        { id: 'vacant', label: 'ว่าง', val: vacantCount, icon: <Home className="w-4 h-4" />, color: 'text-emerald-400', iconBg: 'bg-emerald-500/10' },
                        { id: 'repair', label: 'ซ่อม/จอง', val: repairCount, icon: <Zap className="w-4 h-4" />, color: 'text-amber-400', iconBg: 'bg-amber-500/10' },
                    ].map((s) => (
                        <button
                            key={s.id}
                            onClick={() => {
                                setFilterStatus(prev => prev === s.id ? 'all' : s.id);
                                if (filterFloor !== 'all') setFilterFloor('all');
                            }}
                            className={`relative overflow-hidden transition-all duration-300 px-3 py-1.5 rounded-lg border text-left active:scale-[0.98] group ${filterStatus === s.id
                                ? 'bg-brand-card shadow-2xl border-brand-orange-500/50 -translate-y-0.5'
                                : 'bg-brand-card/30 hover:bg-brand-card/50 border-white/5 hover:border-white/10'
                                }`}
                        >
                            <div className="flex items-center gap-2 relative z-10">
                                <div className={`w-6 h-6 rounded-md ${s.iconBg} ${s.color} flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 transition-transform duration-500`}>
                                    {React.cloneElement(s.icon, { className: 'w-3 h-3' })}
                                </div>
                                <div className="flex-1">
                                    <p className="text-[8px] font-black text-zinc-500 uppercase tracking-tighter truncate opacity-70 mb-0.5">{s.label}</p>
                                    <div className="flex items-baseline gap-0.5">
                                        <span className={`text-sm font-black tracking-tight ${filterStatus === s.id ? 'text-white' : s.color}`}>{s.val}</span>
                                        <span className="text-[8px] font-bold text-zinc-600">ห้อง</span>
                                    </div>
                                </div>
                            </div>
                            {filterStatus === s.id && (
                                <div className="absolute top-0 right-0 w-6 h-6 bg-brand-orange-500/10 blur-lg rounded-full -mr-2 -mt-2 animate-pulse" />
                            )}
                        </button>
                    ))}
                </div>

                {/* ── Occupancy mini-bar ─────────────────────────── */}
                <div className="mb-4 bg-brand-card/30 backdrop-blur-md border border-white/5 rounded-2xl p-4 flex items-center gap-4 group">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black shrink-0 flex items-center gap-1.5">
                            <LayoutGrid className="w-3 h-3 text-blue-500" /> อัตราการเข้าพัก
                        </span>
                        <span className="text-xl font-black text-blue-400 leading-none mt-1">{occupancyRate}%</span>
                    </div>
                    <div className="flex-1 h-3 bg-zinc-800/50 rounded-full overflow-hidden p-[2px] border border-white/5">
                        <div
                            className="h-full bg-gradient-to-r from-blue-600 via-blue-400 to-emerald-400 rounded-full transition-all duration-1000 ease-out relative shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                            style={{ width: `${occupancyRate}%` }}
                        >
                            <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        </div>
                    </div>
                    <div className="hidden sm:flex flex-col items-end">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">{occupiedCount} / {totalRooms}</span>
                        <span className="text-[9px] text-zinc-600 font-medium">ห้องไม่ว่าง</span>
                    </div>
                </div>

                {/* ── Toolbar ──────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row gap-2 mb-4 items-stretch sm:items-center">
                    {/* Floor filter */}
                    <div className="flex gap-1 bg-zinc-900 border border-white/5 rounded-xl p-1 overflow-x-auto custom-scrollbar shrink-0">
                        {['all', ...floorsList].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilterFloor(f.toString())}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${filterFloor === f.toString()
                                    ? 'bg-brand-orange-500 text-white shadow'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                {f === 'all' ? 'ทั้งหมด' : `ชั้น ${f}`}
                            </button>
                        ))}
                    </div>

                    {/* Search */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                        <input
                            type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="ค้นหาห้อง, ผู้เช่า, สถานะ..."
                            className="w-full h-9 bg-zinc-900 border border-white/5 rounded-xl pl-9 pr-8 text-xs font-medium text-white placeholder:text-zinc-600 outline-none focus:border-brand-orange-500/40 transition-all"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* View Tabs */}
                    <div className="flex bg-zinc-900 border border-white/5 p-1 rounded-xl shrink-0">
                        <button
                            onClick={() => handleTabChange('datagrid')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${viewTab === 'datagrid' ? 'bg-brand-orange-500 text-white shadow-lg shadow-brand-orange-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            <List className="w-3.5 h-3.5" /> รายการ
                        </button>
                        <button
                            onClick={() => handleTabChange('floorplan')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${viewTab === 'floorplan' ? 'bg-brand-orange-500 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
                        >
                            <Map className="w-3.5 h-3.5" /> ผังห้อง
                        </button>
                    </div>
                </div>

                {/* Result count */}
                <p className="text-[10px] text-zinc-600 font-medium mb-3">{filteredRooms.length} ห้อง</p>

                {/* ── Main Area ──────────────────────────────────── */}
                <div className="flex gap-3 items-start">

                    {/* ── Content Area ───────────────────────── */}
                    <div className={`transition-all duration-300 w-full min-w-0 ${selectedRoom ? 'lg:w-[60%]' : ''}`}>
                        {filteredRooms.length === 0 ? (
                            <div className="text-center py-20 bg-brand-card/20 backdrop-blur-xl rounded-3xl border border-dashed border-white/10 animate-in fade-in zoom-in duration-500">
                                <Building2 className="w-12 h-12 text-zinc-800 mx-auto mb-4 opacity-20" />
                                <p className="text-zinc-400 text-lg font-bold tracking-tight">ไม่พบห้องพักที่ต้องการ</p>
                                <p className="text-zinc-600 text-sm mt-1">ลองล้างตัวกรองหรือใช้คำค้นหาใหม่</p>
                                <button
                                    onClick={() => { setFilterFloor('all'); setFilterStatus('all'); setSearch(''); }}
                                    className="mt-6 px-6 py-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10 rounded-xl text-xs font-bold transition-all"
                                >
                                    ล้างการกรองทั้งหมด
                                </button>
                            </div>

                        ) : viewTab === 'datagrid' ? (
                            /* ── DataGrid Tab ─────────────────────────────── */
                            <div className="bg-brand-card/40 backdrop-blur-2xl border border-white/8 rounded-3xl overflow-hidden shadow-2xl">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-white/5">
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">ห้อง</th>
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">สถานะ</th>
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest hidden sm:table-cell">ผู้เช่า</th>
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest hidden md:table-cell text-right">ไฟ</th>
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest hidden md:table-cell text-right">น้ำ</th>
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest text-right">ค่าเช่า</th>
                                                <th className="px-4 py-3 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.04]">
                                            {filteredRooms.map(room => {
                                                const style = getStatusStyle(room.status);
                                                const normalized = normalizeStatus(room.status);
                                                const isVacant = normalized === 'ว่าง';
                                                const isSelected = selectedRoom?.roomNumber === room.roomNumber && selectedRoom?.apartmentId === room.apartmentId;

                                                return (
                                                    <tr
                                                        key={`${room.apartmentId}_${room.roomNumber}`}
                                                        onClick={() => handleRoomClick(room)}
                                                        className={`cursor-pointer transition-colors group ${isSelected ? 'bg-brand-orange-500/5' : 'hover:bg-white/[0.02]'}`}
                                                    >
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2.5">
                                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold font-mono transition-all border ${isSelected ? 'bg-brand-orange-500 border-brand-orange-500 text-white' : `bg-zinc-800 border-white/5 ${style.text}`}`}>
                                                                    {room.roomNumber}
                                                                </div>
                                                                <span className="text-[10px] text-zinc-600 hidden sm:block">ชั้น {room.floor}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <StatusPill status={room.status} />
                                                        </td>
                                                        <td className="px-4 py-3 hidden sm:table-cell">
                                                            <p className={`text-xs font-medium truncate max-w-[120px] ${isVacant ? 'text-zinc-600 italic' : 'text-zinc-300'}`}>
                                                                {isVacant ? '—' : (room.tenantName || 'ไม่ระบุ')}
                                                            </p>
                                                        </td>
                                                        <td className="px-4 py-3 hidden md:table-cell text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <Zap className="w-3 h-3 text-yellow-500/50" />
                                                                <span className="text-xs font-mono text-zinc-400">{room.electricityMeter || 0}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 hidden md:table-cell text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <Droplets className="w-3 h-3 text-blue-500/50" />
                                                                <span className="text-xs font-mono text-zinc-400">{room.waterMeter || 0}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className="text-xs font-semibold text-zinc-300">{room.price?.toLocaleString() || '—'}</span>
                                                            <span className="text-[10px] text-zinc-600 ml-0.5">฿</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ml-auto transition-all ${isSelected ? 'bg-brand-orange-500 text-white' : 'bg-zinc-800 text-zinc-500 group-hover:text-zinc-300'}`}>
                                                                <ChevronRight className="w-3.5 h-3.5" />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        ) : (
                            /* ── Floor Plan Tab ─────────────────────────── */
                            <div className="space-y-6">
                                {(filterFloor === 'all' ? floorsList : [parseInt(filterFloor)]).map(floorNum => {
                                    const floorRooms = filteredRooms.filter(r => r.floor === floorNum);
                                    if (floorRooms.length === 0) return null;
                                    return (
                                        <div key={floorNum}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">ชั้น {floorNum}</span>
                                                <div className="flex-1 h-px bg-white/5" />
                                                <span className="text-[10px] text-zinc-600">{floorRooms.length} ห้อง</span>
                                            </div>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5">
                                                {floorRooms.map(room => {
                                                    const style = getStatusStyle(room.status);
                                                    const normalized = normalizeStatus(room.status);
                                                    const isVacant = normalized === 'ว่าง';
                                                    const isSelected = selectedRoom?.roomNumber === room.roomNumber && selectedRoom?.apartmentId === room.apartmentId;

                                                    return (
                                                        <button
                                                            key={`${room.apartmentId}_${room.roomNumber}`}
                                                            onClick={() => handleRoomClick(room)}
                                                            title={`${room.roomNumber} · ${style.label}${!isVacant && room.tenantName ? ` · ${room.tenantName}` : ''}`}
                                                            className={`relative group rounded-lg border transition-all duration-200 text-left active:scale-95 overflow-hidden ${isSelected
                                                                ? 'border-brand-orange-500 bg-brand-orange-500/10 shadow-md shadow-brand-orange-500/10'
                                                                : `border-white/5 bg-zinc-900 hover:border-white/15 ${style.cardBorder}`
                                                                }`}
                                                        >
                                                            {/* Status indicator strip at top */}
                                                            <div className={`h-0.5 w-full ${style.dot} opacity-60`} />
                                                            <div className="p-2">
                                                                <p className={`text-[11px] font-bold font-mono leading-none mb-1.5 ${isSelected ? 'text-brand-orange-400' : 'text-zinc-200'}`}>
                                                                    {room.roomNumber}
                                                                </p>
                                                                <p className={`text-[9px] font-medium leading-none truncate ${style.text}`}>
                                                                    {style.label}
                                                                </p>
                                                                {!isVacant && room.tenantName && (
                                                                    <p className="text-[8px] text-zinc-600 leading-none mt-0.5 truncate">{room.tenantName.split(' ')[0]}</p>
                                                                )}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Legend */}
                                <div className="flex flex-wrap gap-3 pt-2 border-t border-white/5">
                                    {Object.entries(STATUS_COLORS).map(([key, style]) => (
                                        <div key={key} className="flex items-center gap-1.5">
                                            <span className={`w-2 h-2 rounded-sm ${style.dot} opacity-80`} />
                                            <span className={`text-[10px] font-medium ${style.text}`}>{style.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Detail Panel ──────────────────────────── */}
                    {selectedRoom && (
                        <>
                            <div className="fixed inset-0 z-[100] lg:hidden" onClick={() => setSelectedRoom(null)}>
                                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                            </div>
                            <div className="fixed inset-x-0 bottom-0 z-[101] lg:relative lg:inset-auto lg:z-auto lg:w-[40%] lg:max-w-sm lg:sticky lg:top-20">
                                <div className="bg-zinc-950 border border-white/10 rounded-t-2xl lg:rounded-xl shadow-2xl max-h-[88vh] lg:max-h-[calc(100vh-100px)] flex flex-col overflow-hidden">

                                    {/* Mobile drag handle */}
                                    <div className="lg:hidden flex justify-center pt-2 pb-1 shrink-0">
                                        <div className="w-8 h-1 bg-zinc-700 rounded-full" />
                                    </div>

                                    {/* Panel Header */}
                                    <div className="px-5 py-4 border-b border-white/5 shrink-0 flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold font-mono ${getStatusStyle(selectedRoom.status).bg} ${getStatusStyle(selectedRoom.status).text} border ${getStatusStyle(selectedRoom.status).border}`}>
                                            {selectedRoom.roomNumber}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-bold text-white">ห้อง {selectedRoom.roomNumber}</h4>
                                                <StatusPill status={selectedRoom.status} />
                                            </div>
                                            <p className="text-[10px] text-zinc-500 mt-0.5">ชั้น {selectedRoom.floor}</p>
                                        </div>
                                        <button
                                            onClick={() => setSelectedRoom(null)}
                                            className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-all text-zinc-400 hover:text-white shrink-0"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    {/* Scrollable Content */}
                                    <div className="overflow-y-auto flex-1 divide-y divide-white/[0.04] bg-zinc-950/20">

                                        {/* Tenant info (Top Priority) */}
                                        <div className="px-5 py-3 bg-white/[0.02]">
                                            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">ผู้เช่าปัจจุบัน</p>
                                            {selectedRoom.tenantId ? (
                                                <button
                                                    onClick={() => navigate(`/tenants?tenantId=${selectedRoom.tenantId}`)}
                                                    className="w-full flex items-center gap-2.5 bg-brand-card/40 hover:bg-brand-card/60 backdrop-blur-md border border-white/8 rounded-xl p-2 transition-all text-left group/tenant shadow-xl"
                                                >
                                                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20 group-hover/tenant:scale-105 transition-transform duration-500">
                                                        <User className="w-4 h-4 text-blue-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-xs font-black text-white truncate">{selectedRoom.tenantName || 'ไม่ระบุ'}</p>
                                                            <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                                                        </div>
                                                        <div className="flex items-center gap-1 mt-0.5">
                                                            <CheckCircle2 className="w-2.5 h-2.5 text-blue-400" />
                                                            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">ยืนยันแล้ว</p>
                                                        </div>
                                                    </div>
                                                    <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center group-hover/tenant:bg-brand-orange-500 transition-all">
                                                        <ExternalLink className="w-3 h-3 text-zinc-500 group-hover/tenant:text-white" />
                                                    </div>
                                                </button>
                                            ) : (
                                                <div className="w-full h-12 bg-zinc-900/30 border border-white/5 border-dashed rounded-xl flex items-center justify-center gap-2 text-zinc-600">
                                                    <Home className="w-3.5 h-3.5 opacity-30" />
                                                    <p className="text-[10px] font-bold uppercase tracking-widest italic">ยังไม่มีผู้เช่าเข้าพัก</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Status Chip Row */}
                                        <div className="px-5 py-3">
                                            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">สถานะห้อง</p>
                                            <div className="flex flex-wrap gap-1">
                                                {['ว่าง', 'ไม่ว่าง', 'แจ้งซ่อม', 'จอง'].map(st => {
                                                    const isActive = normalizeStatus(selectedRoom.status) === st;
                                                    const s = STATUS_COLORS[st];
                                                    return (
                                                        <button
                                                            key={st}
                                                            onClick={() => setSelectedRoom({ ...selectedRoom, status: st })}
                                                            className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${isActive
                                                                ? `${s.bg} ${s.border} ${s.text} scale-[1.02] shadow-sm`
                                                                : 'bg-zinc-900/40 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10'}`}
                                                        >
                                                            <div className={`w-1 h-1 rounded-full ${s.dot} ${isActive ? 'animate-pulse' : ''}`} />
                                                            {st === 'แจ้งซ่อม' ? 'ซ่อม' : st}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Pricing Row (Compact) */}
                                        <div className="px-5 py-3 bg-white/[0.01]">
                                            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">ค่าเช่า & อัตราเลท</p>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                <div className="bg-brand-card/30 border border-white/5 rounded-xl p-1.5 text-center">
                                                    <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-tighter mb-0.5">ค่าเช่า</p>
                                                    <input
                                                        type="number"
                                                        value={selectedRoom.price || ''}
                                                        onChange={(e) => setSelectedRoom({ ...selectedRoom, price: parseInt(e.target.value) || 0 })}
                                                        className="w-full bg-transparent text-center outline-none font-black text-white text-xs"
                                                    />
                                                </div>
                                                <div className="bg-brand-card/30 border border-white/5 rounded-xl p-1.5 text-center">
                                                    <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-tighter mb-0.5 flex items-center justify-center gap-1">
                                                        <Zap className="w-2 h-2 text-amber-500" /> ไฟฟ้า
                                                    </p>
                                                    <p className="text-xs font-black text-amber-500">{currentApt?.utilityRates?.electricity || 0}</p>
                                                </div>
                                                <div className="bg-brand-card/30 border border-white/5 rounded-xl p-1.5 text-center">
                                                    <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-tighter mb-0.5 flex items-center justify-center gap-1">
                                                        <Droplets className="w-2 h-2 text-blue-500" /> ประปา
                                                    </p>
                                                    <p className="text-xs font-black text-blue-500">{currentApt?.utilityRates?.water || 0}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Meter Readings */}
                                        <div className="px-5 py-4">
                                            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">มิเตอร์</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1.5">
                                                        <Zap className="w-3 h-3 text-yellow-500/60" /> ไฟฟ้า
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={selectedRoom.electricityMeter || 0}
                                                        onChange={(e) => setSelectedRoom({ ...selectedRoom, electricityMeter: parseFloat(e.target.value) || 0 })}
                                                        className="w-full bg-zinc-900 rounded-xl px-3 py-2.5 border border-white/5 outline-none font-bold text-white focus:border-brand-orange-500/40 transition-all text-sm"
                                                        placeholder="0"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1.5">
                                                        <Droplets className="w-3 h-3 text-blue-500/60" /> น้ำ
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={selectedRoom.waterMeter || 0}
                                                        onChange={(e) => setSelectedRoom({ ...selectedRoom, waterMeter: parseFloat(e.target.value) || 0 })}
                                                        className="w-full bg-zinc-900 rounded-xl px-3 py-2.5 border border-white/5 outline-none font-bold text-white focus:border-brand-orange-500/40 transition-all text-sm"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </div>
                                        </div>


                                        {/* Fixed Expenses (Service Fees) - Compact Grid */}
                                        {currentApt?.fixedExpenses && currentApt.fixedExpenses.length > 0 && (
                                            <div className="px-5 py-3 border-t border-white/[0.04]">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">ค่าบริการรายเดือน</p>
                                                    <span className="text-[8px] font-bold text-zinc-600 uppercase">เปิด/ปิด</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    {currentApt.fixedExpenses.map((expense, idx) => {
                                                        const activeExpenses = selectedRoom.fixedExpenses || [];
                                                        const isActive = activeExpenses.find(fe => fe.name === expense.name)?.active;
                                                        return (
                                                            <button
                                                                key={idx}
                                                                onClick={() => {
                                                                    const currentFixed = [...(selectedRoom.fixedExpenses || [])];
                                                                    const existingIdx = currentFixed.findIndex(fe => fe.name === expense.name);
                                                                    if (existingIdx >= 0) {
                                                                        currentFixed[existingIdx].active = !currentFixed[existingIdx].active;
                                                                    } else {
                                                                        currentFixed.push({ ...expense, active: true });
                                                                    }
                                                                    setSelectedRoom({ ...selectedRoom, fixedExpenses: currentFixed });
                                                                }}
                                                                className={`flex items-center justify-between px-2 py-1.5 rounded-lg border text-[10px] transition-all ${isActive
                                                                        ? 'bg-brand-orange-500/10 border-brand-orange-500/30 text-white shadow-sm'
                                                                        : 'bg-zinc-900/40 border-white/5 text-zinc-500 hover:border-white/10'
                                                                    }`}
                                                            >
                                                                <span className="font-bold truncate max-w-[60px]">{expense.name}</span>
                                                                <span className={`font-black ${isActive ? 'text-brand-orange-400' : 'text-zinc-700'}`}>
                                                                    {expense.amount?.toLocaleString()}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Amenities */}
                                        {selectedRoom.amenities && selectedRoom.amenities.length > 0 && (
                                            <div className="px-5 py-4">
                                                <button onClick={() => setShowAmenities(!showAmenities)} className="w-full flex items-center justify-between mb-2">
                                                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">สิ่งอำนวยความสะดวก</p>
                                                    <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${showAmenities ? 'rotate-180' : ''}`} />
                                                </button>
                                                {showAmenities && (
                                                    <div className="grid grid-cols-2 gap-1.5">
                                                        {selectedRoom.amenities.map((amenity, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => {
                                                                    const newAms = [...selectedRoom.amenities];
                                                                    newAms[idx].status = !newAms[idx].status;
                                                                    setSelectedRoom({ ...selectedRoom, amenities: newAms });
                                                                }}
                                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${amenity.status ? 'bg-brand-orange-500/5 border-brand-orange-500/20 text-white' : 'bg-zinc-900 border-white/5 text-zinc-500 hover:border-white/10'}`}
                                                            >
                                                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${amenity.status ? 'bg-brand-orange-500 border-brand-orange-500' : 'border-zinc-700'}`}>
                                                                    {amenity.status && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                                                                </div>
                                                                <span className="font-medium truncate">{amenity.name}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Save Button */}
                                    <div className="px-5 py-4 border-t border-white/5 shrink-0 bg-zinc-950">
                                        <button
                                            onClick={handleSaveRoom}
                                            disabled={saving}
                                            className="w-full py-3 bg-brand-orange-500 hover:bg-brand-orange-400 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-brand-orange-500/20"
                                        >
                                            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลังบันทึก...</> : <><Save className="w-4 h-4" /> บันทึกข้อมูล</>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
