import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    collection, query, where, onSnapshot, addDoc, updateDoc,
    doc, serverTimestamp, deleteDoc, getDocs, getDoc, setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import MainLayout from '../components/MainLayout';
import { useToast } from '../hooks/useToast';
import Toast from '../components/Toast';
import { getUserApartments } from '../utils/apartmentUtils';
import {
    CalendarCheck, Plus, X, ChevronDown, CheckCircle2,
    XCircle, Clock, Trash2, User, Phone, Calendar,
    FileText, Home, Search, StickyNote
} from 'lucide-react';

// ─── Generate all rooms from apartment floor config ───────────────────────────
const generateRoomsFromConfig = (apt) => {
    const rooms = [];
    (apt.floors || []).forEach(floor => {
        for (let i = 1; i <= floor.roomCount; i++) {
            rooms.push({
                roomNumber: `${floor.id}${i.toString().padStart(2, '0')}`,
                floor: floor.id,
                status: 'ว่าง',
                tenantId: null,
                tenantName: null,
            });
        }
    });
    return rooms;
};

const STATUS_CONFIG = {
    pending: {
        label: 'รอยืนยัน',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        dot: 'bg-amber-400',
        icon: <Clock className="w-3 h-3" />
    },
    confirmed: {
        label: 'ยืนยันแล้ว',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        dot: 'bg-emerald-400',
        icon: <CheckCircle2 className="w-3 h-3" />
    },
    cancelled: {
        label: 'ยกเลิกแล้ว',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        dot: 'bg-red-400',
        icon: <XCircle className="w-3 h-3" />
    },
};

const StatusBadge = ({ status }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
            {cfg.icon} {cfg.label}
        </span>
    );
};

