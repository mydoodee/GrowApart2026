import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import SegmentedSwitcher from './SegmentedSwitcher';
import {
    LogOut, Home, User, Settings, Building,
    X, LayoutGrid, ClipboardList, MessageSquare, Clock, Gauge, FileText, CreditCard, Package
} from 'lucide-react';
export default function Sidebar({ profile, activeAptId, isMenuOpen, setIsMenuOpen, apartments, onAptSwitch }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [requestCount, setRequestCount] = useState(0);
    const [pendingSlipCount, setPendingSlipCount] = useState(0);
    const path = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    const tab = searchParams.get('tab');
    useEffect(() => {
        if (!activeAptId || activeAptId === 'all') {
            setTimeout(() => setRequestCount(prev => prev !== 0 ? 0 : prev), 0);
            return;
        }

        // Listen for pending requests to show badge
        const q = query(
            collection(db, 'requests'),
            where('apartmentId', '==', activeAptId),
            where('status', '==', 'pending')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setRequestCount(snapshot.size);
        });

        // Listen for pending slip verifications to show badge on billing
        const slipQ = query(
            collection(db, 'payments'),
            where('apartmentId', '==', activeAptId),
            where('status', '==', 'waiting_verification')
        );

        const unsubscribeSlips = onSnapshot(slipQ, (snapshot) => {
            setPendingSlipCount(snapshot.size);
        });

        return () => { unsubscribe(); unsubscribeSlips(); };
    }, [activeAptId]);

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/login', { replace: true });
    };

    const navItems = [
        {
            label: 'หน้าแรก',
            icon: <Home className="w-5 h-5 mr-3" />,
            path: '/dashboard',
            active: path === '/dashboard'
        },
        {
            label: 'ตั้งค่า',
            icon: <Settings className="w-5 h-5 mr-3" />,
            path: '/settings',
            active: path === '/settings' && !tab
        },
        {
            label: 'สัญญา',
            icon: <FileText className="w-5 h-5 mr-3" />,
            path: '/contracts',
            active: path === '/contracts'
        },
        {
            label: 'จัดการห้องพัก',
            icon: <LayoutGrid className="w-5 h-5 mr-3" />,
            path: '/rooms',
            active: path === '/rooms'
        },
        {
            label: 'เก็บมิเตอร์',
            icon: <Gauge className="w-5 h-5 mr-3" />,
            path: '/meters',
            active: path === '/meters'
        },
        {
            label: 'ออกบิลรายเดือน',
            icon: <CreditCard className="w-5 h-5 mr-3" />,
            path: '/billing',
            active: path === '/billing',
            badge: pendingSlipCount,
            badgeColor: 'bg-emerald-500'
        }
    ];

    const adminItems = [
        {
            label: 'ผู้เช่า',
            icon: <User className="w-5 h-5 mr-3" />,
            path: '/tenants',
            active: path === '/tenants'
        },
        {
            label: 'ประวัติผู้เช่า',
            icon: <Clock className="w-5 h-5 mr-3" />,
            path: '/tenant-history',
            active: path === '/tenant-history'
        },
        {
            label: 'พนักงาน',
            icon: <User className="w-5 h-5 mr-3" />,
            path: '/settings?tab=staff',
            active: tab === 'staff'
        },
        {
            label: 'คำขอเข้าร่วม',
            icon: <ClipboardList className="w-5 h-5 mr-3" />,
            path: '/settings?tab=requests',
            active: tab === 'requests',
            badge: requestCount
        },
        {
            label: 'แจ้งซ่อม',
            icon: <MessageSquare className="w-5 h-5 mr-3" />,
            path: '/settings?tab=maintenance_tab',
            active: tab === 'maintenance_tab'
        },
        {
            label: 'พัสดุ',
            icon: <Package className="w-5 h-5 mr-3" />,
            path: '/parcels',
            active: path === '/parcels'
        }
    ];

    const isAuthorized = profile?.role === 'owner' || profile?.role === 'manager';

    return (
        <>
            {/* Mobile Backdrop */}
            {isMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] md:hidden transition-opacity duration-300"
                    onClick={() => setIsMenuOpen(false)}
                ></div>
            )}

            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 w-52 bg-brand-card z-[100] transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:flex md:flex-col md:rounded-xl md:shadow-lg overflow-hidden
                ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="h-12 flex flex-shrink-0 items-center justify-between px-4 mt-2 mb-2 md:border-none">
                    <div className="flex items-center h-full gap-2">
                        <img src="/logo.png" alt="Rentara Logo" className="h-8 w-auto object-contain" />
                        <span className="text-white font-bold text-lg tracking-wide">Rentara App</span>
                    </div>
                    <button onClick={() => setIsMenuOpen(false)} className="md:hidden text-white p-2">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-3 py-4 border-b border-white/5">
                    <SegmentedSwitcher
                        apartments={apartments || []}
                        activeId={activeAptId}
                        onSelect={onAptSwitch}
                    />
                </div>

                <nav className="flex-1 px-3 py-2 space-y-0.5">
                    <p className="text-[11px] font-bold text-white/25 tracking-[0.15em] uppercase px-4 pt-2 pb-1.5">Main Menu</p>
                    {navItems.map((item) => (
                        <button
                            key={item.label}
                            onClick={() => { navigate(item.path); setIsMenuOpen(false); }}
                            className={`w-full flex items-center px-3 py-1.5 rounded-lg font-bold transition-all active:scale-95 text-xs ${item.active ? 'bg-brand-orange-500/10 text-brand-orange-500' : 'text-brand-gray-300 hover:bg-white/5 hover:text-white'}`}
                        >
                            <span className="w-5 h-5 flex items-center justify-center mr-2 opacity-80 shrink-0">
                                {item.icon && React.isValidElement(item.icon) ? React.cloneElement(item.icon, { className: 'w-4 h-4' }) : null}
                            </span>
                            {item.label}
                            {item.badge > 0 && (
                                <span className={`ml-auto ${item.badgeColor || 'bg-red-500'} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse`}>
                                    {item.badge}
                                </span>
                            )}
                        </button>
                    ))}

                    {isAuthorized && (
                        <>
                            <p className="text-[11px] font-bold text-white/25 tracking-[0.15em] uppercase px-4 pt-3.5 pb-1.5">ผู้เข้าร่วม</p>
                            {adminItems.map((item) => (
                                <button
                                    key={item.label}
                                    onClick={() => { navigate(item.path); setIsMenuOpen(false); }}
                                    className={`w-full flex items-center px-3 py-1.5 rounded-lg font-bold transition-all active:scale-95 text-xs ${item.active ? 'bg-brand-orange-500/10 text-brand-orange-500' : 'text-brand-gray-300 hover:bg-white/5 hover:text-white'}`}
                                >
                                    <span className="flex items-center">
                                        <span className="w-5 h-5 flex items-center justify-center mr-2 opacity-80 shrink-0">
                                            {item.icon && React.isValidElement(item.icon) ? React.cloneElement(item.icon, { className: 'w-4 h-4' }) : null}
                                        </span>
                                        {item.label}
                                    </span>
                                    {item.badge > 0 && (
                                        <span className="ml-auto bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                            {item.badge}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </>
                    )}
                </nav>

                <div className="p-2.5 border-t border-white/10 md:border-none">
                    <button
                        onClick={handleLogout}
                        className="flex items-center w-full px-3 py-2 text-red-400 bg-red-400/5 hover:bg-red-400/10 rounded-lg font-bold transition-all active:scale-[0.98] group text-xs"
                    >
                        <LogOut className="w-4 h-4 mr-2.5 group-hover:-translate-x-0.5 transition-transform" />
                        ออกจากระบบ
                    </button>
                </div>
            </aside>
        </>
    );
}
