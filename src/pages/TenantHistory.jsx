import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    collection, doc, getDoc, getDocs, query, where, orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    Search, X, User, Clock, Home, LayoutGrid, CalendarDays, Banknote, Phone, Mail,
    Printer, History, ChevronRight, ChevronLeft, Building
} from 'lucide-react';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import MainLayout from '../components/MainLayout';
import { getUserApartments } from '../utils/apartmentUtils';

// ─── helpers ──────────────────────────────────────────────────────────────────
const AVATAR_BG = [
    'bg-brand-orange-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-purple-500', 'bg-pink-500', 'bg-yellow-500'
];
const getAvatarBg = (name = '') => AVATAR_BG[(name.charCodeAt(0) || 0) % AVATAR_BG.length];

const fmtDate = (ts) => {
    if (!ts) return '-';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
};

// ─── main ─────────────────────────────────────────────────────────────────────
export default function TenantHistory({ user }) {
    const navigate = useNavigate();
    const { toast, showToast, hideToast } = useToast();

    const [profile, setProfile] = useState(null);
    const [apartments, setApartments] = useState([]);
    const [activeAptId, setActiveAptId] = useState(localStorage.getItem('activeApartmentId'));
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    const [filterFloor, setFilterFloor] = useState('all');
    const [filterYear, setFilterYear] = useState('all');
    const [search, setSearch] = useState('');
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [isTenant, setIsTenant] = useState(false);

    // ── load data ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const load = async () => {
            const profileSnap = await getDoc(doc(db, 'users', user.uid));
            let userData = null;
            if (profileSnap.exists()) {
                userData = profileSnap.data();
                setProfile(userData);
                setIsTenant(userData.role === 'tenant');
            }

            const apps = await getUserApartments(db, user);
            setApartments(apps);

            if (userData?.role === 'tenant') {
                // Fetch ALL history for this tenant across any apartment
                const q = query(
                    collection(db, 'tenantHistory'),
                    where('tenantId', '==', user.uid)
                );
                const snap = await getDocs(q);
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                data.sort((a, b) => (b.movedOutAt?.toMillis?.() || 0) - (a.movedOutAt?.toMillis?.() || 0));
                setHistory(data);
                setLoading(false);
            } else {
                const aptId = activeAptId && activeAptId !== 'all' ? activeAptId : null;
                if (!aptId) { setLoading(false); return; }

                const q = query(
                    collection(db, 'tenantHistory'),
                    where('apartmentId', '==', aptId)
                );
                const snap = await getDocs(q);
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                data.sort((a, b) => (b.movedOutAt?.toMillis?.() || 0) - (a.movedOutAt?.toMillis?.() || 0));
                setHistory(data);
                setLoading(false);
            }
        };
        load().catch(err => { console.error(err); setLoading(false); });
    }, [user, activeAptId, showToast]);

    const LayoutComponent = isTenant ? ({ children }) => <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col">{children}</div> : MainLayout;

    // ── Printing Logic ───────────────────────────────────────────────────────
    const handlePrintYearSummary = async (year) => {
        if (!user || !year) return;
        showToast('กำลังเตรียมไฟล์พิมพ์...', 'info');

        try {
            // Fetch all payments for this tenant in this year
            const paymentsQ = query(
                collection(db, 'payments'),
                where('tenantId', '==', user.uid),
                orderBy('month', 'desc')
            );
            const snap = await getDocs(paymentsQ);
            const yearPayments = snap.docs
                .map(d => d.data())
                .filter(p => p.month && p.month.startsWith(`${year}`));

            const printWindow = window.open('', '_blank');
            const totalAmount = yearPayments.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
            const paidCount = yearPayments.filter(p => p.paid).length;

            const rows = yearPayments.map(p => {
                const [y, m] = p.month.split('-');
                const monthName = new Date(y, parseInt(m) - 1).toLocaleDateString('th-TH', { month: 'long' });
                return `
                    <tr>
                        <td>${monthName}</td>
                        <td style="color: ${p.paid ? '#10b981' : '#ef4444'}">${p.paid ? 'ชำระแล้ว' : 'ค้างชำระ'}</td>
                        <td>${p.totalAmount?.toLocaleString() || 0} บาท</td>
                        <td>${p.paidAt ? fmtDate(p.paidAt) : '-'}</td>
                    </tr>
                `;
            }).join('');

            printWindow.document.write(`
                <html>
                <head>
                    <title>รายงานสรุปค่าเช่าปี ${year}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
                        body { font-family: 'Sarabun', sans-serif; padding: 40px; color: #1e293b; }
                        header { border-bottom: 2px solid #f97316; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
                        h1 { color: #f97316; margin: 0; font-size: 24px; }
                        .info { margin-bottom: 30px; display: grid; grid-template-cols: 1fr 1fr; gap: 20px; font-size: 14px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                        th { background: #f8fafc; text-align: left; padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-transform: uppercase; color: #64748b; }
                        td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
                        .summary { background: #fff7ed; padding: 20px; border-radius: 12px; border: 1px solid #ffedd5; text-align: right; }
                        .summary-item { font-size: 14px; margin-bottom: 5px; }
                        .total { font-size: 20px; font-weight: bold; color: #f97316; margin-top: 10px; }
                        @media print { .no-print { display: none; } }
                    </style>
                </head>
                <body>
                    <header>
                        <div>
                            <h1>รายงานสรุปการชำระเงินรายปี</h1>
                            <p style="margin: 5px 0 0; color: #64748b;">ปีงบประมาณ ${year}</p>
                        </div>
                        <div style="text-align: right;">
                            <p style="margin: 0; font-weight: bold;">GrowApart System</p>
                            <p style="margin: 0; font-size: 12px; color: #94a3b8;">วันที่ออกเอกสาร: ${new Date().toLocaleDateString('th-TH')}</p>
                        </div>
                    </header>
                    <div class="info">
                        <div>
                            <p><strong>ชื่อผู้เช่า:</strong> ${profile?.name || '-'}</p>
                            <p><strong>อีเมล:</strong> ${profile?.email || '-'}</p>
                        </div>
                        <div style="text-align: right;">
                            <p><strong>จำนวนงวดที่ชำระ:</strong> ${paidCount} เดือน</p>
                            <p><strong>สถานะปัจจุบัน:</strong> ${history.length > 0 ? 'ย้ายออกแล้ว' : 'สมาชิก'} </p>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>เดือน</th>
                                <th>สถานะ</th>
                                <th>ยอดชำระ</th>
                                <th>วันที่ชำระ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows || '<tr><td colspan="4" style="text-align:center; padding: 40px; color: #94a3b8;">ไม่พบข้อมูลการชำระเงินในปีนี้</td></tr>'}
                        </tbody>
                    </table>
                    <div class="summary">
                        <div class="summary-item">รวมยอดเงินที่ชำระทั้งปี:</div>
                        <div class="total">${totalAmount.toLocaleString()} บาท</div>
                    </div>
                    <p style="text-align: center; font-size: 11px; color: #94a3b8; margin-top: 50px;">
                        เอกสารนี้ออกโดยระบบอัตโนมัติ ไม่จำเป็นต้องประทับตรา
                    </p>
                    <script>window.onload = () => { window.print(); window.close(); }</script>
                </body>
                </html>
            `);
            printWindow.document.close();
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาดในการโหลดข้อมูลพิมพ์', 'error');
        }
    };

    // ── handlers ─────────────────────────────────────────────────────────────
    const handleAptSwitch = (id) => {
        localStorage.setItem('activeApartmentId', id);
        setActiveAptId(id); setSelectedRecord(null);
        showToast('สลับตึกเรียบร้อย');
    };

    // ── display data ─────────────────────────────────────────────────────────
    const floorsList = [...new Set(history.map(h => h.floor))].sort((a, b) => a - b);
    const sq = search.trim().toLowerCase();

    const displayRecords = history.filter(r => {
        if (!isTenant && filterFloor !== 'all' && r.floor !== parseInt(filterFloor)) return false;
        if (!sq) return true;
        return (r.tenantName || '').toLowerCase().includes(sq)
            || (r.roomNumber || '').toLowerCase().includes(sq)
            || (r.tenantPhone || '').includes(sq)
            || (r.tenantEmail || '').toLowerCase().includes(sq)
            || (r.apartmentName || '').toLowerCase().includes(sq);
    });

    // Grouping by year
    const groupedByYear = displayRecords.reduce((acc, rec) => {
        const date = rec.movedOutAt?.toDate ? rec.movedOutAt.toDate() : new Date(rec.movedOutAt);
        const year = date.getFullYear() + 543; // Thai Year
        if (!acc[year]) acc[year] = [];
        acc[year].push(rec);
        return acc;
    }, {});
    const years = Object.keys(groupedByYear).sort((a, b) => b - a);

    if (loading) return (
        <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
            <div className="w-12 h-12 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );



    return (
        <LayoutComponent profile={profile} apartments={apartments} activeAptId={activeAptId} onAptSwitch={handleAptSwitch} title="ประวัติการเช่า">
            <Toast {...toast} onClose={hideToast} />

            {/* Premium Mobile Header for Tenant */}
            {isTenant && (
                <header className="sticky top-0 z-[60] bg-brand-bg/60 backdrop-blur-xl border-b border-white/5 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div onClick={() => navigate(-1)} className="w-10 h-10 bg-brand-card rounded-xl border border-white/10 flex items-center justify-center text-brand-gray-400 cursor-pointer">
                            <ChevronLeft className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white tracking-tight leading-none">ประวัติการเช่า</h2>
                            <p className="text-[10px] font-medium text-brand-orange-500 uppercase tracking-wider mt-1">Tenant History</p>
                        </div>
                    </div>
                </header>
            )}

            <div className="px-5 lg:px-4 py-6 max-w-[1200px] mx-auto w-full relative z-10">

                {/* ── Intro Section ─────────────────────────── */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-brand-orange-500/10 rounded-xl flex items-center justify-center text-brand-orange-500">
                            <Clock className="w-5 h-5" />
                        </div>
                        <h1 className="text-xl font-black text-white tracking-tight">คลังประวัติของคุณ</h1>
                    </div>
                    <p className="text-brand-gray-500 text-sm max-w-md">รวมข้อมูลการเข้าพักทั้งหมดของคุณที่ผ่านมา สามารถตรวจสอบยอดชำระและพิมพ์สรุปรายปีได้ครับ</p>
                </div>

                {/* ── Floor/Filter Row ──────────────────────── */}
                <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
                    {!isTenant ? (
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
                    ) : (
                        <div className="flex-1" />
                    )}
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20 flex items-center gap-2 h-10">
                            <p className="text-[9px] font-medium text-emerald-500 uppercase tracking-widest opacity-80">{isTenant ? 'รายการประวัติ' : 'ทั้งหมด'}</p>
                            <p className="text-base font-bold text-white leading-none">{history.length}</p>
                        </div>
                    </div>
                </div>

                {/* ── Search ────────────────────────────────── */}
                <div className="relative mb-8">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray-500" />
                    <input
                        type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder={isTenant ? "ค้นหาชื่ออาคาร, เลขห้อง..." : "ค้นหาชื่อ, เลขห้อง, เบอร์โทร..."}
                        className="w-full bg-brand-card/30 border border-white/5 rounded-2xl pl-12 pr-12 py-4 text-sm font-medium text-white placeholder:text-brand-gray-600 outline-none focus:border-brand-orange-500/50 focus:bg-brand-card/50 transition-all shadow-xl"
                    />
                </div>

                {/* ── Main display ──────────────────────────── */}
                <div className="flex flex-col lg:flex-row gap-8 items-start">

                    <div className={`transition-all duration-300 ${selectedRecord ? 'w-full lg:w-[55%]' : 'w-full'}`}>
                        {years.length === 0 ? (
                            <div className="text-center py-24 bg-brand-card/20 rounded-[32px] border border-dashed border-white/5 backdrop-blur-sm">
                                <Clock className="w-12 h-12 text-brand-gray-700 mx-auto mb-4 opacity-20" />
                                <p className="text-white font-bold text-lg">ยังไม่พบข้อมูลประวัติ</p>
                                <p className="text-brand-gray-500 text-sm mt-1">ประวัติจะปรากฏขึ้นเมื่อมีการย้ายออกจากหอพักครับ</p>
                            </div>
                        ) : (
                            <div className="space-y-10">
                                {years.map(year => (
                                    <div key={year} className="space-y-4">
                                        <div className="flex items-center justify-between px-2">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-[1px] bg-brand-orange-500/30" />
                                                <h3 className="text-lg font-black text-white">ประจำปี {year}</h3>
                                            </div>
                                            {isTenant && (
                                                <button
                                                    onClick={() => handlePrintYearSummary(year - 543)}
                                                    className="flex items-center gap-2 bg-white/5 hover:bg-brand-orange-500 hover:text-brand-bg border border-white/10 rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition-all"
                                                >
                                                    <Printer className="w-3.5 h-3.5" /> พิมพ์สรุปปี {year}
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 gap-2">
                                            {groupedByYear[year].map(record => {
                                                const isSelected = selectedRecord?.id === record.id;
                                                return (
                                                    <div
                                                        key={record.id}
                                                        onClick={() => setSelectedRecord(isSelected ? null : record)}
                                                        className={`group relative bg-brand-card/40 border transition-all duration-300 cursor-pointer overflow-hidden rounded-2xl ${isSelected ? 'border-brand-orange-500 shadow-2xl shadow-brand-orange-500/10' : 'border-white/5 hover:border-white/20 hover:bg-brand-card/60'}`}
                                                    >
                                                        <div className="absolute top-0 left-0 w-1.5 h-full bg-brand-orange-500 transition-transform origin-left scale-y-0 group-hover:scale-y-100" />

                                                        <div className="flex flex-col lg:flex-row lg:items-center gap-4 p-4 lg:p-5">
                                                            {/* Primary Info: Name First */}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base shrink-0 ${getAvatarBg(isTenant ? record.apartmentName : record.tenantName)}`}>
                                                                        {(isTenant ? record.apartmentName : record.tenantName || '').charAt(0).toUpperCase()}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <h4 className="text-sm font-bold text-white truncate">
                                                                            {isTenant ? record.apartmentName : record.tenantName || 'ไม่ทราบชื่อ'}
                                                                        </h4>
                                                                        <p className="text-[10px] font-medium text-brand-orange-500 uppercase tracking-widest mt-0.5">
                                                                            {isTenant ? 'Apartment' : 'Tenant'}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Aligned Grid Columns */}
                                                            <div className="hidden lg:grid grid-cols-3 gap-8 flex-[2] items-center">
                                                                {/* Room Info */}
                                                                <div className="text-left">
                                                                    <p className="text-[9px] font-bold text-brand-gray-600 uppercase tracking-[0.15em] mb-1">ห้องพัก / ชั้น</p>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-sm font-black text-white">{record.roomNumber}</span>
                                                                        <span className="text-[10px] text-brand-gray-500 font-medium">ชั้น {record.floor}</span>
                                                                    </div>
                                                                </div>

                                                                {/* Duration Info */}
                                                                <div className="text-left">
                                                                    <p className="text-[9px] font-bold text-brand-gray-600 uppercase tracking-[0.15em] mb-1">ระยะเวลาเข้าพัก</p>
                                                                    <div className="flex items-center gap-2 text-[11px] text-brand-gray-400 font-medium whitespace-nowrap">
                                                                        <CalendarDays className="w-3.5 h-3.5 text-brand-orange-500/50" />
                                                                        <span>{fmtDate(record.joinedAt)} - {fmtDate(record.movedOutAt)}</span>
                                                                    </div>
                                                                </div>

                                                                {/* Financial Info */}
                                                                <div className="text-left">
                                                                    <p className="text-[9px] font-bold text-brand-gray-600 uppercase tracking-[0.15em] mb-1">ค่าเช่าล่าสุด</p>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-sm font-black text-white">{record.rentPrice?.toLocaleString() || 0}</span>
                                                                        <span className="text-[10px] text-brand-gray-500 font-medium">บาท</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Mobile Support Info */}
                                                            <div className="lg:hidden flex items-center justify-between pt-3 border-t border-white/5">
                                                                <div className="flex items-center gap-4 text-[11px] text-brand-gray-400 font-medium">
                                                                    <div className="flex items-center gap-1">
                                                                        <Building className="w-3 h-3" /> {record.roomNumber}
                                                                    </div>
                                                                    <div className="flex items-center gap-1">
                                                                        <CalendarDays className="w-3 h-3" /> {fmtDate(record.movedOutAt)}
                                                                    </div>
                                                                </div>
                                                                <div className="text-sm font-black text-white">
                                                                    {record.rentPrice?.toLocaleString() || 0} <span className="text-[10px] font-normal text-brand-gray-600">บ.</span>
                                                                </div>
                                                            </div>

                                                            {/* Action Icon */}
                                                            <div className="hidden lg:flex shrink-0">
                                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-brand-orange-500 text-brand-bg shadow-lg shadow-brand-orange-500/20' : 'bg-white/5 text-brand-gray-600 group-hover:text-brand-orange-500 group-hover:bg-brand-orange-500/10'}`}>
                                                                    <ChevronRight className={`w-5 h-5 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Detail Panel ──────────────────────────── */}
                    {selectedRecord && (
                        <div className="w-full lg:w-[45%] sticky top-24 animate-in slide-in-from-right-8 fade-in duration-500 z-50">
                            <div className="bg-brand-card border border-white/10 rounded-[32px] overflow-hidden shadow-2xl backdrop-blur-md">
                                <div className="p-8 space-y-8">
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-brand-orange-500 uppercase tracking-[0.2em] mb-2">ข้อมูลรายละเอียด</p>
                                            <h3 className="text-xl font-black text-white leading-tight">
                                                หอพัก{selectedRecord.apartmentName}<br />ชั้น {selectedRecord.floor} ห้อง {selectedRecord.roomNumber}
                                            </h3>
                                        </div>
                                        <button onClick={() => setSelectedRecord(null)} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-brand-gray-500 hover:text-white transition-all">
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                            <p className="text-[9px] font-bold text-brand-gray-500 uppercase mb-1">ระยะเวลาพัก</p>
                                            <p className="text-sm font-bold text-white">
                                                {(() => {
                                                    const join = selectedRecord.joinedAt?.toDate ? selectedRecord.joinedAt.toDate() : new Date(selectedRecord.joinedAt);
                                                    const out = selectedRecord.movedOutAt?.toDate ? selectedRecord.movedOutAt.toDate() : new Date(selectedRecord.movedOutAt);
                                                    const diff = out - join;
                                                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                                                    return `${Math.floor(days / 30)} เดือน ${days % 30} วัน`;
                                                })()}
                                            </p>
                                        </div>
                                        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                            <p className="text-[9px] font-bold text-brand-gray-500 uppercase mb-1">ค่าเช่าล่าสุด</p>
                                            <p className="text-sm font-bold text-white">{selectedRecord.rentPrice?.toLocaleString() || 0} บาท</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-bold text-brand-gray-600 uppercase tracking-widest pl-2">ไทม์ไลน์การเข้าพัก</h4>
                                        <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/10">
                                            <div className="relative">
                                                <div className="absolute left-[-21px] top-1.5 w-[11px] h-[11px] rounded-full bg-emerald-500 border-2 border-brand-bg shadow-[0_0_10px_rgba(16,185,129,0.3)]"></div>
                                                <p className="text-[9px] font-bold text-emerald-500 uppercase mb-0.5">วันที่ย้ายเข้า</p>
                                                <p className="text-sm font-bold text-white">{fmtDate(selectedRecord.joinedAt)}</p>
                                            </div>
                                            <div className="relative">
                                                <div className="absolute left-[-21px] top-1.5 w-[11px] h-[11px] rounded-full bg-red-500 border-2 border-brand-bg shadow-[0_0_10px_rgba(239,68,68,0.3)]"></div>
                                                <p className="text-[9px] font-bold text-red-500 uppercase mb-0.5">วันที่ย้ายออก</p>
                                                <p className="text-sm font-bold text-white">{fmtDate(selectedRecord.movedOutAt)}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {isTenant && (
                                        <div className="pt-4">
                                            <button
                                                onClick={() => {
                                                    const year = (selectedRecord.movedOutAt?.toDate ? selectedRecord.movedOutAt.toDate() : new Date(selectedRecord.movedOutAt)).getFullYear();
                                                    handlePrintYearSummary(year);
                                                }}
                                                className="w-full py-4 bg-brand-orange-500 rounded-2xl text-brand-bg font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-orange-500/20 active:scale-95 transition-all"
                                            >
                                                พิมพ์รายงานสรุปปีการย้ายออก
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </LayoutComponent>
    );
}
