import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage2 } from '../firebase';
import {
    LogOut, Home, MessageSquare, CreditCard, User,
    Bell, Settings, LayoutGrid, ChevronRight, CheckCircle2,
    Clock, AlertCircle, MapPin, Building, Wallet, CircleUser, ArrowUpRight, Activity, Zap, Droplets,
    Wind, Tv, Wifi, Bed, Shirt, Thermometer, Snowflake, Refrigerator, Fan, Box, Camera, Key, ShieldCheck, X
} from 'lucide-react';
import Toast, { useToast } from '../components/Toast';
import ProfileModal from '../components/ProfileModal';

export default function TenantDashboard({ user }) {
    const navigate = useNavigate();
    const { toast, showToast, hideToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [myRooms, setMyRooms] = useState([]);
    const [hasPendingRequest, setHasPendingRequest] = useState(false);
    const [activeTab, setActiveTab] = useState('bills');
    const [apartmentDetails, setApartmentDetails] = useState({});
    const [maintenanceRequests, setMaintenanceRequests] = useState([]);
    const [maintenanceForm, setMaintenanceForm] = useState({
        title: '',
        priority: 'ปกติ',
        description: ''
    });
    const [submitting, setSubmitting] = useState(false);

    // Profile Edit State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const AmenityIcons = {
        'เครื่องปรับอากาศ': <Snowflake size={18} />,
        'พัดลม': <Fan size={18} />,
        'เตียงนอน': <Bed size={18} />,
        'ตู้เสื้อผ้า': <Shirt size={18} />,
        'เครื่องทำน้ำอุ่น': <Thermometer size={18} />,
        'ตู้เย็น': <Refrigerator size={18} />,
        'โทรทัศน์': <Tv size={18} />,
        'โต๊ะเครื่องแป้ง': <User size={18} />,
        'WiFi': <Wifi size={18} />
    };

    const getTimeGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'สวัสดียามเช้า';
        if (hour < 17) return 'สวัสดียามบ่าย';
        if (hour < 20) return 'สวัสดียามเย็น';
        return 'สวัสดียามค่ำคืน';
    };

    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }

        // 1. Listen for rooms where this user is the tenant
        const roomsQ = query(collection(db, 'rooms'), where('tenantId', '==', user.uid));
        const unsubscribeRooms = onSnapshot(roomsQ, async (snap) => {
            const roomsData = [];
            const aptIds = new Set();

            snap.forEach(d => {
                const data = { id: d.id, ...d.data() };
                roomsData.push(data);
                if (data.apartmentId) aptIds.add(data.apartmentId);
            });

            setMyRooms(roomsData);

            if (roomsData.length > 0) {
                // Fetch apartment details if they exist
                const aptInfo = { ...apartmentDetails };
                for (const id of aptIds) {
                    if (!aptInfo[id]) {
                        const aptRef = doc(db, 'apartments', id);
                        const aptSnap = await getDoc(aptRef);
                        if (aptSnap.exists()) {
                            aptInfo[id] = aptSnap.data();
                        }
                    }
                }
                setApartmentDetails(aptInfo);
                setHasPendingRequest(false); // If has rooms, no need to show pending
            } else {
                // If no rooms, start listening for pending requests
                setupRequestSubscriber();
            }
            setLoading(false);
        }, (error) => {
            console.error("Error listening to rooms", error);
            setLoading(false);
        });

        // 2. Listen for pending requests if no rooms are found
        let unsubscribeRequests = null;
        const setupRequestSubscriber = () => {
            if (unsubscribeRequests) return;

            const reqQ = query(
                collection(db, 'requests'),
                where('userId', '==', user.uid),
                where('status', '==', 'pending')
            );

            unsubscribeRequests = onSnapshot(reqQ, (snap) => {
                setHasPendingRequest(!snap.empty);
            }, (error) => {
                console.warn("Error listening to requests", error);
            });
        };
        setupRequestSubscriber();

        // 3. Listen for maintenance requests
        let unsubscribeMaintenance = null;
        if (user?.uid) {
            const maintQ = query(
                collection(db, 'maintenance'),
                where('tenantId', '==', user.uid),
                where('apartmentId', 'in', Array.from(new Set(myRooms.map(r => r.apartmentId))).length > 0 ? Array.from(new Set(myRooms.map(r => r.apartmentId))) : ['placeholder'])
            );

            // Note: 'in' query with empty array will error, so we only subscribe if we have apartment IDs
            // or we use a different approach. Better: subscribe to all user's maintenance regardless of apartment if they are tenants.
            const maintQSimple = query(
                collection(db, 'maintenance'),
                where('tenantId', '==', user.uid)
            );

            unsubscribeMaintenance = onSnapshot(maintQSimple, (snap) => {
                const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
                setMaintenanceRequests(requests);
            }, (error) => {
                if (error.code !== 'permission-denied') {
                    console.error("Error listening to maintenance", error);
                }
            });
        }

        return () => {
            if (unsubscribeRooms) unsubscribeRooms();
            if (unsubscribeRequests) unsubscribeRequests();
            if (unsubscribeMaintenance) unsubscribeMaintenance();
        };
    }, [user]);

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/tenant-login', { replace: true });
    };

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
                <div className="w-12 h-12 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const NavItems = [
        { id: 'bills', icon: <Wallet className="w-5 h-5" />, label: 'บิลค่าเช่า' },
        { id: 'dashboard', icon: <Building className="w-5 h-5" />, label: 'ห้องเช่า' },
        { id: 'maintenance', icon: <Activity className="w-5 h-5" />, label: 'แจ้งซ่อม' },
        { id: 'profile', icon: <CircleUser className="w-5 h-5" />, label: 'โปรไฟล์' },
    ];

    const primaryApt = myRooms.length > 0 ? apartmentDetails[myRooms[0].apartmentId] : null;

    return (
        <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col relative pb-24 lg:pb-0 overflow-x-hidden">
            <Toast {...toast} onClose={hideToast} />
            <ProfileModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                user={user}
                showToast={showToast}
            />

            {/* Background Glows */}
            <div className="fixed top-[-10%] right-[-10%] w-[80%] h-[50%] bg-brand-orange-500/10 rounded-full blur-[120px] pointer-events-none z-0"></div>
            <div className="fixed bottom-[-10%] left-[-10%] w-[60%] h-[40%] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none z-0"></div>

            {/* Sticky Mobile Header */}
            <header className="sticky top-0 z-[60] bg-brand-bg/60 backdrop-blur-xl border-b border-white/5 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-bg rounded-xl border border-white/10 flex items-center justify-center text-brand-orange-500 shadow-md overflow-hidden">
                        {primaryApt?.general?.logoURL ? (
                            <img src={primaryApt.general.logoURL} alt={primaryApt.general.name} className="w-full h-full object-cover" />
                        ) : (
                            <Building className="w-5 h-5" />
                        )}
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white tracking-tight leading-none italic uppercase">
                            {primaryApt?.general?.name || 'GrowApart'}
                        </h2>
                        <p className="text-[10px] font-bold text-brand-gray-500 tracking-[0.2em] uppercase mt-1">
                            {primaryApt?.general?.name ? 'OFFICIAL TENANT' : 'Management'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button className="relative w-10 h-10 flex items-center justify-center bg-brand-card rounded-xl border border-white/10 text-brand-gray-400">
                        <Bell className="w-5 h-5" />
                        <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-brand-bg"></span>
                    </button>
                    {activeTab === 'profile' && (
                        <button onClick={handleLogout} className="w-10 h-10 flex items-center justify-center bg-red-500/10 rounded-xl border border-red-500/10 text-red-500">
                            <LogOut className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-1 w-full max-w-lg mx-auto px-5 pt-6 relative z-10 transition-all">
                {activeTab === 'dashboard' && (
                    <div className="space-y-4 pb-10 animate-in fade-in slide-in-from-bottom-5 duration-700">

                        {myRooms.length === 0 ? (
                            <div className="bg-brand-card/50 p-8 rounded-2xl text-center border border-white/5 backdrop-blur-sm relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-orange-500/5 rounded-bl-[4rem] group-hover:scale-110 transition-transform duration-700"></div>
                                <div className="w-16 h-16 bg-brand-orange-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-brand-orange-500">
                                    {hasPendingRequest ? <Clock className="w-8 h-8 animate-pulse" /> : <AlertCircle className="w-8 h-8" />}
                                </div>
                                <h2 className="text-white font-bold text-xl mb-2">
                                    {hasPendingRequest ? 'กำลังรอดำเนินการ' : 'ไม่พบข้อมูลห้องพัก'}
                                </h2>
                                <p className="text-brand-gray-500 text-xs font-bold leading-relaxed max-w-[240px] mx-auto">
                                    {hasPendingRequest
                                        ? 'คำขอร่วมหอพักของคุณส่งไปแล้ว กรุณารอเจ้าของหอพักตรวจสอบข้อมลูครับ'
                                        : 'อีเมลของคุณยังไม่ได้ถูกผูกเข้ากับห้องพักใดๆ กรุณาติดต่อเจ้าหน้าที่หอพักครับ'}
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Premium Total Bill Card */}
                                {myRooms.map(room => {
                                    const apt = apartmentDetails[room.apartmentId];
                                    const rentPrice = room.price || room.rentAmount || apt?.utilityRates?.baseRent || 0;
                                    const totalEstimated = rentPrice + (room.fixedExpenses?.filter(e => e.active).reduce((sum, e) => sum + e.amount, 0) || 0);

                                    return (
                                        <div key={room.id} className="space-y-4">
                                            {/* Summary Card */}
                                            <div className="bg-gradient-to-br from-brand-orange-500 to-orange-600 rounded-2xl p-6 shadow-2xl shadow-brand-orange-500/30 relative overflow-hidden group active:scale-[0.98] transition-all">
                                                <div className="absolute top-[-20%] right-[-10%] w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
                                                <div className="absolute bottom-[-20%] left-[-10%] w-48 h-48 bg-black/10 rounded-full blur-3xl"></div>

                                                <div className="flex items-center justify-between mb-6 relative z-10">
                                                    <div className="flex flex-col">
                                                        <p className="text-[10px] font-black text-brand-bg/60 uppercase tracking-widest leading-none mb-1">{apt?.general?.name || 'Apartment'}</p>
                                                        <h4 className="text-xl font-black text-brand-bg italic uppercase tracking-tighter leading-none">Room {room.roomNumber}</h4>
                                                    </div>
                                                    <div className="bg-brand-bg/20 backdrop-blur-md w-10 h-10 rounded-xl flex items-center justify-center border border-white/10">
                                                        <Wallet className="w-5 h-5 text-brand-bg" />
                                                    </div>
                                                </div>

                                                <div className="relative z-10 mb-6">
                                                    <p className="text-[10px] font-black text-brand-bg/50 uppercase tracking-widest mb-1">ยอดประมาณการเดือนนี้</p>
                                                    <div className="flex items-baseline gap-2">
                                                        <h2 className="text-4xl font-black text-brand-bg tracking-tighter transition-all">
                                                            {totalEstimated.toLocaleString()}
                                                        </h2>
                                                        <span className="text-sm font-black text-brand-bg/60 uppercase tracking-widest italic">THB</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between pt-6 border-t border-white/10 relative z-10">
                                                    <div className="flex -space-x-2">
                                                        <div className="w-8 h-8 rounded-full border-2 border-brand-orange-500 bg-brand-bg flex items-center justify-center overflow-hidden">
                                                            <Activity className="w-4 h-4 text-brand-orange-500" />
                                                        </div>
                                                        <div className="w-8 h-8 rounded-full border-2 border-brand-orange-500 bg-brand-bg flex items-center justify-center overflow-hidden">
                                                            <MessageSquare className="w-4 h-4 text-brand-orange-500" />
                                                        </div>
                                                    </div>
                                                    <button onClick={() => setActiveTab('bills')} className="bg-brand-bg text-brand-orange-500 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-90 transition-all">
                                                        ชำระเงิน
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Detailed Info Cards */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-brand-card/50 p-5 rounded-2xl border border-white/5 backdrop-blur-md">
                                                    <div className="w-10 h-10 bg-yellow-500/10 rounded-2xl flex items-center justify-center text-yellow-500 mb-4">
                                                        <Zap size={20} />
                                                    </div>
                                                    <p className="text-[10px] font-black text-brand-gray-500 uppercase tracking-widest mb-1">ค่าไฟฟ้า</p>
                                                    <p className="text-lg font-black text-white">{apt?.utilityRates?.electricity || 0} <span className="text-[10px]">บ./หน่วย</span></p>
                                                </div>
                                                <div className="bg-brand-card/50 p-5 rounded-2xl border border-white/5 backdrop-blur-md">
                                                    <div className="w-10 h-10 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 mb-4">
                                                        <Droplets size={20} />
                                                    </div>
                                                    <p className="text-[10px] font-black text-brand-gray-500 uppercase tracking-widest mb-1">ค่าน้ำมินิ</p>
                                                    <p className="text-lg font-black text-white">{apt?.utilityRates?.water || 0} <span className="text-[10px]">บ./หน่วย</span></p>
                                                </div>
                                            </div>


                                            {/* Room Amenities Section */}
                                            {(room.amenities && room.amenities.some(a => a.status)) && (
                                                <div className="space-y-4">
                                                    <h3 className="text-[10px] font-black text-brand-gray-500 uppercase tracking-[0.2em] ml-2">สิ่งอำนวยความสะดวกในห้อง</h3>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {room.amenities.filter(a => a.status).map((amenity, idx) => (
                                                            <div key={idx} className="bg-brand-card/20 p-4 rounded-2xl border border-white/5 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                                                                <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-brand-orange-400">
                                                                    {AmenityIcons[amenity.name] || <CheckCircle2 size={18} />}
                                                                </div>
                                                                <p className="text-[11px] font-bold text-white/90">{amenity.name}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Fixed Services */}
                                            <div className="space-y-3">
                                                <h3 className="text-[10px] font-black text-brand-gray-500 uppercase tracking-[0.2em] ml-2">ค่าบริการคงที่</h3>
                                                <div className="space-y-2">
                                                    <div className="bg-brand-card/30 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 bg-white/5 rounded-xl flex items-center justify-center text-brand-gray-400">
                                                                <Building size={16} />
                                                            </div>
                                                            <p className="text-xs font-bold text-white">ค่าเช่าห้องพัก</p>
                                                        </div>
                                                        <p className="text-sm font-black text-white">{(room.price || room.rentAmount || apt?.utilityRates?.baseRent || 0).toLocaleString()} <span className="text-[10px] text-brand-gray-400 opacity-50">฿</span></p>
                                                    </div>
                                                    {room.fixedExpenses?.filter(e => e.active).map((expense, idx) => (
                                                        <div key={idx} className="bg-brand-card/30 p-4 rounded-2xl border border-white/5 flex items-center justify-between animate-in fade-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${idx * 100}ms` }}>
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 bg-white/5 rounded-xl flex items-center justify-center text-brand-gray-400">
                                                                    <Activity size={16} />
                                                                </div>
                                                                <p className="text-xs font-bold text-white">{expense.name}</p>
                                                            </div>
                                                            <p className="text-sm font-black text-white">{expense.amount.toLocaleString()} <span className="text-[10px] text-brand-gray-400 opacity-50">฿</span></p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'bills' && (
                    <div className="space-y-6 pb-10 animate-in fade-in slide-in-from-bottom-5 duration-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-black text-white leading-tight">บิลค่าเช่า</h1>
                                <p className="text-brand-gray-500 font-bold text-[10px] uppercase tracking-widest mt-1">Billing & Payment history</p>
                            </div>
                            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
                                <Wallet size={24} />
                            </div>
                        </div>

                        <div className="bg-brand-card/50 p-10 rounded-2xl text-center border border-white/5 backdrop-blur-md relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-[4rem] group-hover:scale-110 transition-transform duration-700"></div>
                            <div className="w-20 h-20 bg-emerald-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 text-emerald-500/30">
                                <Activity className="w-10 h-10" />
                            </div>
                            <p className="text-white font-black text-xl mb-2 italic">ยังไม่มีใบแจ้งหนี้</p>
                            <p className="text-brand-gray-500 text-xs font-bold leading-relaxed max-w-[240px] mx-auto">ยอดหนี้ของคุณจะปรากฏที่นี่ เมื่อเจ้าของหอพักสรุปยอดบิลประจำเดือนให้ครับ</p>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-brand-gray-500 uppercase tracking-[0.2em] ml-2">ประวัติย้อนหลัง</h3>
                            <div className="bg-brand-card/20 p-8 rounded-2xl border border-dashed border-white/5 text-center">
                                <p className="text-[10px] font-bold text-brand-gray-600 uppercase tracking-widest">No history record</p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'maintenance' && (
                    <div className="space-y-6 pb-10 animate-in fade-in slide-in-from-bottom-5 duration-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-black text-white leading-tight">แจ้งซ่อมบำรุง</h1>
                                <p className="text-brand-gray-500 font-bold text-[10px] uppercase tracking-widest mt-1">Maintenance Request System</p>
                            </div>
                            <div className="w-12 h-12 bg-brand-orange-500/10 rounded-2xl flex items-center justify-center text-brand-orange-500">
                                <Activity size={24} />
                            </div>
                        </div>

                        <div className="bg-brand-card/80 p-8 rounded-2xl border border-white/10 shadow-xl backdrop-blur-md">
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-brand-orange-500 uppercase tracking-widest ml-4">หัวข้อเรื่อง</label>
                                    <input
                                        type="text"
                                        value={maintenanceForm.title}
                                        onChange={(e) => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })}
                                        placeholder="เช่น ก๊อกน้ำรั่ว, ไฟดับ..."
                                        className="w-full bg-brand-bg rounded-2xl px-6 py-4 border border-white/10 outline-none font-bold text-white placeholder:text-white/10 focus:border-brand-orange-500/50 transition-all text-sm"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-brand-orange-500 uppercase tracking-widest ml-4">ระดับความสำคัญ</label>
                                    <div className="flex gap-2">
                                        {['ปกติ', 'ด่วน', 'ฉุกเฉิน'].map(v => (
                                            <button
                                                key={v}
                                                onClick={() => setMaintenanceForm({ ...maintenanceForm, priority: v })}
                                                className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${maintenanceForm.priority === v ? 'bg-brand-orange-500 text-brand-bg border-brand-orange-500 shadow-lg shadow-brand-orange-500/20' : 'bg-brand-bg/50 text-brand-gray-400 border-white/5 hover:border-white/10'}`}
                                            >
                                                {v}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-brand-orange-500 uppercase tracking-widest ml-4">รายละเอียด</label>
                                    <textarea
                                        rows="3"
                                        value={maintenanceForm.description}
                                        onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })}
                                        placeholder="อธิบายปัญหาที่คุณพบ..."
                                        className="w-full bg-brand-bg rounded-2xl px-6 py-5 border border-white/10 outline-none font-bold text-white placeholder:text-white/10 resize-none focus:border-brand-orange-500/50 transition-all text-sm"
                                    ></textarea>
                                </div>
                                <button
                                    onClick={handleSubmitMaintenance}
                                    disabled={submitting}
                                    className="w-full py-5 bg-gradient-to-r from-brand-orange-500 to-orange-400 text-brand-bg rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-brand-orange-500/20 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {submitting ? 'Sending Request...' : 'ยืนยันการแจ้งเรื่อง'}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-brand-gray-500 uppercase tracking-[0.2em] ml-2">ประวัติรายการ</h3>
                            <div className="space-y-3 min-h-[200px]">
                                {maintenanceRequests.length === 0 ? (
                                    <div className="bg-brand-card/30 border border-dashed border-white/5 rounded-2xl p-10 text-center">
                                        <p className="text-brand-gray-600 font-bold text-xs">ไม่มีประวัติรายการ</p>
                                    </div>
                                ) : (
                                    maintenanceRequests.map((req, idx) => (
                                        <div key={req.id} className="bg-brand-card/50 p-5 rounded-2xl border border-white/10 relative overflow-hidden group animate-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${idx * 100}ms` }}>
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h4 className="text-sm font-black text-white italic">{req.title}</h4>
                                                    <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest mt-1">
                                                        {req.createdAt?.toDate ? req.createdAt.toDate().toLocaleDateString('th-TH') : 'Just now'}
                                                    </p>
                                                </div>
                                                <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-tighter border ${req.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/10' :
                                                    req.status === 'in-progress' ? 'bg-blue-500/10 text-blue-500 border-blue-500/10' :
                                                        'bg-emerald-500/10 text-emerald-500 border-emerald-500/10'
                                                    }`}>
                                                    {req.status === 'pending' ? 'Pending' : req.status === 'in-progress' ? 'Repairing' : 'Completed'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-brand-gray-400 font-medium leading-relaxed mb-4 line-clamp-2">{req.description}</p>
                                            <div className="bg-brand-bg/50 px-3 py-2 rounded-xl flex items-center justify-between border border-white/5">
                                                <span className={`text-[9px] font-black uppercase ${req.priority === 'ปกติ' ? 'text-brand-gray-500' : req.priority === 'ด่วน' ? 'text-orange-400' : 'text-red-500'}`}>
                                                    Priority: {req.priority}
                                                </span>
                                                <ArrowUpRight size={14} className="text-brand-gray-700" />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div className="space-y-8 pb-10 animate-in fade-in slide-in-from-bottom-5 duration-700">
                        <div className="text-center pt-8">
                            <div className="w-28 h-28 bg-brand-card rounded-2xl border-2 border-brand-orange-500/20 p-1 mx-auto mb-6 relative">
                                <div className="w-full h-full bg-brand-bg rounded-[1.5rem] flex items-center justify-center text-white font-black text-4xl overflow-hidden shadow-2xl uppercase">
                                    {user?.photoURL ? <img src={user.photoURL} alt="" /> : (user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U')}
                                </div>
                                <div className="absolute bottom-2 right-2 w-8 h-8 bg-emerald-500 rounded-full border-4 border-brand-bg flex items-center justify-center">
                                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                                </div>
                            </div>
                            <h2 className="text-2xl font-black text-white italic">{user?.displayName || user?.email?.split('@')[0] || 'User'}</h2>
                            <p className="text-xs font-bold text-brand-orange-500 uppercase tracking-[0.3em] mt-2 mb-4">Official Tenant</p>
                            <div className="inline-flex items-center gap-2 bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                <span className="text-[10px] font-bold text-brand-gray-400 uppercase tracking-widest">{user?.email}</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-brand-gray-500 uppercase tracking-[0.2em] ml-4">Account Settings</h3>
                            <div className="bg-brand-card/50 rounded-[1.5rem] border border-white/10 overflow-hidden divide-y divide-white/5">
                                <button
                                    onClick={() => setIsEditModalOpen(true)}
                                    className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-brand-gray-500 group-hover:text-brand-orange-500 transition-colors">
                                            <User size={18} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-bold text-white">จัดการโปรไฟล์และความปลอดภัย</p>
                                            <p className="text-[10px] font-bold text-brand-gray-600 uppercase tracking-tighter">รูปโปรไฟล์ ชื่อ และรหัสผ่าน</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-brand-gray-700" />
                                </button>
                            </div>
                        </div>


                        <div className="pt-4">
                            <button onClick={handleLogout} className="w-full flex items-center justify-center gap-3 p-5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-[1.5rem] border border-red-500/10 transition-all font-black uppercase tracking-widest text-xs italic">
                                <LogOut size={18} /> Logout Session
                            </button>
                            <p className="text-center text-[9px] font-black text-brand-gray-700 uppercase tracking-widest mt-6 italic">GrowApart v1.0.2 Mobile UI</p>
                        </div>
                    </div>
                )}
            </main>

            {/* Bottom Navigation Navbar */}
            <nav className="fixed bottom-0 left-0 right-0 z-[100] px-6 pb-8 pt-4 lg:hidden">
                <div className="bg-brand-bg/80 backdrop-blur-2xl border border-white/10 rounded-2xl px-5 py-3 shadow-2xl shadow-black/40 flex items-center justify-between">
                    {NavItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`flex flex-col items-center gap-1.5 p-2 transition-all relative ${activeTab === item.id ? 'text-brand-orange-500' : 'text-brand-gray-600 hover:text-brand-gray-300'
                                }`}
                        >
                            <div className={`p-2 rounded-2xl transition-all ${activeTab === item.id ? 'bg-brand-orange-500/20 shadow-lg shadow-brand-orange-500/10 scale-110' : ''
                                }`}>
                                {item.icon}
                            </div>
                            <span className={`text-[8px] font-black uppercase tracking-widest ${activeTab === item.id ? 'opacity-100' : 'opacity-40'}`}>
                                {item.label}
                            </span>
                            {activeTab === item.id && (
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-brand-orange-500 rounded-full shadow-glow"></div>
                            )}
                        </button>
                    ))}
                </div>
            </nav>

            {/* Edit Profile Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-5 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-brand-bg/80 backdrop-blur-md" onClick={() => !submitting && setIsEditModalOpen(false)}></div>
                    <div className="bg-brand-card w-full max-w-lg rounded-t-2xl sm:rounded-2xl border-t sm:border border-white/10 relative z-20 overflow-hidden animate-in slide-in-from-bottom-full duration-500">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                            <h3 className="text-lg font-black text-white italic">
                                {editMode === 'profile' ? 'แก้ไขข้อมูลส่วนตัว' : 'เปลี่ยนรหัสผ่าน'}
                            </h3>
                            <button
                                onClick={() => !submitting && setIsEditModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-brand-gray-500"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {editMode === 'profile' ? (
                                <>
                                    <div className="flex flex-col items-center">
                                        <div className="relative group">
                                            <div className="w-24 h-24 bg-brand-bg rounded-[1.5rem] border-2 border-brand-orange-500/20 overflow-hidden shadow-2xl">
                                                {(imagePreview || user?.photoURL) ? (
                                                    <img src={imagePreview || user.photoURL} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-white font-black text-3xl uppercase">
                                                        {user?.displayName?.charAt(0) || user?.email?.charAt(0)}
                                                    </div>
                                                )}
                                                {uploadingImage && (
                                                    <div className="absolute inset-0 bg-brand-bg/60 flex items-center justify-center">
                                                        <div className="w-6 h-6 border-2 border-brand-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                                    </div>
                                                )}
                                            </div>
                                            <label className="absolute bottom-[-8px] right-[-8px] w-10 h-10 bg-brand-orange-500 rounded-2xl flex items-center justify-center text-brand-bg cursor-pointer shadow-lg shadow-brand-orange-500/30 hover:scale-110 active:scale-95 transition-all">
                                                <Camera size={18} />
                                                <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} disabled={submitting} />
                                            </label>
                                        </div>
                                        <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest mt-4">คลิกรูปกล้องเพื่อเปลี่ยนรูปโปรไฟล์</p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-brand-orange-500 uppercase tracking-widest ml-4">ชื่อที่ต้องการแสดง</label>
                                        <input
                                            type="text"
                                            value={displayNameInput}
                                            onChange={(e) => setDisplayNameInput(e.target.value)}
                                            className="w-full bg-brand-bg rounded-2xl px-6 py-4 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all"
                                            placeholder="กรอกชื่อของคุณ..."
                                            disabled={submitting}
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-brand-gray-500 uppercase tracking-widest ml-4">รหัสผ่านปัจจุบัน</label>
                                            <input
                                                type="password"
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                className="w-full bg-brand-bg rounded-2xl px-6 py-4 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all placeholder:text-white/5"
                                                placeholder="••••••••"
                                                disabled={submitting}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-brand-orange-500 uppercase tracking-widest ml-4">รหัสผ่านใหม่</label>
                                            <input
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                className="w-full bg-brand-bg rounded-2xl px-6 py-4 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all placeholder:text-white/5"
                                                placeholder="••••••••"
                                                disabled={submitting}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-brand-gray-500 uppercase tracking-widest ml-4">ยืนยันรหัสผ่านใหม่</label>
                                            <input
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className="w-full bg-brand-bg rounded-2xl px-6 py-4 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all placeholder:text-white/5"
                                                placeholder="••••••••"
                                                disabled={submitting}
                                            />
                                        </div>
                                    </div>
                                    <div className="bg-brand-orange-500/5 p-4 rounded-2xl flex items-start gap-3 border border-brand-orange-500/10">
                                        <ShieldCheck className="w-5 h-5 text-brand-orange-500 shrink-0" />
                                        <p className="text-[10px] font-bold text-brand-gray-500 leading-relaxed uppercase tracking-tighter">
                                            * การเปลี่ยนรหัสผ่านจำเป็นต้องมีการยืนยันตัวตนอีกครั้งโดยใช้รหัสผ่านปัจจุบันของคุณ
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="p-6 bg-white/5 border-t border-white/5 flex gap-3 pb-12 sm:pb-6">
                            <button
                                onClick={() => setIsEditModalOpen(false)}
                                disabled={submitting}
                                className="flex-1 py-4 bg-brand-bg text-brand-gray-500 rounded-2xl font-black uppercase tracking-widest text-[10px] border border-white/5 hover:bg-white/5 transition-all"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={editMode === 'profile' ? handleUpdateProfile : handleUpdatePassword}
                                disabled={submitting}
                                className="flex-[2] py-4 bg-gradient-to-r from-brand-orange-500 to-orange-600 text-brand-bg rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand-orange-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                {submitting ? (
                                    <div className="w-4 h-4 border-2 border-brand-bg border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    'บันทึกข้อมูล'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
