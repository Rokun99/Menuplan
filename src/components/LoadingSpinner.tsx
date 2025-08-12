import React from 'react';
import clsx from 'clsx';

interface LoadingSpinnerProps {
    size?: 'small' | 'medium' | 'large';
    overlay?: boolean;
    className?: string;
    text?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
    size = 'medium', 
    overlay = true, 
    className,
    text 
}) => {
    const spinnerClasses = clsx(
        'loading-spinner',
        {
            'w-5 h-5 border-2': size === 'small',
            'w-10 h-10 border-4': size === 'medium',
            'w-16 h-16 border-4': size === 'large',
        },
        className
    );

    const spinner = (
        <div className="text-center">
            <div className={spinnerClasses}></div>
            {text && <p className="text-sm text-slate-600 mt-2">{text}</p>}
        </div>
    );

    if (overlay) {
        return (
            <div className="loading-overlay">
                {spinner}
            </div>
        );
    }
    
    return spinner;
};