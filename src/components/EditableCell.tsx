import React, { useState, useEffect, useRef } from 'react';
import { EditIcon } from './Icons';

interface EditableCellProps {
    value: string;
    onSave: (value: string) => void;
    onSingleClick: () => void;
    allergens?: string[];
}

export const EditableCell: React.FC<EditableCellProps> = ({ value, onSave, onSingleClick, allergens }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState(value);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSave = () => {
        onSave(text);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            setText(value);
            setIsEditing(false);
        }
    };

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);
    
    useEffect(() => {
        setText(value);
    }, [value]);

    useEffect(() => {
        return () => {
            if (timer.current) {
                clearTimeout(timer.current);
            }
        };
    }, []);

    const handleClick = () => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
            setIsEditing(true);
        } else {
            timer.current = setTimeout(() => {
                timer.current = null;
                onSingleClick();
            }, 250);
        }
    };

    if (isEditing) {
        return (
            <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="absolute inset-0 w-full h-full p-2 border-2 border-blue-500 rounded-md resize-none z-10 bg-white text-base"
            />
        );
    }

    return (
        <div 
            className="relative flex-1 w-full h-full flex flex-col items-start p-2 hover:bg-slate-50 cursor-pointer group editable-cell-container transition-colors" 
            onClick={handleClick}
        >
            <span className="whitespace-pre-wrap flex-1 text-base text-slate-700">{text || <span className="text-slate-400">Klicken für Auswahl / Doppelklick zum Bearbeiten...</span>}</span>
            {allergens && allergens.length > 0 && (
                <div className="mt-auto pt-1 text-xs text-slate-400">
                    <span className="font-medium">Allergene:</span> {allergens.join(', ')}
                </div>
            )}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity edit-icon">
                <EditIcon />
            </div>
        </div>
    );
};
