import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function VoiceInput({ value: propsValue, onChange, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { value: string; onChange: (e: any) => void }) {
    const [isListening, setIsListening] = useState(false);
    const [localValue, setLocalValue] = useState(propsValue);
    const recognitionRef = useRef<any>(null);
    const timeoutRef = useRef<any>(null);
    const isFocused = useRef(false);

    // 外部の変更を内部に反映（フォーカス中以外、または値が変わったとき）
    useEffect(() => {
        if (!isFocused.current && propsValue !== localValue) {
            setLocalValue(propsValue);
        }
    }, [propsValue]);

    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ja-JP';

        recognition.onresult = (event: any) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript) {
                const newValue = localValue + (localValue ? ' ' : '') + finalTranscript;
                setLocalValue(newValue);
                onChange({ target: { value: newValue } });
            }
        };

        recognition.onerror = (event: any) => {
            console.error("Speech recognition error", event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [localValue]); // localValueに依存させる

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nextValue = e.target.value;
        setLocalValue(nextValue);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            onChange(e);
        }, 300); // 300ms デバウンス
    };

    const toggleListen = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isListening) {
            recognitionRef.current?.stop();
        } else {
            try {
                recognitionRef.current?.start();
                setIsListening(true);
            } catch (e) {
                console.error("Could not start speech recognition", e);
            }
        }
    };

    const hasSpeech = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    return (
        <div className="relative flex items-center w-full">
            <input
                value={localValue}
                onChange={handleTextChange}
                onFocus={() => { isFocused.current = true; }}
                onBlur={(e) => { 
                    isFocused.current = false;
                    // 確実に同期させるためonBlur時にも呼び出し
                    onChange(e);
                }}
                className={className}
                {...props}
            />
            {hasSpeech && (
                <button
                    type="button"
                    onClick={toggleListen}
                    className={cn(
                        "absolute right-2 p-1.5 rounded-full z-10 transition-colors",
                        isListening
                            ? "bg-rose-500 text-white"
                            : "text-stone-400 hover:text-emerald-500 hover:bg-stone-100"
                    )}
                    title="音声入力"
                >
                    {isListening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
                </button>
            )}
        </div>
    );
}

export function VoiceTextarea({ value: propsValue, onChange, className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; onChange: (e: any) => void }) {
    const [isListening, setIsListening] = useState(false);
    const [localValue, setLocalValue] = useState(propsValue);
    const recognitionRef = useRef<any>(null);
    const timeoutRef = useRef<any>(null);
    const isFocused = useRef(false);

    // 外部の変更を内部に反映
    useEffect(() => {
        if (!isFocused.current && propsValue !== localValue) {
            setLocalValue(propsValue);
        }
    }, [propsValue]);

    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ja-JP';

        recognition.onresult = (event: any) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript) {
                const newValue = localValue + (localValue ? '\n' : '') + finalTranscript;
                setLocalValue(newValue);
                onChange({ target: { value: newValue } });
            }
        };

        recognition.onerror = (event: any) => {
            console.error("Speech recognition error", event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [localValue]);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nextValue = e.target.value;
        setLocalValue(nextValue);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            onChange(e);
        }, 300);
    };

    const toggleListen = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isListening) {
            recognitionRef.current?.stop();
        } else {
            try {
                recognitionRef.current?.start();
                setIsListening(true);
            } catch (e) {
                console.error("Could not start speech recognition", e);
            }
        }
    };

    const hasSpeech = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    return (
        <div className="relative flex w-full">
            <textarea
                value={localValue}
                onChange={handleTextChange}
                onFocus={() => { isFocused.current = true; }}
                onBlur={(e) => { 
                    isFocused.current = false;
                    onChange(e); // 離脱時に同期を確定させる
                }}
                className={className}
                {...props}
            />
            {hasSpeech && (
                <button
                    type="button"
                    onClick={toggleListen}
                    className={cn(
                        "absolute bottom-2 right-2 p-1.5 rounded-full shadow-sm z-10 transition-colors",
                        isListening
                            ? "bg-rose-500 text-white"
                            : "bg-white border border-stone-200 text-stone-400 hover:text-emerald-500 hover:bg-stone-50"
                    )}
                    title="音声入力"
                >
                    {isListening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
                </button>
            )}
        </div>
    );
}
