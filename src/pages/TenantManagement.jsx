import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
    collection, doc, getDoc, getDocs, query, where, onSnapshot,
    updateDoc, setDoc, deleteField, addDoc, Timestamp
} from 'firebase/firestore';
import { getAuth, sendPasswordResetEmail as firebaseSendReset } from 'firebase/auth';
import { db } from '../firebase';
import {
    User, Search, X, QrCode as QrCodeIcon, CreditCard, AlertCircle,
    CheckCircle2, Clock, LayoutGrid, Banknote, KeyRound,
    ArrowRightLeft, ChevronDown, ChevronRight, Loader2, LogOut, Download, Printer, Copy, Check, Home, ExternalLink, List, Users, Calendar, Image as ImageIcon
} from 'lucide-react';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import MainLayout from '../components/MainLayout';
import { getUserApartments } from '../utils/apartmentUtils';

// ─── helpers ──────────────────────────────────────────────────────────────────
const AVATAR_BG = [
    'bg-brand-orange-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-purple-500', 'bg-pink-500', 'bg-yellow-500', 'bg-zinc-700'
];
const getAvatarBg = (name = '') => AVATAR_BG[(name.charCodeAt(0) || 0) % AVATAR_BG.length];

const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const thMonthsFull = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

const normalizeStatus = (status) => {
    if (status === 'paid') return 'จ่ายแล้ว';
    if (status === 'overdue') return 'ค้างชำระ';
    if (status === 'pending') return 'รอชำระ';
    return status || 'รอชำระ';
};

