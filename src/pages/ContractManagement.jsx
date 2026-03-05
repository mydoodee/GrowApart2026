import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    doc, getDoc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage2 } from '../firebase';
import {
    FileText, UploadCloud, ExternalLink, Loader2, Plus, Info, Save
} from 'lucide-react';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import MainLayout from '../components/MainLayout';
import { getUserApartments } from '../utils/apartmentUtils';

export default function ContractManagement({ user }) {
    const { toast, showToast, hideToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeAptId, setActiveAptId] = useState(localStorage.getItem('activeApartmentId'));
    const [profile, setProfile] = useState(null);
    const [apartments, setApartments] = useState([]);
    const [contractInfo, setContractInfo] = useState({ pdfURL: '', template: '' });
    const [uploadingContract, setUploadingContract] = useState(false);

    useEffect(() => {
        async function loadData() {
            if (!user) return;
            try {
                // Fetch profile
                const profileRef = doc(db, 'users', user.uid);
                const profileSnap = await getDoc(profileRef);
                if (profileSnap.exists()) {
                    setProfile(profileSnap.data());
                }

                // Fetch apartments
                const apts = await getUserApartments(user.uid);
                setApartments(apts);

                const currentId = activeAptId || (apts.length > 0 ? apts[0].id : null);
                if (currentId && currentId !== 'all') {
                    if (!activeAptId) {
                        setActiveAptId(currentId);
                        localStorage.setItem('activeApartmentId', currentId);
                    }
                    const aptRef = doc(db, 'apartments', currentId);
                    const aptSnap = await getDoc(aptRef);
                    if (aptSnap.exists()) {
                        const data = aptSnap.data();
                        setContractInfo(data.contractInfo || { pdfURL: '', template: '' });
                    }
                }
            } catch (error) {
                console.error(error);
                showToast('โหลดข้อมูลล้มเหลว', 'error');
            }
            setLoading(false);
        }
        loadData();
    }, [user, activeAptId, showToast]);

    const handleAptSwitch = (id) => {
        localStorage.setItem('activeApartmentId', id);
        setActiveAptId(id);
        showToast('สลับตึกเรียบร้อย');
    };

    const handleContractPDFUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            showToast('กรุณาเลือกไฟล์ PDF เท่านั้น', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast('ขนาดไฟล์ต้องไม่เกิน 5MB', 'error');
            return;
        }

        setUploadingContract(true);
        try {
            const storageRef = ref(storage2, `contracts/${activeAptId}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            setContractInfo(prev => ({ ...prev, pdfURL: downloadURL }));
            showToast('อัปโหลดไฟล์สัญญาเรียบร้อย', 'success');
        } catch (error) {
            console.error('Error uploading contract:', error);
            showToast('อัปโหลดไฟล์สัญญาล้มเหลว', 'error');
        } finally {
            setUploadingContract(false);
        }
    };

    const handleSave = async () => {
        if (!activeAptId || activeAptId === 'all') {
            showToast('กรุณาเลือกตึกก่อนบันทึก', 'error');
            return;
        }

        setSaving(true);
        try {
            await updateDoc(doc(db, 'apartments', activeAptId), {
                contractInfo,
                updatedAt: serverTimestamp()
            });
            showToast('บันทึกข้อมูลเรียบร้อย', 'success');
        } catch (error) {
            console.error(error);
            showToast('บันทึกล้มเหลว', 'error');
        }
        setSaving(false);
    };

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
            title="จัดการสัญญา"
        >
            <Toast {...toast} onClose={hideToast} />

            <header className="h-14 flex items-center justify-end px-6 lg:px-5 bg-brand-bg/40 backdrop-blur-md sticky top-0 z-40">
                <button
                    onClick={handleSave}
                    disabled={saving || !activeAptId || activeAptId === 'all'}
                    className="px-6 h-10 rounded-xl flex items-center shadow-md active:scale-95 transition-all disabled:opacity-50 bg-brand-orange-500 hover:bg-brand-orange-400 text-brand-bg shadow-brand-orange-500/20"
                >
                    <Save className="w-4 h-4 md:mr-2" />
                    <span className="hidden md:block font-bold text-xs">{saving ? 'บันทึก...' : 'บันทึกข้อมูล'}</span>
                </button>
            </header>

            <div className="px-6 lg:px-5 py-5 max-w-5xl mx-auto w-full">
                <div className="bg-brand-card border border-white/10 rounded-xl p-5 md:p-8 shadow-lg relative overflow-hidden min-h-[60vh]">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-brand-orange-500/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2"></div>

                    {(!activeAptId || activeAptId === 'all') ? (
                        <div className="text-center py-16">
                            <FileText className="w-10 h-10 text-brand-gray-600 mx-auto mb-6" />
                            <h3 className="text-xl font-bold text-white mb-1 uppercase tracking-tight">กรุณาเลือกตึก</h3>
                            <p className="text-brand-gray-500 font-bold text-sm uppercase tracking-widest leading-relaxed max-w-sm mx-auto">เลือกอาคารที่คุณต้องการจัดการเพื่อเข้าถึงการจัดการสัญญา</p>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center space-x-3 mb-2">
                                <div className="w-10 h-10 bg-brand-orange-500/10 rounded-xl flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-brand-orange-500" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white uppercase tracking-tight">การจัดการสัญญา</h3>
                                    <p className="text-brand-gray-400 text-xs font-medium mt-1">ตั้งค่าไฟล์สัญญาและร่างข้อความสัญญามาตรฐาน</p>
                                </div>
                            </div>

                            {/* PDF Upload Section */}
                            <div className="bg-brand-card/30 border border-white/10 rounded-2xl p-6">
                                <h4 className="text-sm font-bold text-white mb-4 flex items-center">
                                    <UploadCloud className="w-4 h-4 mr-2 text-brand-orange-500" />
                                    ไฟล์สัญญา (PDF)
                                </h4>
                                <div className="flex flex-col md:flex-row items-center gap-6">
                                    <div className="flex-1 w-full">
                                        <div className="bg-brand-bg/50 border-2 border-dashed border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all hover:border-brand-orange-500/30 group relative overflow-hidden">
                                            {contractInfo.pdfURL ? (
                                                <>
                                                    <div className="w-16 h-16 bg-brand-orange-500/20 rounded-2xl flex items-center justify-center mb-4 text-brand-orange-500">
                                                        <FileText size={32} />
                                                    </div>
                                                    <p className="text-white font-bold text-sm mb-1 uppercase tracking-tight">มีไฟล์สัญญาอยู่ในระบบแล้ว</p>
                                                    <div className="flex gap-3 mt-4">
                                                        <a
                                                            href={contractInfo.pdfURL}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-bold transition-all"
                                                        >
                                                            <ExternalLink size={14} className="mr-2" />
                                                            ดูไฟล์ปัจจุบัน
                                                        </a>
                                                        <label className="flex items-center px-4 py-2 bg-brand-orange-500 text-brand-bg rounded-xl text-xs font-bold hover:bg-brand-orange-400 transition-all cursor-pointer">
                                                            <UploadCloud size={14} className="mr-2" />
                                                            {uploadingContract ? 'กำลังอัปโหลด...' : 'อัปโหลดใหม่'}
                                                            <input type="file" className="hidden" accept=".pdf" onChange={handleContractPDFUpload} disabled={uploadingContract} />
                                                        </label>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4 text-brand-gray-600 group-hover:text-brand-orange-500 transition-all">
                                                        <UploadCloud size={32} />
                                                    </div>
                                                    <p className="text-brand-gray-400 font-bold text-sm mb-1 uppercase tracking-tight">ยังไม่ได้อัปโหลดไฟล์สัญญา</p>
                                                    <p className="text-[10px] text-brand-gray-500 font-medium mb-4 uppercase tracking-widest">ขนาดไฟล์ไม่เกิน 5MB (เฉพาะ .PDF)</p>
                                                    <label className="flex items-center px-6 py-2.5 bg-brand-orange-500 text-brand-bg rounded-xl text-xs font-bold hover:bg-brand-orange-400 transition-all cursor-pointer shadow-lg shadow-brand-orange-500/20">
                                                        {uploadingContract ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                                                        {uploadingContract ? 'กำลังอัปโหลด...' : 'เลือกไฟล์เพื่ออัปโหลด'}
                                                        <input type="file" className="hidden" accept=".pdf" onChange={handleContractPDFUpload} disabled={uploadingContract} />
                                                    </label>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Template Section */}
                            <div className="bg-brand-card/30 border border-white/10 rounded-2xl p-6">
                                <h4 className="text-sm font-bold text-white mb-4 flex items-center uppercase tracking-tight">
                                    <FileText className="w-4 h-4 mr-2 text-brand-orange-500" />
                                    ร่างข้อความสัญญา (Template)
                                </h4>
                                <div className="relative">
                                    <textarea
                                        value={contractInfo.template}
                                        onChange={(e) => setContractInfo(prev => ({ ...prev, template: e.target.value }))}
                                        rows="12"
                                        className="w-full bg-brand-bg/50 rounded-2xl p-6 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all resize-none text-sm placeholder:text-white/5 leading-relaxed"
                                        placeholder="เขียนระเบียบการ หรือข้อตกลงเบื้องต้นของหอพักที่นี่..."
                                    ></textarea>
                                    <div className="absolute top-4 right-4 text-[10px] font-black text-brand-gray-600 uppercase tracking-widest pointer-events-none">
                                        Contract Draft
                                    </div>
                                </div>
                                <div className="mt-4 flex items-start gap-3 bg-brand-orange-500/5 border border-brand-orange-500/10 rounded-xl p-4">
                                    <Info className="w-4 h-4 text-brand-orange-500 mt-0.5 shrink-0" />
                                    <p className="text-[11px] text-brand-gray-400 font-medium leading-relaxed">
                                        ข้อความนี้จะแสดงให้ผู้เช่าเห็นในหน้าลงทะเบียนหรือหน้าจัดการห้องพัก เพื่อให้รับทราบเงื่อนไขเบื้องต้นก่อนเข้าพัก
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
