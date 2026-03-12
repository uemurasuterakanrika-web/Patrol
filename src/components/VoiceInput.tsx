import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function VoiceInput({ value, onChange, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { value: string; onChange: (e: any) => void }) {
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'ja-JP';

                recognition.onresult = (event: any) => {
                    let interimTranscript = '';
                    let finalTranscript = '';

                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        const transcript = event.results[i][0].transcript;
                        if (event.results[i].isFinal) {
                            finalTranscript += transcript;
                        } else {
                            interimTranscript += transcript;
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
            }
        }

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [onChange]); // Only recreation recognition if onChange changes

    const toggleListen = () => {
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

    return (
        <div className="relative flex items-center w-full">
            <input
                value={localValue}
                onChange={(e) => {
                    setLocalValue(e.target.value);
                    onChange(e);
                }}
                className={className}
                {...props}
            />
            {(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition ? (
                <button
                    type="button"
                    onClick={toggleListen}
                    className={cn(
                        "absolute right-2 p-1.5 rounded-full transition-colors z-10",
                        isListening
                            ? "bg-rose-500 text-white animate-pulse"
                            : "text-stone-400 hover:text-emerald-500 hover:bg-stone-100"
                    )}
                    title="音声入力"
                >
                    {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
            ) : null}
        </div>
    );
}

export function VoiceTextarea({ value, onChange, className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; onChange: (e: any) => void }) {
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'ja-JP';

                recognition.onresult = (event: any) => {
                    let finalTranscript = '';

                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        const transcript = event.results[i][0].transcript;
                        if (event.results[i].isFinal) {
                            finalTranscript += transcript;
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
            }
        }

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [onChange]); // Only recreation recognition if onChange changes

    const toggleListen = () => {
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

    return (
        <div className="relative flex w-full">
            <textarea
                value={localValue}
                onChange={(e) => {
                    setLocalValue(e.target.value);
                    onChange(e);
                }}
                className={className}
                {...props}
            />
            {(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition ? (
                <button
                    type="button"
                    onClick={toggleListen}
                    className={cn(
                        "absolute bottom-2 right-2 p-1.5 rounded-full transition-colors shadow-sm z-10",
                        isListening
                            ? "bg-rose-500 text-white animate-pulse"
                            : "bg-white border border-stone-200 text-stone-400 hover:text-emerald-500 hover:bg-stone-50"
                    )}
                    title="音声入力"
                >
                    {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
            ) : null}
        </div>
    );
}
