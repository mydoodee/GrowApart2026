import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, db } from '../firebase';
import { Building, User, CheckCircle2, Loader2, Mail, Phone, Lock, Eye, EyeOff } from 'lucide-react';
import Toast, { useToast } from '../components/Toast';

const GoogleIcon = () => (
    <svg className="w-4 h-4 mr-3" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
);

export default function TenantJoinGeneral({ user }) {
    const { aptId } = useParams();
    const navigate = useNavigate();
    const { toast, showToast, hideToast } = useToast();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [apartment, setApartment] = useState(null);
    const [requestStatus, setRequestStatus] = useState(null);

    // Auth states
    const [authMethod, setAuthMethod] = useState('phone');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (!aptId) return;

        const loadData = async () => {
            try {
                let aptData = null;
                try {
                    const aptRef = doc(db, 'apartments', aptId);
                    const aptSnap = await getDoc(aptRef);
                    if (aptSnap.exists()) {
                        aptData = { id: aptSnap.id, ...aptSnap.data() };
                        setApartment(aptData);
                    }
                } catch (aptErr) {
                    console.error("Failed to fetch apartment info:", aptErr);
                    // Still continue so they can see the form
                }

                if (user) {
                    try {
                        const userDoc = await getDoc(doc(db, 'users', user.uid));
                        if (userDoc.exists()) {
                            const userData = userDoc.data();
                            if (userData.apartmentRoles && userData.apartmentRoles[aptId]) {
                                navigate('/tenant-dashboard', { replace: true });
                                return;
                            }
                        }
                    } catch (userErr) {
                        console.error("Failed to fetch user roles:", userErr);
                    }

                    const reqQ = query(
                        collection(db, 'requests'),
                        where('userId', '==', user.uid),
                        where('apartmentId', '==', aptId),
                        where('status', '==', 'pending')
                    );
                    try {
                        const reqSnap = await getDocs(reqQ);
                        if (!reqSnap.empty) {
                            setRequestStatus('pending');
                        }
                    } catch (fetchErr) {
                        console.error("Firestore getDocs failed:", fetchErr);
                    }
                }
            } catch (err) {
                console.error(err);
                showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
            }
            setLoading(false);
        };

        loadData();
    }, [aptId, user]);

    const submitJoinRequest = async (currentUser) => {
        try {
            await addDoc(collection(db, 'requests'), {
                userId: currentUser.uid,
                userName: name || currentUser.displayName || 'ผู้เช่า',
                userEmail: currentUser.email || '',
                userPhone: phone || '',
                apartmentId: aptId,
                apartmentName: apartment?.general?.name || 'Unknown',
                status: 'pending',
                type: 'tenant',
                createdAt: serverTimestamp()
            });
            showToast('ส่งคำขอลงทะเบียนเรียบร้อยแล้ว กรุณารอนายตรวจอนุมัติ', 'success');
            navigate('/tenant-dashboard', { replace: true });
        } catch (error) {
            console.error(error);
            showToast('ส่งคำขอล้มเหลว', 'error');
        }
        setSubmitting(false);
    };

    const handleAuthAndJoin = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        let currentUser = user;

        try {
            if (!currentUser) {
                let authEmail = email;
                if (authMethod === 'phone') {
                    if (!phone || phone.length < 9) { showToast('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง (9-10 หลัก)', 'error'); setSubmitting(false); return; }
                    authEmail = `${phone.replace(/\D/g, '')}@growapart.system`;
                } else {
                    if (!email || !email.includes('@')) { showToast('กรุณากรอกอีเมลให้ถูกต้อง', 'error'); setSubmitting(false); return; }
                    authEmail = email;
                }

                if (!password || password.length < 6) {
                    showToast('รหัสผ่านต้องมี 6 ตัวอักษรขึ้นไป', 'error');
                    setSubmitting(false);
                    return;
                }

                try {
                    // Try to sign in first (if account already exists)
                    console.log("Attempting sign in:", authEmail);
                    const userCredential = await signInWithEmailAndPassword(auth, authEmail, password);
                    currentUser = userCredential.user;
                    localStorage.setItem('loginContext', 'tenant');
                } catch (signInErr) {
                    console.log("Sign in failed:", signInErr.code, signInErr.message);
                    // If doesn't exist, create new account
                    if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential' || signInErr.code === 'auth/invalid-email') {
                        try {
                            const userCredential = await createUserWithEmailAndPassword(auth, authEmail, password);
                            currentUser = userCredential.user;
                            localStorage.setItem('loginContext', 'tenant');

                            await setDoc(doc(db, 'users', currentUser.uid), {
                                name: name || 'ผู้เช่า',
                                email: authMethod === 'email' ? authEmail : '',
                                phone: authMethod === 'phone' ? phone : '',
                                role: 'tenant',
                                createdAt: serverTimestamp()
                            });
                        } catch (createErr) {
                            console.error("Create User Error:", createErr);
                            showToast(createErr.code === 'auth/email-already-in-use' ? 'อีเมล/เบอร์โทรนี้ถูกใช้งานแล้ว' : 'สมัครสมาชิกไม่สำเร็จ', 'error');
                            setSubmitting(false);
                            return;
                        }
                    } else {
                        console.error("Sign In Error:", signInErr);
                        showToast('รหัสผ่านไม่ถูกต้อง หรือพบข้อผิดพลาด', 'error');
                        setSubmitting(false);
                        return;
                    }
                }
            }
            if (currentUser) {
                await submitJoinRequest(currentUser);
            }
        } catch (error) {
            console.error(error);
            showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
            setSubmitting(false);
        }
    };

    if (loading) return <div className="flex h-screen w-full items-center justify-center bg-brand-bg"><Loader2 className="w-12 h-12 text-brand-orange-500 animate-spin" /></div>;

    return (
        <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center py-10 px-4 relative">
            <Toast {...toast} onClose={hideToast} />
            <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-brand-orange-500/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="max-w-md w-full bg-brand-card rounded-xl p-8 shadow-lg border border-white/10 relative z-10">
                <div className="text-center mb-10">
                    <div className="w-16 h-16 bg-brand-orange-500/20 rounded-2xl flex items-center justify-center text-brand-orange-500 mx-auto mb-4 border border-brand-orange-500/30">
                        <Building className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-1 uppercase tracking-tight">{apartment?.general?.name || 'ลงทะเบียนผู้เช่า'}</h1>
                    <p className="text-brand-gray-500 font-bold text-xs tracking-wide">TENANT REGISTRATION</p>
                </div>

                {requestStatus === 'pending' ? (
                    <div className="bg-emerald-500/10 rounded-xl p-8 border border-emerald-500/20 text-center animate-in zoom-in-95 duration-500">
                        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                        <p className="text-emerald-500 font-bold">ส่งคำขอลงทะเบียนเรียบร้อย!</p>
                        <p className="text-brand-gray-400 text-xs mt-2 font-medium">กรุณารอเจ้าของหอพักตรวจสอบและจัดสรรห้องพักให้คุณ</p>
                        <button onClick={() => navigate('/tenant-login')} className="mt-8 w-full py-3 bg-brand-orange-500 text-brand-bg rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-brand-orange-500/20 active:scale-95 transition-all">กลับหน้าล็อกอิน</button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {!user && (
                            <>
                                <div className="flex bg-brand-bg rounded-xl p-1 border border-white/5">
                                    <button onClick={() => setAuthMethod('phone')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${authMethod === 'phone' ? 'bg-brand-card text-brand-orange-500 shadow-sm' : 'text-brand-gray-400'}`}>เบอร์โทรศัพท์</button>
                                    <button onClick={() => setAuthMethod('email')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${authMethod === 'email' ? 'bg-brand-card text-brand-orange-500 shadow-sm' : 'text-brand-gray-400'}`}>อีเมล</button>
                                </div>

                                <form onSubmit={handleAuthAndJoin} className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-brand-gray-500 uppercase px-1 tracking-widest">ชื่อ - นามสกุล</label>
                                        <input
                                            type="text"
                                            placeholder="กรอกชื่อและนามสกุลจริง"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="w-full bg-white/5 rounded-xl px-4 py-3 text-sm text-white border border-white/10 focus:border-brand-orange-500 outline-none placeholder:text-white/10 transition-all font-medium"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-brand-gray-500 uppercase px-1 tracking-widest">{authMethod === 'phone' ? 'เบอร์โทรศัพท์' : 'อีเมล'}</label>
                                        {authMethod === 'phone' ? (
                                            <div className="flex items-center bg-white/5 rounded-xl px-4 py-3 border border-white/10 focus-within:border-brand-orange-500 transition-all">
                                                <Phone className="w-4 h-4 text-white/20 mr-3 shrink-0" />
                                                <input type="tel" placeholder="08X-XXX-XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-transparent border-none text-white font-medium w-full outline-none placeholder:text-white/10 text-sm" required />
                                            </div>
                                        ) : (
                                            <div className="flex items-center bg-white/5 rounded-xl px-4 py-3 border border-white/10 focus-within:border-brand-orange-500 transition-all">
                                                <Mail className="w-4 h-4 text-white/20 mr-3 shrink-0" />
                                                <input type="email" placeholder="example@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-transparent border-none text-white font-medium w-full outline-none placeholder:text-white/10 text-sm" required />
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-brand-gray-500 uppercase px-1 tracking-widest">รหัสผ่าน</label>
                                        <div className="relative flex items-center bg-white/5 rounded-xl px-4 py-3 border border-white/10 focus-within:border-brand-orange-500 transition-all">
                                            <Lock className="w-4 h-4 text-white/20 mr-3 shrink-0" />
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                placeholder="ตั้งรหัสผ่าน 6 ตัวขึ้นไป"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className="bg-transparent border-none text-white font-medium w-full outline-none placeholder:text-white/10 text-sm"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                                            >
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full py-4 bg-gradient-to-r from-brand-orange-500 to-orange-400 text-brand-bg rounded-xl font-bold uppercase text-xs tracking-widest mt-4 flex items-center justify-center shadow-lg shadow-brand-orange-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                                    >
                                        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ลงทะเบียนเข้าพัก'}
                                    </button>
                                </form>

                                <div className="text-center">
                                    <p className="text-[10px] text-brand-gray-500 font-medium">มีบัญชีอยู่แล้ว? <button onClick={() => navigate('/tenant-login')} className="text-brand-orange-500 font-bold hover:underline">เข้าสู่ระบบ</button></p>
                                </div>
                            </>
                        )}

                        {user && (
                            <button
                                onClick={() => { setSubmitting(true); submitJoinRequest(user); }}
                                disabled={submitting}
                                className="w-full py-4 bg-brand-orange-500 text-brand-bg rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-brand-orange-500/20 active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50"
                            >
                                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ยืนยันการส่งคำขอลงทะเบียน'}
                            </button>
                        )}
                    </div>
                )}
            </div>

            <button
                onClick={() => navigate('/tenant-login')}
                className="mt-8 text-brand-gray-500 hover:text-white text-[10px] font-bold tracking-widest uppercase transition-colors"
            >
                ยกเลิกและกลับหน้าหลัก
            </button>
        </div>
    );
}
