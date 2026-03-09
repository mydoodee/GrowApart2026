import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    collection, query, where, getDocs, doc, setDoc,
    serverTimestamp, getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { getUserApartments } from '../utils/apartmentUtils';
import MainLayout from '../components/MainLayout';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import {
    Zap, Droplets, ChevronDown, ChevronRight,
    Save, Check, Loader2, Building, AlertCircle, User,
    Calendar, List, Download, CreditCard, Printer,
    ChevronLeft, CheckCircle2, Clock, Info, Banknote, FileText, X, Search
} from 'lucide-react';

const thMonthsFull = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

export default function MonthlyBilling({ user }) {
    const navigate = useNavigate();
    const { toast, showToast, hideToast } = useToast();

    // --- State ---
    const [profile, setProfile] = useState(null);
    const [apartments, setApartments] = useState([]);
    const [activeAptId, setActiveAptId] = useState(localStorage.getItem('activeApartmentId'));
    const [loading, setLoading] = useState(true);
    const [issuing, setIssuing] = useState({}); // { roomNumber: true/false }
    const [issuingAll, setIssuingAll] = useState(false);

    const now = new Date();
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());

    const [rooms, setRooms] = useState([]);
    const [meterReadings, setMeterReadings] = useState({}); // { roomNumber: { electricity: {}, water: {} } }
    const [existingPayments, setExistingPayments] = useState({}); // { roomNumber: paymentDoc }
    const [pendingFirstBills, setPendingFirstBills] = useState([]);
    const [verifyingPayment, setVerifyingPayment] = useState(null); // Payment doc to verify
    const [searchTerm, setSearchTerm] = useState('');

    const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

    // --- Load Data ---
    const loadData = useCallback(async () => {
        if (!user || !activeAptId || activeAptId === 'all') {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            // profile
            const profSnap = await getDoc(doc(db, 'users', user.uid));
            if (profSnap.exists()) setProfile(profSnap.data());

            // apartments
            const apps = await getUserApartments(db, user);
            setApartments(apps);

            const apt = apps.find(a => a.id === activeAptId);
            if (!apt) { setLoading(false); return; }

            // 1. Load Rooms
            const rSnap = await getDocs(query(collection(db, 'rooms'), where('apartmentId', '==', activeAptId)));
            const roomList = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setRooms(roomList);

            // 2. Load Meter Readings for the month
            const mSnap = await getDocs(query(
                collection(db, 'meterReadings'),
                where('apartmentId', '==', activeAptId),
                where('monthKey', '==', monthKey)
            ));
            const mMap = {};
            mSnap.docs.forEach(d => {
                const data = d.data();
                if (!mMap[data.roomNumber]) mMap[data.roomNumber] = {};
                mMap[data.roomNumber][data.type] = data;
            });
            setMeterReadings(mMap);

            // 3. Load Existing Payments for the month
            const pSnap = await getDocs(query(
                collection(db, 'payments'),
                where('apartmentId', '==', activeAptId),
                where('month', '==', monthKey),
                where('type', '==', 'monthly_bill')
            ));
            const pMap = {};
            pSnap.docs.forEach(d => {
                pMap[d.data().roomNumber] = { id: d.id, ...d.data() };
            });
            setExistingPayments(pMap);

            // 4. Load Pending First Bills
            const fSnap = await getDocs(query(
                collection(db, 'payments'),
                where('apartmentId', '==', activeAptId),
                where('type', '==', 'first_bill'),
                where('status', '==', 'waiting_verification')
            ));
            setPendingFirstBills(fSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        } catch (e) {
            console.error(e);
            showToast('โหลดข้อมูลล้มเหลว', 'error');
        }
        setLoading(false);
    }, [user, activeAptId, monthKey]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleAptSwitch = (id) => {
        localStorage.setItem('activeApartmentId', id);
        setActiveAptId(id);
    };

    const calculateBill = (room) => {
        const meters = meterReadings[room.roomNumber] || {};
        const elec = meters.electricity || null;
        const water = meters.water || null;

        const rent = room.price || 0;
        const elecAmount = elec?.amount || 0;
        const waterAmount = water?.amount || 0;
        const fixedSum = (room.fixedExpenses || [])
            .filter(ex => ex.active)
            .reduce((sum, ex) => sum + (ex.amount || 0), 0);

        const total = rent + elecAmount + waterAmount + fixedSum;

        return {
            rent,
            electricity: {
                units: elec?.units || 0,
                amount: elecAmount,
                old: elec?.oldReading || 0,
                new: elec?.newReading || 0
            },
            water: {
                units: water?.units || 0,
                amount: waterAmount,
                old: water?.oldReading || 0,
                new: water?.newReading || 0
            },
            fixedExpenses: (room.fixedExpenses || []).filter(ex => ex.active),
            total
        };
    };

    const issueBill = async (room) => {
        if (!room.tenantId) return;
        const bill = calculateBill(room);

        setIssuing(prev => ({ ...prev, [room.roomNumber]: true }));
        try {
            const paymentId = `bill_${activeAptId}_${room.roomNumber}_${monthKey}`;
            await setDoc(doc(db, 'payments', paymentId), {
                apartmentId: activeAptId,
                roomNumber: room.roomNumber,
                tenantId: room.tenantId,
                tenantName: room.tenantName || 'ไม่ระบุ',
                month: monthKey,
                type: 'monthly_bill',
                status: 'pending',
                amount: bill.total,
                details: {
                    rent: bill.rent,
                    electricity: bill.electricity,
                    water: bill.water,
                    fixedExpenses: bill.fixedExpenses
                },
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            setExistingPayments(prev => ({
                ...prev,
                [room.roomNumber]: { id: paymentId, status: 'pending', amount: bill.total }
            }));
            showToast(`ออกบิลห้อง ${room.roomNumber} เรียบร้อย`, 'success');
        } catch (e) {
            console.error(e);
            showToast('ออกบิลล้มเหลว', 'error');
        }
        setIssuing(prev => ({ ...prev, [room.roomNumber]: false }));
    };

    const handleVerifyPayment = async (status) => {
        if (!verifyingPayment) return;
        try {
            const payRef = doc(db, 'payments', verifyingPayment.id);
            await setDoc(payRef, {
                status: status,
                verifiedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            }, { merge: true });

            showToast(status === 'paid' ? 'ยืนยันการชำระเงินเรียบร้อย' : 'ปฏิเสธการชำระเงินแล้ว', 'success');

            // If it was a first bill, update the room as well
            if (verifyingPayment.type === 'first_bill') {
                const roomSnap = await getDocs(query(
                    collection(db, 'rooms'),
                    where('apartmentId', '==', activeAptId),
                    where('roomNumber', '==', verifyingPayment.roomNumber)
                ));
                if (!roomSnap.empty) {
                    await setDoc(doc(db, 'rooms', roomSnap.docs[0].id), {
                        firstBillPaid: status === 'paid',
                        firstBillStatus: status
                    }, { merge: true });
                }
                setPendingFirstBills(prev => prev.filter(p => p.id !== verifyingPayment.id));
            } else {
                setExistingPayments(prev => ({
                    ...prev,
                    [verifyingPayment.roomNumber]: { ...prev[verifyingPayment.roomNumber], status: status }
                }));
            }

            setVerifyingPayment(null);
        } catch (e) {
            console.error(e);
            showToast('เกิดข้อผิดพลาด', 'error');
        }
    };

    const issueAllReady = async () => {
        const readyRooms = rooms.filter(r => {
            if (!r.tenantId) return false;
            if (existingPayments[r.roomNumber]) return false;
            const meters = meterReadings[r.roomNumber] || {};
            return meters.electricity && meters.water;
        });

        if (readyRooms.length === 0) {
            showToast('ไม่มีห้องที่พร้อมออกบิล', 'info');
            return;
        }

        setIssuingAll(true);
        let successCount = 0;
        for (const room of readyRooms) {
            try {
                const bill = calculateBill(room);
                const paymentId = `bill_${activeAptId}_${room.roomNumber}_${monthKey}`;
                await setDoc(doc(db, 'payments', paymentId), {
                    apartmentId: activeAptId,
                    roomNumber: room.roomNumber,
                    tenantId: room.tenantId,
                    tenantName: room.tenantName || 'ไม่ระบุ',
                    month: monthKey,
                    type: 'monthly_bill',
                    status: 'pending',
                    amount: bill.total,
                    details: {
                        rent: bill.rent,
                        electricity: bill.electricity,
                        water: bill.water,
                        fixedExpenses: bill.fixedExpenses
                    },
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                successCount++;
            } catch (e) {
                console.error(`Failed to issue bill for ${room.roomNumber}:`, e);
            }
        }

        loadData(); // Refresh all
        setIssuingAll(false);
        showToast(`ออกบิลสำเร็จ ${successCount} ห้อง`, 'success');
    };

    if (loading && !rooms.length) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
                <Loader2 className="w-10 h-10 text-brand-orange-500 animate-spin" />
            </div>
        );
    }

    const occupiedRooms = rooms.filter(r => r.tenantId);

    const filteredRooms = occupiedRooms.filter(r => {
        const s = searchTerm.toLowerCase();
        return (
            r.roomNumber?.toLowerCase().includes(s) ||
            r.tenantName?.toLowerCase().includes(s) ||
            r.floor?.toString().toLowerCase().includes(s)
        );
    });

    const readyToIssue = occupiedRooms.filter(r => {
        const meters = meterReadings[r.roomNumber] || {};
        return meters.electricity && meters.water && !existingPayments[r.roomNumber];
    });
    const alreadyIssued = occupiedRooms.filter(r => existingPayments[r.roomNumber]);
    const paidCount = occupiedRooms.filter(r => existingPayments[r.roomNumber]?.status === 'paid').length;

    return (
        <MainLayout
            profile={profile}
            apartments={apartments}
            activeAptId={activeAptId}
            onAptSwitch={handleAptSwitch}
            title="ออกบิลรายเดือน"
        >
            <Toast {...toast} onClose={hideToast} />

            <div className="px-3 sm:px-5 py-3 max-w-[1600px] mx-auto w-full space-y-4">

                {/* Header Actions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 bg-brand-card/50 p-1 rounded-xl border border-white/5">
                            <button
                                onClick={() => {
                                    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
                                    else setSelectedMonth(m => m - 1);
                                }}
                                className="p-2 hover:bg-white/5 rounded-lg text-brand-gray-400 hover:text-white transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="px-3 py-1 text-center min-w-[120px]">
                                <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest">{selectedYear + 543}</p>
                                <p className="text-sm font-black text-white">{thMonthsFull[selectedMonth]}</p>
                            </div>
                            <button
                                onClick={() => {
                                    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
                                    else setSelectedMonth(m => m + 1);
                                }}
                                className="p-2 hover:bg-white/5 rounded-lg text-brand-gray-400 hover:text-white transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-1 items-center gap-3 bg-brand-card/50 px-4 py-2.5 rounded-2xl border border-white/5 focus-within:border-brand-orange-500/50 transition-all max-w-sm">
                        <Search className="w-4 h-4 text-brand-gray-500" />
                        <input
                            type="text"
                            placeholder="ค้นหาชั้น, เลขห้อง, หรือชื่อคน..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-transparent border-none outline-none text-sm text-white placeholder:text-brand-gray-600 w-full"
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="text-brand-gray-500 hover:text-white transition-colors">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={issueAllReady}
                        disabled={issuingAll || readyToIssue.length === 0}
                        className="flex items-center justify-center gap-2 bg-brand-orange-500 hover:bg-brand-orange-400 disabled:opacity-30 text-brand-bg px-5 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-brand-orange-500/20 transition-all active:scale-95"
                    >
                        {issuingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                        ออกบิลทั้งหมด ({readyToIssue.length})
                    </button>

                </div>

                {/* Summary Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {[
                        { label: 'ผู้เช่ารวม', value: occupiedRooms.length, icon: <User />, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                        { label: 'จดมิเตอร์', value: occupiedRooms.filter(r => (meterReadings[r.roomNumber]?.electricity && meterReadings[r.roomNumber]?.water)).length, icon: <Zap />, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                        { label: 'พร้อมบิล', value: readyToIssue.length, icon: <CheckCircle2 />, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                        { label: 'บิลแล้ว', value: alreadyIssued.length, icon: <FileText />, color: 'text-brand-orange-400', bg: 'bg-brand-orange-500/10' },
                        { label: 'ชำระแล้ว', value: paidCount, icon: <CheckCircle2 />, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                    ].map((s, idx) => (
                        <div key={idx} className="bg-brand-card/40 border border-white/8 p-3 rounded-2xl flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center shrink-0 ${s.color}`}>
                                {React.cloneElement(s.icon, { size: 18 })}
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest">{s.label}</p>
                                <p className="text-lg font-black text-white leading-none mt-0.5">{s.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Pending First Bills Section */}
                {pendingFirstBills.length > 0 && (
                    <div className="bg-brand-orange-500/5 border border-brand-orange-500/20 rounded-3xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="px-6 py-4 bg-brand-orange-500/10 border-b border-brand-orange-500/10 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-brand-orange-500 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                รอยืนยันค่าแรกเข้า (สมาชิกใหม่)
                            </h3>
                            <span className="px-2 py-0.5 bg-brand-orange-500 text-brand-bg rounded-lg text-[10px] font-black uppercase">
                                {pendingFirstBills.length} รายการ
                            </span>
                        </div>
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <tbody className="divide-y divide-white/5">
                                    {pendingFirstBills.map(p => (
                                        <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-lg bg-brand-orange-500/10 flex items-center justify-center text-brand-orange-500 font-bold text-xs shrink-0">
                                                        {p.roomNumber}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white">{p.tenantName}</p>
                                                        <p className="text-[10px] text-brand-gray-500 uppercase tracking-wider">First Bill Payment</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-brand-gray-400">
                                                    <Calendar size={14} />
                                                    <span className="text-xs font-medium">ส่งเมื่อ {p.uploadedAt?.toDate ? p.uploadedAt.toDate().toLocaleDateString('th-TH') : 'เพิ่งส่ง'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <p className="text-sm font-black text-white">{p.amount?.toLocaleString()} บ.</p>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => setVerifyingPayment(p)}
                                                    className="inline-flex items-center gap-1.5 bg-brand-orange-500 hover:bg-brand-orange-400 text-brand-bg px-4 py-2 rounded-xl text-[10px] font-black transition-all active:scale-95 shadow-lg shadow-brand-orange-500/10"
                                                >
                                                    <Check size={14} /> ตรวจสอบสลิป
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Room List */}
                <div className="bg-brand-card/40 border border-white/8 rounded-3xl overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white/5">
                                    <th className="px-6 py-4 text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest">ห้อง / ผู้เช่า</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest">สถานะมิเตอร์</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest text-right">ค่าเช่า + อื่นๆ</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest text-right">รวมทั้งสิ้น</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest text-center">สถานะบิล</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredRooms.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-20 text-center">
                                            <Building className="w-10 h-10 text-brand-gray-700 mx-auto mb-4 opacity-20" />
                                            <p className="text-brand-gray-500 font-medium">ไม่พบผลการค้นหา</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRooms.map(room => {
                                        const meters = meterReadings[room.roomNumber] || {};
                                        const bill = calculateBill(room);
                                        const payment = existingPayments[room.roomNumber];
                                        const isMetersComplete = meters.electricity && meters.water;
                                        const isIssuing = issuing[room.roomNumber];

                                        return (
                                            <tr key={room.id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-brand-orange-500/10 flex items-center justify-center text-brand-orange-500 font-bold text-xs shrink-0">
                                                            {room.roomNumber}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold text-white truncate">{room.tenantName}</p>
                                                            <p className="text-[10px] text-brand-gray-500">ชั้น {room.floor}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`flex items-center gap-1 text-[10px] font-bold ${meters.electricity ? 'text-yellow-400' : 'text-brand-gray-700'}`}>
                                                            <Zap className="w-3.5 h-3.5" /> {meters.electricity ? 'OK' : 'NO'}
                                                        </div>
                                                        <div className={`flex items-center gap-1 text-[10px] font-bold ${meters.water ? 'text-blue-400' : 'text-brand-gray-700'}`}>
                                                            <Droplets className="w-3.5 h-3.5" /> {meters.water ? 'OK' : 'NO'}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <p className="text-xs font-bold text-brand-gray-400">
                                                        {calculateBill(room).rent.toLocaleString()} + {(calculateBill(room).total - calculateBill(room).rent).toLocaleString()}
                                                    </p>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <p className="text-sm font-black text-white">{bill.total.toLocaleString()} บ.</p>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {payment ? (
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${payment.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                            payment.status === 'waiting_verification' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                                                                'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'}`}>
                                                            {payment.status === 'paid' ? <CheckCircle2 size={10} /> : payment.status === 'waiting_verification' ? <Clock size={10} /> : <Clock size={10} />}
                                                            {payment.status === 'paid' ? 'ชำระแล้ว' : payment.status === 'waiting_verification' ? 'รอตรวจสอบ' : 'ค้างชำระ'}
                                                        </span>
                                                    ) : isMetersComplete ? (
                                                        <span className="text-[9px] font-black text-emerald-400/50 uppercase tracking-widest italic">พร้อมออกบิล</span>
                                                    ) : (
                                                        <span className="text-[9px] font-black text-brand-gray-700 uppercase tracking-widest">รอมิเตอร์</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex justify-center gap-2">
                                                        {payment ? (
                                                            <>
                                                                {payment.status === 'waiting_verification' && (
                                                                    <button
                                                                        onClick={() => setVerifyingPayment(payment)}
                                                                        className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-brand-bg px-3 py-1.5 rounded-xl text-[10px] font-black transition-all active:scale-95 shadow-lg shadow-orange-500/20"
                                                                    >
                                                                        <Check size={14} /> ตรวจสอบสลิป
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => navigate(`/rooms?room=${room.roomNumber}`)}
                                                                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-brand-gray-400 hover:text-white transition-all"
                                                                    title="ดูรายละเอียด"
                                                                >
                                                                    <ChevronRight className="w-4 h-4" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => issueBill(room)}
                                                                disabled={!isMetersComplete || isIssuing}
                                                                className="flex items-center gap-2 bg-brand-orange-500/10 hover:bg-brand-orange-500 border border-brand-orange-500/20 text-brand-orange-500 hover:text-brand-bg px-4 py-1.5 rounded-xl text-[10px] font-black transition-all active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed group-hover:shadow-lg group-hover:shadow-brand-orange-500/10"
                                                            >
                                                                {isIssuing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                                ออกบิล
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>



            </div>

            {/* Slip Verification Modal */}
            {verifyingPayment && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setVerifyingPayment(null)} />
                    <div className="relative bg-brand-card w-full max-w-lg rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">ตรวจสอบหลักฐานการโอนเงิน</h3>
                            <button onClick={() => setVerifyingPayment(null)} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-brand-gray-400">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="mb-6">
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest">ห้อง {verifyingPayment.roomNumber}</p>
                                        <p className="text-sm font-bold text-white">{verifyingPayment.tenantName || 'ไม่ระบุชื่อ'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest">ยอดที่ต้องชำระ</p>
                                        <p className="text-lg font-black text-brand-orange-500">{verifyingPayment.amount?.toLocaleString()} บาท</p>
                                    </div>
                                </div>
                                <div className="bg-black/20 rounded-2xl overflow-hidden border border-white/5 max-h-[400px] flex items-center justify-center">
                                    {verifyingPayment.slipUrl ? (
                                        <img src={verifyingPayment.slipUrl} alt="Transfer Slip" className="max-w-full max-h-full object-contain" />
                                    ) : (
                                        <div className="py-20 text-center">
                                            <AlertCircle className="w-10 h-10 text-brand-gray-700 mx-auto mb-2" />
                                            <p className="text-brand-gray-500 text-xs">ไม่พบรูปภาพสลิป</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleVerifyPayment('paid')}
                                    className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-brand-bg rounded-2xl font-black uppercase tracking-wider text-xs shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <CheckCircle2 size={16} /> ได้รับเงินถูกต้อง
                                </button>
                                <button
                                    onClick={() => handleVerifyPayment('pending')}
                                    className="flex-1 py-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-brand-bg border border-red-500/20 rounded-2xl font-black uppercase tracking-wider text-xs active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <X size={16} /> ปฏิเสธสลิป
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
}
