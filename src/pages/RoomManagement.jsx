import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
    Home, Save, Trash2, Plus, Info, CheckCircle2,
    X, LayoutGrid, Check, Settings, LogOut, Bell, Building, Menu, MapPin, Phone, Zap, Droplets, CreditCard
} from 'lucide-react';
import Toast, { useToast } from '../components/Toast';
import MainLayout from '../components/MainLayout';
import { getUserApartments } from '../utils/apartmentUtils';

export default function RoomManagement({ user }) {
    const navigate = useNavigate();
    const { toast, showToast, hideToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [profile, setProfile] = useState(null);
    const [apartments, setApartments] = useState([]);
    const [activeAptId, setActiveAptId] = useState(localStorage.getItem('activeApartmentId'));
    const [rooms, setRooms] = useState([]);
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // Filter states
    const [filterFloor, setFilterFloor] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');

    useEffect(() => {
        if (!user) return;

        // Fetch profile
        const profileRef = doc(db, 'users', user.uid);
        getDoc(profileRef).then(snap => {
            if (snap.exists()) setProfile(snap.data());
        });

        let unsubscribe;

        const loadData = async () => {
            try {
                const apps = await getUserApartments(db, user);
                setApartments(apps);

                if (activeAptId) {
                    let q;
                    if (activeAptId === 'all') {
                        q = collection(db, 'rooms');
                    } else {
                        q = query(collection(db, 'rooms'), where('apartmentId', '==', activeAptId));
                    }

                    unsubscribe = onSnapshot(q, (snapshot) => {
                        const firestoreRooms = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        let allRooms = [];

                        if (activeAptId === 'all') {
                            // Fetch rooms for ALL buildings
                            allRooms = [...firestoreRooms];

                            // For each app, ensure all its rooms are represented (merge with config)
                            for (const app of apps) {
                                const appRooms = allRooms.filter(r => r.apartmentId === app.id);
                                const generated = generateRoomsFromConfig(app);

                                generated.forEach(genRoom => {
                                    const existing = appRooms.find(r => r.roomNumber === genRoom.roomNumber);
                                    if (!existing) {
                                        allRooms.push(genRoom);
                                    }
                                });
                            }
                        } else {
                            // Single building
                            const activeApt = apps.find(a => a.id === activeAptId);
                            if (activeApt) {
                                const generated = generateRoomsFromConfig(activeApt);
                                allRooms = generated.map(genRoom => {
                                    const existing = firestoreRooms.find(r => r.roomNumber === genRoom.roomNumber);
                                    return existing ? existing : genRoom;
                                });
                            }
                        }
                        setRooms(allRooms);
                        setLoading(false);
                    });
                } else {
                    setLoading(false);
                }
            } catch (error) {
                console.error(error);
                showToast('โหลดข้อมูลล้มเหลว', 'error');
                setLoading(false);
            }
        };

        loadData();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [user, activeAptId]);

    const generateRoomsFromConfig = (apt) => {
        const generated = [];
        if (apt.floors) {
            apt.floors.forEach(floor => {
                for (let i = 1; i <= floor.roomCount; i++) {
                    const roomNo = `${floor.id}${i.toString().padStart(2, '0')}`;
                    generated.push({
                        apartmentId: apt.id,
                        roomNumber: roomNo,
                        floor: floor.id,
                        status: 'ว่าง',
                        price: apt.utilityRates?.baseRent || 0,
                        amenities: apt.amenities || [],
                        fixedExpenses: apt.fixedExpenses?.map(fe => ({ ...fe, active: true })) || []
                    });
                }
            });
        }
        return generated;
    };

    const handleAptSwitch = (id) => {
        localStorage.setItem('activeApartmentId', id);
        setActiveAptId(id);
        showToast('สลับตึกเรียบร้อย');
    };

    const handleRoomClick = (room) => {
        setSelectedRoom({ ...room });
        setIsEditModalOpen(true);
    };

    const handleSaveRoom = async () => {
        setSaving(true);
        try {
            const roomId = selectedRoom.id || `${selectedRoom.apartmentId}_${selectedRoom.roomNumber}`;
            const roomRef = doc(db, 'rooms', roomId);

            const dataToSave = {
                ...selectedRoom,
                updatedAt: serverTimestamp()
            };
            delete dataToSave.id;

            await setDoc(roomRef, dataToSave, { merge: true });

            setRooms(rooms.map(r =>
                (r.roomNumber === selectedRoom.roomNumber && r.apartmentId === selectedRoom.apartmentId)
                    ? { ...selectedRoom, id: roomId }
                    : r
            ));

            showToast('บันทึกข้อมูลห้องพักเรียบร้อย');
            setIsEditModalOpen(false);
        } catch (error) {
            console.error(error);
            showToast('บันทึกล้มเหลว', 'error');
        }
        setSaving(false);
    };

    const floorsList = activeAptId === 'all'
        ? Array.from(new Set(rooms.map(r => r.floor))).sort((a, b) => a - b)
        : (apartments.find(a => a.id === activeAptId)?.floors?.map(f => f.id) || []);

    const filteredRooms = rooms.filter(r => {
        const floorMatch = filterFloor === 'all' || r.floor === parseInt(filterFloor);
        const statusMatch = filterStatus === 'all' || r.status === filterStatus || (filterStatus === 'ไม่ว่าง' && r.status === 'occupied');
        return floorMatch && statusMatch;
    });

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
                <div className="w-12 h-12 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const currentApt = apartments.find(a => a.id === activeAptId);

    return (
        <MainLayout
            profile={profile}
            apartments={apartments}
            activeAptId={activeAptId}
            onAptSwitch={handleAptSwitch}
            title="จัดการห้องพัก"
        >
            <Toast {...toast} onClose={hideToast} />

            <div className="px-5 lg:px-4 py-2 max-w-[1600px] mx-auto w-full relative z-10 shrink-0">
                {/* Filters */}
                <div className="flex flex-col lg:flex-row lg:items-center gap-6 mb-8">
                    {/* Floor Filter Buttons */}
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-2.5">
                            <button
                                onClick={() => setFilterFloor('all')}
                                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${filterFloor === 'all' ? 'bg-brand-orange-500 border-brand-orange-500 text-brand-bg shadow-xl shadow-brand-orange-500/25 scale-[1.02]' : 'bg-brand-bg/40 border-white/5 text-brand-gray-400 hover:text-white hover:bg-white/10 hover:border-white/10'}`}
                            >
                                ทุกชั้น
                            </button>
                            {floorsList.map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilterFloor(f.toString())}
                                    className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${filterFloor === f.toString() ? 'bg-brand-orange-500 border-brand-orange-500 text-brand-bg shadow-xl shadow-brand-orange-500/25 scale-[1.02]' : 'bg-brand-bg/40 border-white/5 text-brand-gray-400 hover:text-white hover:bg-white/10 hover:border-white/10'}`}
                                >
                                    ชั้น {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 lg:border-l lg:border-white/5 lg:pl-6">
                        <div className="w-52">
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="w-full bg-brand-bg/60 border border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-brand-orange-500/50 transition-all cursor-pointer hover:border-white/20 h-[50px]"
                            >
                                <option value="all">ทุกสถานะ</option>
                                <option value="ว่าง">ว่าง</option>
                                <option value="ไม่ว่าง">ไม่ว่าง / มีผู้เช่า</option>
                                <option value="แจ้งซ่อม">แจ้งซ่อม</option>
                                <option value="จอง">จอง</option>
                            </select>
                        </div>

                        <div className="bg-brand-orange-500/10 px-5 py-2.5 rounded-2xl border border-brand-orange-500/20 flex flex-col items-center justify-center min-w-[110px] h-[50px]">
                            <p className="text-[9px] font-black text-brand-orange-500 uppercase tracking-widest leading-none mb-1 opacity-80">Rooms</p>
                            <p className="text-xl font-black text-white leading-none tracking-tighter">{filteredRooms.length}</p>
                        </div>
                    </div>
                </div>

                {/* Room Grid */}
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3">
                    {filteredRooms.map((room) => (
                        <button
                            key={`${room.apartmentId}_${room.roomNumber}`}
                            onClick={() => handleRoomClick(room)}
                            className={`
                                relative p-3.5 rounded-xl border transition-all duration-300 flex flex-col justify-between h-24 text-left group overflow-hidden shadow-sm hover:shadow-lg active:scale-[0.97]
                                ${(room.status === 'ไม่ว่าง' || room.status === 'occupied') ? 'bg-brand-card border-blue-500/10' :
                                    room.status === 'แจ้งซ่อม' ? 'bg-brand-card border-red-500/10' :
                                        room.status === 'จอง' ? 'bg-brand-card border-yellow-500/10' :
                                            'bg-brand-card border-white/5 hover:border-brand-orange-500/40'}
                            `}
                        >
                            {/* Visual Indicator on top */}
                            <div className={`
                                absolute top-0 left-0 w-full h-[2px]
                                ${(room.status === 'ไม่ว่าง' || room.status === 'occupied') ? 'bg-blue-500' :
                                    room.status === 'แจ้งซ่อม' ? 'bg-red-500' :
                                        room.status === 'จอง' ? 'bg-yellow-500' :
                                            'bg-brand-gray-700'}
                            `}></div>

                            <div className="flex justify-between items-start w-full relative z-10">
                                <p className="text-[10px] font-bold text-brand-gray-400 leading-none uppercase tracking-wider">ชั้น {room.floor}</p>
                                <h4 className="text-lg font-black text-white leading-none tracking-tighter">{room.roomNumber}</h4>
                            </div>

                            <div className="flex justify-between items-end w-full relative z-10">
                                <span className={`
                                    text-xs font-black uppercase tracking-tight leading-none
                                    ${(room.status === 'ไม่ว่าง' || room.status === 'occupied') ? 'text-blue-500' :
                                        room.status === 'แจ้งซ่อม' ? 'text-red-500' :
                                            room.status === 'จอง' ? 'text-yellow-500' :
                                                'text-green-500'}
                                `}>
                                    {room.status === 'occupied' ? 'ไม่ว่าง' : room.status}
                                </span>
                                {room.tenantId && (
                                    <div className="bg-blue-500/20 p-0.5 rounded-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]"></div>
                                    </div>
                                )}
                            </div>
                        </button>
                    ))}
                </div>

                {filteredRooms.length === 0 && (
                    <div className="text-center py-20 bg-brand-card/50 rounded-3xl border border-dashed border-white/10">
                        <LayoutGrid className="w-12 h-12 text-brand-gray-700 mx-auto mb-4" />
                        <h3 className="text-white font-bold text-lg">ไม่พบข้อมูลห้องพัก</h3>
                        <p className="text-brand-gray-300 text-sm">ลองเปลี่ยนเงื่อนไขการกรองข้อมูล</p>
                    </div>
                )}
            </div>

            {/* Edit Room Modal */}
            {
                isEditModalOpen && selectedRoom && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsEditModalOpen(false)}></div>
                        <div className="relative bg-brand-card w-full max-w-lg rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                                <h3 className="text-lg font-bold text-white">แก้ไขข้อมูลห้อง {selectedRoom.roomNumber}</h3>
                                <button onClick={() => setIsEditModalOpen(false)} className="text-brand-gray-300 hover:text-white transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="p-6 space-y-5 h-[60vh] overflow-y-auto custom-scrollbar">
                                <div>
                                    <label className="text-xs font-bold text-brand-gray-400 mb-2 block ml-1 uppercase">สถานะห้องพัก</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {['ว่าง', 'ไม่ว่าง', 'แจ้งซ่อม', 'จอง'].map(st => (
                                            <button
                                                key={st}
                                                onClick={() => setSelectedRoom({ ...selectedRoom, status: st })}
                                                className={`
                                                py-2.5 rounded-xl font-bold text-xs transition-all border
                                                ${(selectedRoom.status === st || (st === 'ไม่ว่าง' && selectedRoom.status === 'occupied')) ? 'bg-brand-orange-500/10 border-brand-orange-500 text-brand-orange-500 shadow-lg shadow-brand-orange-500/5' : 'bg-brand-bg/50 border-white/5 text-brand-gray-300 hover:text-white'}
                                            `}
                                            >
                                                {st}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-brand-gray-400 mb-2 block ml-1 uppercase">ราคาเช่ารายเดือน</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={selectedRoom.price}
                                            onChange={(e) => setSelectedRoom({ ...selectedRoom, price: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-brand-bg rounded-xl px-4 py-3 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500 transition-all text-center text-xl text-brand-orange-500"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-gray-300 font-bold text-xs uppercase tracking-widest">บาท</span>
                                    </div>
                                    {currentApt?.utilityRates && (
                                        <div className="mt-2 flex items-center justify-between px-2">
                                            <p className="text-[11px] font-bold text-brand-gray-300 uppercase tracking-widest flex items-center gap-2">
                                                <Zap className="w-3 h-3 text-yellow-500" />
                                                ไฟฟ้า {currentApt.utilityRates.electricity} บ.
                                            </p>
                                            <p className="text-[11px] font-bold text-brand-gray-300 uppercase tracking-widest flex items-center gap-2">
                                                <Droplets className="w-3 h-3 text-blue-500" />
                                                น้ำ {currentApt.utilityRates.water} บ.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {currentApt?.fixedExpenses && currentApt.fixedExpenses.length > 0 && (
                                    <div>
                                        <label className="text-xs font-bold text-brand-gray-400 mb-2 block ml-1 uppercase">ค่าบริการรายเดือนเพิ่มเติม</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {currentApt.fixedExpenses.map((expense, idx) => {
                                                const isSelected = selectedRoom.fixedExpenses?.find(fe => fe.name === expense.name)?.active;
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => {
                                                            const currentFixed = selectedRoom.fixedExpenses || [];
                                                            const existingIdx = currentFixed.findIndex(fe => fe.name === expense.name);
                                                            let newFixed;
                                                            if (existingIdx >= 0) {
                                                                newFixed = [...currentFixed];
                                                                newFixed[existingIdx].active = !newFixed[existingIdx].active;
                                                            } else {
                                                                newFixed = [...currentFixed, { ...expense, active: true }];
                                                            }
                                                            setSelectedRoom({ ...selectedRoom, fixedExpenses: newFixed });
                                                        }}
                                                        className={`
                                                        flex flex-col items-start px-4 py-2 rounded-xl border transition-all
                                                        ${isSelected ? 'bg-brand-orange-500/10 border-brand-orange-500/30' : 'bg-transparent border-white/5'}
                                                    `}
                                                    >
                                                        <div className="flex items-center w-full justify-between mb-1">
                                                            <span className={`text-[11px] font-black uppercase tracking-tight ${isSelected ? 'text-brand-orange-500' : 'text-brand-gray-300'}`}>
                                                                {expense.name}
                                                            </span>
                                                            <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${isSelected ? 'bg-brand-orange-500 border-brand-orange-500 shadow-[0_0_8px_rgba(243,156,18,0.4)]' : 'border-white/20'}`}>
                                                                {isSelected && <Check className="w-2 h-2 text-brand-bg" strokeWidth={5} />}
                                                            </div>
                                                        </div>
                                                        <p className={`text-[11px] font-bold ${isSelected ? 'text-brand-orange-500/80' : 'text-brand-gray-300'}`}>
                                                            {expense.amount.toLocaleString()} บาท/เดือน
                                                        </p>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-xs font-bold text-brand-gray-400 mb-2 block ml-1 uppercase">สิ่งอำนวยความสะดวกในห้อง</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {selectedRoom.amenities?.map((amenity, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    const newAms = [...selectedRoom.amenities];
                                                    newAms[idx].status = !newAms[idx].status;
                                                    setSelectedRoom({ ...selectedRoom, amenities: newAms });
                                                }}
                                                className={`
                                                flex items-center px-4 py-2.5 rounded-xl border transition-all text-[11px] font-bold
                                                ${amenity.status ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-white/5 text-brand-gray-300'}
                                            `}
                                            >
                                                <div className={`w-3.5 h-3.5 rounded-md mr-3 flex items-center justify-center border ${amenity.status ? 'bg-brand-orange-500 border-brand-orange-500' : 'border-white/10'}`}>
                                                    {amenity.status && <Check className="w-2.5 h-2.5 text-brand-bg" strokeWidth={4} />}
                                                </div>
                                                {amenity.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-brand-bg/50 border-t border-white/5 flex gap-3">
                                <button
                                    onClick={handleSaveRoom}
                                    disabled={saving}
                                    className="flex-1 bg-brand-orange-500 text-brand-bg py-3 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-brand-orange-400 active:scale-95 transition-all shadow-lg shadow-brand-orange-500/20"
                                >
                                    {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </MainLayout >
    );
}
