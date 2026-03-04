import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, query, where, onSnapshot, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import {
    LayoutGrid, Bell, TrendingUp, Users, Wrench,
    PlusCircle, CreditCard, ArrowUpRight,
    Calendar, CheckCircle2, AlertCircle, Clock, Banknote
} from 'lucide-react';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import MainLayout from '../components/MainLayout';
import { getUserApartments } from '../utils/apartmentUtils';

export default function Dashboard({ user }) {
    const navigate = useNavigate();
    const { toast, showToast, hideToast } = useToast();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    const [apartments, setApartments] = useState([]);
    const [activeAptId, setActiveAptId] = useState(localStorage.getItem('activeApartmentId'));
    const [stats, setStats] = useState({
        totalRooms: 0,
        occupied: 0,
        maintenance: 0,
        pendingBills: 0,
        waitingVerification: 0
    });
    const [recentPayments, setRecentPayments] = useState([]);

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    useEffect(() => {
        if (!user) return;

        // Fetch profile
        const profileRef = doc(db, 'users', user.uid);
        getDoc(profileRef).then(snap => {
            if (snap.exists()) setProfile(snap.data());
        });

        // Fetch apartments list
        getUserApartments(db, user).then(setApartments);

        if (!activeAptId) {
            setLoading(false);
            return;
        }

        // Stats and Data Listeners
        let roomsQ, paymentsQ;
        if (activeAptId === 'all') {
            roomsQ = collection(db, 'rooms');
            paymentsQ = query(
                collection(db, 'payments'),
                where('month', '==', monthKey),
                orderBy('updatedAt', 'desc'),
                limit(8)
            );
        } else {
            roomsQ = query(collection(db, 'rooms'), where('apartmentId', '==', activeAptId));
            paymentsQ = query(
                collection(db, 'payments'),
                where('apartmentId', '==', activeAptId),
                where('month', '==', monthKey),
                orderBy('updatedAt', 'desc'),
                limit(8)
            );
        }

        const unsubRooms = onSnapshot(roomsQ, (snapshot) => {
            let total = 0, occ = 0, mt = 0;
            if (!snapshot.empty) {
                snapshot.forEach(d => {
                    const data = d.data();
                    total++;
                    if (data.status === 'ไม่ว่าง' || data.status === 'occupied') occ++;
                    if (data.status === 'แจ้งซ่อม') mt++;
                });
            } else {
                const currentApt = apartments.find(a => a.id === activeAptId);
                if (currentApt?.floors) {
                    total = currentApt.floors.reduce((acc, f) => acc + f.roomCount, 0);
                }
            }
            setStats(prev => ({ ...prev, totalRooms: total, occupied: occ, maintenance: mt }));
            setLoading(false);
        });

        const unsubPayments = onSnapshot(paymentsQ, (snapshot) => {
            const pays = [];
            let pending = 0;
            let waiting = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                pays.push({ id: doc.id, ...data });
                if (data.status === 'pending') pending++;
                if (data.status === 'waiting_verification') waiting++;
            });
            setRecentPayments(pays);
            setStats(prev => ({ ...prev, pendingBills: pending, waitingVerification: waiting }));
        });

        return () => {
            unsubRooms();
            unsubPayments();
        };
    }, [user, activeAptId, apartments, monthKey]);

    const handleAptSwitch = (id) => {
        localStorage.setItem('activeApartmentId', id);
        setActiveAptId(id);
        showToast('สลับตึกเรียบร้อย');
    };

    const currentApt = apartments.find(a => a.id === activeAptId);
    const occupancyRate = stats.totalRooms > 0 ? Math.round((stats.occupied / stats.totalRooms) * 100) : 0;

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg relative">
                <div className="absolute inset-0 bg-brand-orange-500/5 animate-pulse"></div>
                <div className="w-16 h-16 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin shadow-lg relative z-10"></div>
            </div>
        );
    }

    return (
        <MainLayout
            profile={profile}
            apartments={apartments}
            activeAptId={activeAptId}
            onAptSwitch={handleAptSwitch}
            title="Overview"
        >
            <Toast {...toast} onClose={hideToast} />

            <div className="px-4 lg:px-8 py-6 max-w-7xl mx-auto w-full relative z-10 space-y-8">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-extrabold text-white tracking-tight">
                            ยินดีต้อนรับ, <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange-500 to-orange-400">{profile?.name || 'ผู้จัดการ'}</span>
                        </h1>
                        <p className="text-brand-gray-400 font-medium flex items-center">
                            <Calendar className="w-4 h-4 mr-2 text-brand-orange-500/60" />
                            ภาพรวมของ <span className="text-white font-bold mx-1">{currentApt?.general?.name || 'หอพักของคุณ'}</span> ประจำวันที่ {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                </div>

                {/* Primary Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {/* Capacity */}
                    <div className="group bg-brand-card p-6 rounded-2xl border border-white/5 shadow-xl hover:border-brand-orange-500/30 transition-all duration-300 relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-brand-orange-500/5 rounded-full blur-2xl group-hover:bg-brand-orange-500/10 transition-colors"></div>
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-brand-orange-500/10 rounded-xl text-brand-orange-500">
                                <LayoutGrid size={24} />
                            </div>
                            <span className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest border border-white/5 px-2 py-1 rounded-md">Capacity</span>
                        </div>
                        <div className="space-y-1">
                            <div className="text-3xl font-bold text-white tracking-tighter">{stats.totalRooms}</div>
                            <div className="text-brand-gray-500 text-xs font-bold uppercase tracking-wide">ห้องพักทั้งหมด</div>
                        </div>
                    </div>

                    {/* Occupancy */}
                    <div className="group bg-brand-card p-6 rounded-2xl border border-white/5 shadow-xl hover:border-blue-500/30 transition-all duration-300 relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors"></div>
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                                <Users size={24} />
                            </div>
                            <div className="flex items-center text-emerald-500 text-[10px] font-bold">
                                <TrendingUp size={12} className="mr-1" />
                                {occupancyRate}%
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-3xl font-bold text-white tracking-tighter">{stats.occupied}</div>
                            <div className="text-brand-gray-500 text-xs font-bold uppercase tracking-wide">เข้าพักแล้ว</div>
                        </div>
                        <div className="mt-4 w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                style={{ width: `${occupancyRate}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Pending Verification */}
                    <div className="group bg-brand-card p-6 rounded-2xl border border-white/5 shadow-xl hover:border-yellow-500/30 transition-all duration-300 relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-yellow-500/5 rounded-full blur-2xl group-hover:bg-yellow-500/10 transition-colors"></div>
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-yellow-500/10 rounded-xl text-yellow-500">
                                <Clock size={24} />
                            </div>
                            {stats.waitingVerification > 0 && (
                                <span className="bg-yellow-500 text-brand-bg text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">Wait Slip</span>
                            )}
                        </div>
                        <div className="space-y-1">
                            <div className="text-3xl font-bold text-white tracking-tighter">{stats.waitingVerification}</div>
                            <div className="text-brand-gray-500 text-xs font-bold uppercase tracking-wide">รอตรวจสอบสลิป</div>
                        </div>
                    </div>

                    {/* Pending Bills */}
                    <div className="group bg-brand-card p-6 rounded-2xl border border-white/5 shadow-xl hover:border-red-500/30 transition-all duration-300 relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-colors"></div>
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-red-500/10 rounded-xl text-red-500">
                                <Banknote size={24} />
                            </div>
                            <span className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest border border-white/5 px-2 py-1 rounded-md">Unpaid</span>
                        </div>
                        <div className="space-y-1">
                            <div className="text-3xl font-bold text-white tracking-tighter">{stats.pendingBills}</div>
                            <div className="text-brand-gray-500 text-xs font-bold uppercase tracking-wide">บิลค้างชำระ</div>
                        </div>
                    </div>
                </div>

                {/* Main Content Sections */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Billing Status */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-brand-card rounded-2xl border border-white/5 shadow-xl overflow-hidden">
                            <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
                                <h3 className="text-lg font-bold text-white tracking-tight flex items-center">
                                    <Banknote className="w-5 h-5 mr-3 text-brand-orange-500" />
                                    สถานะการเรียกเก็บบิลล่าสุด
                                </h3>
                                <button onClick={() => navigate('/billing')} className="text-[10px] font-bold text-brand-orange-500 uppercase tracking-widest hover:underline transition-all">ดูบิลทั้งหมด</button>
                            </div>
                            <div className="divide-y divide-white/5">
                                {recentPayments.length > 0 ? (
                                    recentPayments.map((pay) => (
                                        <div key={pay.id} className="p-4 hover:bg-white/5 transition-colors group cursor-pointer" onClick={() => navigate('/billing')}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs mr-4 border ${pay.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                            pay.status === 'waiting_verification' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                                                                'bg-red-500/10 text-red-500 border-red-500/20'
                                                        }`}>
                                                        {pay.roomNumber}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold text-white">{pay.tenantName || 'ไม่ระบุชื่อ'}</div>
                                                        <div className="text-[10px] text-brand-gray-500 font-medium">ยอดชำระ: {pay.amount?.toLocaleString()} บาท</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${pay.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                            pay.status === 'waiting_verification' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                                                                'bg-red-500/10 text-red-500 border-red-500/20'
                                                        }`}>
                                                        {pay.status === 'paid' ? 'ชำระแล้ว' : pay.status === 'waiting_verification' ? 'รอสืบค้น' : 'ค้างชำระ'}
                                                    </span>
                                                    <ArrowUpRight size={18} className="text-brand-gray-500 group-hover:text-brand-orange-500 transition-colors" />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
                                        <AlertCircle className="w-12 h-12 text-brand-gray-600 mb-4" />
                                        <p className="text-brand-gray-400 font-bold mb-1">ยังไม่มีการออกบิลในเดือนนี้</p>
                                        <p className="text-brand-gray-500 text-xs">คุณสามารถเริ่มออกบิลได้ที่เมนู "ออกบิลรายเดือน"</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Visual Revenue Overview Placeholder */}
                        <div className="bg-brand-card rounded-2xl border border-white/5 shadow-xl p-6 relative group overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-brand-orange-500/[0.02] to-transparent"></div>
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-lg font-bold text-white tracking-tight flex items-center">
                                    <TrendingUp className="w-5 h-5 mr-3 text-brand-orange-500" />
                                    แนวโน้มรายรับ (6 เดือนล่าสุด)
                                </h3>
                                <div className="p-1 px-3 bg-white/5 rounded-lg border border-white/5 flex items-center gap-4 text-[10px] font-bold text-brand-gray-400">
                                    <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-brand-orange-500 mr-2"></div>รายรับ</div>
                                    <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-brand-gray-600 mr-2"></div>เฉลี่ย</div>
                                </div>
                            </div>

                            {/* Stylized Bar Chart */}
                            <div className="flex items-end justify-between h-32 gap-3 mb-4">
                                {[35, 65, 45, 85, 55, 75].map((h, i) => (
                                    <div key={i} className="flex-1 space-y-2 group/bar">
                                        <div
                                            className="w-full bg-brand-orange-500/20 group-hover/bar:bg-brand-orange-500/40 rounded-t-lg transition-all duration-700 relative overflow-hidden"
                                            style={{ height: `${h}%` }}
                                        >
                                            <div className="absolute top-0 left-0 right-0 h-1 bg-brand-orange-500 shadow-[0_0_10px_rgba(230,126,34,0.5)]"></div>
                                        </div>
                                        <div className="text-center text-[9px] font-bold text-brand-gray-500 tracking-tighter">{['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.'][i]}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="text-[10px] text-brand-gray-500 text-center font-medium opacity-60">* ข้อมูลตัวอย่างเพื่อการแสดงผล</div>
                        </div>
                    </div>

                    {/* Right Column: Quick Actions & Financial Snap */}
                    <div className="space-y-6">
                        {/* Quick Actions Card */}
                        <div className="bg-brand-orange-500 rounded-2xl shadow-2xl p-6 relative overflow-hidden group">
                            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700"></div>
                            <h3 className="text-brand-bg font-extrabold text-lg mb-6 relative z-10 flex items-center">
                                <PlusCircle className="w-5 h-5 mr-3" />
                                ดำเนินการด่วน
                            </h3>
                            <div className="grid grid-cols-2 gap-3 relative z-10">
                                <button
                                    onClick={() => navigate('/billing')}
                                    className="aspect-square bg-brand-bg/90 hover:bg-brand-bg text-white rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-lg group/btn"
                                >
                                    <CreditCard className="w-6 h-6 mb-2 text-brand-orange-500 group-hover/btn:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold uppercase tracking-tight">ออกบิล</span>
                                </button>
                                <button
                                    onClick={() => navigate('/meters')}
                                    className="aspect-square bg-brand-bg/90 hover:bg-brand-bg text-white rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-lg group/btn"
                                >
                                    <Clock className="w-6 h-6 mb-2 text-brand-orange-500 group-hover/btn:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold uppercase tracking-tight">จดมิเตอร์</span>
                                </button>
                                <button
                                    onClick={() => navigate('/tenants')}
                                    className="aspect-square bg-brand-bg/90 hover:bg-brand-bg text-white rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-lg group/btn"
                                >
                                    <Users className="w-6 h-6 mb-2 text-brand-orange-500 group-hover/btn:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold uppercase tracking-tight">คัดกรอง</span>
                                </button>
                                <button
                                    onClick={() => navigate('/settings')}
                                    className="aspect-square bg-brand-bg/90 hover:bg-brand-bg text-white rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-lg group/btn"
                                >
                                    <LayoutGrid className="w-6 h-6 mb-2 text-brand-orange-500 group-hover/btn:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold uppercase tracking-tight">ตั้งค่า</span>
                                </button>
                            </div>
                        </div>

                        {/* System Stats Hidden */}
                        <div className="bg-brand-card rounded-2xl border border-white/5 shadow-xl p-6">
                            <h3 className="text-[10px] font-black text-brand-gray-500 uppercase tracking-[0.2em] mb-4">
                                System Overview
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white/40">Maintenance</span>
                                    <span className="text-xs font-black text-white">{stats.maintenance} <span className="text-[9px] text-white/20 ml-1">UNITS</span></span>
                                </div>
                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-red-500" style={{ width: `${(stats.maintenance / stats.totalRooms) * 100}%` }}></div>
                                </div>
                            </div>
                            <div className="mt-6 pt-5 border-t border-white/5">
                                <p className="text-[10px] text-brand-gray-600 font-bold leading-relaxed">
                                    Your property system is currently healthy. All services are operational.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
