import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, X, Info } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs) => twMerge(clsx(inputs));

let toastTimeout;

export const useToast = () => {
    const [toast, setToast] = useState(null);

    const showToast = (message, type = 'success', duration = 3000) => {
        if (toastTimeout) clearTimeout(toastTimeout);
        setToast({ message, type });
        toastTimeout = setTimeout(() => {
            setToast(null);
        }, duration);
    };

    const hideToast = () => {
        setToast(null);
        if (toastTimeout) clearTimeout(toastTimeout);
    };

    return { toast, showToast, hideToast };
};

export default function Toast({ message, type, onClose }) {
    if (!message) return null;

    const icons = {
        success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
        error: <AlertCircle className="w-5 h-5 text-red-500" />,
        info: <Info className="w-5 h-5 text-blue-500" />
    };

    const styles = {
        success: "border-emerald-500/20 bg-emerald-500/5",
        error: "border-red-500/20 bg-red-500/5",
        info: "border-blue-500/20 bg-blue-500/5"
    };

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000] animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className={cn(
                "flex items-center space-x-3 px-6 py-2.5 rounded-xl border backdrop-blur-xl shadow-lg min-w-[300px]",
                styles[type] || styles.info
            )}>
                {icons[type] || icons.info}
                <p className="flex-1 text-sm font-bold text-white">{message}</p>
                <button onClick={onClose} className="text-white/20 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
