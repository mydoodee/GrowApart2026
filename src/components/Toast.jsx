import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

const Toast = ({ show, message, type = 'info', onClose, duration = 3000 }) => {
    useEffect(() => {
        if (show && duration) {
            const timer = setTimeout(onClose, duration);
            return () => clearTimeout(timer);
        }
    }, [show, duration, onClose]);

    if (!show) return null;

    const styles = {
        success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 shadow-emerald-500/10',
        error: 'bg-rose-500/10 border-rose-500/20 text-rose-500 shadow-rose-500/10',
        warning: 'bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-amber-500/10',
        info: 'bg-brand-orange-500/10 border-brand-orange-500/20 text-brand-orange-500 shadow-brand-orange-500/10'
    };

    const icons = {
        success: <CheckCircle2 className="w-5 h-5" />,
        error: <AlertCircle className="w-5 h-5" />,
        warning: <AlertTriangle className="w-5 h-5" />,
        info: <Info className="w-5 h-5" />
    };

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-bottom-4 duration-300">
            <div className={`
                flex items-center gap-3 px-5 py-3.5 
                border rounded-2xl backdrop-blur-xl shadow-2xl
                min-w-[320px] max-w-md
                ${styles[type] || styles.info}
            `}>
                <div className="shrink-0">
                    {icons[type] || icons.info}
                </div>
                <p className="flex-1 text-sm font-bold tracking-tight">
                    {message}
                </p>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-white/10 rounded-lg transition-colors shrink-0"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default Toast;
