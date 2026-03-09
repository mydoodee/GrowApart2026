import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, db } from '../firebase';
import { Building, MapPin, User, CheckCircle2, Loader2, Mail, Phone, Lock, Eye, EyeOff } from 'lucide-react';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

const GoogleIcon = () => (
    <svg className="w-4 h-4 mr-3" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
);

export default function TenantJoin({ user, userRole }) {
    const { aptId, roomNum } = useParams();
    const navigate = useNavigate();
    const { toast, showToast, hideToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [apartment, setApartment] = useState(null);
    const [requestStatus, setRequestStatus] = useState(null); // 'pending', 'approved', null

    // Auth states
    const [authMethod, setAuthMethod] = useState('phone'); // 'phone' | 'email'
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        async function checkData() {
            try {
                const aptRef = doc(db, 'apartments', aptId);
                const aptSnap = await getDoc(aptRef);
                if (aptSnap.exists()) {
                    setApartment(aptSnap.data());
                }

                if (user) {
                    const q = query(
                        collection(db, 'requests'),
                        where('userId', '==', user.uid),
                        where('apartmentId', '==', aptId),
                        where('roomNumber', '==', roomNum),
                        where('status', '==', 'pending')
                    );
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        setRequestStatus('pending');
                    }
                }
            } catch (error) {
                console.error("Error fetching data:", error);
                showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
            }
            setLoading(false);
        }
        checkData();
    }, [aptId, roomNum, user]);

    const submitJoinRequest = async (currentUser) => {
        try {
            // First find the roomId for this roomNumber
            const roomsQ = query(
                collection(db, 'apartments', aptId, 'rooms'),
                where('roomNumber', '==', roomNum)
            );
            const roomsSnap = await getDocs(roomsQ);
            let roomId = null;
            if (!roomsSnap.empty) {
                roomId = roomsSnap.docs[0].id;
            }

            // Check if request already exists
            const reqQ = query(
                collection(db, 'requests'),
                where('userId', '==', currentUser.uid),
                where('apartmentId', '==', aptId),
                where('roomNumber', '==', roomNum)
            );
            const reqSnap = await getDocs(reqQ);

            if (reqSnap.empty) {
                await addDoc(collection(db, 'requests'), {
                    userId: currentUser.uid,
                    userName: name || currentUser.displayName || 'ผู้เช่า',
                    userEmail: currentUser.email || '',
                    userPhone: phone || '',
                    apartmentId: aptId,
                    apartmentName: apartment?.general?.name || 'Unknown',
                    roomNumber: roomNum,
                    roomId: roomId, // Store the Firestore ID
                    status: 'pending',
                    type: 'tenant',
                    createdAt: serverTimestamp()
                });
                showToast('ส่งคำขอเข้าระบบเรียบร้อยแล้ว กรุณารอเจ้าของหออนุมัติ', 'success');
                navigate('/tenant-dashboard', { replace: true });
            } else {
                navigate('/tenant-dashboard', { replace: true });
            }
        } catch (error) {
            console.error("Join request failed:", error);
            showToast('ส่งคำขอล้มเหลว', 'error');
        }
        setSubmitting(false);
    };

    const handleGoogleAuth = async () => {
        setSubmitting(true);
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const currentUser = result.user;

            // Ensure user doc exists
            const userRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) {
                await setDoc(userRef, {
                    name: currentUser.displayName,
                    email: currentUser.email,
                    role: 'tenant',
                    createdAt: serverTimestamp()
                });
            }
            localStorage.setItem('loginContext', 'tenant');
            await submitJoinRequest(currentUser);
        } catch (error) {
            console.error(error);
            showToast('ล็อกอินด้วย Google ล้มเหลว', 'error');
            setSubmitting(false);
        }
    };

    const handleAuthAndJoin = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        let currentUser = user;

        try {
            if (!currentUser) {
                let authEmail = email;
                if (authMethod === 'phone') {
                    if (!phone) { showToast('กรุณากรอกเบอร์โทรศัพท์', 'error'); setSubmitting(false); return; }
                    authEmail = `${phone.replace(/\D/g, '')}@rentara.system`;
                } else if (!email) {
                    showToast('กรุณากรอกอีเมล', 'error'); setSubmitting(false); return;
                }

                try {
                    const userCred = await signInWithEmailAndPassword(auth, authEmail, password);
                    currentUser = userCred.user;
                    localStorage.setItem('loginContext', 'tenant');
                } catch (err) {
                    if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
                        if (!name) {
                            showToast('กรุณากรอกชื่อ-นามสกุล เพื่อลงทะเบียนครั้งแรก', 'error');
                            setSubmitting(false);
                            return;
                        }
                        const userCred = await createUserWithEmailAndPassword(auth, authEmail, password);
                        currentUser = userCred.user;
                        localStorage.setItem('loginContext', 'tenant');

                        await setDoc(doc(db, 'users', currentUser.uid), {
                            name: name,
                            email: authEmail,
                            phone: authMethod === 'phone' ? phone : '',
                            role: 'tenant',
                            createdAt: serverTimestamp()
                        });
                    } else {
                        throw err;
                    }
                }
            }

            if (currentUser) {
                await submitJoinRequest(currentUser);
            }
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/wrong-password') showToast('รหัสผ่านไม่ถูกต้อง สำหรับบัญชีนี้', 'error');
            else if (error.code === 'auth/weak-password') showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');
            else if (error.code === 'auth/email-already-in-use') showToast('อีเมลหรือเบอร์นี้มีในระบบแล้ว รหัสไม่ตรง', 'error');
            else showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
                <Loader2 className="w-12 h-12 text-brand-orange-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center py-10 px-4 relative overflow-y-auto">
            <Toast {...toast} onClose={hideToast} />

            <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-brand-orange-500/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="max-w-md w-full bg-brand-card rounded-xl p-8 shadow-lg border border-white/10 relative z-10 animate-in zoom-in-95 duration-500 my-auto">
                <div className="w-16 h-16 bg-brand-orange-500/20 rounded-xl flex items-center justify-center text-brand-orange-500 shadow-md mx-auto mb-5 border border-brand-orange-500/30">
                    <Building className="w-8 h-8" />
                </div>

                <div className="text-center mb-6">
                    <h1 className="text-xl font-bold text-white mb-1 uppercase tracking-tight">เข้าร่วมหอพัก</h1>
                    <p className="text-brand-gray-500 font-bold text-sm tracking-wide">TENANT REGISTRATION & LOGIN</p>
                </div>

                <div className="bg-brand-bg/50 rounded-xl p-4 border border-white/10 space-y-3 mb-6">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-brand-gray-500 uppercase tracking-widest">หอพัก</span>
                        <span className="text-white font-bold text-sm truncate max-w-[150px]">{apartment?.general?.name || 'ไม่พบข้อมูล'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-brand-gray-500 uppercase tracking-widest">หมายเลขห้อง</span>
                        <span className="text-brand-orange-500 font-bold text-xl">ห้อง {roomNum}</span>
                    </div>
                </div>

                {requestStatus === 'pending' ? (
                    <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20 text-center animate-pulse mt-4">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
                        <p className="text-emerald-500 font-bold text-sm">ส่งคำขอแล้ว! กรุณารอเจ้าของหออนุมัติ</p>
                        <p className="text-brand-gray-400 text-xs mt-2 font-medium tracking-wide">จะมีการแจ้งเตือนเมื่อคำขอของคุณได้รับการยืนยัน</p>
                    </div>
                ) : (
                    <>
                        {user ? (
                            <div className="space-y-4">
                                <button
                                    onClick={() => { setSubmitting(true); submitJoinRequest(user); }}
                                    disabled={submitting}
                                    className="w-full py-3 bg-brand-orange-500 text-brand-bg rounded-xl font-bold uppercase tracking-widest text-xs shadow-md shadow-brand-orange-500/20 active:scale-[0.98] transition-all flex items-center justify-center cursor-pointer"
                                >
                                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ยืนยันและส่งคำขอ'}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <button
                                    type="button"
                                    onClick={handleGoogleAuth}
                                    disabled={submitting}
                                    className="w-full flex items-center justify-center py-2.5 bg-white text-gray-800 rounded-xl font-bold text-xs hover:bg-gray-100 transition-all shadow-md active:scale-95 border border-transparent disabled:opacity-70"
                                >
                                    <GoogleIcon />
                                    ดำเนินการต่อด้วย GOOGLE
                                </button>

                                <div className="flex items-center justify-center space-x-4">
                                    <div className="flex-1 h-px bg-white/10"></div>
                                    <span className="text-[10px] uppercase font-bold text-brand-gray-500 tracking-widest">หรือเข้าสู่ระบบด้วย</span>
                                    <div className="flex-1 h-px bg-white/10"></div>
                                </div>

                                <div className="flex bg-brand-bg rounded-xl p-1 border border-white/5 shadow-inner">
                                    <button
                                        type="button"
                                        onClick={() => setAuthMethod('phone')}
                                        className={`flex-1 flex justify-center py-1.5 rounded-lg text-xs font-bold transition-all ${authMethod === 'phone' ? 'bg-brand-card text-brand-orange-500 shadow-sm' : 'text-brand-gray-400 hover:text-white'}`}
                                    >
                                        เบอร์โทรศัพท์
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAuthMethod('email')}
                                        className={`flex-1 flex justify-center py-1.5 rounded-lg text-xs font-bold transition-all ${authMethod === 'email' ? 'bg-brand-card text-brand-orange-500 shadow-sm' : 'text-brand-gray-400 hover:text-white'}`}
                                    >
                                        อีเมล
                                    </button>
                                </div>

                                <form onSubmit={handleAuthAndJoin} className="space-y-4">
                                    {!user && (
                                        <div>
                                            <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                                                <User className="w-4 h-4 text-brand-bg/40 mr-3 shrink-0" />
                                                <input
                                                    type="text"
                                                    placeholder="ชื่อ - นามสกุล (สำหรับสมัครใหม่)"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 text-sm"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {authMethod === 'phone' ? (
                                        <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                                            <Phone className="w-4 h-4 text-brand-bg/40 mr-3 shrink-0" />
                                            <input
                                                type="tel"
                                                placeholder="08X-XXX-XXXX"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 text-sm"
                                                required
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                                            <Mail className="w-4 h-4 text-brand-bg/40 mr-3 shrink-0" />
                                            <input
                                                type="email"
                                                placeholder="employee@domain.com"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 text-sm"
                                                required
                                            />
                                        </div>
                                    )}

                                    <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                                        <Lock className="w-4 h-4 text-brand-bg/40 mr-3 shrink-0" />
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            placeholder="รหัสผ่าน"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 tracking-widest text-sm"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="text-brand-bg/30 hover:text-brand-bg/50 focus:outline-none ml-2"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full mt-4 py-2.5 bg-gradient-to-r from-[#e67e22] via-[#f39c12] to-[#f1c40f] hover:from-[#f39c12] hover:via-[#f1c40f] hover:to-[#fbc531] text-brand-bg font-extrabold rounded-xl shadow-[0_4px_15px_-3px_rgba(243,156,18,0.4)] transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center border-b-2 border-orange-700/30"
                                    >
                                        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'เข้าสู่ระบบและส่งคำขอ'}
                                    </button>
                                </form>
                            </div>
                        )}
                    </>
                )}

                <div className="mt-6 flex flex-col items-center">
                    <button
                        onClick={() => navigate(userRole === 'tenant' ? '/tenant-dashboard' : '/dashboard')}
                        className="text-brand-gray-500 hover:text-white text-xs font-bold tracking-wide transition-colors"
                    >
                        กลับสู่หน้าหลัก
                    </button>
                </div>
            </div>
        </div>
    );
}
