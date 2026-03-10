import React, { useState } from 'react';
import {
    X, Camera, User, Key, LogOut, ShieldCheck,
    AlertCircle, CheckCircle2, Phone
} from 'lucide-react';
import {
    updateProfile,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    signOut
} from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, storage2 } from '../firebase';
import { useNavigate } from 'react-router-dom';

export default function ProfileModal({ isOpen, onClose, user, userData, showToast }) {
    const navigate = useNavigate();
    const [editMode, setEditMode] = useState('profile'); // 'profile' or 'password'
    const [displayNameInput, setDisplayNameInput] = useState(user?.displayName || userData?.name || '');
    const [phoneInput, setPhoneInput] = useState(userData?.phone || '');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [uploadingImage, setUploadingImage] = useState(false);
    const [profileImageFile, setProfileImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleLogout = async () => {
        try {
            await signOut(auth);
            const isTenant = window.location.pathname.startsWith('/tenant');
            navigate(isTenant ? '/tenant-login' : '/login', { replace: true });
            onClose();
        } catch (error) {
            console.error('Logout error:', error);
            showToast('เกิดข้อผิดพลาดในการออกจากระบบ', 'error');
        }
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                showToast('ขนาดรูปภาพต้องไม่เกิน 2MB', 'error');
                return;
            }
            setProfileImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleUpdateProfile = async () => {
        if (!displayNameInput.trim()) {
            showToast('กรุณากรอกชื่อที่ต้องการแสดง', 'error');
            return;
        }

        setSubmitting(true);
        try {
            let photoURL = user.photoURL;

            if (profileImageFile) {
                setUploadingImage(true);
                const storageRef = ref(storage2, `shop-logos/${user.uid}/${Date.now()}_${profileImageFile.name}`);
                const snapshot = await uploadBytes(storageRef, profileImageFile);
                photoURL = await getDownloadURL(snapshot.ref);
                setUploadingImage(false);
            }

            await updateProfile(auth.currentUser, {
                displayName: displayNameInput,
                photoURL: photoURL
            });

            // Update in Firestore as well
            if (user?.uid) {
                const userRef = doc(db, 'users', user.uid);
                await updateDoc(userRef, {
                    name: displayNameInput,
                    phone: phoneInput,
                    photoURL: photoURL,
                    updatedAt: serverTimestamp()
                });
            }

            showToast('อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้ว', 'success');
            onClose();
        } catch (error) {
            console.error('Error updating profile:', error);
            showToast('เกิดข้อผิดพลาดในการอัปเดตโปรไฟล์', 'error');
        } finally {
            setSubmitting(false);
            setUploadingImage(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showToast('รหัสผ่านใหม่ไม่ตรงกัน', 'error');
            return;
        }

        if (newPassword.length < 6) {
            showToast('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร', 'error');
            return;
        }

        setSubmitting(true);
        try {
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(auth.currentUser, credential);
            await updatePassword(auth.currentUser, newPassword);

            showToast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว', 'success');
            onClose();
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            console.error('Error updating password:', error);
            if (error.code === 'auth/wrong-password') {
                showToast('รหัสผ่านปัจจุบันไม่ถูกต้อง', 'error');
            } else {
                showToast('เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน', 'error');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-5 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-brand-bg/80 backdrop-blur-md" onClick={() => !submitting && onClose()}></div>
            <div className="bg-brand-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 relative z-20 overflow-hidden animate-in slide-in-from-bottom-full duration-500 shadow-2xl">

                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-brand-orange-500/10 rounded-2xl flex items-center justify-center text-brand-orange-500">
                            {editMode === 'profile' ? <User size={20} /> : <Key size={20} />}
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white italic leading-none">
                                {editMode === 'profile' ? 'แก้ไขข้อมูลส่วนตัว' : 'เปลี่ยนรหัสผ่าน'}
                            </h3>
                            <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest mt-1">
                                {editMode === 'profile' ? 'Profile Management' : 'Security Settings'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => !submitting && onClose()}
                        className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-brand-gray-500 hover:bg-white/10 hover:text-white transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-8">
                    {/* Tabs */}
                    <div className="flex bg-brand-bg/50 p-1.5 rounded-2xl border border-white/5">
                        <button
                            onClick={() => setEditMode('profile')}
                            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${editMode === 'profile' ? 'bg-brand-orange-500 text-brand-bg shadow-lg shadow-brand-orange-500/20' : 'text-brand-gray-500 hover:text-white'}`}
                        >
                            ข้อมูลทั่วไป
                        </button>
                        <button
                            onClick={() => setEditMode('password')}
                            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${editMode === 'password' ? 'bg-brand-orange-500 text-brand-bg shadow-lg shadow-brand-orange-500/20' : 'text-brand-gray-500 hover:text-white'}`}
                        >
                            ความปลอดภัย
                        </button>
                    </div>

                    {editMode === 'profile' ? (
                        <div className="space-y-8">
                            <div className="flex flex-col items-center">
                                <div className="relative group">
                                    <div className="w-28 h-28 bg-brand-bg rounded-3xl border-2 border-brand-orange-500/20 overflow-hidden shadow-2xl p-1">
                                        <div className="w-full h-full bg-brand-card rounded-2xl flex items-center justify-center text-white font-black text-4xl uppercase overflow-hidden">
                                            {(imagePreview || user?.photoURL) ? (
                                                <img src={imagePreview || user.photoURL} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'
                                            )}
                                        </div>
                                        {uploadingImage && (
                                            <div className="absolute inset-0 bg-brand-bg/60 flex items-center justify-center rounded-3xl">
                                                <div className="w-6 h-6 border-2 border-brand-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        )}
                                    </div>
                                    <label className="absolute bottom-[-8px] right-[-8px] w-12 h-12 bg-brand-orange-500 rounded-2xl flex items-center justify-center text-brand-bg cursor-pointer shadow-xl shadow-brand-orange-500/30 hover:scale-110 active:scale-95 transition-all border-4 border-brand-card">
                                        <Camera size={20} />
                                        <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} disabled={submitting} />
                                    </label>
                                </div>
                                <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest mt-6">คลิกเพื่อเปลี่ยนรูปโปรไฟล์ (ไม่เกิน 2MB)</p>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-brand-orange-500 uppercase tracking-widest ml-4">ชื่อ - นามสกุล</label>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-gray-500 group-focus-within:text-brand-orange-500 transition-colors">
                                            <User size={16} />
                                        </div>
                                        <input
                                            type="text"
                                            value={displayNameInput}
                                            onChange={(e) => setDisplayNameInput(e.target.value)}
                                            className="w-full bg-brand-bg/50 rounded-2xl pl-11 pr-4 py-3.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all text-sm placeholder:text-white/20"
                                            placeholder="กรอกชื่อของคุณ..."
                                            disabled={submitting}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-brand-orange-500 uppercase tracking-widest ml-4">เบอร์โทรศัพท์ติดต่อ</label>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-gray-500 group-focus-within:text-brand-orange-500 transition-colors">
                                            <Phone size={16} />
                                        </div>
                                        <input
                                            type="tel"
                                            value={phoneInput}
                                            onChange={(e) => setPhoneInput(e.target.value)}
                                            className="w-full bg-brand-bg/50 rounded-2xl pl-11 pr-4 py-3.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all text-sm placeholder:text-white/20"
                                            placeholder="0XXXXXXXXX"
                                            disabled={submitting}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-brand-gray-500 uppercase tracking-widest ml-4">รหัสผ่านปัจจุบัน</label>
                                    <input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full bg-brand-bg/50 rounded-2xl px-6 py-4 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all placeholder:text-white/5 text-sm"
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
                                        className="w-full bg-brand-bg/50 rounded-2xl px-6 py-4 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all placeholder:text-white/5 text-sm"
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
                                        className="w-full bg-brand-bg/50 rounded-2xl px-6 py-4 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all placeholder:text-white/5 text-sm"
                                        placeholder="••••••••"
                                        disabled={submitting}
                                    />
                                </div>
                            </div>
                            <div className="bg-brand-orange-500/5 p-4 rounded-2xl flex items-start gap-3 border border-brand-orange-500/10">
                                <ShieldCheck className="w-5 h-5 text-brand-orange-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] font-bold text-brand-gray-400 leading-relaxed uppercase tracking-wide">
                                    การเปลี่ยนรหัสผ่านจำเป็นต้องใช้รหัสผ่านปัจจุบันเพื่อยืนยันตัวตนอีกครั้ง
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 pt-0 space-y-3">
                    <button
                        onClick={editMode === 'profile' ? handleUpdateProfile : handleUpdatePassword}
                        disabled={submitting}
                        className="w-full py-4 bg-brand-orange-500 text-brand-bg rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-brand-orange-500/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {submitting ? 'กำลังดำเนินการ...' : 'บันทึกการเปลี่ยนแปลง'}
                    </button>

                    <button
                        onClick={handleLogout}
                        disabled={submitting}
                        className="w-full py-4 bg-red-500/10 text-red-500 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] border border-red-500/10 hover:bg-red-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <LogOut size={16} /> ออกจากระบบ
                    </button>

                    {/* Safe area for mobile devices */}
                    <div className="h-4 sm:hidden"></div>
                </div>
            </div>
        </div>
    );
}