export default function BookingManagement({ user }) {
    const [searchParams] = useSearchParams();
    const { toast, showToast, hideToast } = useToast();

    const [apartments, setApartments] = useState([]);
    const [activeAptId, setActiveAptId] = useState(localStorage.getItem('activeApartmentId'));
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    const [bookings, setBookings] = useState([]);
    const [rooms, setRooms] = useState([]);

    // Filter / search
    const [filterStatus, setFilterStatus] = useState('all');
    const [search, setSearch] = useState('');

    // Add modal
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedFloor, setSelectedFloor] = useState('');
    const [formData, setFormData] = useState({
        roomNumber: '',
        guestName: '',
        guestPhone: '',
        checkInDate: '',
        guestNote: '',
    });

    // Detail modal
    const [detailBooking, setDetailBooking] = useState(null);

    // ─── Load data ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        let unsubBookings;
        const load = async () => {
            try {
                const profileSnap = await getDoc(doc(db, 'users', user.uid));
                if (profileSnap.exists()) setProfile(profileSnap.data());

                const apps = await getUserApartments(db, user);
                setApartments(apps);

                const aptId = activeAptId && activeAptId !== 'all' ? activeAptId : null;
                if (!aptId) { setLoading(false); return; }

                const apt = apps.find(a => a.id === aptId);

                // 1. Generate all rooms from apartment config (covers rooms not yet in Firestore)
                const generated = apt ? generateRoomsFromConfig(apt) : [];

                // 2. Fetch saved room docs from Firestore
                const roomsSnap = await getDocs(query(collection(db, 'rooms'), where('apartmentId', '==', aptId)));
                const fsRooms = {};
                roomsSnap.docs.forEach(d => { fsRooms[d.data().roomNumber] = { id: d.id, ...d.data() }; });

                // 3. Merge: generated rooms overlaid with Firestore data
                const mergedRooms = generated.map(gr => {
                    const fs = fsRooms[gr.roomNumber];
                    return fs ? { ...gr, ...fs } : gr;
                });

                setRooms(mergedRooms);

                // Bookings real-time
                const q = query(collection(db, 'bookings'), where('apartmentId', '==', aptId));
                unsubBookings = onSnapshot(q, snap => {
                    const list = snap.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                    setBookings(list);

                    // Check for deep-linking (once list is loaded)
                    const rid = searchParams.get('roomNumber');
                    if (rid) {
                        setSearch(rid);

                        // Auto-open Add Modal if mode=add is present
                        if (searchParams.get('mode') === 'add' && !isAddOpen) {
                            const targetRoom = mergedRooms.find(r => r.roomNumber === rid);
                            if (targetRoom) {
                                setSelectedFloor(String(targetRoom.floor));
                                setFormData(p => ({ ...p, roomNumber: rid }));
                                setIsAddOpen(true);

                                // Clear params to prevent reopening after submission
                                const newParams = new URLSearchParams(searchParams);
                                newParams.delete('mode');
                                newParams.delete('roomNumber');
                                window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
                            }
                        }
                    }

                    const bid = searchParams.get('bookingId');
                    if (bid) {
                        const found = list.find(b => b.id === bid);
                        if (found) setDetailBooking(found);
                    }

                    setLoading(false);
                });
            } catch (err) {
                console.error(err);
                setLoading(false);
            }
        };
        load();
        return () => { if (unsubBookings) unsubBookings(); };
    }, [user, activeAptId]);

    const handleAptSwitch = id => {
        localStorage.setItem('activeApartmentId', id);
        setActiveAptId(id);
    };

    // ─── Derived occupied / vacant rooms ────────────────────────────────────
    const vacantRooms = rooms.filter(r => {
        const s = r.status || 'ว่าง';
        return s === 'ว่าง' || s === 'vacant';
    });

    const availableFloors = [...new Set(vacantRooms.map(r => r.floor))]
        .filter(f => f !== undefined && f !== null)
        .sort((a, b) => Number(a) - Number(b));

    const roomsOnFloor = selectedFloor !== ''
        ? vacantRooms.filter(r => String(r.floor) === String(selectedFloor))
        : [];

    // ─── Sync room status in Firestore ────────────────────────────────────────
    const updateRoomStatus = async (aptId, roomNumber, status) => {
        try {
            const roomId = `${aptId}_${roomNumber}`;
            await setDoc(doc(db, 'rooms', roomId), {
                apartmentId: aptId,
                roomNumber,
                status,
                updatedAt: serverTimestamp(),
            }, { merge: true });
        } catch (err) {
            console.error('[updateRoomStatus]', err);
        }
    };

    // ─── Add booking ─────────────────────────────────────────────────────────
    const resetForm = () => {
        setFormData({ roomNumber: '', guestName: '', guestPhone: '', checkInDate: '', guestNote: '' });
        setSelectedFloor('');
    };

    const handleSubmit = async e => {
        e.preventDefault();
        if (!activeAptId || activeAptId === 'all') { showToast('กรุณาเลือกหอพักก่อน', 'warning'); return; }
        if (!formData.roomNumber) { showToast('กรุณาเลือกห้อง', 'warning'); return; }
        if (!formData.guestName.trim()) { showToast('กรุณาระบุชื่อผู้จอง', 'warning'); return; }

        const room = rooms.find(r => r.roomNumber === formData.roomNumber);
        const floor = room?.floor ?? parseInt(selectedFloor) ?? null;

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'bookings'), {
                apartmentId: activeAptId,
                roomNumber: formData.roomNumber,
                floor,
                guestName: formData.guestName.trim(),
                guestPhone: formData.guestPhone.trim(),
                checkInDate: formData.checkInDate || null,
                guestNote: formData.guestNote.trim(),
                status: 'pending',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: user.uid,
            });
            // Sync room status → 'จอง'
            await updateRoomStatus(activeAptId, formData.roomNumber, 'จอง');
            showToast('บันทึกการจองเรียบร้อย', 'success');
            setIsAddOpen(false);
            resetForm();
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาด', 'error');
        }
        setIsSubmitting(false);
    };

    // ─── Status actions ──────────────────────────────────────────────────────
    const handleStatusChange = async (bookingId, newStatus) => {
        const booking = bookings.find(b => b.id === bookingId);
        try {
            await updateDoc(doc(db, 'bookings', bookingId), {
                status: newStatus,
                updatedAt: serverTimestamp(),
            });
            // Sync room: cancelled → 'ว่าง', confirmed → keep 'จอง'
            if (newStatus === 'cancelled' && booking?.roomNumber) {
                await updateRoomStatus(booking.apartmentId || activeAptId, booking.roomNumber, 'ว่าง');
            }
            showToast(newStatus === 'confirmed' ? 'ยืนยันการจองแล้ว' : 'ยกเลิกการจองแล้ว', 'success');
            if (detailBooking?.id === bookingId) setDetailBooking(prev => ({ ...prev, status: newStatus }));
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาด', 'error');
        }
    };

    const handleDelete = async bookingId => {
        const booking = bookings.find(b => b.id === bookingId);
        if (!confirm('ยืนยันลบข้อมูลการจองนี้?')) return;
        try {
            await deleteDoc(doc(db, 'bookings', bookingId));
            // Revert room to 'ว่าง' if booking was active
            if (booking?.roomNumber && (booking.status === 'pending' || booking.status === 'confirmed')) {
                await updateRoomStatus(booking.apartmentId || activeAptId, booking.roomNumber, 'ว่าง');
            }
            showToast('ลบการจองเรียบร้อย', 'success');
            if (detailBooking?.id === bookingId) setDetailBooking(null);
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาด', 'error');
        }
    };

    // ─── Filtered list ───────────────────────────────────────────────────────
    const filtered = bookings.filter(b => {
        if (filterStatus !== 'all' && b.status !== filterStatus) return false;
        if (search) {
            const q = search.toLowerCase();
            return (b.guestName || '').toLowerCase().includes(q) ||
                (b.guestPhone || '').toLowerCase().includes(q) ||
                (b.roomNumber || '').toLowerCase().includes(q);
        }
        return true;
    });

    const pendingCount = bookings.filter(b => b.status === 'pending').length;
    const confirmedCount = bookings.filter(b => b.status === 'confirmed').length;
    const cancelledCount = bookings.filter(b => b.status === 'cancelled').length;

    if (loading) return (
        <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
            <div className="w-10 h-10 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <MainLayout profile={profile} apartments={apartments} activeAptId={activeAptId} onAptSwitch={handleAptSwitch} title="การจองห้องพัก">
            <Toast {...toast} onClose={hideToast} />

            <div className="px-3 sm:px-5 py-3 max-w-[1200px] mx-auto w-full">

                {/* ── Stats Bar ─────────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    {[
                        { id: 'all', label: 'ทั้งหมด', val: bookings.length, icon: <CalendarCheck className="w-4 h-4" />, color: 'text-white', iconBg: 'bg-white/5' },
                        { id: 'pending', label: 'รอยืนยัน', val: pendingCount, icon: <Clock className="w-4 h-4" />, color: 'text-amber-400', iconBg: 'bg-amber-500/10' },
                        { id: 'confirmed', label: 'ยืนยันแล้ว', val: confirmedCount, icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-400', iconBg: 'bg-emerald-500/10' },
                        { id: 'cancelled', label: 'ยกเลิก', val: cancelledCount, icon: <XCircle className="w-4 h-4" />, color: 'text-red-400', iconBg: 'bg-red-500/10' },
                    ].map(s => (
                        <button
                            key={s.id}
                            onClick={() => setFilterStatus(s.id)}
                            className={`flex items-center gap-3 p-3 rounded-2xl border transition-all text-left active:scale-[0.98] ${filterStatus === s.id
                                ? 'bg-brand-card/80 border-brand-orange-500/50 shadow-lg shadow-brand-orange-500/10'
                                : 'bg-brand-card/40 border-white/8 hover:border-white/20'}`}
                        >
                            <div className={`w-9 h-9 rounded-xl ${s.iconBg} flex items-center justify-center shrink-0 ${s.color}`}>
                                {s.icon}
                            </div>
                            <div className="flex flex-col items-start min-w-0">
                                <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest leading-none mb-1">{s.label}</p>
                                <p className="text-sm font-black text-white leading-none">{s.val} <span className="text-[10px] font-bold text-brand-gray-600">รายการ</span></p>
                            </div>
                        </button>
                    ))}
                </div>

                {/* ── Toolbar ─────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4 items-stretch sm:items-center">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-gray-500 group-focus-within:text-brand-orange-500 transition-colors" />
                        <input
                            type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="ค้นหาชื่อ, เบอร์, ห้อง..."
                            className="w-full h-10 bg-brand-card/50 border border-white/8 rounded-xl pl-10 pr-10 text-xs font-bold text-white placeholder:text-brand-gray-600 outline-none focus:border-brand-orange-500/50 transition-all"
                        />
                        {search && <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-gray-500 hover:text-white transition-colors"><X className="w-3.5 h-3.5" /></button>}
                    </div>

                    {activeAptId && activeAptId !== 'all' && (
                        <button
                            onClick={() => setIsAddOpen(true)}
                            className="h-10 px-4 bg-brand-orange-500 hover:bg-brand-orange-600 text-white rounded-xl text-[12px] font-bold transition-all flex items-center gap-2 whitespace-nowrap shadow-lg shadow-brand-orange-500/20 active:scale-95"
                        >
                            <Plus className="w-4 h-4" /> บันทึกการจอง
                        </button>
                    )}
                </div>

                {/* ── No Apt Selected ──────────────────────────────── */}
                {(!activeAptId || activeAptId === 'all') && (
                    <div className="text-center py-20 bg-brand-card/40 border border-white/8 rounded-3xl">
                        <CalendarCheck className="w-10 h-10 text-brand-gray-700 mx-auto mb-3 opacity-30" />
                        <p className="text-brand-gray-500 font-bold text-sm">กรุณาเลือกหอพักก่อน</p>
                    </div>
                )}

                {/* ── Bookings List ─────────────────────────────────── */}
                {activeAptId && activeAptId !== 'all' && (
                    filtered.length === 0 ? (
                        <div className="text-center py-20 bg-brand-card/40 border border-white/8 rounded-3xl">
                            <CalendarCheck className="w-10 h-10 text-brand-gray-700 mx-auto mb-3 opacity-30" />
                            <p className="text-brand-gray-500 font-bold text-sm">ไม่พบรายการจอง</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filtered.map(b => (
                                <div
                                    key={b.id}
                                    onClick={() => setDetailBooking(b)}
                                    className="bg-brand-card/40 border border-white/8 hover:border-white/20 rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-all hover:bg-brand-card/60 active:scale-[0.99]"
                                >
                                    {/* Room badge */}
                                    <div className="w-12 h-12 rounded-xl bg-brand-orange-500/10 border border-brand-orange-500/20 flex flex-col items-center justify-center shrink-0">
                                        <Home className="w-4 h-4 text-brand-orange-500 mb-0.5" />
                                        <p className="text-[10px] font-black text-brand-orange-400 leading-none">{b.roomNumber}</p>
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-sm font-bold text-white truncate">{b.guestName || 'ไม่ระบุชื่อ'}</p>
                                            <StatusBadge status={b.status} />
                                        </div>
                                        <div className="flex items-center gap-3 flex-wrap">
                                            {b.guestPhone && (
                                                <p className="text-[11px] text-brand-gray-500 flex items-center gap-1">
                                                    <Phone className="w-3 h-3" /> {b.guestPhone}
                                                </p>
                                            )}
                                            {b.checkInDate && (
                                                <p className="text-[11px] text-brand-gray-500 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" /> {new Date(b.checkInDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Quick actions */}
                                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                                        {b.status === 'pending' && (
                                            <>
                                                <button
                                                    onClick={() => handleStatusChange(b.id, 'confirmed')}
                                                    className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/20 transition-all active:scale-90"
                                                    title="ยืนยัน"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleStatusChange(b.id, 'cancelled')}
                                                    className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/20 transition-all active:scale-90"
                                                    title="ยกเลิก"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => handleDelete(b.id)}
                                            className="p-2 text-brand-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"
                                            title="ลบ"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>

            {/* ── ADD MODAL ─────────────────────────────────────────── */}
            {isAddOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setIsAddOpen(false); resetForm(); }} />
                    <div className="bg-brand-card w-full max-w-md rounded-2xl border border-white/10 shadow-2xl relative flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
                            <div>
                                <h3 className="text-lg font-bold text-white">บันทึกการจอง</h3>
                                <p className="text-[10px] font-medium text-brand-gray-500 tracking-wider">กรอกข้อมูลลูกค้าที่ต้องการจองห้อง</p>
                            </div>
                            <button onClick={() => { setIsAddOpen(false); resetForm(); }} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 text-brand-gray-400 hover:text-white rounded-xl transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto">
                            <form onSubmit={handleSubmit} className="space-y-4">

                                {/* Floor + Room */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-brand-gray-400 block ml-1"><span className="text-red-500">*</span> ห้องพัก</label>
                                    <div className="flex gap-2">
                                        {/* Floor selector */}
                                        <div className="relative flex-1">
                                            <select
                                                value={selectedFloor}
                                                onChange={e => { setSelectedFloor(e.target.value); setFormData(p => ({ ...p, roomNumber: '' })); }}
                                                required
                                                className="w-full h-11 bg-black/20 border border-white/10 rounded-xl px-3 pr-8 text-sm font-bold text-white appearance-none focus:border-brand-orange-500/50 outline-none transition-all cursor-pointer"
                                                style={{ colorScheme: 'dark' }}
                                            >
                                                <option value="" className="bg-[#1a1a2e] text-brand-gray-500">ชั้น...</option>
                                                {availableFloors.map(f => (
                                                    <option key={f} value={f} className="bg-[#1a1a2e]">ชั้น {f}</option>
                                                ))}
                                                {availableFloors.length === 0 && (
                                                    <option disabled className="bg-[#1a1a2e] text-brand-gray-600">ไม่มีห้องว่าง</option>
                                                )}
                                            </select>
                                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray-500 pointer-events-none" />
                                        </div>

                                        {/* Room selector */}
                                        <div className="relative flex-[1.4]">
                                            <select
                                                value={formData.roomNumber}
                                                onChange={e => setFormData(p => ({ ...p, roomNumber: e.target.value }))}
                                                required
                                                disabled={!selectedFloor}
                                                className="w-full h-11 bg-black/20 border border-white/10 rounded-xl px-3 pr-8 text-sm font-bold text-white appearance-none focus:border-brand-orange-500/50 outline-none transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                                style={{ colorScheme: 'dark' }}
                                            >
                                                <option value="" className="bg-[#1a1a2e] text-brand-gray-500">เลือกห้อง...</option>
                                                {roomsOnFloor
                                                    .sort((a, b) => (a.roomNumber || '').localeCompare(b.roomNumber || '', 'th', { numeric: true }))
                                                    .map(r => (
                                                        <option key={r.roomNumber} value={r.roomNumber} className="bg-[#1a1a2e]">
                                                            {r.roomNumber}
                                                        </option>
                                                    ))
                                                }
                                            </select>
                                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray-500 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>

                                {/* Guest Name */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-brand-gray-400 block ml-1"><span className="text-red-500">*</span> ชื่อผู้จอง</label>
                                    <div className="relative">
                                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray-600" />
                                        <input
                                            type="text" required
                                            value={formData.guestName}
                                            onChange={e => setFormData(p => ({ ...p, guestName: e.target.value }))}
                                            placeholder="ชื่อ-นามสกุล"
                                            className="w-full h-11 bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 text-sm font-bold text-white placeholder:text-brand-gray-600 focus:border-brand-orange-500/50 outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Phone */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-brand-gray-400 block ml-1">เบอร์โทรศัพท์</label>
                                    <div className="relative">
                                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray-600" />
                                        <input
                                            type="tel"
                                            value={formData.guestPhone}
                                            onChange={e => setFormData(p => ({ ...p, guestPhone: e.target.value }))}
                                            placeholder="0XX-XXX-XXXX"
                                            className="w-full h-11 bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 text-sm font-bold text-white placeholder:text-brand-gray-600 focus:border-brand-orange-500/50 outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Check-in date */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-brand-gray-400 block ml-1">วันที่ต้องการเข้าพัก</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray-600 pointer-events-none" />
                                        <input
                                            type="date"
                                            value={formData.checkInDate}
                                            onChange={e => setFormData(p => ({ ...p, checkInDate: e.target.value }))}
                                            className="w-full h-11 bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 text-sm font-bold text-white focus:border-brand-orange-500/50 outline-none transition-all"
                                            style={{ colorScheme: 'dark' }}
                                        />
                                    </div>
                                </div>

                                {/* Note */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-brand-gray-400 block ml-1">หมายเหตุ</label>
                                    <textarea
                                        value={formData.guestNote}
                                        onChange={e => setFormData(p => ({ ...p, guestNote: e.target.value }))}
                                        placeholder="ข้อมูลเพิ่มเติม (ถ้ามี)"
                                        rows={3}
                                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder:text-brand-gray-600 focus:border-brand-orange-500/50 outline-none transition-all resize-none"
                                    />
                                </div>

                                {/* Buttons */}
                                <div className="pt-2 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => { setIsAddOpen(false); resetForm(); }}
                                        className="flex-1 h-11 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold text-sm transition-all"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex-[1.5] h-11 bg-brand-orange-500 hover:bg-brand-orange-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-brand-orange-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting
                                            ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            : <><Plus className="w-4 h-4" /> บันทึกการจอง</>
                                        }
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* ── DETAIL MODAL ───────────────────────────────────────── */}
            {detailBooking && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailBooking(null)} />
                    <div className="bg-brand-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-white/10 shadow-2xl relative flex flex-col max-h-[85vh] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
                        {/* Handle */}
                        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
                            <div className="w-8 h-1 bg-white/20 rounded-full" />
                        </div>

                        {/* Header */}
                        <div className="p-5 border-b border-white/5 flex items-center gap-3 shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-brand-orange-500/10 border border-brand-orange-500/20 flex items-center justify-center">
                                <Home className="w-5 h-5 text-brand-orange-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-bold text-white">ห้อง {detailBooking.roomNumber}</h3>
                                    <StatusBadge status={detailBooking.status} />
                                </div>
                                <p className="text-[10px] text-brand-gray-500">ชั้น {detailBooking.floor}</p>
                            </div>
                            <button onClick={() => setDetailBooking(null)} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 text-brand-gray-400 hover:text-white rounded-xl transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-5 overflow-y-auto space-y-3">
                            {[
                                { icon: <User className="w-4 h-4 text-brand-gray-500" />, label: 'ชื่อผู้จอง', val: detailBooking.guestName || '—' },
                                { icon: <Phone className="w-4 h-4 text-brand-gray-500" />, label: 'เบอร์โทร', val: detailBooking.guestPhone || '—' },
                                { icon: <Calendar className="w-4 h-4 text-brand-gray-500" />, label: 'วันที่เข้าพัก', val: detailBooking.checkInDate ? new Date(detailBooking.checkInDate).toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—' },
                                { icon: <FileText className="w-4 h-4 text-brand-gray-500" />, label: 'บันทึกเมื่อ', val: detailBooking.createdAt?.toDate ? detailBooking.createdAt.toDate().toLocaleString('th-TH') : '—' },
                            ].map(row => (
                                <div key={row.label} className="flex items-start gap-3 bg-white/[0.03] border border-white/5 rounded-xl p-3">
                                    <span className="mt-0.5 shrink-0">{row.icon}</span>
                                    <div>
                                        <p className="text-[10px] font-bold text-brand-gray-600 uppercase tracking-wider mb-0.5">{row.label}</p>
                                        <p className="text-sm font-bold text-white">{row.val}</p>
                                    </div>
                                </div>
                            ))}

                            {detailBooking.guestNote && (
                                <div className="flex items-start gap-3 bg-white/[0.03] border border-white/5 rounded-xl p-3">
                                    <StickyNote className="w-4 h-4 text-brand-gray-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-[10px] font-bold text-brand-gray-600 uppercase tracking-wider mb-0.5">หมายเหตุ</p>
                                        <p className="text-sm font-medium text-brand-gray-300">{detailBooking.guestNote}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer actions */}
                        <div className="p-4 border-t border-white/5 shrink-0 flex gap-2">
                            {detailBooking.status === 'pending' && (
                                <>
                                    <button
                                        onClick={() => handleStatusChange(detailBooking.id, 'confirmed')}
                                        className="flex-1 h-11 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-95"
                                    >
                                        <CheckCircle2 className="w-4 h-4" /> ยืนยันการจอง
                                    </button>
                                    <button
                                        onClick={() => handleStatusChange(detailBooking.id, 'cancelled')}
                                        className="flex-1 h-11 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-95"
                                    >
                                        <XCircle className="w-4 h-4" /> ยกเลิกการจอง
                                    </button>
                                </>
                            )}
                            {detailBooking.status !== 'pending' && (
                                <div className="flex-1 flex items-center justify-center gap-2 text-brand-gray-600 text-sm font-bold">
                                    <StatusBadge status={detailBooking.status} />
                                </div>
                            )}
                            <button
                                onClick={() => handleDelete(detailBooking.id)}
                                className="w-11 h-11 flex items-center justify-center text-brand-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors shrink-0"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
}
