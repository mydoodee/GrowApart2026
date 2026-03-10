import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, getDocs, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage2 as storage } from '../firebase';
import MainLayout from '../components/MainLayout';
import { useToast } from '../hooks/useToast';
import Toast from '../components/Toast';
import { getUserApartments } from '../utils/apartmentUtils';
import { 
    Package, Search, Plus, CheckCircle2, User, Home, Clock, 
    Truck, X, MoreVertical, Trash2, Camera, Image as ImageIcon, FileText,
    Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp
} from 'lucide-react';

const CARRIERS = ['ไปรษณีย์ไทย (EMS/Reg)', 'Kerry Express', 'Flash Express', 'J&T Express', 'Shopee Xpress', 'Lazada Logistics', 'Ninja Van', 'DHL', 'อื่นๆ'];

const compressImage = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200;
                const MAX_HEIGHT = 1200;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    }));
                }, 'image/jpeg', 0.7); // 70% quality
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

export default function ParcelManagement({ user }) {
    const { toast, showToast, hideToast } = useToast();

    const [apartments, setApartments] = useState([]);
    const [activeAptId, setActiveAptId] = useState(localStorage.getItem('activeApartmentId'));
    const [parcels, setParcels] = useState([]);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Calendar State
    const [parcelCalMonth, setParcelCalMonth] = useState(new Date().getMonth());
    const [parcelCalYear, setParcelCalYear] = useState(new Date().getFullYear());
    const [parcelSelectedDate, setParcelSelectedDate] = useState(null);
    const [isParcelGridOpen, setIsParcelGridOpen] = useState(false);
    const [expandedParcelId, setExpandedParcelId] = useState(null);

    // Filters
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('pending'); // 'pending' | 'picked_up' | 'all'
    
    // Modal states
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    
    const [formData, setFormData] = useState({
        roomNumber: '',
        remark: ''
    });
    const [photoFiles, setPhotoFiles] = useState([]);
    const [photoPreviews, setPhotoPreviews] = useState([]);

    // Rooms data for autocomplete/validation
    const [rooms, setRooms] = useState([]);

    useEffect(() => {
        if (!user) return;
        
        let unsubParcels;

        const load = async () => {
            try {
                // Get apartments
                const apps = await getUserApartments(db, user);
                setApartments(apps);
                
                // Fetch profile
                const profileRef = doc(db, 'users', user.uid);
                const profileSnap = await getDoc(profileRef);
                if (profileSnap.exists()) {
                    setProfile(profileSnap.data());
                }
                
                const aptId = activeAptId && activeAptId !== 'all' ? activeAptId : null;
                if (!aptId) { setLoading(false); return; }

                // Fetch rooms for validation
                const roomsQ = query(collection(db, 'rooms'), where('apartmentId', '==', aptId));
                const roomsSnap = await getDocs(roomsQ);
                setRooms(roomsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

                // Listen to parcels
                const parcelsQ = query(
                    collection(db, 'parcels'),
                    where('apartmentId', '==', aptId)
                );
                
                unsubParcels = onSnapshot(parcelsQ, (snap) => {
                    const fetchedParcels = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    // Sort by addedAt desc
                    fetchedParcels.sort((a, b) => (b.addedAt?.seconds || 0) - (a.addedAt?.seconds || 0));
                    setParcels(fetchedParcels);
                    setLoading(false);
                });

            } catch (err) {
                console.error(err);
                setLoading(false);
            }
        };

        load();

        return () => {
            if (unsubParcels) unsubParcels();
        };
    }, [user, activeAptId]);

    const handleAptSwitch = (id) => {
        localStorage.setItem('activeApartmentId', id);
        setActiveAptId(id);
    };

    const handleAddParcel = async (e) => {
        e.preventDefault();
        if (!activeAptId || activeAptId === 'all') {
            showToast('กรุณาเลือกหอพักก่อนเพิ่มพัสดุ', 'warning');
            return;
        }
        if (!formData.roomNumber) {
            showToast('กรุณาระบุเลขห้อง', 'warning');
            return;
        }
        // Validate room exists
        const room = rooms.find(r => r.roomNumber === formData.roomNumber);
        if (!room) {
            showToast(`ไม่พบเลขห้อง "${formData.roomNumber}" ในระบบ กรุณาตรวจสอบอีกครั้ง`, 'error');
            setIsSubmitting(false);
            return;
        }

        setIsSubmitting(true);
        try {
            const photoUrls = [];
            if (photoFiles.length > 0) {
                for (let i = 0; i < photoFiles.length; i++) {
                    const file = photoFiles[i];
                    
                    // Compress Image
                    let fileToUpload = file;
                    try {
                        fileToUpload = await compressImage(file);
                    } catch (compressError) {
                        console.warn("Compression failed, using original file", compressError);
                    }

                    const timestamp = Date.now();
                    const storagePath = `parcels/${activeAptId}/${timestamp}_${formData.roomNumber}_${i}.jpg`;
                    const photoRef = ref(storage, storagePath);
                    const snapshot = await uploadBytes(photoRef, fileToUpload);
                    const url = await getDownloadURL(snapshot.ref);
                    photoUrls.push(url);
                }
            }

            // Link to a tenant ID based on room
            const tenantId = room?.tenantId || null;

            await addDoc(collection(db, 'parcels'), {
                apartmentId: activeAptId,
                roomNumber: formData.roomNumber,
                tenantId: tenantId,
                recipientName: room?.tenantName || '', // Keep for compatibility
                photoUrls: photoUrls,
                remark: formData.remark || '',
                status: 'pending',
                addedAt: serverTimestamp(),
                addedBy: user.uid
            });

            showToast('เพิ่มพัสดุสำเร็จ', 'success');
            setIsAddModalOpen(false);
            setFormData({ roomNumber: '', remark: '' });
            setPhotoFiles([]);
            setPhotoPreviews([]);
        } catch (error) {
            console.error(error);
            showToast('เกิดข้อผิดพลาดในการเพิ่มพัสดุ', 'error');
        }
        setIsSubmitting(false);
    };

    const handlePhotoChange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            setPhotoFiles(prev => [...prev, ...files]);
            
            files.forEach(file => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setPhotoPreviews(prev => [...prev, reader.result]);
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const removePhoto = (index) => {
        setPhotoFiles(prev => prev.filter((_, i) => i !== index));
        setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
    };

    const handleMarkPickedUp = async (parcelId) => {
        try {
            await updateDoc(doc(db, 'parcels', parcelId), {
                status: 'picked_up',
                pickedUpAt: serverTimestamp(),
                pickedUpBy: user.uid
            });
            showToast('บันทึกการรับพัสดุแล้ว', 'success');
        } catch (error) {
            console.error(error);
            showToast('เกิดข้อผิดพลาดในการบันทึก', 'error');
        }
    };

    const handleDelete = async (parcelId) => {
        if (!confirm('ยืนยันลบข้อมูลพัสดุนี้?')) return;
        try {
            await deleteDoc(doc(db, 'parcels', parcelId));
            showToast('ลบข้อมูลพัสดุแล้ว', 'success');
        } catch (error) {
            console.error(error);
            showToast('เกิดข้อผิดพลาดในการลบ', 'error');
        }
    };

    const handleRoomNumberChange = (e) => {
        const val = e.target.value;
        setFormData(prev => ({ ...prev, roomNumber: val }));
    };

    // Filtered computation
    const filteredParcels = parcels.filter(p => {
        // Status filter
        if (filterStatus !== 'all' && p.status !== filterStatus) return false;
        
        // Calendar filter: if a date is selected, filter by that date. 
        // If no date selected, filter by the current month/year in the calendar view.
        if (p.addedAt) {
            const date = p.addedAt.toDate();
            if (parcelSelectedDate) {
                if (date.getDate() !== parcelSelectedDate || 
                    date.getMonth() !== parcelCalMonth || 
                    date.getFullYear() !== parcelCalYear) return false;
            } else {
                if (date.getMonth() !== parcelCalMonth || 
                    date.getFullYear() !== parcelCalYear) return false;
            }
        } else if (parcelSelectedDate || parcelCalMonth !== new Date().getMonth() || parcelCalYear !== new Date().getFullYear()) {
            return false; // Hide if no date and we are filtering
        }

        // Search filter
        if (search) {
            const sq = search.toLowerCase();
            return (p.roomNumber || '').toLowerCase().includes(sq) ||
                   (p.recipientName || '').toLowerCase().includes(sq) ||
                   (p.trackingNumber || '').toLowerCase().includes(sq) ||
                   (p.carrier || '').toLowerCase().includes(sq);
        }
        return true;
    });

    const parcelsInMonth = parcels.filter(p => {
        if (!p.addedAt) return false;
        const date = p.addedAt.toDate();
        return date.getFullYear() === parcelCalYear && date.getMonth() === parcelCalMonth;
    });

    const parcelsByDate = {};
    parcelsInMonth.forEach(p => {
        const date = p.addedAt.toDate().getDate();
        if (!parcelsByDate[date]) parcelsByDate[date] = [];
        parcelsByDate[date].push(p);
    });

    const daysInMonth = new Date(parcelCalYear, parcelCalMonth + 1, 0).getDate();
    const firstDay = new Date(parcelCalYear, parcelCalMonth, 1).getDay();
    const thMonthsFull = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const thDays = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

    const pendingCount = parcels.filter(p => p.status === 'pending').length;
    const pickedUpCount = parcels.filter(p => p.status === 'picked_up').length;

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
                <div className="w-10 h-10 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <MainLayout profile={profile} apartments={apartments} activeAptId={activeAptId} onAptSwitch={handleAptSwitch} title="จัดการพัสดุ">
            <Toast {...toast} onClose={hideToast} />

            <div className="px-3 sm:px-5 py-3 max-w-[1200px] mx-auto w-full">
                
                {/* ── Stats Bar ─────────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                    <button onClick={() => setFilterStatus('all')} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${filterStatus === 'all' ? 'bg-brand-card/80 border-brand-orange-500/50 shadow-lg shadow-brand-orange-500/10' : 'bg-brand-card/40 border-white/8 hover:border-white/20'}`}>
                        <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-400">
                            <Package size={16} />
                        </div>
                        <div className="flex flex-col items-start min-w-0">
                            <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest leading-none mb-1">พัสดุทั้งหมด</p>
                            <p className="text-sm font-black text-white leading-none">{parcels.length} <span className="text-[10px] font-bold text-brand-gray-600">ชิ้น</span></p>
                        </div>
                    </button>
                    <button onClick={() => setFilterStatus('pending')} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${filterStatus === 'pending' ? 'bg-brand-card/80 border-brand-orange-500/50 shadow-lg shadow-brand-orange-500/10' : 'bg-brand-card/40 border-white/8 hover:border-white/20'}`}>
                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-400">
                            <Clock size={16} />
                        </div>
                        <div className="flex flex-col items-start min-w-0">
                            <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest leading-none mb-1">รอรับ</p>
                            <p className="text-sm font-black text-white leading-none">{pendingCount} <span className="text-[10px] font-bold text-brand-gray-600">ชิ้น</span></p>
                        </div>
                    </button>
                    <button onClick={() => setFilterStatus('picked_up')} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${filterStatus === 'picked_up' ? 'bg-brand-card/80 border-brand-orange-500/50 shadow-lg shadow-brand-orange-500/10' : 'bg-brand-card/40 border-white/8 hover:border-white/20'}`}>
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-400">
                            <CheckCircle2 size={16} />
                        </div>
                        <div className="flex flex-col items-start min-w-0">
                            <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest leading-none mb-1">รับแล้ว</p>
                            <p className="text-sm font-black text-white leading-none">{pickedUpCount} <span className="text-[10px] font-bold text-brand-gray-600">ชิ้น</span></p>
                        </div>
                    </button>
                </div>

                {/* ── Toolbar ──────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4 items-stretch sm:items-center">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-gray-500 group-focus-within:text-brand-orange-500 transition-colors" />
                        <input
                            type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="ค้นหาห้อง, ชื่อผู้รับ, เลขพัสดุ..."
                            className="w-full h-10 bg-brand-card/50 border border-white/8 rounded-xl pl-10 pr-10 text-xs font-bold text-white placeholder:text-brand-gray-600 outline-none focus:border-brand-orange-500/50 transition-all"
                        />
                        {search && <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-gray-500 hover:text-white transition-colors"><X className="w-3.5 h-3.5" /></button>}
                    </div>
                    
                    {activeAptId && activeAptId !== 'all' && (
                        <button onClick={() => setIsAddModalOpen(true)} className="h-10 px-4 bg-brand-orange-500 hover:bg-brand-orange-600 text-white rounded-xl text-[12px] font-bold transition-all flex items-center gap-2 whitespace-nowrap shadow-lg shadow-brand-orange-500/20 active:scale-95">
                            <Plus className="w-4 h-4" /> เพิ่มพัสดุ
                        </button>
                    )}
                </div>

                {/* ── Mobile-First Premium Calendar ─────────────────────────── */}
                <div className="relative mb-6 animate-in fade-in duration-700">
                    {/* Header: Month/Year & Select Grid Toggle */}
                    <div className="flex items-center justify-between mb-4 px-1">
                        <div className="flex items-center gap-2.5">
                            <div className="flex items-center bg-white/5 backdrop-blur-md p-1 rounded-2xl border border-white/5">
                                <button 
                                    onClick={() => {
                                        if (parcelCalMonth === 0) { setParcelCalMonth(11); setParcelCalYear(y => y - 1); }
                                        else { setParcelCalMonth(m => m - 1); }
                                        setParcelSelectedDate(null);
                                    }} 
                                    className="p-1 px-2 hover:bg-white/10 rounded-xl transition-colors text-brand-gray-400 active:scale-90"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <div className="px-1 min-w-[90px] text-center">
                                    <h3 className="text-[11px] font-black text-white uppercase tracking-tighter">{thMonthsFull[parcelCalMonth].substring(0, 3)} {parcelCalYear + 543}</h3>
                                </div>
                                <button 
                                    onClick={() => {
                                        if (parcelCalMonth === 11) { setParcelCalMonth(0); setParcelCalYear(y => y + 1); }
                                        else { setParcelCalMonth(m => m + 1); }
                                        setParcelSelectedDate(null);
                                    }} 
                                    className="p-1 px-2 hover:bg-white/10 rounded-xl transition-colors text-brand-gray-400 active:scale-90"
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                            <button 
                                onClick={() => {
                                    const now = new Date();
                                    setParcelCalMonth(now.getMonth());
                                    setParcelCalYear(now.getFullYear());
                                    setParcelSelectedDate(now.getDate());
                                }}
                                className="h-8 px-4 bg-brand-orange-500/10 hover:bg-brand-orange-500/20 text-brand-orange-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-brand-orange-500/20 active:scale-90 flex items-center justify-center"
                            >
                                วันนี้
                            </button>
                        </div>

                        <button 
                            onClick={() => setIsParcelGridOpen(!isParcelGridOpen)}
                            className={`w-9 h-9 flex items-center justify-center rounded-2xl border transition-all active:scale-90 relative z-40
                                ${isParcelGridOpen ? 'bg-brand-orange-500 text-brand-bg border-brand-orange-500 shadow-xl' : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10'}
                            `}
                        >
                            <Calendar size={18} />
                        </button>
                    </div>

                    {/* Floating Mini-Calendar Popover */}
                    {isParcelGridOpen && (
                        <>
                            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 animate-in fade-in duration-300" onClick={() => setIsParcelGridOpen(false)} />
                            <div className="absolute top-12 right-0 w-[240px] bg-brand-card/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-2xl p-4 z-40 animate-in zoom-in-95 fade-in duration-300 origin-top-right">
                                <div className="grid grid-cols-7 gap-1">
                                    {thDays.map(day => (
                                        <div key={day} className="text-center text-[8px] font-black text-white/30 uppercase py-1">
                                            {day}
                                        </div>
                                    ))}
                                    {Array.from({ length: firstDay }).map((_, i) => (
                                        <div key={`empty-${i}`} className="p-1"></div>
                                    ))}
                                    {Array.from({ length: daysInMonth }).map((_, i) => {
                                        const date = i + 1;
                                        const dateParcels = parcelsByDate[date] || [];
                                        const isSelected = parcelSelectedDate === date;
                                        const isToday = new Date().getDate() === date && new Date().getMonth() === parcelCalMonth && new Date().getFullYear() === parcelCalYear;

                                        return (
                                            <button
                                                key={date}
                                                onClick={() => { setParcelSelectedDate(date); setIsParcelGridOpen(false); }}
                                                className={`relative flex flex-col items-center justify-center h-8 rounded-xl border transition-all active:scale-75
                                                    ${isSelected ? 'bg-brand-orange-500 text-brand-bg border-brand-orange-500 shadow-lg' : 
                                                    isToday ? 'bg-brand-orange-500/10 border-brand-orange-500/40 text-brand-orange-500' : 
                                                    'bg-white/5 border-white/5 text-white/60 hover:bg-white/10'}
                                                `}
                                            >
                                                <span className="text-[10px] font-bold">{date}</span>
                                                {dateParcels.length > 0 && (
                                                    <div className={`absolute bottom-1 w-1 h-1 rounded-full ${isSelected ? 'bg-brand-bg/40' : 'bg-brand-orange-500'}`}></div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* ── Parcels List ─────────────────────────── */}
                {filteredParcels.length === 0 ? (
                    <div className="text-center py-20 bg-brand-card/40 border border-white/8 rounded-3xl">
                        <Package className="w-10 h-10 text-brand-gray-700 mx-auto mb-3 opacity-30" />
                        <p className="text-brand-gray-500 font-bold text-sm">ไม่พบข้อมูลพัสดุ</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredParcels.map(parcel => {
                            const isExpanded = expandedParcelId === parcel.id;
                            
                            return (
                                <div 
                                    key={parcel.id} 
                                    onClick={() => setExpandedParcelId(isExpanded ? null : parcel.id)}
                                    className={`bg-brand-card/40 border rounded-2xl p-4 flex flex-col transition-all cursor-pointer ${isExpanded ? 'border-brand-orange-500/40 bg-brand-card/80 shadow-2xl' : 'border-white/8 hover:border-white/20'}`}
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${parcel.status === 'pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                                <Package className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-brand-gray-500 tracking-widest uppercase mb-0.5">ห้องพัก</p>
                                                <p className="text-lg font-black text-brand-orange-500 leading-none">{parcel.roomNumber}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            {parcel.status === 'pending' ? (
                                                <span className="px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md text-[10px] font-bold flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> รอรับ
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-[10px] font-bold flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> รับแล้ว
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-between items-center px-1">
                                        <p className="text-sm font-bold text-white flex items-center gap-2">
                                            <User className="w-3.5 h-3.5 text-brand-gray-500" /> {parcel.recipientName || 'ไม่ระบุชื่อ'}
                                        </p>
                                        <div className="text-brand-gray-600">
                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </div>
                                    </div>

                                    {/* Expandable Content */}
                                    {isExpanded && (
                                        <div className="mt-4 pt-4 border-t border-white/5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                            {((parcel.photoUrls && parcel.photoUrls.length > 0) || parcel.photoUrl) && (
                                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10">
                                                    {(parcel.photoUrls || [parcel.photoUrl]).filter(url => !!url).map((url, idx) => (
                                                        <div 
                                                            key={idx} 
                                                            className="w-48 h-32 rounded-xl overflow-hidden border border-white/5 shrink-0 bg-black/20 cursor-pointer hover:border-brand-orange-500/50 transition-all hover:scale-[1.02]"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedImage(url);
                                                            }}
                                                        >
                                                            <img src={url} alt={`Parcel ${idx + 1}`} className="w-full h-full object-cover" />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            
                                            <div className="space-y-2">
                                                {parcel.carrier && (
                                                    <p className="text-xs font-bold text-brand-orange-500 flex items-center gap-2">
                                                        <Truck className="w-3.5 h-3.5" /> {parcel.carrier} {parcel.trackingNumber ? `(${parcel.trackingNumber})` : ''}
                                                    </p>
                                                )}
                                                {parcel.remark && (
                                                    <p className="text-xs font-medium text-brand-gray-400 flex items-start gap-2">
                                                        <FileText className="w-3.5 h-3.5 text-brand-gray-500 mt-0.5 shrink-0" /> {parcel.remark}
                                                    </p>
                                                )}
                                                <p className="text-[10px] font-medium text-brand-gray-500 flex items-center gap-2">
                                                    <Clock className="w-3 h-3" /> มาถึง: {parcel.addedAt?.toDate ? parcel.addedAt.toDate().toLocaleString('th-TH') : '-'}
                                                </p>
                                                {parcel.status === 'picked_up' && parcel.pickedUpAt && (
                                                    <p className="text-[10px] font-medium text-emerald-500/80 flex items-center gap-2">
                                                        <CheckCircle2 className="w-3 h-3" /> รับเมื่อ: {parcel.pickedUpAt.toDate().toLocaleString('th-TH')}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                                                {parcel.status === 'pending' ? (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleMarkPickedUp(parcel.id); }}
                                                        className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border border-emerald-500/20"
                                                    >
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> บันทึกการรับพัสดุ
                                                    </button>
                                                ) : (
                                                    <div className="text-[10px] font-bold text-brand-gray-600 flex items-center gap-1">
                                                        <CheckCircle2 className="w-3 h-3" /> เสร็จสิ้น
                                                    </div>
                                                )}
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(parcel.id); }}
                                                    className="p-1.5 text-brand-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Add Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)} />
                    <div className="bg-brand-card w-full max-w-md rounded-2xl border border-white/10 shadow-2xl relative flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
                            <div>
                                <h3 className="text-lg font-bold text-white tracking-wide">เพิ่มพัสดุใหม่</h3>
                                <p className="text-[10px] font-medium text-brand-gray-500 tracking-wider">บันทึกข้อมูลพัสดุที่มาส่ง</p>
                            </div>
                            <button onClick={() => setIsAddModalOpen(false)} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 text-brand-gray-400 hover:text-white rounded-xl transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                        
                        <div className="p-5 overflow-y-auto">
                            <form onSubmit={handleAddParcel} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-brand-gray-400 block ml-1"><span className="text-red-500">*</span> ห้องพัก</label>
                                    <input 
                                        type="text" required
                                        value={formData.roomNumber}
                                        onChange={handleRoomNumberChange}
                                        placeholder="เช่น A01, 101"
                                        className="w-full h-11 bg-black/20 border border-white/10 rounded-xl px-4 text-sm font-bold text-white placeholder:text-brand-gray-600 focus:border-brand-orange-500/50 outline-none transition-all"
                                    />
                                </div>
                                
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-brand-gray-400 block ml-1">รูปถ่ายพัสดุ</label>
                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                        {photoPreviews.map((src, idx) => (
                                            <div key={idx} className="relative aspect-video rounded-xl border border-white/10 overflow-hidden bg-black/20">
                                                <img src={src} className="w-full h-full object-cover" />
                                                <button 
                                                    type="button" 
                                                    onClick={() => removePhoto(idx)}
                                                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-lg flex items-center justify-center text-white shadow-lg active:scale-90 transition-all"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                        <div className="relative group cursor-pointer aspect-video rounded-xl border-2 border-dashed border-white/10 overflow-hidden hover:border-brand-orange-500/50 transition-all bg-black/20 flex flex-col items-center justify-center gap-1">
                                            <Camera className="text-brand-gray-600 w-6 h-6 group-hover:text-brand-orange-500 transition-colors" />
                                            <span className="text-[8px] font-bold text-brand-gray-500 uppercase tracking-widest text-center px-2">เพิ่มรูป</span>
                                            <input 
                                                type="file" accept="image/*" capture="environment" multiple
                                                onChange={handlePhotoChange}
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-brand-gray-400 block ml-1">หมายเหตุ (Remark)</label>
                                    <textarea 
                                        value={formData.remark}
                                        onChange={e => setFormData(prev => ({ ...prev, remark: e.target.value }))}
                                        placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                                        className="w-full h-24 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder:text-brand-gray-600 focus:border-brand-orange-500/50 outline-none transition-all resize-none"
                                    />
                                </div>

                                <div className="pt-4 flex gap-3">
                                    <button 
                                        type="button" onClick={() => { setIsAddModalOpen(false); setPhotoPreviews([]); setPhotoFiles([]); }}
                                        className="flex-1 h-11 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold text-sm transition-all"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button 
                                        type="submit" disabled={isSubmitting}
                                        className="flex-2 w-[60%] h-11 bg-brand-orange-500 hover:bg-brand-orange-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-brand-orange-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : (
                                            <>
                                                <Plus className="w-4 h-4" /> บันทึกข้อมูล
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Viewer Modal */}
            {selectedImage && (
                <div 
                    className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={(e) => {
                        e.stopPropagation();
                        setSelectedImage(null);
                    }}
                >
                    <button 
                        className="absolute top-4 right-4 md:top-6 md:right-6 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-[111]"
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedImage(null);
                        }}
                    >
                        <X size={24} />
                    </button>
                    <img 
                        src={selectedImage} 
                        alt="Enlarged Parcel" 
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200" 
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

        </MainLayout>
    );
}
