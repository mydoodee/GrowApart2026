import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { LayoutGrid, Bell } from 'lucide-react';
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
    const [stats, setStats] = useState({ totalRooms: 0, occupied: 0, maintenance: 0 });

    useEffect(() => {
        if (!user) return;

        // Fetch profile (one-time is fine, but onSnapshot would also work)
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

        // Real-time Stats Listener
        let q;
        if (activeAptId === 'all') {
            q = collection(db, 'rooms');
        } else {
            q = query(collection(db, 'rooms'), where('apartmentId', '==', activeAptId));
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let total = 0, occ = 0, mt = 0;

            if (snapshot.empty && activeAptId !== 'all') {
                // Handle case where rooms aren't in Firestore yet (use config)
                getUserApartments(db, user).then(apps => {
                    const activeApt = apps.find(a => a.id === activeAptId);
                    if (activeApt?.floors) {
                        total = activeApt.floors.reduce((acc, f) => acc + f.roomCount, 0);
                        setStats({ totalRooms: total, occupied: 0, maintenance: 0 });
                    }
                });
            } else if (snapshot.empty && activeAptId === 'all') {
                // All buildings mode but no rooms in Firestore
                getUserApartments(db, user).then(apps => {
                    total = apps.reduce((acc, a) => acc + (a.floors?.reduce((facc, f) => facc + f.roomCount, 0) || 0), 0);
                    setStats({ totalRooms: total, occupied: 0, maintenance: 0 });
                });
            } else {
                snapshot.forEach(d => {
                    const data = d.data();
                    total++;
                    if (data.status === 'ไม่ว่าง' || data.status === 'occupied') occ++;
                    if (data.status === 'แจ้งซ่อม') mt++;
                });
                setStats({ totalRooms: total, occupied: occ, maintenance: mt });
            }
            setLoading(false);
        }, (error) => {
            console.error("Error listening to rooms:", error);
            showToast('เกิดข้อผิดพลาดในการโหลดข้อมูลแบบเรียลไทม์', 'error');
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, activeAptId, showToast]);

    const handleAptSwitch = (id) => {
        localStorage.setItem('activeApartmentId', id);
        setActiveAptId(id);
        showToast('สลับตึกเรียบร้อย');
    };

    const currentApt = apartments.find(a => a.id === activeAptId);

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
                <div className="w-12 h-12 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <MainLayout
            profile={profile}
            apartments={apartments}
            activeAptId={activeAptId}
            onAptSwitch={handleAptSwitch}
            title="Dashboard"
        >
            <Toast {...toast} onClose={hideToast} />

            {/* Dashboard Content */}
            <div className="px-6 lg:px-4 py-3 max-w-7xl mx-auto w-full relative z-10">
                <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-white mb-1">ยินดีต้อนรับกลับมา, <span className="text-brand-orange-500">{profile?.name || 'ผู้จัดการ'}</span></h1>
                        <p className="text-brand-gray-400 font-medium">นี่คือภาพรวมของ <span className="text-white font-bold">{currentApt?.general.name || 'หอพักของคุณ'}</span> ในวันนี้</p>
                    </div>
                    <button
                        onClick={() => navigate('/rooms')}
                        className="bg-brand-card hover:bg-white/5 text-white px-6 py-2.5 rounded-xl font-bold flex items-center border border-white/10 transition-all shadow-md active:scale-95"
                    >
                        <LayoutGrid className="w-5 h-5 mr-3 text-brand-orange-500" />
                        ดูผังห้องพักทั้งหมด
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {/* Stats Cards */}
                    <div className="bg-brand-card rounded-xl p-5 shadow-md relative overflow-hidden group hover:scale-[1.02] transition-all duration-500 cursor-pointer border border-white/10">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-orange-500/10 rounded-bl-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform"></div>
                        <h3 className="text-brand-gray-300 text-xs font-bold tracking-wide mb-2 relative z-10">ห้องพักทั้งหมด</h3>
                        <div className="text-2xl font-bold text-white mb-5 tracking-tighter relative z-10">{stats.totalRooms} <span className="text-sm text-brand-gray-500 uppercase tracking-widest">ห้อง</span></div>
                        <button
                            onClick={() => navigate('/rooms')}
                            className="w-full py-2.5 bg-brand-orange-500/10 text-brand-orange-500 hover:bg-brand-orange-500 hover:text-brand-bg rounded-xl text-xs font-bold transition-all active:scale-[0.97] relative z-10 shadow-lg shadow-brand-orange-500/10"
                        >
                            ดูผังห้องพัก
                        </button>
                    </div>

                    <div className="bg-brand-card rounded-xl p-5 shadow-md relative overflow-hidden group hover:scale-[1.02] transition-all duration-500 cursor-pointer border border-white/10">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-bl-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform"></div>
                        <h3 className="text-brand-gray-300 text-xs font-bold tracking-wide mb-2 relative z-10">การเข้าพัก</h3>
                        <div className="text-2xl font-bold text-white mb-5 tracking-tighter relative z-10">
                            {stats.occupied} <span className="text-sm text-brand-gray-500 uppercase tracking-widest leading-none ml-1">/ {stats.totalRooms}</span>
                        </div>
                        <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden mb-2 relative z-10">
                            <div className="bg-brand-orange-500 h-full transition-all duration-1000 shadow-[0_0_10px_rgba(230,126,34,0.5)]" style={{ width: stats.totalRooms > 0 ? `${(stats.occupied / stats.totalRooms) * 100}%` : '0%' }}></div>
                        </div>
                        <p className="text-xs font-medium text-brand-gray-500 relative z-10">อัตราการเข้าพัก: {stats.totalRooms > 0 ? Math.round((stats.occupied / stats.totalRooms) * 100) : 0}%</p>
                    </div>

                    <div className="bg-brand-card rounded-xl p-5 shadow-md relative overflow-hidden group hover:scale-[1.02] transition-all duration-500 cursor-pointer border border-white/10">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-bl-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform"></div>
                        <h3 className="text-brand-gray-300 text-xs font-bold tracking-wide mb-2 relative z-10">แจ้งซ่อมบำรุง</h3>
                        <div className="text-2xl font-bold text-white mb-5 tracking-tighter flex items-center relative z-10">
                            {stats.maintenance} <span className="text-sm text-brand-gray-500 font-bold ml-2 uppercase tracking-widest">รายการ</span>
                        </div>
                        <button className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all tracking-wide relative z-10">
                            จัดการคำขอซ่อม
                        </button>
                    </div>
                </div>

                {/* Activity Section */}
                <div className="bg-brand-card rounded-xl p-5 shadow-md border border-white/10">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-xl font-bold text-white tracking-tight">กิจกรรมล่าสุด</h3>
                        <span className="text-xs font-bold text-brand-orange-500 uppercase tracking-widest bg-brand-orange-500/10 px-4 py-2 rounded-full">อัปเดตสด</span>
                    </div>
                    <div className="flex flex-col items-center justify-center py-16 text-center bg-brand-bg/40 rounded-xl border border-white/10 shadow-inner">
                        <div className="w-20 h-14 bg-brand-card shadow-lg rounded-xl flex items-center justify-center mb-6 relative overflow-hidden group border border-white/10">
                            <div className="absolute inset-0 bg-gradient-to-br from-brand-orange-500/5 to-transparent"></div>
                            <Bell className="w-8 h-8 text-brand-gray-600 relative z-10 group-hover:rotate-12 transition-transform duration-500" />
                        </div>
                        <p className="text-brand-gray-400 font-extrabold text-lg mb-1 tracking-tight">เงียบเหงาจัง...</p>
                        <p className="text-brand-gray-500 text-sm font-medium">ยังไม่มีกิจกรรมที่น่าสนใจในขณะนี้</p>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
