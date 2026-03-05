import { useState, useCallback } from 'react';

export const useToast = () => {
    const [toast, setToast] = useState({
        show: false,
        message: '',
        type: 'info'
    });

    const showToast = useCallback((message, type = 'info') => {
        setToast({ show: true, message, type });
    }, []);

    const hideToast = useCallback(() => {
        setToast(prev => ({ ...prev, show: false }));
    }, []);

    return { toast, showToast, hideToast };
};
