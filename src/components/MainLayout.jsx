import React, { useState } from 'react';
import Sidebar from './Sidebar';
import SegmentedSwitcher from './SegmentedSwitcher';
import ProfileModal from './ProfileModal';
import Toast from './Toast';
import { useToast } from '../hooks/useToast';
import { Menu, Bell, Building, LogOut } from 'lucide-react';
import { auth } from '../firebase';

export default function MainLayout({
    children,
    profile,
    apartments,
    activeAptId,
    onAptSwitch,
    title = "Dashboard"
}) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const { toast, showToast, hideToast } = useToast();

    return (
        <div className="min-h-screen bg-brand-bg text-brand-text flex overflow-hidden lg:p-4 text-xs sm:text-sm">
            <Toast {...toast} onClose={hideToast} />
            <ProfileModal
                isOpen={isProfileModalOpen}
                onClose={() => setIsProfileModalOpen(false)}
                user={auth.currentUser}
                showToast={showToast}
            />
            <Sidebar
                profile={profile}
                activeAptId={activeAptId}
                isMenuOpen={isMenuOpen}
                setIsMenuOpen={setIsMenuOpen}
            />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden relative w-full lg:ml-4">
                {/* Background glow for aesthetic */}
                <div className="fixed top-0 right-0 w-[50%] h-[50%] bg-brand-orange-500/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

                {/* Top Header */}
                <header className="h-12 flex items-center justify-between px-6 lg:px-4 bg-brand-bg/80 backdrop-blur-md z-50 md:rounded-xl md:mt-0 transition-all border-b border-white/5 shrink-0">
                    <div className="flex items-center md:hidden">
                        <button onClick={() => setIsMenuOpen(true)} className="p-2 -ml-2 text-white bg-brand-card/50 rounded-xl mr-4 active:scale-90 transition-transform">
                            <Menu className="w-6 h-6" />
                        </button>
                        <div className="flex items-center">
                            <Building className="w-6 h-6 text-brand-orange-500 mr-2" />
                            <span className="text-xl font-bold text-white tracking-tight">GrowApart</span>
                        </div>
                    </div>

                    <h2 className="text-sm font-bold text-white hidden md:block tracking-tight uppercase">{title}</h2>

                    <div className="flex items-center space-x-6">
                        <SegmentedSwitcher
                            apartments={apartments}
                            activeId={activeAptId}
                            onSelect={onAptSwitch}
                        />
                        <button className="relative text-brand-gray-400 hover:text-white transition-colors">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-0 right-0 w-2 h-2 bg-brand-orange-500 rounded-full border border-brand-gray-900"></span>
                        </button>
                        <button
                            onClick={() => setIsProfileModalOpen(true)}
                            className="flex items-center pl-4 border-l border-white/10 group cursor-pointer active:scale-95 transition-all outline-none"
                        >
                            <div className="w-9 h-9 bg-brand-orange-500 rounded-2xl border-2 border-white/10 flex items-center justify-center text-brand-bg font-black mr-3 shadow-lg shadow-brand-orange-500/20 text-xs overflow-hidden">
                                {auth.currentUser?.photoURL ? (
                                    <img src={auth.currentUser.photoURL} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    profile?.name?.charAt(0) || profile?.displayName?.charAt(0) || 'U'
                                )}
                            </div>
                            <div className="hidden sm:block text-right">
                                <p className="text-xs font-black text-white line-clamp-1 group-hover:text-brand-orange-500 transition-colors uppercase">{profile?.name || profile?.displayName || 'ผู้ใช้'}</p>
                                <p className="text-[10px] text-brand-gray-500 font-bold tracking-widest uppercase">
                                    {profile?.role === 'owner' ? 'Owner' : (profile?.role === 'manager' ? 'Manager' : 'Staff')}
                                </p>
                            </div>
                        </button>
                    </div>
                </header>

                <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
                    {children}
                    {/* Mobile Bottom Padding */}
                    <div className="h-6 md:hidden shrink-0"></div>
                </div>
            </main>
        </div>
    );
}
