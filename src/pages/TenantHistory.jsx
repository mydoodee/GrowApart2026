import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    collection, doc, getDoc, getDocs, query, where, orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    Search, X, User, Clock, Home, LayoutGrid, CalendarDays, Banknote, Phone, Mail
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
    const [search, setSearch] = useState('');
    const [selectedRecord, setSelectedRecord] = useState(null);

    // ── load data ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const load = async () => {
            const profileSnap = await getDoc(doc(db, 'users', user.uid));
            if (profileSnap.exists()) setProfile(profileSnap.data());

            const apps = await getUserApartments(db, user);
            setApartments(apps);

            const aptId = activeAptId && activeAptId !== 'all' ? activeAptId : null;
            if (!aptId) { setLoading(false); return; }

            const q = query(
                collection(db, 'tenantHistory'),
                where('apartmentId', '==', aptId)
            );
            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Sort client-side to avoid needing a complex index
            data.sort((a, b) => (b.movedOutAt?.toMillis?.() || 0) - (a.movedOutAt?.toMillis?.() || 0));
            setHistory(data);
            setLoading(false);
        };
        load().catch(err => { console.error(err); setLoading(false); });
    }, [user, activeAptId]);

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
        if (filterFloor !== 'all' && r.floor !== parseInt(filterFloor)) return false;
        if (!sq) return true;
        return (r.tenantName || '').toLowerCase().includes(sq)
            || (r.roomNumber || '').toLowerCase().includes(sq)
            || (r.tenantPhone || '').includes(sq)
            || (r.tenantEmail || '').toLowerCase().includes(sq);
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
        <MainLayout profile={profile} apartments={apartments} activeAptId={activeAptId} onAptSwitch={handleAptSwitch} title="ประวัติผู้เช่า">
            <Toast {...toast} onClose={hideToast} />

            <div className="px-5 lg:px-4 py-2 max-w-[1600px] mx-auto w-full relative z-10">

                {/* ── Floor buttons + stats ──────────────────────── */}
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
                            <p className="text-[9px] font-medium text-brand-orange-500 uppercase tracking-widest opacity-80">ทั้งหมด</p>
                            <p className="text-base font-bold text-white leading-none">{history.length}</p>
                        </div>
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
                    <div className={`transition-all duration-300 ${selectedRecord ? 'w-1/2 lg:w-[58%]' : 'w-full'}`}>
                        {displayRecords.length === 0 ? (
                            <div className="text-center py-20 bg-brand-card/50 rounded-3xl border border-dashed border-white/10">
                                <Clock className="w-10 h-10 text-brand-gray-700 mx-auto mb-3" />
                                <p className="text-white font-bold">ไม่มีประวัติผู้เช่า</p>
                                <p className="text-brand-gray-500 text-sm mt-1">ยังไม่มีผู้เช่าที่ย้ายออก</p>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {years.map(year => (
                                    <div key={year} className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                                            <h3 className="text-lg font-bold text-brand-orange-500/80 px-4">พ.ศ. {year}</h3>
                                            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                                            {groupedByYear[year].map(record => {
                                                const isSelected = selectedRecord?.id === record.id;
                                                const initial = (record.tenantName || '').slice(0, 1).toUpperCase();

                                                return (
                                                    <button
                                                        key={record.id}
                                                        onClick={() => setSelectedRecord(isSelected ? null : record)}
                                                        className={`relative p-3 rounded-xl border transition-all duration-200 flex flex-col gap-2 text-left active:scale-[0.97] ${isSelected
                                                            ? 'bg-brand-orange-500/10 border-brand-orange-500/40 shadow-lg shadow-brand-orange-500/10'
                                                            : 'bg-brand-card border-white/8 hover:border-brand-orange-500/25'
                                                            }`}
                                                    >
                                                        <div className={`absolute top-0 left-0 w-full h-[2px] rounded-t-xl ${isSelected ? 'bg-brand-orange-500' : 'bg-red-500/40'}`} />

                                                        {/* room + floor */}
                                                        <div className="flex items-center justify-between">
                                                            <span className={`text-[9px] font-medium uppercase ${isSelected ? 'text-brand-orange-400/70' : 'text-brand-gray-600'}`}>ชั้น {record.floor}</span>
                                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-brand-orange-500 text-brand-bg' : 'bg-brand-orange-500/10 text-brand-orange-400'}`}>
                                                                {record.roomNumber}
                                                            </span>
                                                        </div>

                                                        {/* avatar + name */}
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 ${getAvatarBg(record.tenantName)}`}>
                                                                {initial || <User className="w-3.5 h-3.5" />}
                                                            </div>
                                                            <p className={`font-medium text-xs leading-tight truncate ${isSelected ? 'text-brand-orange-300' : 'text-white'}`}>
                                                                {record.tenantName || 'ไม่มีชื่อ'}
                                                            </p>
                                                        </div>

                                                        {/* footer */}
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-1">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                                                                <span className="text-[9px] font-medium text-red-400">ย้ายออกแล้ว</span>
                                                            </div>
                                                            <span className="text-[9px] text-brand-gray-600">
                                                                {fmtDate(record.movedOutAt)}
                                                            </span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Detail Panel ──────────────────────────────── */}
                    {selectedRecord && (
                        <div className="w-1/2 lg:w-[42%] sticky top-20 animate-in slide-in-from-right-4 fade-in duration-300">
                            <div className="bg-brand-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[calc(100vh-120px)] flex flex-col">

                                {/* header */}
                                <div className="relative px-5 pt-4 pb-3 border-b border-white/8 shrink-0">
                                    <button onClick={() => setSelectedRecord(null)} className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                                        <X className="w-3.5 h-3.5 text-brand-gray-400" />
                                    </button>
                                    <div className="flex items-center gap-3 pr-8">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0 ${getAvatarBg(selectedRecord.tenantName)}`}>
                                            {(selectedRecord.tenantName || '').slice(0, 1).toUpperCase() || <User className="w-6 h-6" />}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-white font-bold text-sm leading-tight truncate">
                                                {selectedRecord.tenantName || 'ไม่มีชื่อ'}
                                            </h4>
                                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap gap-y-1">
                                                <div className="flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                                                    <span className="text-[10px] font-semibold text-red-400 uppercase">ย้ายออกแล้ว</span>
                                                </div>
                                                <span className="bg-brand-orange-500/15 border border-brand-orange-500/25 text-brand-orange-400 px-2 py-0.5 rounded-lg text-[10px] font-semibold">
                                                    ห้อง {selectedRecord.roomNumber}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* scrollable */}
                                <div className="overflow-y-auto custom-scrollbar flex-1">

                                    {/* info rows */}
                                    <div className="px-5 py-3 space-y-0 border-b border-white/8">
                                        {[
                                            { icon: <Home className="w-3.5 h-3.5" />, label: 'ชั้น', value: selectedRecord.floor || '-' },
                                            { icon: <Banknote className="w-3.5 h-3.5" />, label: 'ค่าเช่า/เดือน', value: selectedRecord.rentPrice ? `${selectedRecord.rentPrice.toLocaleString()} บ.` : '-' },
                                            { icon: <CalendarDays className="w-3.5 h-3.5" />, label: 'เข้าพักตั้งแต่', value: fmtDate(selectedRecord.joinedAt) },
                                            { icon: <CalendarDays className="w-3.5 h-3.5" />, label: 'ย้ายออกวันที่', value: fmtDate(selectedRecord.movedOutAt) },
                                            selectedRecord.tenantPhone && { icon: <Phone className="w-3.5 h-3.5" />, label: 'โทรศัพท์', value: <a href={`tel:${selectedRecord.tenantPhone}`} className="hover:text-brand-orange-400 transition-colors">{selectedRecord.tenantPhone}</a> },
                                            selectedRecord.tenantEmail && { icon: <Mail className="w-3.5 h-3.5" />, label: 'อีเมล', value: <span className="text-xs truncate max-w-[55%]">{selectedRecord.tenantEmail}</span> },
                                        ].filter(Boolean).map((row, i) => (
                                            <div key={i} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-brand-gray-600">{row.icon}</span>
                                                    <span className="text-[11px] font-medium text-brand-gray-500 uppercase tracking-wider shrink-0">{row.label}</span>
                                                </div>
                                                <span className="text-white font-semibold text-sm text-right">{row.value}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Duration summary */}
                                    <div className="px-5 py-4">
                                        <p className="text-[10px] font-medium text-brand-gray-600 uppercase tracking-wider mb-2">ระยะเวลาเช่า</p>
                                        <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-center">
                                            {(() => {
                                                const joinDate = selectedRecord.joinedAt?.toDate ? selectedRecord.joinedAt.toDate() : null;
                                                const outDate = selectedRecord.movedOutAt?.toDate ? selectedRecord.movedOutAt.toDate() : null;
                                                if (!joinDate || !outDate) return <p className="text-brand-gray-500 text-sm font-medium">ไม่ทราบ</p>;
                                                const diffMs = outDate - joinDate;
                                                const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                                const months = Math.floor(days / 30);
                                                const remainDays = days % 30;
                                                return (
                                                    <p className="text-white font-bold text-lg">
                                                        {months > 0 && <span>{months} <span className="text-brand-gray-400 text-sm font-medium">เดือน</span> </span>}
                                                        {remainDays} <span className="text-brand-gray-400 text-sm font-medium">วัน</span>
                                                    </p>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
