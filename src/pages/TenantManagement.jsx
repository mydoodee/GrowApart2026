import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
    collection, doc, getDoc, getDocs, query, where, onSnapshot,
    updateDoc, setDoc, deleteField, addDoc, Timestamp
} from 'firebase/firestore';
import { getAuth, sendPasswordResetEmail as firebaseSendReset } from 'firebase/auth';
import { db } from '../firebase';
import {
    User, Search, X, QrCode,
    CreditCard, AlertCircle,
    CheckCircle2, Clock, LayoutGrid, Banknote, KeyRound,
    ArrowRightLeft, ChevronDown, Loader2, LogOut, Download, Printer, Copy, Check, Home, ExternalLink
} from 'lucide-react';
import Toast, { useToast } from '../components/Toast';
import MainLayout from '../components/MainLayout';
import { getUserApartments } from '../utils/apartmentUtils';

// ─── helpers ──────────────────────────────────────────────────────────────────
const AVATAR_BG = [
    'bg-brand-orange-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-purple-500', 'bg-pink-500', 'bg-yellow-500'
];
const getAvatarBg = (name = '') => AVATAR_BG[(name.charCodeAt(0) || 0) % AVATAR_BG.length];

const StatusChip = ({ status }) => {
    const map = {
        paid: { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle2 className="w-3 h-3" />, label: 'จ่ายแล้ว' },
        overdue: { cls: 'bg-red-500/10 text-red-400 border-red-500/20', icon: <AlertCircle className="w-3 h-3" />, label: 'ค้างชำระ' },
    };
    const s = map[status] || { cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: <Clock className="w-3 h-3" />, label: 'รอชำระ' };
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${s.cls}`}>
            {s.icon} {s.label}
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
    const [payments, setPayments] = useState([]);
    const [paymentsLoading, setPaymentsLoading] = useState(false);

    // room-transfer state
    const [showTransfer, setShowTransfer] = useState(false);
    const [transferRoom, setTransferRoom] = useState('');
    const [transferSaving, setTransferSaving] = useState(false);

    // move-out state
    const [moveOutSaving, setMoveOutSaving] = useState(false);
    const [showMoveOutConfirm, setShowMoveOutConfirm] = useState(false);

    // QR modal state
    const [showQRModal, setShowQRModal] = useState(false);
    const [qrCopied, setQrCopied] = useState(false);
    const qrRef = useRef(null);

    // First bill state
    const [showFirstBill, setShowFirstBill] = useState(false);
    const [firstBillSaving, setFirstBillSaving] = useState(false);
    const firstBillRef = useRef(null);

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

            const tSnap = await getDocs(query(
                collection(db, 'users'),
                where(`apartmentRoles.${aptId}.role`, '==', 'tenant')
            ));
            setTenants(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
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
            setSelectedTenant({ ...tenant, roomNumber: rn, roomObj });

            // Set floor filter to show the tenant's room
            if (filterFloor !== 'all' && roomObj && roomObj.floor !== parseInt(filterFloor)) {
                setFilterFloor('all');
            }
        }

        // Clear param so re-selecting doesn't loop
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('tenantId');
        setSearchParams(newParams, { replace: true });
    }, [loading, tenants, rooms, searchParams]);

    // ── payments ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!selectedTenant?.id || !activeAptId) {
            setPayments([]);
            setPaymentsLoading(false);
            return;
        }

        setPaymentsLoading(true);
        const q = query(
            collection(db, 'payments'),
            where('tenantId', '==', selectedTenant.id),
            where('apartmentId', '==', activeAptId)
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            console.log("[TenantManagement] Payment update received:", snap.docs.length);
            const sorted = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.month || '').localeCompare(a.month || ''));
            setPayments(sorted);
            setPaymentsLoading(false);
        }, (err) => {
            console.error("Error listening to payments:", err);
            setPaymentsLoading(false);
        });

        return () => unsubscribe();
    }, [selectedTenant?.id, activeAptId]);

    // ── handlers ──────────────────────────────────────────────────────────────
    const handleAptSwitch = (id) => {
        localStorage.setItem('activeApartmentId', id);
        setActiveAptId(id); setSelectedTenant(null);
        showToast('สลับตึกเรียบร้อย');
    };

    const handleResetPassword = async (email) => {
        if (!email) return;
        try {
            await firebaseSendReset(getAuth(), email);
            showToast('ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว', 'success');
        } catch { showToast('ส่งลิงก์ล้มเหลว', 'error'); }
    };

    // ── room transfer ─────────────────────────────────────────────────────────
    const handleTransferRoom = async () => {
        if (!transferRoom || !selectedTenant || !activeAptId) return;
        setTransferSaving(true);
        try {
            // Update tenant's apartmentRoles
            const tenantRef = doc(db, 'users', selectedTenant.id);
            await updateDoc(tenantRef, {
                [`apartmentRoles.${activeAptId}.roomNumber`]: transferRoom
            });

            // Find and update old room document
            const oldRoomNum = selectedTenant.roomNumber || 'unknown';
            const oldRoomQuery = query(
                collection(db, 'rooms'),
                where('apartmentId', '==', activeAptId),
                where('roomNumber', '==', oldRoomNum)
            );
            const oldRoomSnap = await getDocs(oldRoomQuery);
            if (oldRoomSnap.docs.length > 0) {
                await updateDoc(oldRoomSnap.docs[0].ref, {
                    status: 'ว่าง',
                    tenantId: null,
                    tenantName: null
                });
            }

            // Find and update new room document (or create if doesn't exist)
            const newRoomQuery = query(
                collection(db, 'rooms'),
                where('apartmentId', '==', activeAptId),
                where('roomNumber', '==', transferRoom)
            );
            const newRoomSnap = await getDocs(newRoomQuery);
            const tenantName = selectedTenant.name || selectedTenant.displayName || '';
            if (newRoomSnap.docs.length > 0) {
                await updateDoc(newRoomSnap.docs[0].ref, {
                    status: 'ไม่ว่าง',
                    tenantId: selectedTenant.id,
                    tenantName: tenantName
                });
            } else {
                // Room doesn't exist in Firestore yet, create with apartment defaults
                const apt = apartments.find(a => a.id === activeAptId);
                const newRoomId = `${activeAptId}_${transferRoom}`;
                await setDoc(doc(db, 'rooms', newRoomId), {
                    apartmentId: activeAptId,
                    roomNumber: transferRoom,
                    floor: parseInt(transferRoom.toString()[0]) || 1,
                    status: 'ไม่ว่าง',
                    tenantId: selectedTenant.id,
                    tenantName: tenantName,
                    price: apt?.utilityRates?.baseRent || 0,
                    amenities: apt?.amenities?.map(a => ({ ...a })) || [],
                    fixedExpenses: apt?.fixedExpenses?.map(fe => ({ ...fe, active: true })) || []
                });
            }

            // Refresh tenants list
            const tSnap = await getDocs(query(
                collection(db, 'users'),
                where(`apartmentRoles.${activeAptId}.role`, '==', 'tenant')
            ));
            const updatedTenants = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setTenants(updatedTenants);

            // Update selectedTenant with new room
            const updated = updatedTenants.find(t => t.id === selectedTenant.id);
            if (updated) {
                const newRoomObj = rooms.find(r => r.roomNumber === transferRoom);
                setSelectedTenant({ ...updated, roomNumber: transferRoom, roomObj: newRoomObj });
            }

            showToast(`ย้ายห้องเป็น ${transferRoom} เรียบร้อยแล้ว`, 'success');
            setShowTransfer(false);
            setTransferRoom('');
        } catch (e) {
            console.error(e);
            showToast('ย้ายห้องล้มเหลว', 'error');
        }
        setTransferSaving(false);
    };

    // ── move out ──────────────────────────────────────────────────────────────
    const handleMoveOut = async () => {
        if (!selectedTenant || !activeAptId) return;
        setMoveOutSaving(true);
        try {
            const roomNum = selectedTenant.roomNumber;
            const tenantName = selectedTenant.name || selectedTenant.displayName || '';
            const aptData = apartments.find(a => a.id === activeAptId);
            const roleData = selectedTenant.apartmentRoles?.[activeAptId];

            // 0. Save tenant history before removing
            await addDoc(collection(db, 'tenantHistory'), {
                tenantId: selectedTenant.id,
                tenantName,
                tenantEmail: selectedTenant.email || '',
                tenantPhone: selectedTenant.phone || '',
                roomNumber: roomNum,
                floor: selectedTenant.roomObj?.floor || parseInt(roomNum?.toString()[0]) || 1,
                apartmentId: activeAptId,
                apartmentName: aptData?.name || '',
                joinedAt: roleData?.joinedAt || null,
                movedOutAt: Timestamp.now(),
                rentPrice: selectedTenant.roomObj?.price || 0,
            });

            // 1. Remove apartmentRoles from user
            const tenantRef = doc(db, 'users', selectedTenant.id);
            await updateDoc(tenantRef, {
                [`apartmentRoles.${activeAptId}`]: deleteField()
            });

            // 2. Find and set room status to vacant
            const roomQuery = query(
                collection(db, 'rooms'),
                where('apartmentId', '==', activeAptId),
                where('roomNumber', '==', roomNum)
            );
            const roomSnap = await getDocs(roomQuery);
            if (roomSnap.docs.length > 0) {
                await updateDoc(roomSnap.docs[0].ref, {
                    status: 'ว่าง',
                    tenantId: null,
                    tenantName: null
                });
            }

            // 3. Refresh local lists
            setTenants(prev => prev.filter(t => t.id !== selectedTenant.id));
            setSelectedTenant(null);
            setShowMoveOutConfirm(false);

            showToast(`แจ้งย้ายออกห้อง ${roomNum} เรียบร้อยแล้ว`, 'success');
        } catch (e) {
            console.error(e);
            showToast('เกิดข้อผิดพลาดในการแจ้งย้ายออก', 'error');
        }
        setMoveOutSaving(false);
    };
    // ── first bill helpers ────────────────────────────────────────────────────
    const currentApt = apartments.find(a => a.id === activeAptId);
    const bankDetails = currentApt?.bankDetails || {};
    const utilityRates = currentApt?.utilityRates || {};

    const getFirstBillItems = () => {
        if (!selectedTenant?.roomObj) return [];
        const room = selectedTenant.roomObj;
        const items = [];
        items.push({ label: 'ค่าเช่าห้อง (เดือนแรก)', amount: room.price || utilityRates.baseRent || 0 });
        if (room.deposit) items.push({ label: 'ค่ามัดจำ', amount: room.deposit });
        if (room.fixedExpenses) {
            room.fixedExpenses.filter(e => e.active).forEach(e => {
                items.push({ label: e.name, amount: e.amount || 0 });
            });
        }
        return items;
    };

    const getFirstBillTotal = () => getFirstBillItems().reduce((sum, i) => sum + i.amount, 0);

    const handleConfirmFirstPayment = async () => {
        if (!selectedTenant || !activeAptId) return;
        setFirstBillSaving(true);
        try {
            const now = new Date();
            const monthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
            await addDoc(collection(db, 'payments'), {
                tenantId: selectedTenant.id,
                tenantName: selectedTenant.name || selectedTenant.displayName || '',
                apartmentId: activeAptId,
                roomNumber: selectedTenant.roomNumber,
                month: monthStr,
                type: 'first_bill',
                amount: getFirstBillTotal(),
                items: getFirstBillItems(),
                status: 'paid',
                paidAt: Timestamp.now(),
                createdAt: Timestamp.now()
            });

            // Mark room as first bill paid
            if (selectedTenant.roomObj?.id) {
                await updateDoc(doc(db, 'rooms', selectedTenant.roomObj.id), {
                    firstBillPaid: true,
                    firstBillPaidAt: Timestamp.now()
                });
            }

            showToast('บันทึกการชำระค่าแรกเข้าเรียบร้อย', 'success');
            setShowFirstBill(false);

            // Refresh payments
            const q = query(
                collection(db, 'payments'),
                where('tenantId', '==', selectedTenant.id),
                where('apartmentId', '==', activeAptId)
            );
            const snap = await getDocs(q);
            const sorted = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.month || '').localeCompare(a.month || ''));
            setPayments(sorted);
        } catch (e) {
            console.error(e);
            showToast('บันทึกล้มเหลว', 'error');
        }
        setFirstBillSaving(false);
    };

    const handlePrintFirstBill = () => {
        const el = firstBillRef.current;
        if (!el) return;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>ใบแจ้งค่าแรกเข้า</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; padding: 24px; color: #222; }
                    .bill-container { max-width: 420px; margin: 0 auto; }
                    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 16px; }
                    .header h1 { font-size: 20px; font-weight: 900; margin-bottom: 4px; }
                    .header p { font-size: 12px; color: #555; }
                    .info-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px dashed #ddd; }
                    .info-row .label { color: #666; }
                    .info-row .value { font-weight: 700; }
                    .section-title { font-size: 12px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; margin: 16px 0 8px; }
                    .item-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
                    .total-row { display: flex; justify-content: space-between; padding: 12px 0 8px; font-size: 18px; font-weight: 900; border-top: 2px solid #333; margin-top: 8px; }
                    .qr-section { text-align: center; margin-top: 20px; padding-top: 16px; border-top: 1px dashed #ddd; }
                    .qr-section p { font-size: 11px; color: #666; margin-bottom: 8px; }
                    .qr-section svg { width: 160px; height: 160px; }
                    .bank-info { text-align: center; font-size: 11px; color: #555; margin-top: 8px; }
                    .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #aaa; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>${el.innerHTML}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.onload = () => { printWindow.print(); };
    };


    // ── display data ──────────────────────────────────────────────────────────
    const tenantMap = {};
    tenants.forEach(t => {
        const rn = t.apartmentRoles?.[activeAptId]?.roomNumber;
        if (rn) tenantMap[rn] = t;
    });

    const floorsList = floors.map(f => f.id).sort((a, b) => a - b);
    const sq = search.trim().toLowerCase();

    const displayRooms = rooms.filter(r => {
        if (filterFloor !== 'all' && r.floor !== parseInt(filterFloor)) return false;
        if (!sq) return true;
        const t = tenantMap[r.roomNumber];
        if (!t) return r.roomNumber?.toLowerCase().includes(sq);
        const name = (t.name || t.displayName || '').toLowerCase();
        return name.includes(sq) || (t.phone || '').includes(sq) || (t.email || '').toLowerCase().includes(sq) || r.roomNumber?.toLowerCase().includes(sq);
    });

    // Vacant rooms: not occupied by any tenant
    const vacantRooms = rooms.filter(r => !tenantMap[r.roomNumber] && r.roomNumber !== selectedTenant?.roomNumber);

    const occupiedCount = tenants.length;
    const totalRooms = rooms.length;

    if (loading) return (
        <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
            <div className="w-12 h-12 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <MainLayout profile={profile} apartments={apartments} activeAptId={activeAptId} onAptSwitch={handleAptSwitch} title="ผู้เช่า">
            <Toast {...toast} onClose={hideToast} />

            <div className="px-5 lg:px-4 py-2 max-w-[1600px] mx-auto w-full relative z-10">

                {/* ── Floor buttons + stats ──────────────────────────── */}
                <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
                    <div className="flex-1 min-w-0 flex flex-wrap gap-2">
                        {['all', ...floorsList].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilterFloor(f.toString())}
                                className={`px-4 py-2 rounded-xl text-[10px] font-semibold uppercase tracking-wider transition-all border ${filterFloor === f.toString()
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
                            <p className="text-[9px] font-medium text-brand-orange-500 uppercase tracking-widest opacity-80">ผู้เช่า</p>
                            <p className="text-base font-bold text-white leading-none">{occupiedCount}<span className="text-brand-gray-500 text-xs font-medium">/{totalRooms}</span></p>
                        </div>
                        {activeAptId && activeAptId !== 'all' && (
                            <button
                                onClick={() => setShowQRModal(true)}
                                className="h-10 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-[10px] font-semibold transition-all inline-flex items-center gap-1.5"
                            >
                                <QrCode className="w-3.5 h-3.5" /> QR
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Search ────────────────────────────────────────── */}
                <div className="relative mb-4">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-gray-500" />
                    <input
                        type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="ค้นหาชื่อ, เลขห้อง, เบอร์โทร..."
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
                    <div className={`transition-all duration-300 w-full ${selectedTenant ? 'md:w-1/2 lg:w-[58%]' : ''}`}>
                        {displayRooms.length === 0 ? (
                            <div className="text-center py-20 bg-brand-card/50 rounded-3xl border border-dashed border-white/10">
                                <LayoutGrid className="w-10 h-10 text-brand-gray-700 mx-auto mb-3" />
                                <p className="text-white font-bold">ไม่พบผู้เช่า</p>
                                <p className="text-brand-gray-500 text-sm mt-1">ลองเปลี่ยนชั้นหรือคำค้นหา</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                                {displayRooms.map(room => {
                                    const tenant = tenantMap[room.roomNumber];
                                    const isSelected = selectedTenant?.id === tenant?.id;
                                    const name = tenant?.name || tenant?.displayName || '';
                                    const initial = name.slice(0, 1).toUpperCase();
                                    const joinedAt = tenant?.apartmentRoles?.[activeAptId]?.joinedAt;

                                    if (!tenant) {
                                        return (
                                            <div key={room.roomNumber} className="relative p-3 rounded-xl border border-white/5 bg-brand-card/30 opacity-35 flex flex-col gap-1">
                                                <div className="absolute top-0 left-0 w-full h-[2px] bg-brand-gray-800 rounded-t-xl" />
                                                <span className="text-[9px] font-bold text-brand-gray-700 uppercase">ชั้น {room.floor}</span>
                                                <p className="text-lg font-black text-brand-gray-700 leading-none">{room.roomNumber}</p>
                                                <span className="text-[9px] font-bold text-green-800">ว่าง</span>
                                            </div>
                                        );
                                    }

                                    return (
                                        <button
                                            key={room.roomNumber}
                                            onClick={() => {
                                                setSelectedTenant(isSelected ? null : { ...tenant, roomNumber: room.roomNumber, roomObj: room });
                                                setShowTransfer(false);
                                                setTransferRoom('');
                                            }}
                                            className={`relative p-3 rounded-xl border transition-all duration-200 flex flex-col gap-2 text-left active:scale-[0.97] ${isSelected
                                                ? 'bg-brand-orange-500/10 border-brand-orange-500/40 shadow-lg shadow-brand-orange-500/10'
                                                : 'bg-brand-card border-white/8 hover:border-brand-orange-500/25'
                                                }`}
                                        >
                                            <div className={`absolute top-0 left-0 w-full h-[2px] rounded-t-xl ${isSelected ? 'bg-brand-orange-500' : 'bg-blue-500/60'}`} />

                                            {/* room + floor */}
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[9px] font-bold uppercase ${isSelected ? 'text-brand-orange-400/70' : 'text-brand-gray-600'}`}>ชั้น {room.floor}</span>
                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-brand-orange-500 text-brand-bg' : 'bg-brand-orange-500/10 text-brand-orange-400'}`}>
                                                    {room.roomNumber}
                                                </span>
                                            </div>

                                            {/* avatar + name */}
                                            <div className="flex items-center gap-2">
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 ${getAvatarBg(name)}`}>
                                                    {tenant.photoURL
                                                        ? <img src={tenant.photoURL} className="w-full h-full object-cover rounded-lg" alt="" />
                                                        : (initial || <User className="w-3.5 h-3.5" />)
                                                    }
                                                </div>
                                                <p className={`font-medium text-xs leading-tight truncate ${isSelected ? 'text-brand-orange-300' : 'text-white'}`}>
                                                    {name || 'ไม่มีชื่อ'}
                                                </p>
                                            </div>

                                            {/* footer */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                                                    <span className="text-[9px] font-medium text-emerald-400">มีผู้เช่า</span>
                                                </div>
                                                {joinedAt?.toDate && (
                                                    <span className="text-[9px] text-brand-gray-600">
                                                        {joinedAt.toDate().toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Detail Panel ──────────────────────────────── */}
                    {selectedTenant && (
                        <>
                            {/* Mobile: full-screen overlay */}
                            <div className="fixed inset-0 z-[100] md:hidden" onClick={() => setSelectedTenant(null)}>
                                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                            </div>
                            <div className="fixed inset-x-0 bottom-0 z-[101] md:relative md:inset-auto md:z-auto md:w-1/2 lg:w-[42%] md:sticky md:top-20 animate-in slide-in-from-bottom-4 md:slide-in-from-right-4 fade-in duration-300">
                                <div className="bg-brand-card border border-white/10 rounded-t-3xl md:rounded-2xl overflow-hidden shadow-2xl max-h-[85vh] md:max-h-[calc(100vh-120px)] flex flex-col">

                                    {/* Mobile drag handle */}
                                    <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
                                        <div className="w-10 h-1 bg-white/20 rounded-full" />
                                    </div>

                                    {/* header */}
                                    <div className="relative px-5 pt-4 md:pt-4 pb-3 border-b border-white/8 shrink-0">
                                        <button onClick={() => setSelectedTenant(null)} className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                                            <X className="w-3.5 h-3.5 text-brand-gray-400" />
                                        </button>
                                        <div className="flex items-center gap-3 pr-8">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0 ${getAvatarBg(selectedTenant.name || selectedTenant.displayName || '')}`}>
                                                {selectedTenant.photoURL
                                                    ? <img src={selectedTenant.photoURL} className="w-full h-full object-cover rounded-2xl" alt="" />
                                                    : ((selectedTenant.name || selectedTenant.displayName || '').slice(0, 1).toUpperCase() || <User className="w-6 h-6" />)
                                                }
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-white font-bold text-sm leading-tight truncate">
                                                    {selectedTenant.name || selectedTenant.displayName || 'ไม่มีชื่อ'}
                                                </h4>
                                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap gap-y-1">
                                                    <div className="flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                                        <span className="text-[10px] font-semibold text-emerald-400 uppercase">ผู้เช่า</span>
                                                    </div>
                                                    <button
                                                        onClick={() => navigate(`/rooms?room=${selectedTenant.roomNumber}`)}
                                                        className="bg-brand-orange-500/15 hover:bg-brand-orange-500/25 border border-brand-orange-500/25 hover:border-brand-orange-500/40 text-brand-orange-400 px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all inline-flex items-center gap-1 group"
                                                    >
                                                        <Home className="w-2.5 h-2.5" />
                                                        ห้อง {selectedTenant.roomNumber}
                                                        <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* scrollable */}
                                    <div className="overflow-y-auto custom-scrollbar flex-1">

                                        {/* info rows */}
                                        <div className="px-5 py-3 space-y-0 border-b border-white/8">
                                            {[
                                                { label: 'ชั้น', value: selectedTenant.roomObj?.floor || selectedTenant.roomNumber?.toString()[0] || '-' },
                                                selectedTenant.phone && { label: 'โทรศัพท์', value: <a href={`tel:${selectedTenant.phone}`} className="hover:text-brand-orange-400 transition-colors">{selectedTenant.phone}</a> },
                                                selectedTenant.email && { label: 'อีเมล', value: <span className="text-xs truncate max-w-[55%]">{selectedTenant.email}</span> },
                                                selectedTenant.apartmentRoles?.[activeAptId]?.joinedAt && {
                                                    label: 'เข้าพักตั้งแต่',
                                                    value: (() => { const d = selectedTenant.apartmentRoles[activeAptId].joinedAt; return d?.toDate ? d.toDate().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'; })()
                                                },
                                                selectedTenant.roomObj?.price && { label: 'ค่าเช่า/เดือน', value: `${selectedTenant.roomObj.price.toLocaleString()} บ.` },
                                                selectedTenant.roomObj?.deposit ? { label: 'ค่ามัดจำ', value: `${selectedTenant.roomObj.deposit.toLocaleString()} บ.` } : null,
                                            ].filter(Boolean).map((row, i) => (
                                                <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                                    <span className="text-[11px] font-medium text-brand-gray-500 uppercase tracking-wider shrink-0">{row.label}</span>
                                                    <span className="text-white font-semibold text-sm text-right">{row.value}</span>
                                                </div>
                                            ))}

                                            {/* Fixed Expenses (parking, WiFi, etc.) */}
                                            {selectedTenant.roomObj?.fixedExpenses?.filter(e => e.active).length > 0 && (
                                                <div className="pt-2 pb-1">
                                                    <p className="text-[10px] font-medium text-brand-gray-600 uppercase tracking-wider mb-1.5">ค่าบริการรายเดือนเพิ่มเติม</p>
                                                    <div className="space-y-1">
                                                        {selectedTenant.roomObj.fixedExpenses.filter(e => e.active).map((e, i) => (
                                                            <div key={i} className="flex items-center justify-between bg-white/3 border border-white/8 rounded-lg px-3 py-1.5">
                                                                <span className="text-[11px] font-medium text-brand-gray-300">{e.name}</span>
                                                                <span className="text-[11px] font-bold text-brand-orange-400">{e.amount?.toLocaleString()} บ.</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {selectedTenant.roomObj?.amenities?.filter(a => a.status).length > 0 && (
                                                <div className="pt-2 pb-1">
                                                    <p className="text-[10px] font-medium text-brand-gray-600 uppercase tracking-wider mb-1.5">สิ่งอำนวยความสะดวก</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {selectedTenant.roomObj.amenities.filter(a => a.status).map((a, i) => (
                                                            <span key={i} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-medium text-brand-gray-300">{a.name}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* ── Transfer room section ──────────────── */}
                                        <div className="px-5 py-3 border-b border-white/8">
                                            <button
                                                onClick={() => { setShowTransfer(!showTransfer); setTransferRoom(''); }}
                                                className="w-full flex items-center justify-between group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <ArrowRightLeft className="w-4 h-4 text-brand-orange-500" />
                                                    <span className="text-sm font-bold text-white">เปลี่ยนห้องพัก</span>
                                                </div>
                                                <ChevronDown className={`w-4 h-4 text-brand-gray-500 transition-transform duration-200 ${showTransfer ? 'rotate-180' : ''}`} />
                                            </button>

                                            {showTransfer && (
                                                <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <p className="text-[11px] text-brand-gray-500 mb-2 font-medium">เลือกห้องว่างที่ต้องการย้ายไป</p>
                                                    {vacantRooms.length === 0 ? (
                                                        <p className="text-center py-4 text-brand-gray-600 text-xs font-bold">ไม่มีห้องว่าง</p>
                                                    ) : (
                                                        <>
                                                            <div className="grid grid-cols-4 gap-1.5 mb-3 max-h-36 overflow-y-auto custom-scrollbar">
                                                                {vacantRooms.map(r => (
                                                                    <button
                                                                        key={r.roomNumber}
                                                                        onClick={() => setTransferRoom(r.roomNumber)}
                                                                        className={`py-2 rounded-lg text-xs font-semibold transition-all border ${transferRoom === r.roomNumber
                                                                            ? 'bg-brand-orange-500 border-brand-orange-500 text-brand-bg shadow-lg shadow-brand-orange-500/20'
                                                                            : 'bg-white/5 border-white/10 text-brand-gray-300 hover:border-white/20 hover:text-white'
                                                                            }`}
                                                                    >
                                                                        {r.roomNumber}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                            <button
                                                                onClick={handleTransferRoom}
                                                                disabled={!transferRoom || transferSaving}
                                                                className="w-full py-2.5 bg-brand-orange-500 hover:bg-brand-orange-400 disabled:opacity-40 text-brand-bg rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                                                            >
                                                                {transferSaving
                                                                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังย้าย...</>
                                                                    : <><ArrowRightLeft className="w-3.5 h-3.5" /> ยืนยันย้ายไปห้อง {transferRoom || '...'}</>
                                                                }
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* ── Payment history ────────────────────── */}
                                        <div className="px-5 py-3">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Banknote className="w-4 h-4 text-brand-orange-500" />
                                                <h5 className="text-sm font-bold text-white uppercase tracking-wide">ประวัติการชำระเงิน</h5>
                                            </div>

                                            {paymentsLoading ? (
                                                <div className="flex items-center justify-center py-6">
                                                    <div className="w-5 h-5 border-2 border-brand-orange-500 border-t-transparent rounded-full animate-spin" />
                                                </div>
                                            ) : payments.length === 0 ? (
                                                <div className="text-center py-6 border border-dashed border-white/10 rounded-xl">
                                                    <CreditCard className="w-7 h-7 text-brand-gray-700 mx-auto mb-2" />
                                                    <p className="text-brand-gray-600 font-bold text-xs">ยังไม่มีประวัติการชำระ</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    {payments.map(p => {
                                                        const label = p.month ? new Date(p.month + '-01').toLocaleDateString('th-TH', { year: 'numeric', month: 'long' }) : p.month;
                                                        return (
                                                            <div key={p.id} className="flex items-center justify-between bg-white/3 border border-white/8 rounded-xl px-3 py-2.5">
                                                                <div>
                                                                    <p className="text-white font-bold text-xs">{label}</p>
                                                                    <p className="text-brand-gray-400 text-[11px] font-medium">{p.amount?.toLocaleString()} บาท</p>
                                                                </div>
                                                                <StatusChip status={p.status} />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* actions footer */}
                                    <div className="px-5 pb-4 pt-4 border-t border-white/8 shrink-0 flex flex-col gap-2">
                                        {/* First Bill Button */}
                                        <button
                                            onClick={() => setShowFirstBill(true)}
                                            className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2 ${selectedTenant.roomObj?.firstBillPaid
                                                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                                : 'bg-brand-orange-500 hover:bg-brand-orange-400 text-brand-bg shadow-lg shadow-brand-orange-500/20'
                                                }`}
                                        >
                                            {selectedTenant.roomObj?.firstBillPaid
                                                ? <><CheckCircle2 className="w-3.5 h-3.5" /> ชำระค่าแรกเข้าแล้ว — ดูบิล</>
                                                : <><Printer className="w-3.5 h-3.5" /> พิมพ์บิลค่าแรกเข้า</>
                                            }
                                        </button>
                                        <button
                                            onClick={() => setShowMoveOutConfirm(true)}
                                            className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                                        >
                                            <LogOut className="w-3.5 h-3.5" /> ย้ายผู้เช่าออก
                                        </button>
                                        <button
                                            onClick={() => handleResetPassword(selectedTenant.email)}
                                            disabled={!selectedTenant.email}
                                            className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                                        >
                                            <KeyRound className="w-3.5 h-3.5" /> ส่งลิงก์รีเซ็ตรหัสผ่าน
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Move Out Confirm Modal ────────────────────────────── */}
            {showMoveOutConfirm && selectedTenant && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !moveOutSaving && setShowMoveOutConfirm(false)}></div>
                    <div className="relative bg-brand-card w-full max-w-sm rounded-3xl border border-white/10 shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 border border-red-500/20 relative">
                            <LogOut className="w-8 h-8 text-red-500 relative z-10" />
                            <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full"></div>
                        </div>
                        <h3 className="text-xl font-black text-white mb-2 tracking-tight">ยืนยันการย้ายออก</h3>
                        <p className="text-brand-gray-400 text-sm mb-1 leading-relaxed">
                            ต้องการให้ <span className="text-white font-bold">{selectedTenant.name || selectedTenant.displayName}</span>
                        </p>
                        <p className="text-brand-gray-400 text-sm mb-8 leading-relaxed">
                            ย้ายออกจากห้อง <span className="text-white font-bold">{selectedTenant.roomNumber}</span> ใช่หรือไม่?
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowMoveOutConfirm(false)}
                                disabled={moveOutSaving}
                                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold text-sm transition-all border border-white/10 active:scale-95"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleMoveOut}
                                disabled={moveOutSaving}
                                className="flex-1 py-3 bg-red-500 hover:bg-red-400 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-red-500/20 active:scale-95 flex items-center justify-center"
                            >
                                {moveOutSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> กำลังดำเนินการ...</> : 'ยืนยันย้ายออก'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── QR Code Modal ──────────────────────────────────────── */}
            {showQRModal && activeAptId && activeAptId !== 'all' && (() => {
                const joinUrl = `${window.location.origin}/join-tenant/${activeAptId}`;
                const aptName = apartments.find(a => a.id === activeAptId)?.name || 'อพาร์ตเมนต์';

                const handleDownload = () => {
                    const svg = qrRef.current?.querySelector('svg');
                    if (!svg) return;
                    const svgData = new XMLSerializer().serializeToString(svg);
                    const canvas = document.createElement('canvas');
                    const scale = 4;
                    canvas.width = 300 * scale;
                    canvas.height = 300 * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    const img = new Image();
                    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    img.onload = () => {
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        URL.revokeObjectURL(url);
                        const link = document.createElement('a');
                        link.download = `QR-${aptName}.png`;
                        link.href = canvas.toDataURL('image/png');
                        link.click();
                    };
                    img.src = url;
                };

                const handlePrint = () => {
                    const svg = qrRef.current?.querySelector('svg');
                    if (!svg) return;
                    const svgData = new XMLSerializer().serializeToString(svg);
                    const printWindow = window.open('', '_blank');
                    printWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>QR Code - ${aptName}</title>
                            <style>
                                body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; background: #fff; }
                                h2 { font-size: 22px; font-weight: 900; margin-bottom: 8px; color: #111; }
                                p { font-size: 12px; color: #555; margin-bottom: 20px; word-break: break-all; text-align: center; max-width: 340px; }
                                svg { width: 280px; height: 280px; }
                                @media print { button { display: none; } }
                            </style>
                        </head>
                        <body>
                            <h2>สแกนเพื่อเข้าพัก</h2>
                            <p>${aptName}</p>
                            ${svgData}
                            <p style="margin-top:16px">${joinUrl}</p>
                        </body>
                        </html>
                    `);
                    printWindow.document.close();
                    printWindow.onload = () => { printWindow.print(); };
                };

                const handleCopy = () => {
                    navigator.clipboard.writeText(joinUrl);
                    setQrCopied(true);
                    setTimeout(() => setQrCopied(false), 2000);
                };

                return (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowQRModal(false)} />
                        <div className="relative bg-brand-card w-full max-w-sm rounded-3xl border border-white/10 shadow-2xl p-6 animate-in zoom-in-95 duration-200 flex flex-col items-center gap-4">
                            <button onClick={() => setShowQRModal(false)} className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                                <X className="w-3.5 h-3.5 text-brand-gray-400" />
                            </button>

                            <div className="text-center">
                                <div className="flex items-center justify-center gap-2 mb-1">
                                    <QrCode className="w-4 h-4 text-brand-orange-500" />
                                    <h3 className="text-base font-black text-white">QR Code เข้าพัก</h3>
                                </div>
                                <p className="text-brand-gray-500 text-xs">{aptName}</p>
                            </div>

                            {/* QR Code */}
                            <div ref={qrRef} className="bg-white p-4 rounded-2xl shadow-lg">
                                <QRCodeSVG
                                    value={joinUrl}
                                    size={200}
                                    level="H"
                                    includeMargin={false}
                                />
                            </div>

                            {/* URL */}
                            <div className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex items-center gap-2">
                                <p className="text-[11px] text-brand-gray-400 truncate flex-1">{joinUrl}</p>
                                <button onClick={handleCopy} className="shrink-0 text-brand-gray-400 hover:text-white transition-colors">
                                    {qrCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                            </div>

                            {/* Actions */}
                            <div className="w-full grid grid-cols-2 gap-2">
                                <button
                                    onClick={handleDownload}
                                    className="py-2.5 bg-brand-orange-500 hover:bg-brand-orange-400 text-brand-bg rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-brand-orange-500/20"
                                >
                                    <Download className="w-3.5 h-3.5" /> ดาวน์โหลด
                                </button>
                                <button
                                    onClick={handlePrint}
                                    className="py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Printer className="w-3.5 h-3.5" /> ปริ้น
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── First Bill Modal ────────────────────────────────────── */}
            {showFirstBill && selectedTenant && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowFirstBill(false)} />
                    <div className="relative bg-brand-card w-full max-w-md rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <button onClick={() => setShowFirstBill(false)} className="absolute top-4 right-4 z-10 w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                            <X className="w-3.5 h-3.5 text-brand-gray-400" />
                        </button>

                        <div className="max-h-[85vh] overflow-y-auto custom-scrollbar">
                            {/* Bill Content to Print */}
                            <div ref={firstBillRef} className="bg-white text-black p-8">
                                <div className="text-center mb-6 border-b-2 border-slate-800 pb-4">
                                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">ใบแจ้งค่าแรกเข้า</h2>
                                    <p className="text-sm text-slate-500 font-medium">ห้อง {selectedTenant.roomNumber} | ชั้น {selectedTenant.roomObj?.floor}</p>
                                </div>

                                <div className="space-y-4 mb-6">
                                    <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                                        <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">ผู้เช่า</span>
                                        <span className="font-black text-slate-900">{selectedTenant.name || selectedTenant.displayName}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                                        <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">วันที่</span>
                                        <span className="font-bold text-slate-900">{new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">รายละเอียดค่าใช้จ่าย</h4>
                                    <div className="space-y-2">
                                        {getFirstBillItems().map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center py-1">
                                                <span className="text-slate-700 text-sm font-medium">{item.label}</span>
                                                <span className="text-slate-900 text-sm font-black">{item.amount.toLocaleString()} บ.</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between items-center mt-4 pt-4 border-t-2 border-slate-800">
                                        <span className="text-slate-900 text-lg font-black italic">รวมทั้งสิ้น</span>
                                        <span className="text-slate-900 text-2xl font-black">{getFirstBillTotal().toLocaleString()} บ.</span>
                                    </div>
                                </div>

                                {bankDetails.promptpay && (
                                    <div className="text-center py-6 border-t border-dashed border-slate-200 mt-6">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">สแกนเพื่อชำระเงิน (PromptPay)</p>
                                        <div className="inline-block p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-sm mb-4">
                                            <QRCodeSVG value={bankDetails.promptpay} size={160} />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs font-black text-slate-900 leading-none">{bankDetails.accountName || 'ชื่อบัญชี'}</p>
                                            <p className="text-[11px] font-bold text-slate-500 leading-none">{bankDetails.promptpay}</p>
                                        </div>
                                        {bankDetails.name && (
                                            <p className="mt-3 text-[10px] text-slate-400 font-medium">
                                                {bankDetails.name} : {bankDetails.accountNo}
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div className="text-center mt-8 pt-4 border-t border-slate-100">
                                    <p className="text-[9px] text-slate-300 font-medium italic">ใบแจ้งหนี้นี้ออกโดยระบบ GrowApart</p>
                                </div>
                            </div>

                            {/* Modal Actions */}
                            <div className="p-6 bg-brand-bg/50 border-t border-white/10 grid grid-cols-2 gap-3">
                                <button
                                    onClick={handlePrintFirstBill}
                                    className="py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Printer className="w-4 h-4" /> ปริ้นบิล
                                </button>

                                {!selectedTenant.roomObj?.firstBillPaid ? (
                                    <button
                                        onClick={handleConfirmFirstPayment}
                                        disabled={firstBillSaving}
                                        className="py-3 bg-brand-orange-500 hover:bg-brand-orange-400 text-brand-bg rounded-2xl text-xs font-extrabold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-brand-orange-500/20"
                                    >
                                        {firstBillSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                                        ชำระเงินเรียบร้อยแล้ว
                                    </button>
                                ) : (
                                    <div className="py-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs font-bold flex items-center justify-center gap-2">
                                        <CheckCircle2 className="w-4 h-4" /> บันทึกการชำระแล้ว
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
}
