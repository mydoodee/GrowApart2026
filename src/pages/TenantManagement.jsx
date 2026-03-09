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
    'จ่ายแล้ว':    { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'จ่ายแล้ว' },
    'ค้างชำระ': { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-400',     dot: 'bg-red-400',     label: 'ค้างชำระ' },
    'รอชำระ': { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-400',   dot: 'bg-amber-400',   label: 'รอชำระ' },
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
    // eslint-disable-next-line no-unused-vars
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
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
    const [historyView, setHistoryView] = useState('table'); // eslint-disable-next-line no-unused-vars
    const [payments, setPayments] = useState([]);
    const [allAptPayments, setAllAptPayments] = useState([]);
    const [paymentsLoading, setPaymentsLoading] = useState(false);
    const [allPaymentsLoading, setAllPaymentsLoading] = useState(false); // eslint-disable-next-line no-unused-vars
    
    // Filtering states
    const [filterYear, setFilterYear] = useState('all');
    const [filterMonth, setFilterMonth] = useState('all');

    // Evidence preview state
    const [previewSlipUrl, setPreviewSlipUrl] = useState(null);

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
    // eslint-disable-next-line no-unused-vars
    const [showFirstBill, setShowFirstBill] = useState(false);
    // eslint-disable-next-line no-unused-vars
    const [firstBillSaving, setFirstBillSaving] = useState(false);
    // eslint-disable-next-line no-unused-vars
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
             
            setSelectedTenant(prev => {
                if (prev?.id === tenant.id) return prev;
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

    // ── payments for selected tenant ─────────────────────────────────────────
    useEffect(() => {
        if (!selectedTenant?.id || !activeAptId) {
             
            // setPayments([]);
            // setPaymentsLoading(false);
            return;
        }

        setPaymentsLoading(true);
        const q = query(
            collection(db, 'payments'),
            where('tenantId', '==', selectedTenant.id),
            where('apartmentId', '==', activeAptId)
        );

        const unsubscribe = onSnapshot(q, (snap) => {
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

    // ── all apartment payments ───────────────────────────────────────────────
    useEffect(() => {
        if (!activeAptId || activeAptId === 'all') {
             
            // setAllAptPayments([]);
            return;
        }

        setAllPaymentsLoading(true);
        const q = query(
            collection(db, 'payments'),
            where('apartmentId', '==', activeAptId)
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            const sorted = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.month || '').localeCompare(a.month || '') || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setAllAptPayments(sorted);
            setAllPaymentsLoading(false);
        }, (err) => {
            console.error("Error listening to all payments:", err);
            setAllPaymentsLoading(false);
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

    const currentApt = apartments.find(a => a.id === activeAptId);
    // eslint-disable-next-line no-unused-vars
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

    // eslint-disable-next-line no-unused-vars
    const handleConfirmFirstPayment = async () => {
        if (!selectedTenant || !activeAptId) return;
        setFirstBillSaving(true);
        try {
            const now = new Date();
            const monthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
            await addDoc(collection(db, 'payments'), {
                tenantId: selectedTenant.id, tenantName: selectedTenant.name || selectedTenant.displayName || '', apartmentId: activeAptId, roomNumber: selectedTenant.roomNumber,
                month: monthStr, type: 'first_bill', amount: getFirstBillTotal(), items: getFirstBillItems(), status: 'paid', paidAt: Timestamp.now(), createdAt: Timestamp.now()
            });

            if (selectedTenant.roomObj?.id) {
                await updateDoc(doc(db, 'rooms', selectedTenant.roomObj.id), { firstBillPaid: true, firstBillPaidAt: Timestamp.now() });
            }
            showToast('บันทึกการชำระเรียบร้อย', 'success');
            setShowFirstBill(false);
            setPaymentsLoading(true);
        } catch (e) { console.error(e); showToast('บันทึกการชำระล้มเหลว', 'error'); }
        setFirstBillSaving(false);
    };

    // ── display calculations ───────────────────────────────────────────────────
    const tenantMap = {};
    tenants.forEach(t => {
        const rn = t.apartmentRoles?.[activeAptId]?.roomNumber;
        if (rn) tenantMap[rn] = t;
    });

    const floorsList = floors.map(f => f.id).sort((a, b) => a - b);
    const sq = search.trim().toLowerCase();

    // Filtered rooms currently occupied by tenants
    const displayRooms = rooms.filter(r => {
        const t = tenantMap[r.roomNumber];
        if (!t) return false;
        if (filterFloor !== 'all' && r.floor !== parseInt(filterFloor)) return false;
        if (!sq) return true;
        const name = (t.name || t.displayName || t.roomNumber || '').toLowerCase();
        return name.includes(sq) || (t.phone || '').includes(sq) || (t.email || '').toLowerCase().includes(sq) || r.roomNumber?.toLowerCase().includes(sq);
    });

    const vacantRooms = rooms.filter(r => !tenantMap[r.roomNumber]);
    const occupiedCount = tenants.length;
    // eslint-disable-next-line no-unused-vars
    const totalRooms = rooms.length;
    const paymentProgress = 75; // Mock for now

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
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                    {[
                        { label: 'ผู้เช่าทั้งหมด', val: occupiedCount, icon: <Users className="w-4 h-4" />, color: 'text-zinc-300', iconBg: 'bg-zinc-700/50' },
                        { label: 'จ่ายแล้ว', val: Math.round(occupiedCount * 0.7), icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-400', iconBg: 'bg-emerald-500/10' },
                        { label: 'ค้างชำระ', val: Math.round(occupiedCount * 0.1), icon: <AlertCircle className="w-4 h-4" />, color: 'text-red-400', iconBg: 'bg-red-500/10' },
                        { label: 'รอชำระ', val: Math.round(occupiedCount * 0.2), icon: <Clock className="w-4 h-4" />, color: 'text-amber-400', iconBg: 'bg-amber-500/10' },
                    ].map((s, i) => (
                        <div key={i} className="bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg ${s.iconBg} ${s.color} flex items-center justify-center shrink-0`}>
                                {s.icon}
                            </div>
                            <div>
                                <p className="text-[10px] text-zinc-500 font-medium leading-none mb-0.5">{s.label}</p>
                                <span className={`text-lg font-bold ${s.color} leading-none`}>{s.val}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Payment progress ─────────────────────────── */}
                <div className="mb-4 bg-zinc-900 border border-white/5 rounded-xl px-4 py-2.5 flex items-center gap-3">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold shrink-0">การชำระเงินเดือนนี้</span>
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700" style={{ width: `${paymentProgress}%` }} />
                    </div>
                    <span className="text-xs font-bold text-emerald-400 shrink-0">{paymentProgress}%</span>
                </div>

                {/* ── Toolbar ──────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row gap-2 mb-4 items-stretch sm:items-center">
                    <div className="flex gap-1 bg-zinc-900 border border-white/5 rounded-xl p-1 overflow-x-auto custom-scrollbar shrink-0">
                        {['all', ...floorsList].map(f => (
                            <button
                                key={f} onClick={() => setFilterFloor(f.toString())}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${filterFloor === f.toString() ? 'bg-brand-orange-500 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                            >
                                {f === 'all' ? 'ทุกชั้น' : `ชั้น ${f}`}
                            </button>
                        ))}
                    </div>

                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                        <input
                            type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="ค้นหาชื่อ, ห้อง, เบอร์โทร..."
                            className="w-full h-9 bg-zinc-900 border border-white/5 rounded-xl pl-9 pr-8 text-xs font-medium text-white placeholder:text-zinc-600 outline-none focus:border-brand-orange-500/40 transition-all"
                        />
                        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"><X className="w-3.5 h-3.5" /></button>}
                    </div>

                    <div className="flex bg-zinc-900 border border-white/5 p-1 rounded-xl shrink-0">
                        <button
                            onClick={() => handleTabChange('datagrid')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${viewTab === 'datagrid' ? 'bg-brand-orange-500 text-white' : 'text-zinc-400 hover:text-white'}`}
                        >
                            <List className="w-3.5 h-3.5" /> รายการ
                        </button>
                        <button
                            onClick={() => handleTabChange('cards')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${viewTab === 'cards' ? 'bg-brand-orange-500 text-white' : 'text-zinc-400 hover:text-white'}`}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" /> การ์ด
                        </button>
                        <button
                            onClick={() => handleTabChange('history')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${viewTab === 'history' ? 'bg-brand-orange-500 text-white' : 'text-zinc-400 hover:text-white'}`}
                        >
                            <Clock className="w-3.5 h-3.5" /> ประวัติบิล
                        </button>
                    </div>

                    {activeAptId && activeAptId !== 'all' && (
                        <button onClick={() => setShowQRModal(true)} className="h-9 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5">
                            <QrCodeIcon className="w-3.5 h-3.5" /> QR เข้าร่วม
                        </button>
                    )}
                </div>

                <div className="flex gap-3 items-start">
                    <div className={`transition-all duration-300 w-full min-w-0 ${selectedTenant ? 'lg:w-[58%]' : ''}`}>
                        {displayRooms.length === 0 && viewTab !== 'history' ? (
                            <div className="text-center py-16 bg-zinc-900 rounded-xl border border-dashed border-white/10">
                                <Users className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                                <p className="text-zinc-400 text-sm font-medium">ไม่พบผู้เช่า</p>
                            </div>
                        ) : viewTab === 'datagrid' ? (
                            <div className="bg-zinc-900 border border-white/5 rounded-xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-white/5">
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">ผู้เช่า</th>
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">ห้อง</th>
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest hidden md:table-cell">การติดต่อ</th>
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest hidden sm:table-cell">สถานะชำระ</th>
                                                <th className="px-4 py-3 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.04]">
                                            {displayRooms.map(room => {
                                                const tenant = tenantMap[room.roomNumber];
                                                const isSelected = selectedTenant?.id === tenant.id;
                                                const name = tenant.name || tenant.displayName || '—';
                                                return (
                                                    <tr
                                                        key={tenant.id} onClick={() => setSelectedTenant(isSelected ? null : { ...tenant, roomNumber: room.roomNumber, roomObj: room })}
                                                        className={`cursor-pointer transition-colors group ${isSelected ? 'bg-brand-orange-500/5' : 'hover:bg-white/[0.02]'}`}
                                                    >
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${getAvatarBg(name)}`}>
                                                                    {tenant.photoURL ? <img src={tenant.photoURL} className="w-full h-full object-cover rounded-lg" /> : name.charAt(0)}
                                                                </div>
                                                                <span className="text-xs font-semibold text-zinc-200 truncate max-w-[140px]">{name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[11px] font-bold font-mono text-brand-orange-400">{room.roomNumber}</span>
                                                                <span className="text-[9px] text-zinc-600 px-1.5 py-0.5 bg-zinc-800 rounded">ชั้น {room.floor}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 hidden md:table-cell">
                                                            <p className="text-[11px] text-zinc-400">{tenant.phone || '—'}</p>
                                                        </td>
                                                        <td className="px-4 py-3 hidden sm:table-cell">
                                                            <StatusPill status={isSelected ? 'paid' : 'pending'} />
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
                        ) : viewTab === 'cards' ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
                                {displayRooms.length === 0 ? (
                                    <div className="col-span-full text-center py-16 bg-zinc-900 rounded-xl border border-dashed border-white/10">
                                        <Users className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                                        <p className="text-zinc-400 text-sm font-medium">ไม่พบผู้เช่า</p>
                                    </div>
                                ) : (
                                    displayRooms.map(room => {
                                        const tenant = tenantMap[room.roomNumber];
                                        const isSelected = selectedTenant?.id === tenant.id;
                                        const name = tenant.name || tenant.displayName || '—';
                                        return (
                                            <button
                                                key={tenant.id} onClick={() => setSelectedTenant(isSelected ? null : { ...tenant, roomNumber: room.roomNumber, roomObj: room })}
                                                className={`p-3 rounded-xl border transition-all text-left active:scale-95 ${isSelected ? 'bg-brand-orange-500/10 border-brand-orange-500/40 shadow-lg' : 'bg-zinc-900 border-white/5 hover:border-white/10'}`}
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white ${getAvatarBg(name)}`}>
                                                        {tenant.photoURL ? <img src={tenant.photoURL} className="w-full h-full object-cover rounded-lg" /> : name.charAt(0)}
                                                    </div>
                                                    <span className="text-[11px] font-bold font-mono text-brand-orange-400">{room.roomNumber}</span>
                                                </div>
                                                <p className="text-xs font-bold text-white truncate mb-1">{name}</p>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] text-zinc-500 uppercase">ชั้น {room.floor}</span>
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        ) : (
                            <div className="bg-zinc-900 border border-white/5 rounded-xl overflow-hidden min-h-[500px] flex flex-col">
                                {sq || filterYear !== 'all' || filterMonth !== 'all' ? (
                                    <div className="px-4 py-2 bg-brand-orange-500/10 border-b border-white/5 flex flex-wrap items-center justify-between gap-y-2">
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                            <p className="text-[10px] font-bold text-brand-orange-400 uppercase tracking-widest">การกรอง:</p>
                                            {sq && <span className="text-[10px] text-white">ค้นหา: {sq}</span>}
                                            {filterYear !== 'all' && <span className="text-[10px] text-white">ปี: {filterYear}</span>}
                                            {filterMonth !== 'all' && <span className="text-[10px] text-white">เดือน: {thMonths[parseInt(filterMonth)-1]}</span>}
                                        </div>
                                        <button 
                                            onClick={() => { setSearch(''); setFilterYear('all'); setFilterMonth('all'); }}
                                            className="text-[10px] font-bold text-zinc-500 hover:text-white transition-colors"
                                        >
                                            ล้างตัวกรอง
                                        </button>
                                    </div>
                                ) : null}
                                
                                <div className="px-4 py-3 border-b border-white/5 bg-zinc-900/50 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-3">
                                            <select 
                                                value={filterYear} onChange={e => setFilterYear(e.target.value)}
                                                className="bg-zinc-800 border border-white/10 rounded px-2 py-1 text-[10px] font-bold text-white outline-none focus:border-brand-orange-500/50"
                                            >
                                                <option value="all">ทุกปี</option>
                                                {[...new Set(allAptPayments.map(p => p.month?.split('-')[0]))].filter(Boolean).sort((a,b)=>b-a).map(y => (
                                                    <option key={y} value={y}>{y}</option>
                                                ))}
                                            </select>
                                            <select 
                                                value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                                                className="bg-zinc-800 border border-white/10 rounded px-2 py-1 text-[10px] font-bold text-white outline-none focus:border-brand-orange-500/50"
                                            >
                                                <option value="all">ทุกเดือน</option>
                                                {['01','02','03','04','05','06','07','08','09','10','11','12'].map((m, i) => (
                                                    <option key={m} value={m}>{thMonths[i]}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => window.print()}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-white/10 text-[10px] font-bold text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all shadow-sm"
                                    >
                                        <Printer className="w-3.5 h-3.5" /> พิมพ์รายงาน
                                    </button>
                                </div>

                                {/* Print Header (Only visible when printing) */}
                                <div className="hidden print:block px-4 py-4 border-b border-black text-black">
                                    <h2 className="text-xl font-bold mb-1">รายงานประวัติผู้เช่าและการชำระเงิน</h2>
                                    <p className="text-sm">
                                        {currentApt?.name ? `อาคาร: ${currentApt.name}` : ''} 
                                        {filterYear !== 'all' ? ` | ปี: ${filterYear}` : ' | รวมทุกปี'} 
                                        {filterMonth !== 'all' ? ` | เดือน: ${thMonthsFull[parseInt(filterMonth)-1]}` : ''}
                                        {sq ? ` | ค้นหา: "${sq}"` : ''}
                                    </p>
                                </div>

                                <div className="flex-1 overflow-auto custom-scrollbar bg-zinc-950/20 print:overflow-visible print:bg-transparent">
                                    <table className="w-full text-left border-collapse print:text-black">
                                        <thead>
                                            <tr className="border-b border-white/5 bg-white/[0.02] sticky top-0 z-10 backdrop-blur-md print:bg-transparent print:border-black print:static print:text-black">
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest print:text-black print:font-bold">เดือน/ปี</th>
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest print:text-black print:font-bold">ห้อง</th>
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest hidden md:table-cell print:table-cell print:text-black print:font-bold">ผู้เช่า</th>
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest text-right print:text-black print:font-bold">จำนวนเงิน</th>
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest text-center print:hidden">หลักฐาน</th>
                                                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest text-center print:text-black print:font-bold">สถานะ</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/[0.04] print:divide-black/20">
                                                {allAptPayments.length === 0 ? (
                                                    <tr><td colSpan="6" className="px-4 py-16 text-center text-zinc-600 text-[11px] font-medium italic print:text-black">ยังไม่มีประวัติการชำระเงิน</td></tr>
                                                ) : allAptPayments.filter(p => {
                                                    const matchesSearch = !sq || p.roomNumber?.toLowerCase().includes(sq) || p.tenantName?.toLowerCase().includes(sq) || p.month?.includes(sq);
                                                    const [y, m] = (p.month || '').split('-');
                                                    const matchesYear = filterYear === 'all' || y === filterYear;
                                                    const matchesMonth = filterMonth === 'all' || m === filterMonth;
                                                    return matchesSearch && matchesYear && matchesMonth;
                                                }).map(p => (
                                                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group print:border-b print:border-black/10">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-7 h-7 rounded bg-zinc-800 flex items-center justify-center shrink-0 print:hidden"><Calendar className="w-3.5 h-3.5 text-zinc-500 group-hover:text-brand-orange-400 transition-colors" /></div>
                                                                <span className="text-xs font-bold text-zinc-200 print:text-black">{p.month === 'first_bill' ? 'ค่าแรกเข้า' : p.month}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="text-[11px] font-bold font-mono text-brand-orange-400 print:text-black">{p.roomNumber}</span>
                                                        </td>
                                                        <td className="px-4 py-3 hidden md:table-cell print:table-cell">
                                                            <span className="text-[11px] text-zinc-400 truncate max-w-[120px] inline-block print:text-black">{p.tenantName || '—'}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className="text-xs font-bold text-zinc-100 print:text-black">{p.amount?.toLocaleString()} ฿</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center print:hidden">
                                                            {p.slipUrl ? (
                                                                <button 
                                                                    onClick={() => setPreviewSlipUrl(p.slipUrl)}
                                                                    className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-400 hover:text-brand-orange-400 hover:bg-brand-orange-500/10 transition-all flex items-center justify-center mx-auto"
                                                                >
                                                                    <ImageIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            ) : (
                                                                <span className="text-[10px] text-zinc-700 print:text-black">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-center print:w-24">
                                                            <div className="print:hidden">
                                                                <StatusPill status={p.status} />
                                                            </div>
                                                            <div className="hidden print:block text-xs font-bold w-full text-center">
                                                                {normalizeStatus(p.status)}
                                                            </div>
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
                                        <button onClick={() => setSelectedTenant(null)} className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-400 flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
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
                                                <div className="mt-3 p-3 bg-zinc-900 rounded-xl border border-brand-orange-500/30 animate-in fade-in slide-in-from-top-2">
                                                    <p className="text-[11px] font-bold text-white mb-2">เลือกห้องใหม่</p>
                                                    <select value={transferRoom} onChange={e => setTransferRoom(e.target.value)} className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white mb-3 focus:border-brand-orange-500 outline-none">
                                                        <option value="">เลือกห้อง...</option>
                                                        {vacantRooms.map(r => <option key={r.roomNumber} value={r.roomNumber}>{r.roomNumber} - ชั้น {r.floor}</option>)}
                                                    </select>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => setShowTransfer(false)} className="flex-1 py-1.5 text-[10px] font-bold text-zinc-500 hover:text-white">ยกเลิก</button>
                                                        <button onClick={handleTransferRoom} disabled={!transferRoom || transferSaving} className="flex-1 py-1.5 bg-brand-orange-500 text-white rounded-lg text-[10px] font-bold disabled:opacity-40">{transferSaving ? '...' : 'ยืนยัน'}</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>


                                    </div>

                                    <div className="px-5 py-4 border-t border-white/5 bg-zinc-950 flex gap-2">
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

        </MainLayout>
    );
}