const STATUS_COLORS = {
    'จ่ายแล้ว': { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'จ่ายแล้ว' },
    'ค้างชำระ': { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-400', label: 'ค้างชำระ' },
    'รอชำระ': { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-400', label: 'รอชำระ' },
};

const getStatusStyle = (status) => {
    const s = normalizeStatus(status);
    return STATUS_COLORS[s] || { bg: 'bg-zinc-800', border: 'border-zinc-700', text: 'text-zinc-500', dot: 'bg-zinc-600', label: 'ไม่ระบุ' };
};

const StatusPill = ({ status }) => {
    const s = getStatusStyle(status);
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
            <span className={`w-1 h-1 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    );
};

// ─── main ─────────────────────────────────────────────────────────────────────
export default function TenantManagement({ user }) {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { toast, showToast, hideToast } = useToast();

    const [profile, setProfile] = useState(null);
    const [apartments, setApartments] = useState([]);
    const [activeAptId, setActiveAptId] = useState(localStorage.getItem('activeApartmentId'));
    const [floors, setFloors] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [tenants, setTenants] = useState([]);
    const [loading, setLoading] = useState(true);

    const [filterFloor, setFilterFloor] = useState('all');
    const [search, setSearch] = useState('');
    const [selectedTenant, setSelectedTenant] = useState(null);
    const [viewTab, setViewTab] = useState(localStorage.getItem('tenantViewTab') || 'datagrid');
    const [allAptPayments, setAllAptPayments] = useState([]);



    // Filtering states
    const [filterYear, setFilterYear] = useState('all');
    const [filterMonth, setFilterMonth] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');

    // Evidence preview state
    const [previewSlipUrl, setPreviewSlipUrl] = useState(null);

    // Print modal state
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [printMode, setPrintMode] = useState('month'); // 'month' | 'year' | 'all'
    const [printYear, setPrintYear] = useState(String(new Date().getFullYear()));
    const [printMonth, setPrintMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
    const [printPaymentId, setPrintPaymentId] = useState(null);

    // room-transfer state
    const [showTransfer, setShowTransfer] = useState(false);
    const [transferFloor, setTransferFloor] = useState('all');
    const [transferRoom, setTransferRoom] = useState('');
    const [transferSaving, setTransferSaving] = useState(false);

    // move-out state
    const [moveOutSaving, setMoveOutSaving] = useState(false);
    const [showMoveOutConfirm, setShowMoveOutConfirm] = useState(false);

    // QR modal state
    const [showQRModal, setShowQRModal] = useState(false);
    const [qrCopied, setQrCopied] = useState(false);
    const qrRef = useRef(null);

    // vehicle edit state
    const [editVehicleMode, setEditVehicleMode] = useState(false);
    const [editCarPlate, setEditCarPlate] = useState('');
    const [editMotoPlate, setEditMotoPlate] = useState('');
    const [vehicleSaving, setVehicleSaving] = useState(false);

    // ── load ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        let unsub;

        const load = async () => {
            const profileSnap = await getDoc(doc(db, 'users', user.uid));
            if (profileSnap.exists()) setProfile(profileSnap.data());

            const apps = await getUserApartments(db, user);
            setApartments(apps);

            const aptId = activeAptId && activeAptId !== 'all' ? activeAptId : null;
            if (!aptId) { setLoading(false); return; }

            const apt = apps.find(a => a.id === aptId);
            setFloors(apt?.floors || []);

            const generatedRooms = apt?.floors?.flatMap(fl =>
                Array.from({ length: fl.roomCount }, (_, i) => ({
                    roomNumber: `${fl.id}${(i + 1).toString().padStart(2, '0')}`,
                    floor: fl.id, status: 'ว่าง', apartmentId: aptId
                }))
            ) || [];

            const roomsQ = query(collection(db, 'rooms'), where('apartmentId', '==', aptId));
            unsub = onSnapshot(roomsQ, snap => {
                const fsRooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                const merged = generatedRooms.map(gr => fsRooms.find(r => r.roomNumber === gr.roomNumber) || gr);
                setRooms(merged);
            });

            const tQ = query(
                collection(db, 'users'),
                where(`apartmentRoles.${aptId}.role`, '==', 'tenant')
            );
            const unsubTenants = onSnapshot(tQ, snap => {
                setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            });

            setLoading(false);
            return () => {
                if (unsub) unsub();
                unsubTenants();
            };
        };

        load().catch(err => { console.error(err); setLoading(false); });
        return () => { if (unsub) unsub(); };
    }, [user, activeAptId]);

    // Deep linking: Auto-select tenant from URL param
    useEffect(() => {
        if (loading || tenants.length === 0 || rooms.length === 0) return;
        const targetId = searchParams.get('tenantId');
        if (!targetId) return;

        const tenant = tenants.find(t => t.id === targetId);
        if (tenant) {
            const rn = tenant.apartmentRoles?.[activeAptId]?.roomNumber;
            const roomObj = rooms.find(r => r.roomNumber === rn);

            setSelectedTenant(prev => {
                if (prev?.id === tenant.id) return prev;
                // Reset edit states
                setEditVehicleMode(false);
                setEditCarPlate(tenant.vehicles?.car?.[0] || '');
                setEditMotoPlate(tenant.vehicles?.motorcycle?.[0] || '');

                return { ...tenant, roomNumber: rn, roomObj };
            });

            if (filterFloor !== 'all' && roomObj && roomObj.floor !== parseInt(filterFloor)) {
                setFilterFloor('all');
            }
        }

        const newParams = new URLSearchParams(searchParams);
        newParams.delete('tenantId');
        setSearchParams(newParams, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, tenants, rooms, searchParams, activeAptId]);



    // ── all apartment payments ───────────────────────────────────────────────
    useEffect(() => {
        if (!activeAptId || activeAptId === 'all') {

            // setAllAptPayments([]);
            return;
        }


        const q = query(
            collection(db, 'payments'),
            where('apartmentId', '==', activeAptId)
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            const sorted = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.month || '').localeCompare(a.month || '') || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setAllAptPayments(sorted);
        }, (err) => {
            console.error("Error listening to all payments:", err);
        });

        return () => unsubscribe();
    }, [activeAptId]);

    // ── handlers ──────────────────────────────────────────────────────────────
    const handleAptSwitch = (id) => {
        localStorage.setItem('activeApartmentId', id);
        setActiveAptId(id); setSelectedTenant(null);
        showToast('สลับตึกเรียบร้อย');
    };

    const handleTabChange = (tab) => {
        setViewTab(tab);
        localStorage.setItem('tenantViewTab', tab);
    };

    const handleResetPassword = async (email) => {
        if (!email) return;
        try {
            await firebaseSendReset(getAuth(), email);
            showToast('ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว', 'success');
        } catch { showToast('ส่งลิงก์ล้มเหลว', 'error'); }
    };

    const handleTransferRoom = async () => {
        if (!transferRoom || !selectedTenant || !activeAptId) return;
        setTransferSaving(true);
        try {
            const tenantRef = doc(db, 'users', selectedTenant.id);
            await updateDoc(tenantRef, { [`apartmentRoles.${activeAptId}.roomNumber`]: transferRoom });

            const oldRoomNum = selectedTenant.roomNumber || 'unknown';
            const oldRoomQuery = query(collection(db, 'rooms'), where('apartmentId', '==', activeAptId), where('roomNumber', '==', oldRoomNum));
            const oldRoomSnap = await getDocs(oldRoomQuery);
            if (oldRoomSnap.docs.length > 0) {
                await updateDoc(oldRoomSnap.docs[0].ref, { status: 'ว่าง', tenantId: null, tenantName: null });
            }

            const newRoomQuery = query(collection(db, 'rooms'), where('apartmentId', '==', activeAptId), where('roomNumber', '==', transferRoom));
            const newRoomSnap = await getDocs(newRoomQuery);
            const tenantName = selectedTenant.name || selectedTenant.displayName || '';
            if (newRoomSnap.docs.length > 0) {
                await updateDoc(newRoomSnap.docs[0].ref, { status: 'ไม่ว่าง', tenantId: selectedTenant.id, tenantName: tenantName });
            } else {
                const apt = apartments.find(a => a.id === activeAptId);
                const newRoomId = `${activeAptId}_${transferRoom}`;
                await setDoc(doc(db, 'rooms', newRoomId), {
                    apartmentId: activeAptId, roomNumber: transferRoom, floor: parseInt(transferRoom.toString()[0]) || 1, status: 'ไม่ว่าง', tenantId: selectedTenant.id, tenantName: tenantName, price: apt?.utilityRates?.baseRent || 0,
                    amenities: apt?.amenities?.map(a => ({ ...a })) || [], fixedExpenses: apt?.fixedExpenses?.map(fe => ({ ...fe, active: true })) || []
                });
            }

            const tSnap = await getDocs(query(collection(db, 'users'), where(`apartmentRoles.${activeAptId}.role`, '==', 'tenant')));
            const updatedTenants = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setTenants(updatedTenants);

            const updated = updatedTenants.find(t => t.id === selectedTenant.id);
            if (updated) {
                const newRoomObj = rooms.find(r => r.roomNumber === transferRoom);
                setSelectedTenant({ ...updated, roomNumber: transferRoom, roomObj: newRoomObj });
            }
            showToast(`ย้ายห้องเรียบร้อย`, 'success');
            setShowTransfer(false); setTransferRoom('');
        } catch (e) { console.error(e); showToast('ย้ายห้องล้มเหลว', 'error'); }
        setTransferSaving(false);
    };

    const handleMoveOut = async () => {
        if (!selectedTenant || !activeAptId) return;
        setMoveOutSaving(true);
        try {
            const roomNum = selectedTenant.roomNumber;
            const tenantName = selectedTenant.name || selectedTenant.displayName || '';
            const aptData = apartments.find(a => a.id === activeAptId);
            const roleData = selectedTenant.apartmentRoles?.[activeAptId];

            await addDoc(collection(db, 'tenantHistory'), {
                tenantId: selectedTenant.id, tenantName, tenantEmail: selectedTenant.email || '', tenantPhone: selectedTenant.phone || '',
                roomNumber: roomNum, floor: selectedTenant.roomObj?.floor || parseInt(roomNum?.toString()[0]) || 1,
                apartmentId: activeAptId, apartmentName: aptData?.name || '', joinedAt: roleData?.joinedAt || null, movedOutAt: Timestamp.now(), rentPrice: selectedTenant.roomObj?.price || 0,
            });

            await updateDoc(doc(db, 'users', selectedTenant.id), { [`apartmentRoles.${activeAptId}`]: deleteField() });

            const roomQuery = query(collection(db, 'rooms'), where('apartmentId', '==', activeAptId), where('roomNumber', '==', roomNum));
            const roomSnap = await getDocs(roomQuery);
            if (roomSnap.docs.length > 0) {
                await updateDoc(roomSnap.docs[0].ref, { status: 'ว่าง', tenantId: null, tenantName: null });
            }

            setTenants(prev => prev.filter(t => t.id !== selectedTenant.id));
            setSelectedTenant(null); setShowMoveOutConfirm(false);
            showToast(`แจ้งย้ายออกเรียบร้อย`, 'success');
        } catch (e) { console.error(e); showToast('เกิดข้อผิดพลาดในการแจ้งย้ายออก', 'error'); }
        setMoveOutSaving(false);
    };

    const handleSaveVehicles = async () => {
        if (!selectedTenant) return;
        setVehicleSaving(true);
        try {
            const userRef = doc(db, 'users', selectedTenant.id);
            const vehicles = {};
            if (editCarPlate.trim()) vehicles.car = [editCarPlate.trim()];
            if (editMotoPlate.trim()) vehicles.motorcycle = [editMotoPlate.trim()];

            const payload = { vehicles };

            await updateDoc(userRef, payload);

            // update local state
            const updatedTenant = { ...selectedTenant, vehicles };
            setSelectedTenant(updatedTenant);
            
            // update in tenants array
            setTenants(prev => prev.map(t => t.id === updatedTenant.id ? { ...t, vehicles } : t));

            setEditVehicleMode(false);
            showToast('บันทึกข้อมูลยานพาหนะแล้ว', 'success');
        } catch (e) {
            console.error(e);
            showToast('บันทึกยานพาหนะล้มเหลว', 'error');
        }
        setVehicleSaving(false);
    };

    const currentApt = apartments.find(a => a.id === activeAptId);




    const floorsList = floors.map(f => f.id).sort((a, b) => a - b);
    const sq = search.trim().toLowerCase();

    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const statusMap = {};
    tenants.forEach(t => {
        const payment = allAptPayments.find(p => p.tenantId === t.id && p.month === currentMonthKey);
        statusMap[t.id] = normalizeStatus(payment?.status);
    });


    // Simplified filtering logic directly in JSX to reduce redundancy

    const paidCount = tenants.filter(t => statusMap[t.id] === 'จ่ายแล้ว').length;
    const overdueCount = tenants.filter(t => statusMap[t.id] === 'ค้างชำระ').length;
    const pendingCount = tenants.filter(t => statusMap[t.id] === 'รอชำระ').length;
    const occupiedCount = tenants.length;
    const vacantRooms = rooms.filter(r => r.status === 'ว่าง');

    // eslint-disable-next-line no-unused-vars
    const totalRooms = rooms.length;
    const paymentProgress = occupiedCount > 0 ? Math.round((paidCount / occupiedCount) * 100) : 0;

    // ── print helpers ─────────────────────────────────────────────────────────
    const availableYears = [...new Set(allAptPayments.map(p => {
        const y = p.month?.split('-')[0];
        return (y && /^\d{4}$/.test(y)) ? y : null;
    }))].filter(Boolean).sort((a, b) => b - a);

    const getPrintData = () => {
        return allAptPayments.filter(p => {
            if (printPaymentId) return p.id === printPaymentId;

            const matchesSearch = !sq || p.roomNumber?.toLowerCase().includes(sq) || p.tenantName?.toLowerCase().includes(sq) || (p.month && p.month.toLowerCase().includes(sq));
            if (!matchesSearch) return false;

            const [y, m] = (p.month || '').split('-');
            if (printMode === 'month') return y === printYear && m === printMonth;
            if (printMode === 'year') return y === printYear;
            return true; // 'all'
        });
    };

    const handlePrintPDF = () => {
        setShowPrintModal(false);
        setTimeout(() => window.print(), 300);
    };

    const handleInstantPrint = (p) => {
        const monthVal = p.month;
        const roomNum = p.roomNumber;

        // Filter print data to only this room
        if (roomNum) setSearch(roomNum);

        setPrintPaymentId(p.id); // Set printPaymentId before printing

        if (!monthVal || monthVal === 'first_bill') {
            setPrintMode('all');
            setPrintYear('all');
            setPrintMonth('all');
        } else {
            const [y, m] = monthVal.split('-');
            setPrintMode('month');
            setPrintYear(y);
            setPrintMonth(m);
        }
        setTimeout(() => {
            window.print();
            setTimeout(() => setPrintPaymentId(null), 500); // Clear printPaymentId after printing
        }, 300);
    };

    const printData = getPrintData();
    const printTotal = printData.reduce((s, p) => s + (p.amount || 0), 0);
    const printPaid = printData.filter(p => normalizeStatus(p.status) === 'จ่ายแล้ว').reduce((s, p) => s + (p.amount || 0), 0);
    const printUnpaid = printTotal - printPaid;

    const printTitle = `${printMode === 'month'
        ? `รายงานการชำระเงิน เดือน${thMonthsFull[parseInt(printMonth) - 1]} ${parseInt(printYear) + 543}`
        : printMode === 'year'
            ? `รายงานการชำระเงิน ประจำปี ${parseInt(printYear) + 543}`
            : `รายงานการชำระเงินทั้งหมด`}${sq ? ` [ ${sq} ]` : ''}`;



    if (loading) return (
        <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
            <div className="w-10 h-10 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <MainLayout profile={profile} apartments={apartments} activeAptId={activeAptId} onAptSwitch={handleAptSwitch} title="จัดการผู้เช่า">
            <Toast {...toast} onClose={hideToast} />

            <div className="px-3 sm:px-5 py-3 max-w-[1600px] mx-auto w-full">

                {/* ── Stats Bar ─────────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    {[
                        { id: 'all', label: 'ผู้เช่าทั้งหมด', val: occupiedCount, icon: <Users />, color: 'text-blue-400', iconBg: 'bg-blue-500/10' },
                        { id: 'จ่ายแล้ว', label: 'จ่ายแล้ว', val: paidCount, icon: <CheckCircle2 />, color: 'text-emerald-400', iconBg: 'bg-emerald-500/10' },
                        { id: 'ค้างชำระ', label: 'ค้างชำระ', val: overdueCount, icon: <AlertCircle />, color: 'text-red-400', iconBg: 'bg-red-500/10' },
                        { id: 'รอชำระ', label: 'รอชำระ', val: pendingCount, icon: <Clock />, color: 'text-amber-400', iconBg: 'bg-amber-500/10' },
                    ].map((s, i) => (
                        <button
                            key={i}
                            onClick={() => setFilterStatus(s.id)}
                            className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${filterStatus === s.id ? 'bg-brand-card/80 border-brand-orange-500/50 shadow-lg shadow-brand-orange-500/10' : 'bg-brand-card/40 border-white/8 hover:border-white/20'}`}
                        >
                            <div className={`w-8 h-8 rounded-xl ${s.iconBg} flex items-center justify-center shrink-0 ${s.color}`}>
                                {React.cloneElement(s.icon, { size: 16 })}
                            </div>
                            <div className="flex flex-col items-start min-w-0">
                                <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest leading-none mb-1">{s.label}</p>
                                <p className="text-sm font-black text-white leading-none">
                                    {s.val} <span className="text-[10px] font-bold text-brand-gray-600">คน</span>
                                </p>
                            </div>
                        </button>
                    ))}
                </div>

                {/* ── Payment progress ─────────────────────────── */}
                {/* ── Payment progress ─────────────────────────── */}
                <div className="mb-4 bg-brand-card/40 border border-white/8 rounded-2xl px-5 py-3 flex items-center gap-4">
                    <span className="text-[10px] text-brand-gray-500 uppercase tracking-widest font-bold shrink-0">การชำระเงินเดือนนี้</span>
                    <div className="flex-1 h-2 bg-zinc-800/50 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700 shadow-[0_0_12px_rgba(16,185,129,0.3)]" style={{ width: `${paymentProgress}%` }} />
                    </div>
                    <span className="text-xs font-black text-emerald-400 shrink-0">{paymentProgress}%</span>
                </div>

                {/* ── Toolbar ──────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4 items-stretch sm:items-center">
                    <div className="flex gap-1 bg-brand-card/50 border border-white/8 rounded-xl p-1 overflow-x-auto custom-scrollbar shrink-0">
                        {['all', ...floorsList].map(f => (
                            <button
                                key={f} onClick={() => setFilterFloor(f.toString())}
                                className={`px-4 py-2 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${filterFloor === f.toString() ? 'bg-brand-orange-500 text-white shadow-lg shadow-brand-orange-500/20' : 'text-brand-gray-400 hover:text-white hover:bg-white/5'}`}
                            >
                                {f === 'all' ? 'ทุกชั้น' : `ชั้น ${f}`}
                            </button>
                        ))}
                    </div>

                    <div className="relative flex-1 group">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-gray-500 group-focus-within:text-brand-orange-500 transition-colors" />
                        <input
                            type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="ค้นหาชื่อ, ห้อง, เบอร์โทร..."
                            className="w-full h-10 bg-brand-card/50 border border-white/8 rounded-xl pl-10 pr-10 text-xs font-bold text-white placeholder:text-brand-gray-600 outline-none focus:border-brand-orange-500/50 transition-all"
                        />
                        {search && <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-gray-500 hover:text-white transition-colors"><X className="w-3.5 h-3.5" /></button>}
                    </div>

                    <div className="flex bg-brand-card/50 border border-white/8 p-1 rounded-xl shrink-0">
                        <button
                            onClick={() => handleTabChange('datagrid')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold transition-all ${viewTab === 'datagrid' ? 'bg-brand-orange-500 text-white shadow-lg shadow-brand-orange-500/20' : 'text-brand-gray-400 hover:text-white whitespace-nowrap'}`}
                        >
                            <List className="w-3.5 h-3.5" /> รายการ
                        </button>
                        <button
                            onClick={() => handleTabChange('cards')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold transition-all ${viewTab === 'cards' ? 'bg-brand-orange-500 text-white shadow-lg shadow-brand-orange-500/20' : 'text-brand-gray-400 hover:text-white whitespace-nowrap'}`}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" /> การ์ด
                        </button>
                        <button
                            onClick={() => handleTabChange('history')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold transition-all ${viewTab === 'history' ? 'bg-brand-orange-500 text-white shadow-lg shadow-brand-orange-500/20' : 'text-brand-gray-400 hover:text-white whitespace-nowrap'}`}
                        >
                            <Clock className="w-3.5 h-3.5" /> ประวัติบิล
                        </button>
                    </div>

                    {activeAptId && activeAptId !== 'all' && (
                        <button onClick={() => setShowQRModal(true)} className="h-10 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-[11px] font-bold transition-all flex items-center gap-2 whitespace-nowrap shadow-lg shadow-emerald-500/5">
                            <QrCodeIcon className="w-3.5 h-3.5" /> QR เข้าร่วม
                        </button>
                    )}
                </div>

                <div className="flex gap-4 items-start print:hidden">
                    <div className={`transition-all duration-300 w-full min-w-0 ${selectedTenant ? 'lg:w-[58%]' : ''}`}>
                        {(() => {
                            const filteredRooms = rooms.filter(room => {
                                const tenant = tenants.find(t => t.id === room.tenantId);
                                if (!tenant) return false;
                                const matchesSearch = !search ||
                                    room.roomNumber?.toLowerCase().includes(search.toLowerCase()) ||
                                    room.tenantName?.toLowerCase().includes(search.toLowerCase()) ||
                                    tenant.phone?.includes(search) ||
                                    tenant.email?.toLowerCase().includes(search.toLowerCase());
                                const matchesFloor = filterFloor === 'all' || room.floor?.toString() === filterFloor;
                                const matchesStatus = filterStatus === 'all' || statusMap[tenant.id] === filterStatus;
                                return matchesSearch && matchesFloor && matchesStatus;
                            });

                            if (viewTab === 'history') return null; // History handled below
                            if (filteredRooms.length === 0) {
                                return (
                                    <div className="text-center py-20 bg-brand-card/40 border border-white/8 rounded-3xl">
                                        <Users className="w-10 h-10 text-brand-gray-700 mx-auto mb-3 opacity-20" />
                                        <p className="text-brand-gray-500 font-bold text-sm">ไม่พบข้อมูลผู้เช่า</p>
                                    </div>
                                );
                            }

                            if (viewTab === 'datagrid') {
                                return (
                                    <div className="bg-brand-card/40 border border-white/8 rounded-3xl overflow-hidden shadow-2xl">
                                        <div className="overflow-x-auto custom-scrollbar">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-white/5">
                                                        <th className="px-6 py-4 text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest">ผู้เช่า</th>
                                                        <th className="px-6 py-4 text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest">ห้อง</th>
                                                        <th className="px-6 py-4 text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest hidden md:table-cell">การติดต่อ</th>
                                                        <th className="px-6 py-4 text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest hidden sm:table-cell">สถานะชำระ</th>
                                                        <th className="px-6 py-4 w-12"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.04]">
                                                    {filteredRooms.map(room => {
                                                        const tenant = tenants.find(t => t.id === room.tenantId);
                                                        const isSelected = selectedTenant?.id === tenant.id;
                                                        const name = tenant.name || tenant.displayName || room.tenantName || '—';
                                                        return (
                                                            <tr
                                                                key={room.id} onClick={() => {
                                                                    if (isSelected) {
                                                                        setSelectedTenant(null);
                                                                    } else {
                                                                        setSelectedTenant({ ...tenant, roomNumber: room.roomNumber, roomObj: room });
                                                                        setEditVehicleMode(false);
                                                                        setEditCarPlate(tenant.vehicles?.car?.[0] || '');
                                                                        setEditMotoPlate(tenant.vehicles?.motorcycle?.[0] || '');
                                                                    }
                                                                }}
                                                                className={`cursor-pointer transition-colors group ${isSelected ? 'bg-brand-orange-500/5' : 'hover:bg-white/[0.02]'}`}
                                                            >
                                                                <td className="px-6 py-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black text-white shrink-0 shadow-lg ${getAvatarBg(name)}`}>
                                                                            {tenant.photoURL ? <img src={tenant.photoURL} className="w-full h-full object-cover rounded-xl" /> : name.charAt(0)}
                                                                        </div>
                                                                        <span className="text-sm font-bold text-zinc-200 truncate">{name}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[13px] font-black text-brand-orange-500">{room.roomNumber}</span>
                                                                        <span className="text-[10px] font-bold text-brand-gray-500 px-2 py-0.5 bg-white/5 rounded-lg border border-white/5">ชั้น {room.floor}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 hidden md:table-cell">
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <p className="text-xs font-bold text-brand-gray-400 flex items-center gap-1.5"><KeyRound className="w-3 h-3 text-brand-gray-500" /> {tenant.phone || '—'}</p>
                                                                        <p className="text-[10px] font-medium text-brand-gray-500 flex items-center gap-1.5"><Clock className="w-3 h-3 text-brand-gray-600" /> {tenant.email || '—'}</p>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 hidden sm:table-cell">
                                                                    <StatusPill status={statusMap[tenant.id]} />
                                                                </td>
                                                                <td className="px-6 py-4 text-right">
                                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ml-auto transition-all shadow-lg ${isSelected ? 'bg-brand-orange-500 text-brand-bg' : 'bg-white/5 text-brand-gray-500 group-hover:bg-white/10 group-hover:text-white'}`}>
                                                                        <ChevronRight className="w-4 h-4" />
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            }

                            if (viewTab === 'cards') {
                                return (
                                    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                        {filteredRooms.map(room => {
                                            const tenant = tenants.find(t => t.id === room.tenantId);
                                            const isSelected = selectedTenant?.id === tenant.id;
                                            const name = tenant.name || tenant.displayName || room.tenantName || '—';
                                            return (
                                                <div
                                                    key={room.id}
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            setSelectedTenant(null);
                                                        } else {
                                                            setSelectedTenant({ ...tenant, roomNumber: room.roomNumber, roomObj: room });
                                                            setEditVehicleMode(false);
                                                            setEditCarPlate(tenant.vehicles?.car?.[0] || '');
                                                            setEditMotoPlate(tenant.vehicles?.motorcycle?.[0] || '');
                                                        }
                                                    }}
                                                    className={`bg-brand-card/40 border rounded-3xl p-5 cursor-pointer transition-all duration-300 group ${isSelected ? 'border-brand-orange-500 shadow-xl shadow-brand-orange-500/10' : 'border-white/8 hover:border-white/20 hover:bg-white/[0.04]'}`}
                                                >
                                                    <div className="flex items-start justify-between mb-4">
                                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black text-white shrink-0 shadow-lg ${getAvatarBg(name)}`}>
                                                            {tenant.photoURL ? <img src={tenant.photoURL} className="w-full h-full object-cover rounded-2xl" /> : name.charAt(0)}
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 block">ห้อง</span>
                                                            <span className="text-lg font-black text-brand-orange-500">{room.roomNumber}</span>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1 mb-4">
                                                        <h3 className="text-sm font-black text-white truncate">{name}</h3>
                                                        <div className="flex items-center justify-between mt-1">
                                                            <p className="text-[10px] text-brand-gray-500 flex items-center gap-1.5"><KeyRound className="w-3 h-3" /> {tenant.phone || '—'}</p>
                                                            <span className="text-[9px] font-bold text-brand-gray-500 px-1.5 py-0.5 bg-white/5 rounded border border-white/5">ชั้น {room.floor}</span>
                                                        </div>

                                                        {(tenant.vehicles?.car?.[0] || tenant.vehicles?.motorcycle?.[0]) && (
                                                            <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/5">
                                                                {tenant.vehicles?.car?.[0] && <span className="text-[9px] font-bold text-blue-400 bg-blue-500/5 px-1.5 py-0.5 rounded border border-blue-500/10">🚗 {tenant.vehicles.car[0]}</span>}
                                                                {tenant.vehicles?.motorcycle?.[0] && <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10">🏍️ {tenant.vehicles.motorcycle[0]}</span>}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                                                        <StatusPill status={statusMap[tenant.id]} />
                                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${isSelected ? 'bg-brand-orange-500 text-brand-bg' : 'bg-white/5 text-zinc-500 group-hover:text-white'}`}>
                                                            <ChevronRight className="w-3.5 h-3.5" />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        {viewTab === 'history' && (
                            <div className="bg-brand-card/40 border border-white/8 rounded-3xl overflow-hidden min-h-[500px] flex flex-col shadow-2xl">
                                {sq || filterYear !== 'all' || filterMonth !== 'all' ? (
                                    <div className="px-6 py-3 bg-brand-orange-500/10 border-b border-white/8 flex flex-wrap items-center justify-between gap-y-2">
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                            <p className="text-[10px] font-black text-brand-orange-500 uppercase tracking-widest">การกรอง:</p>
                                            {sq && <span className="text-[10px] font-bold text-white">ค้นหา: {sq}</span>}
                                            {filterYear !== 'all' && <span className="text-[10px] font-bold text-white">ปี: {filterYear}</span>}
                                            {filterMonth !== 'all' && <span className="text-[10px] font-bold text-white">เดือน: {thMonths[parseInt(filterMonth) - 1] || ''}</span>}
                                        </div>
                                        <button
                                            onClick={() => { setSearch(''); setFilterYear('all'); setFilterMonth('all'); }}
                                            className="text-[10px] font-black text-brand-gray-500 hover:text-white transition-colors uppercase tracking-widest underline underline-offset-4 decoration-white/10"
                                        >
                                            ล้างตัวกรอง
                                        </button>
                                    </div>
                                ) : null}

                                <div className="px-6 py-4 border-b border-white/8 bg-white/5 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
                                    <div className="flex items-center gap-3">
                                        <select
                                            value={filterYear} onChange={e => setFilterYear(e.target.value)}
                                            className="bg-brand-card/50 border border-white/10 rounded-xl px-3 py-1.5 text-[10px] font-black text-white outline-none focus:border-brand-orange-500/50 appearance-none hover:bg-white/10 transition-all cursor-pointer"
                                        >
                                            <option value="all">ทุกปี</option>
                                            {availableYears.map(y => (
                                                <option key={y} value={y}>{y}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                                            className="bg-brand-card/50 border border-white/10 rounded-xl px-3 py-1.5 text-[10px] font-black text-white outline-none focus:border-brand-orange-500/50 appearance-none hover:bg-white/10 transition-all cursor-pointer"
                                        >
                                            <option value="all">ทุกเดือน</option>
                                            {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m, i) => (
                                                <option key={m} value={m}>{thMonths[i]}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        onClick={() => { setPrintPaymentId(null); setShowPrintModal(true); }}
                                        className="h-9 px-4 bg-brand-orange-500/10 hover:bg-brand-orange-500/20 border border-brand-orange-500/30 text-brand-orange-500 rounded-xl text-[11px] font-black transition-all flex items-center gap-2 shadow-lg shadow-brand-orange-500/5 group"
                                    >
                                        <Printer className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" /> พิมพ์สรุป / PDF
                                    </button>
                                </div>

                                <div className="flex-1 overflow-auto custom-scrollbar bg-white/[0.02] print:overflow-visible print:bg-transparent">
                                    <table className="w-full text-left border-collapse print:text-black">
                                        <thead>
                                            <tr className="bg-white/5 sticky top-0 z-10 backdrop-blur-xl border-b border-white/8 print:bg-transparent print:border-black print:static print:text-black">
                                                <th className="px-6 py-4 text-[10px] font-black text-brand-gray-500 uppercase tracking-widest print:text-black print:font-bold">เดือน/ปี</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-brand-gray-500 uppercase tracking-widest print:text-black print:font-bold">ห้อง</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-brand-gray-500 uppercase tracking-widest hidden sm:table-cell print:table-cell print:text-black print:font-bold">ผู้เช่า</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-brand-gray-500 uppercase tracking-widest text-right print:text-black print:font-bold">จำนวนเงิน</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-brand-gray-500 uppercase tracking-widest text-center print:hidden">หลักฐาน</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-brand-gray-500 uppercase tracking-widest text-center print:text-black print:font-bold">สถานะ</th>
                                                <th className="px-6 py-4 w-12 print:hidden"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.04] print:divide-black/20">
                                            {allAptPayments.length === 0 ? (
                                                <tr><td colSpan="7" className="px-6 py-20 text-center text-brand-gray-600 text-[11px] font-black italic tracking-widest uppercase opacity-40 print:text-black">ยังไม่มีประวัติการชำระเงิน</td></tr>
                                            ) : allAptPayments.filter(p => {
                                                const matchesSearch = !sq || p.roomNumber?.toLowerCase().includes(sq) || p.tenantName?.toLowerCase().includes(sq) || (p.month && p.month.toLowerCase().includes(sq));
                                                const [y, m] = (p.month || '').split('-');
                                                const matchesYear = filterYear === 'all' || y === filterYear;
                                                const matchesMonth = filterMonth === 'all' || m === filterMonth;
                                                return matchesSearch && matchesYear && matchesMonth;
                                            }).map(p => (
                                                <tr key={p.id} className="hover:bg-white/[0.04] transition-colors group border-b border-white/[0.04] last:border-0 print:border-b print:border-black/10">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0 shadow-lg group-hover:bg-brand-orange-500/10 transition-colors print:hidden"><Calendar className="w-4 h-4 text-brand-gray-500 group-hover:text-brand-orange-500 transition-all" /></div>
                                                            <span className="text-xs font-black text-zinc-200 print:text-black uppercase tracking-tighter">{p.month === 'first_bill' ? 'ค่าแรกเข้า' : p.month}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-[13px] font-black text-brand-orange-500 print:text-black">{p.roomNumber}</span>
                                                    </td>
                                                    <td className="px-6 py-4 hidden sm:table-cell print:table-cell">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black text-white shrink-0 shadow-lg print:hidden ${getAvatarBg(p.tenantName || '')}`}>
                                                                {tenants.find(t => t.id === p.tenantId)?.photoURL ? (
                                                                    <img src={tenants.find(t => t.id === p.tenantId).photoURL} className="w-full h-full object-cover rounded-lg" alt="" />
                                                                ) : (p.tenantName || '—').charAt(0)}
                                                            </div>
                                                            <span className="text-xs font-bold text-brand-gray-400 truncate max-w-[120px] inline-block print:text-black">{p.tenantName || '—'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className="text-sm font-black text-brand-gray-200 print:text-black">{p.amount?.toLocaleString()} <span className="text-[10px] font-bold text-brand-gray-600 ml-0.5">฿</span></span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center print:hidden">
                                                        {p.slipUrl ? (
                                                            <button
                                                                onClick={() => setPreviewSlipUrl(p.slipUrl)}
                                                                className="w-8 h-8 rounded-xl bg-white/5 text-brand-gray-500 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center mx-auto shadow-lg"
                                                                title="ดูหลักฐาน"
                                                            >
                                                                <ImageIcon className="w-4 h-4" />
                                                            </button>
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-zinc-700 italic">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="print:hidden">
                                                            <StatusPill status={p.status} />
                                                        </div>
                                                        <div className="hidden print:block text-xs font-bold w-full text-center">
                                                            {normalizeStatus(p.status)}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center print:hidden">
                                                        <button
                                                            onClick={() => handleInstantPrint(p)}
                                                            className="w-8 h-8 rounded-xl bg-brand-orange-500/10 text-brand-orange-500 hover:bg-brand-orange-500/20 active:scale-95 transition-all flex items-center justify-center mx-auto shadow-lg border border-brand-orange-500/20 group/print"
                                                            title="พิมพ์ใบเสร็จ"
                                                        >
                                                            <Printer className="w-4 h-4 group-hover/print:scale-110 transition-transform" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                    </div>

                    {selectedTenant && (
                        <>
                            <div className="fixed inset-0 z-[100] lg:hidden" onClick={() => setSelectedTenant(null)}>
                                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                            </div>
                            <div className="fixed inset-x-0 bottom-0 z-[101] lg:relative lg:inset-auto lg:z-auto lg:w-[42%] lg:max-w-md lg:sticky lg:top-20">
                                <div className="bg-zinc-950 border border-white/10 rounded-t-2xl lg:rounded-xl shadow-2xl max-h-[88vh] lg:max-h-[calc(100vh-100px)] flex flex-col overflow-hidden">
                                    <div className="lg:hidden flex justify-center pt-2 pb-1 shrink-0"><div className="w-8 h-1 bg-zinc-700 rounded-full" /></div>
                                    <div className="px-5 py-4 border-b border-white/5 shrink-0 flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white ${getAvatarBg(selectedTenant.name || selectedTenant.displayName)}`}>
                                            {selectedTenant.photoURL ? <img src={selectedTenant.photoURL} className="w-full h-full object-cover rounded-xl" /> : (selectedTenant.name || selectedTenant.displayName)?.charAt(0)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-bold text-white truncate">{selectedTenant.name || selectedTenant.displayName}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] font-bold text-brand-orange-400 font-mono">ROOM {selectedTenant.roomNumber}</span>
                                                <StatusPill status="paid" />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {selectedTenant.roomNumber && (
                                                <button
                                                    onClick={() => navigate(`/rooms?room=${selectedTenant.roomNumber}`)}
                                                    className="w-7 h-7 rounded-lg bg-brand-orange-500/10 text-brand-orange-400 hover:bg-brand-orange-500/20 flex items-center justify-center transition-all border border-brand-orange-500/20"
                                                    title="ไปที่ห้องพัก"
                                                >
                                                    <Home className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            <button onClick={() => setSelectedTenant(null)} className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-400 flex items-center justify-center transition-all hover:bg-zinc-700 hover:text-white">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="overflow-y-auto flex-1 divide-y divide-white/[0.04]">
                                        <div className="px-5 py-4 space-y-3">
                                            {[
                                                { icon: <User className="w-3.5 h-3.5" />, label: 'รหัสผู้ใช้', val: selectedTenant.id?.slice(0, 8), copy: selectedTenant.id },
                                                { icon: <CreditCard className="w-3.5 h-3.5" />, label: 'เบอร์โทรศัพท์', val: selectedTenant.phone || '—', color: 'text-blue-400' },
                                                { icon: <Clock className="w-3.5 h-3.5" />, label: 'วันที่เข้าพัก', val: selectedTenant.apartmentRoles?.[activeAptId]?.joinedAt?.toDate?.()?.toLocaleDateString('th-TH') || '—' },
                                                { icon: <Banknote className="w-3.5 h-3.5" />, label: 'ค่าเช่าห้อง', val: `${selectedTenant.roomObj?.price?.toLocaleString()} บ.` },
                                            ].map((item, i) => (
                                                <div key={i} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-zinc-500">
                                                        {item.icon} <span className="text-[10px] font-semibold uppercase tracking-wider">{item.label}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`text-xs font-bold ${item.color || 'text-white'}`}>{item.val}</span>
                                                        {item.copy && <button onClick={() => { navigator.clipboard.writeText(item.copy); showToast('คัดลอกรหัสแล้ว'); }} className="text-zinc-600 hover:text-zinc-400"><Copy className="w-3 h-3" /></button>}
                                                    </div>
                                                </div>
                                            ))}
                                            
                                            {/* Vehicle Information */}
                                            <div className="pt-3 mt-3 border-t border-white/5 space-y-3">
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">ยานพาหนะ</p>
                                                    <button 
                                                        onClick={() => {
                                                            if (editVehicleMode) {
                                                                handleSaveVehicles();
                                                            } else {
                                                                setEditVehicleMode(true);
                                                            }
                                                        }}
                                                        disabled={vehicleSaving}
                                                        className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${editVehicleMode ? 'bg-brand-orange-500 text-white' : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'} disabled:opacity-50`}
                                                    >
                                                        {vehicleSaving ? 'กำลังบันทึก...' : editVehicleMode ? 'บันทึก' : 'แก้ไข'}
                                                    </button>
                                                </div>
                                                
                                                {editVehicleMode ? (
                                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-zinc-500 flex items-center gap-1.5 mb-1"><span className="text-xs">🚗</span> ทะเบียนรถยนต์</label>
                                                            <input 
                                                                type="text" 
                                                                value={editCarPlate}
                                                                onChange={e => setEditCarPlate(e.target.value)}
                                                                placeholder="เช่น กก 1234 กทม."
                                                                className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-brand-orange-500 outline-none placeholder:text-zinc-600"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-zinc-500 flex items-center gap-1.5 mb-1"><span className="text-xs">🏍️</span> ทะเบียนรถจักรยานยนต์</label>
                                                            <input 
                                                                type="text" 
                                                                value={editMotoPlate}
                                                                onChange={e => setEditMotoPlate(e.target.value)}
                                                                placeholder="เช่น 1กข 5678 กทม."
                                                                className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-brand-orange-500 outline-none placeholder:text-zinc-600"
                                                            />
                                                        </div>
                                                        <div className="flex justify-end pt-1">
                                                            <button 
                                                                onClick={() => {
                                                                    setEditVehicleMode(false);
                                                                    setEditCarPlate(selectedTenant.vehicles?.car?.[0] || '');
                                                                    setEditMotoPlate(selectedTenant.vehicles?.motorcycle?.[0] || '');
                                                                }}
                                                                className="text-[10px] font-bold text-zinc-500 hover:text-white transition-colors"
                                                            >
                                                                ยกเลิก
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {((selectedTenant.vehicles?.car && selectedTenant.vehicles?.car?.length > 0) || (selectedTenant.vehicles?.motorcycle && selectedTenant.vehicles?.motorcycle?.length > 0)) ? (
                                                            <>
                                                                {selectedTenant.vehicles?.car && selectedTenant.vehicles?.car?.map((plate, idx) => (
                                                                    <div key={`car-${idx}`} className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2 text-zinc-500">
                                                                            <span className="w-3.5 h-3.5 flex items-center justify-center text-xs">🚗</span>
                                                                            <span className="text-[10px] font-semibold uppercase tracking-wider">รถยนต์ {idx + 1}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="text-xs font-bold text-white bg-white/10 px-2 py-0.5 rounded border border-white/10">{plate}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                {selectedTenant.vehicles?.motorcycle && selectedTenant.vehicles?.motorcycle?.map((plate, idx) => (
                                                                    <div key={`moto-${idx}`} className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2 text-zinc-500">
                                                                            <span className="w-3.5 h-3.5 flex items-center justify-center text-xs">🏍️</span>
                                                                            <span className="text-[10px] font-semibold uppercase tracking-wider">รถจักรยานยนต์ {idx + 1}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="text-xs font-bold text-white bg-white/10 px-2 py-0.5 rounded border border-white/10">{plate}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </>
                                                        ) : (
                                                            <p className="text-xs text-zinc-600 italic font-medium">ยังไม่มีข้อมูลยานพาหนะ</p>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>



                                        <div className="px-5 py-4">
                                            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">จัดการห้องพัก</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button onClick={() => setShowTransfer(true)} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-900 border border-white/5 text-[11px] font-bold text-zinc-300 hover:bg-zinc-800 transition-all">
                                                    <ArrowRightLeft className="w-3.5 h-3.5" /> ย้ายห้อง
                                                </button>
                                                <button onClick={() => setShowMoveOutConfirm(true)} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] font-bold text-red-400 hover:bg-red-500/20 transition-all">
                                                    <LogOut className="w-3.5 h-3.5" /> แจ้งย้ายออก
                                                </button>
                                            </div>
                                            {showTransfer && (
                                                <div className="mt-3 p-3 bg-zinc-900 rounded-xl border border-brand-orange-500/30 animate-in fade-in slide-in-from-top-2 space-y-3">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <p className="text-[10px] font-bold text-zinc-500 mb-1.5 uppercase tracking-wider">เลือกชั้น</p>
                                                            <select
                                                                value={transferFloor}
                                                                onChange={e => { setTransferFloor(e.target.value); setTransferRoom(''); }}
                                                                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:border-brand-orange-500 outline-none"
                                                            >
                                                                <option value="all">ทุกชั้น</option>
                                                                {floorsList.map(f => <option key={f} value={f}>ชั้น {f}</option>)}
                                                            </select>
                                                        </div>

                                                        <div>
                                                            <p className="text-[10px] font-bold text-zinc-500 mb-1.5 uppercase tracking-wider">เลือกห้องใหม่</p>
                                                            <select
                                                                value={transferRoom}
                                                                onChange={e => setTransferRoom(e.target.value)}
                                                                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:border-brand-orange-500 outline-none"
                                                            >
                                                                <option value="">เลือกห้อง...</option>
                                                                {vacantRooms
                                                                    .filter(r => transferFloor === 'all' || r.floor === parseInt(transferFloor))
                                                                    .map(r => (
                                                                        <option key={r.roomNumber} value={r.roomNumber}>{r.roomNumber}</option>
                                                                    ))
                                                                }
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2 pt-1 border-t border-white/5 mt-2">
                                                        <button onClick={() => setShowTransfer(false)} className="flex-1 py-2 text-[10px] font-bold text-zinc-500 hover:text-white transition-colors">ยกเลิก</button>
                                                        <button onClick={handleTransferRoom} disabled={!transferRoom || transferSaving} className="flex-1 py-2 bg-brand-orange-500 text-white rounded-lg text-[10px] font-bold disabled:opacity-40 shadow-lg shadow-brand-orange-500/20">{transferSaving ? 'กำลังบันทึก...' : 'ยืนยันการย้าย'}</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>


                                    </div>

                                    <div className="px-5 py-4 border-t border-white/5 bg-zinc-950 flex flex-col gap-2">
                                        <button
                                            onClick={() => {
                                                const name = selectedTenant.name || selectedTenant.displayName || '';
                                                setSearch(name);
                                                handleTabChange('history');
                                                setSelectedTenant(null);
                                            }}
                                            className="w-full py-2.5 bg-brand-orange-500/10 hover:bg-brand-orange-500/20 border border-brand-orange-500/30 text-brand-orange-400 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                                        >
                                            <Clock className="w-3.5 h-3.5" /> ดูประวัติการชำระ
                                        </button>
                                        <button onClick={() => handleResetPassword(selectedTenant.email)} className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-white/5">
                                            <KeyRound className="w-3.5 h-3.5" /> รีเซ็ตรหัสผ่าน
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* QR Code Modal */}
            {showQRModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowQRModal(false)} />
                    <div className="relative bg-zinc-950 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/20"><QrCodeIcon className="w-8 h-8 text-emerald-400" /></div>
                        <h3 className="text-xl font-bold text-white mb-2">QR Code เข้าร่วมตึก</h3>
                        <p className="text-zinc-500 text-xs mb-8">ให้ผู้เช่าสแกนเพื่อลงทะเบียนเข้าห้องพักใน {currentApt?.name}</p>
                        <div className="bg-white p-6 rounded-3xl inline-block shadow-2xl mb-8" ref={qrRef}>
                            <QRCodeSVG value={`https://growapart.web.app/join?apt=${activeAptId}`} size={200} level="H" includeMargin={false} />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowQRModal(false)} className="flex-1 py-3 bg-zinc-900 text-zinc-400 font-bold rounded-xl text-sm transition-all hover:bg-zinc-800">ปิด</button>
                            <button onClick={() => { navigator.clipboard.writeText(`https://growapart.web.app/join?apt=${activeAptId}`); showToast('คัดลอกลิงก์แล้ว'); setQrCopied(true); setTimeout(() => setQrCopied(false), 2000); }} className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all hover:bg-emerald-400 shadow-lg shadow-emerald-500/20">{qrCopied ? 'คัดลอกแล้ว!' : 'คัดลอกลิงก์'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Move Out Confirmation Modal */}
            {showMoveOutConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowMoveOutConfirm(false)} />
                    <div className="relative bg-zinc-950 border border-white/10 rounded-3xl p-6 max-w-sm w-full animate-in zoom-in-95 duration-200">
                        <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center mb-4 border border-red-500/20"><AlertCircle className="w-6 h-6 text-red-500" /></div>
                        <h3 className="text-lg font-bold text-white mb-2">ยืนยันการแจ้งย้ายออก</h3>
                        <p className="text-zinc-500 text-xs mb-6">คุณกำลังจะลบสิทธิ์ผู้เช่า {selectedTenant.name || selectedTenant.displayName} ออกจากห้อง {selectedTenant.roomNumber} ข้อมูลประวัติจะถูกบันทึกไว้</p>
                        <div className="flex gap-2">
                            <button onClick={() => setShowMoveOutConfirm(false)} className="flex-1 py-2.5 bg-zinc-900 text-zinc-500 font-bold rounded-xl text-xs hover:bg-zinc-800 transition-all">ยกเลิก</button>
                            <button onClick={handleMoveOut} disabled={moveOutSaving} className="flex-1 py-2.5 bg-red-500 text-white font-bold rounded-xl text-xs hover:bg-red-400 transition-all shadow-lg shadow-red-500/20">{moveOutSaving ? '...' : 'ยืนยันย้ายออก'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Slip Preview Modal */}
            {previewSlipUrl && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setPreviewSlipUrl(null)} />
                    <div className="relative max-w-lg w-full bg-zinc-950 rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                            <h4 className="text-sm font-bold text-white">หลักฐานการชำระเงิน</h4>
                            <button onClick={() => setPreviewSlipUrl(null)} className="w-8 h-8 rounded-lg bg-zinc-900 text-zinc-400 flex items-center justify-center"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-2 flex items-center justify-center bg-black/40 min-h-[300px]">
                            <img src={previewSlipUrl} alt="Payment Slip" className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-2xl" />
                        </div>
                        <div className="px-6 py-4 bg-zinc-950 text-center">
                            <a
                                href={previewSlipUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-[11px] font-bold text-zinc-400 hover:text-white transition-all"
                            >
                                <ExternalLink className="w-3.5 h-3.5" /> เปิดในหน้าต่างใหม่
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Print Area (Visible only when printing) ───────────────── */}
            <div className="print-area hidden print:block bg-white text-black p-0">
                <div className="flex justify-between items-start mb-8 border-b-2 border-zinc-100 pb-6">
                    <div>
                        <h1 className="text-2xl font-black text-zinc-900 mb-1">{currentApt?.name || 'GrowApart Apartment'}</h1>
                        <p className="text-zinc-500 text-sm">เลขที่ 123/45 ถนนราชพฤกษ์ แขวงตลิ่งชัน เขตตลิ่งชัน กรุงเทพฯ 10170</p>
                        <p className="text-zinc-500 text-sm">โทร: 02-123-4567, 081-234-5678</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-xl font-bold text-brand-orange-500 underline decoration-brand-orange-500/30 underline-offset-4 leading-relaxed">{printTitle}</h2>
                        <p className="text-zinc-400 text-[10px] mt-2 italic font-medium">ออกโดย: {user?.displayName || 'Admin'} • {new Date().toLocaleDateString('th-TH', {
                            year: 'numeric', month: 'long', day: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                        })}</p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-zinc-50 rounded-2xl p-5 border border-zinc-100">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">ยอดรวมประเมิน</p>
                        <p className="text-2xl font-black text-zinc-900">{printTotal.toLocaleString()} <span className="text-sm font-bold text-zinc-400 ml-1">฿</span></p>
                    </div>
                    <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
                        <p className="text-[10px] font-bold text-emerald-600/60 uppercase tracking-widest mb-1.5">ชำระแล้วเรียบร้อย</p>
                        <p className="text-2xl font-black text-emerald-600">{printPaid.toLocaleString()} <span className="text-sm font-bold text-emerald-300 ml-1">฿</span></p>
                    </div>
                    <div className="bg-red-50 rounded-2xl p-5 border border-red-100">
                        <p className="text-[10px] font-bold text-red-600/60 uppercase tracking-widest mb-1.5">ยอดคงเหลือค้างจ่าย</p>
                        <p className="text-2xl font-black text-red-600">{printUnpaid.toLocaleString()} <span className="text-sm font-bold text-red-300 ml-1">฿</span></p>
                    </div>
                </div>

                <table className="w-full text-left border-collapse mb-10 overflow-hidden rounded-t-xl border border-zinc-100">
                    <thead>
                        <tr className="bg-zinc-900 text-white">
                            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">ลำดับ</th>
                            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">งวดเดือน/ปี</th>
                            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">ห้อง</th>
                            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">รายชื่อผู้เช่า</th>
                            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">จำนวนเงิน</th>
                            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-center">ผลการชำระ</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                        {printData.length === 0 ? (
                            <tr><td colSpan="6" className="px-4 py-20 text-center text-zinc-400 italic text-sm font-medium">ไม่พบข้อมูลการชำระเงินในช่วงเวลาที่เลือก</td></tr>
                        ) : printData.map((p, idx) => (
                            <tr key={p.id} className="even:bg-zinc-50/50">
                                <td className="px-4 py-2.5 text-xs text-zinc-500 font-mono">{idx + 1}</td>
                                <td className="px-4 py-2.5 text-xs font-bold text-zinc-900">{p.month === 'first_bill' ? 'เงินประกัน/แรกเข้า' : p.month}</td>
                                <td className="px-4 py-2.5 text-xs font-black text-brand-orange-600">{p.roomNumber}</td>
                                <td className="px-4 py-2.5 text-xs font-medium text-zinc-700">{p.tenantName || '—'}</td>
                                <td className="px-4 py-2.5 text-xs font-black text-zinc-900 text-right">{p.amount?.toLocaleString()} <span className="text-[10px] font-bold text-zinc-400">฿</span></td>
                                <td className="px-4 py-2.5 text-xs text-center font-black">
                                    <span className={normalizeStatus(p.status) === 'จ่ายแล้ว' ? 'text-emerald-600' : 'text-red-500'}>
                                        {normalizeStatus(p.status)}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="grid grid-cols-2 gap-24 mt-20 px-12">
                    <div className="text-center">
                        <div className="border-b border-zinc-300 h-12 mb-3"></div>
                        <p className="text-[11px] text-zinc-600 font-bold uppercase tracking-wider">ลงชื่อ ผู้จัดทำรายงาน</p>
                        <p className="text-[10px] text-zinc-400 mt-1 font-medium italic">( เจ้าหน้าที่ดูแลระบบ / แอดมิน )</p>
                    </div>
                    <div className="text-center">
                        <div className="border-b border-zinc-300 h-12 mb-3"></div>
                        <p className="text-[11px] text-zinc-600 font-bold uppercase tracking-wider">ลงชื่อ ผู้จัดการ / เจ้าของอาคาร</p>
                        <p className="text-[10px] text-zinc-400 mt-1 font-medium italic">( .................................................. )</p>
                    </div>
                </div>

                <div className="fixed bottom-0 left-0 right-0 text-center pb-6 border-t border-zinc-50 pt-4 px-10 flex justify-between items-center text-zinc-300">
                    <p className="text-[8px] font-bold tracking-widest uppercase">GrowApart Management System • Cloud Solution</p>
                    <p className="text-[8px] font-medium tracking-wide">หน้าที่ 1 / 1</p>
                </div>
            </div>

            {/* Print Modal */}
            {showPrintModal && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowPrintModal(false)} />
                    <div className="relative bg-zinc-950 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-brand-orange-500/10 border border-brand-orange-500/20 flex items-center justify-center">
                                    <Printer className="w-5 h-5 text-brand-orange-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white">พิมพ์รายงาน / บันทึก PDF</h3>
                                    <p className="text-[10px] text-zinc-500">{currentApt?.name || 'อาคาร'}</p>
                                </div>
                            </div>
                            <button onClick={() => setShowPrintModal(false)} className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-400 flex items-center justify-center">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Print Mode Selector */}
                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">ช่วงเวลา</p>
                        <div className="grid grid-cols-3 gap-1.5 bg-zinc-900 border border-white/5 rounded-xl p-1 mb-4">
                            {[
                                { key: 'month', label: 'รายเดือน' },
                                { key: 'year', label: 'รายปี' },
                                { key: 'all', label: 'ทั้งหมด' },
                            ].map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => setPrintMode(opt.key)}
                                    className={`py-2 rounded-lg text-[11px] font-bold transition-all ${printMode === opt.key ? 'bg-brand-orange-500 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {/* Year / Month Dropdowns */}
                        {printMode !== 'all' && (
                            <div className="flex gap-2 mb-4">
                                <div className="flex-1">
                                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">ปี</p>
                                    <select
                                        value={printYear}
                                        onChange={e => setPrintYear(e.target.value)}
                                        className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-brand-orange-500/50 transition-all"
                                    >
                                        {availableYears.length > 0
                                            ? availableYears.map(y => <option key={y} value={y}>{parseInt(y) + 543}</option>)
                                            : <option value={printYear}>{parseInt(printYear) + 543}</option>
                                        }
                                    </select>
                                </div>
                                {printMode === 'month' && (
                                    <div className="flex-1">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">เดือน</p>
                                        <select
                                            value={printMonth}
                                            onChange={e => setPrintMonth(e.target.value)}
                                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-brand-orange-500/50 transition-all"
                                        >
                                            {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m, i) => (
                                                <option key={m} value={m}>{thMonthsFull[i]}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Preview Summary */}
                        <div className="bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-0.5">ข้อมูลที่จะพิมพ์</p>
                                <p className="text-xs font-bold text-white">{printTitle}</p>
                            </div>
                            <div className="text-right">
                                <span className="text-2xl font-black text-brand-orange-400">{printData.length}</span>
                                <p className="text-[10px] text-zinc-500">รายการ</p>
                            </div>
                        </div>

                        {/* Totals row */}
                        <div className="grid grid-cols-3 gap-2 mb-5 text-center">
                            {[
                                { label: 'ยอดรวม', val: printTotal, color: 'text-white' },
                                { label: 'จ่ายแล้ว', val: printPaid, color: 'text-emerald-400' },
                                { label: 'ยังค้าง', val: printUnpaid, color: 'text-red-400' },
                            ].map((s, i) => (
                                <div key={i} className="bg-zinc-900/50 border border-white/5 rounded-xl py-2 px-1">
                                    <p className="text-[9px] text-zinc-500 uppercase font-semibold mb-0.5">{s.label}</p>
                                    <p className={`text-xs font-black ${s.color}`}>{s.val.toLocaleString()} ฿</p>
                                </div>
                            ))}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                            <button onClick={() => setShowPrintModal(false)} className="flex-1 py-2.5 text-xs font-bold text-zinc-500 hover:text-white rounded-xl bg-zinc-900 border border-white/5 transition-all">
                                ยกเลิก
                            </button>
                            <button
                                onClick={handlePrintPDF}
                                disabled={printData.length === 0}
                                className="flex-1 py-2.5 text-xs font-bold text-white rounded-xl bg-brand-orange-500 hover:bg-brand-orange-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-orange-500/20 flex items-center justify-center gap-2"
                            >
                                <Printer className="w-3.5 h-3.5" /> พิมพ์ / บันทึก PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </MainLayout>
    );
}
