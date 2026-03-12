import React, { useEffect, useRef, useState } from 'react';
import { DrawingMarker } from '../types';
import { X, Camera, MessageSquare, Loader2, AlertCircle, CheckCircle2, ZoomIn, ZoomOut, Maximize, FileUp, ChevronLeft, ChevronRight } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';

// -------------------------------------------------------------------------
// COMPONENT: DrawingViewer
// -------------------------------------------------------------------------
// 独自の堅牢なPDFビューア実装（@react-pdf-viewer のバグや依存を排除）
// -------------------------------------------------------------------------

// PDF.js worker の設定
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface DrawingViewerProps {
    fileUrl: string;
    markers: DrawingMarker[];
    onAddMarker: (marker: Omit<DrawingMarker, 'id'>) => void;
    onRemoveMarker: (id: string) => void;
    onSelectMarker?: (marker: DrawingMarker) => void;
    readOnly?: boolean;
    className?: string;
}

export const DrawingViewer: React.FC<DrawingViewerProps> = ({
    fileUrl,
    markers,
    onAddMarker,
    onRemoveMarker,
    onSelectMarker,
    readOnly = false,
    className
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
    const [displayZoom, setDisplayZoom] = useState(1.0); // 画面表示用の即時ズーム
    const [renderZoom, setRenderZoom] = useState(1.0);   // レンダリング用の確定ズーム
    const [pdfPage, setPdfPage] = useState<pdfjs.PDFPageProxy | null>(null);
    const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const touchState = useRef({ distance: 0, initialZoom: 1.0, isPinching: false });
    const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastZoomRef = useRef(displayZoom);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    // コンテナのリサイズを監視
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    // ズーム時に中心を維持するためのスクロール調整
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !pdfDimensions.width || lastZoomRef.current === displayZoom) {
            lastZoomRef.current = displayZoom;
            return;
        }

        const viewportWidth = container.clientWidth;
        const viewportHeight = container.clientHeight;
        
        // 1. ズーム前の状態での「画面中央が図面のどの位置(0.0~1.0)にあるか」を計算
        const oldContentWidth = (pdfDimensions.width * lastZoomRef.current) / renderZoom;
        const oldContentHeight = (pdfDimensions.height * lastZoomRef.current) / renderZoom;
        
        let oldLogicalCX, oldLogicalCY;
        
        if (oldContentWidth < viewportWidth) {
            // 中央配置されている場合
            oldLogicalCX = 0.5;
        } else {
            oldLogicalCX = (container.scrollLeft + viewportWidth / 2 - 16) / oldContentWidth;
        }
        
        if (oldContentHeight < viewportHeight) {
            oldLogicalCY = 0.5;
        } else {
            oldLogicalCY = (container.scrollTop + viewportHeight / 2 - 16) / oldContentHeight;
        }

        // 2. ズーム倍率を更新した後の座標を算出
        const newContentWidth = (pdfDimensions.width * displayZoom) / renderZoom;
        const newContentHeight = (pdfDimensions.height * displayZoom) / renderZoom;

        // 3. スクロール位置を即座に適用
        requestAnimationFrame(() => {
            // マージン（センタリング用）を考慮した計算
            const newMarginX = Math.max(0, (viewportWidth - newContentWidth) / 2);
            const newMarginY = Math.max(0, (viewportHeight - newContentHeight) / 2);
            
            if (newContentWidth > viewportWidth) {
                container.scrollLeft = (oldLogicalCX * newContentWidth) - (viewportWidth / 2);
            } else {
                container.scrollLeft = 0;
            }
            
            if (newContentHeight > viewportHeight) {
                container.scrollTop = (oldLogicalCY * newContentHeight) - (viewportHeight / 2);
            } else {
                container.scrollTop = 0;
            }
        });

        lastZoomRef.current = displayZoom;
    }, [displayZoom, pdfDimensions.width]);

    useEffect(() => {
        if (!fileUrl) {
            setIsLoading(false);
            return;
        }

        let isMounted = true;
        setIsLoading(true);
        setError(null);

        const loadPdf = async () => {
            try {
                let pdjData: Parameters<typeof pdfjs.getDocument>[0] = { url: fileUrl };

                if (fileUrl.startsWith('data:')) {
                    const base64 = fileUrl.split(',')[1];
                    const binary = window.atob(base64);
                    const len = binary.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binary.charCodeAt(i);
                    }
                    pdjData = { data: bytes };
                }

                const loadingTask = pdfjs.getDocument(pdjData);
                const pdf = await loadingTask.promise;
                if (isMounted) {
                    setPdfDoc(pdf);
                    setTotalPages(pdf.numPages);
                }
                
                const pageNum = Math.min(currentPage, pdf.numPages);
                const page = await pdf.getPage(pageNum);
                
                if (isMounted) {
                    setPdfPage(page);
                    if (pageNum !== currentPage) setCurrentPage(pageNum);
                    
                    // 初期表示時にコンテナに収まるようにスケールを計算
                    if (containerRef.current) {
                        const container = containerRef.current;
                        const viewport = page.getViewport({ scale: 1.0 });
                        const containerWidth = container.clientWidth - 40; // パディング分
                        const initialScale = Math.min(containerWidth / viewport.width, 1.5);
                        setDisplayZoom(initialScale);
                        setRenderZoom(initialScale);
                        lastZoomRef.current = initialScale;
                    }
                }
            } catch (err: any) {
                console.error("PDF Loading Error:", err);
                if (isMounted) {
                    setError(err.message || "PDFの読み込みに失敗しました");
                    setIsLoading(false);
                }
            }
        };

        loadPdf();

        return () => {
            isMounted = false;
        };
    }, [fileUrl]);

    // ページ切り替え処理
    useEffect(() => {
        if (!pdfDoc) return;
        
        const changePage = async () => {
            setIsLoading(true);
            try {
                const page = await pdfDoc.getPage(currentPage);
                setPdfPage(page);
            } catch (err) {
                console.error("Page Change Error:", err);
            }
        };
        
        changePage();
    }, [currentPage, pdfDoc]);

    // 表示ズームが変更されたら、少し遅れてレンダリング用ズームを更新（デバウンス処理）
    useEffect(() => {
        if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
        
        // ズーム操作中（即時性が求められるとき）はCSSで拡大し、
        // 操作が止まって300ms後に高精細レンダリングを実行する
        renderTimeoutRef.current = setTimeout(() => {
            setRenderZoom(displayZoom);
        }, 300);

        return () => {
            if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
        };
    }, [displayZoom]);

    // renderZoom変更時に高精細再レンダリング
    useEffect(() => {
        if (!pdfPage || !canvasRef.current) return;

        let isRendered = true;
        
        const render = async () => {
            try {
                // レンダリング用のスケール（鮮明さのために2倍）
                const viewport = pdfPage.getViewport({ scale: renderZoom * 2.0 }); 
                
                const canvas = canvasRef.current!;
                const context = canvas.getContext('2d');
                if (!context) return;

                // 解像度を設定（これを変えるとキャンバスがクリアされるため、頻繁に行わない）
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };

                await pdfPage.render(renderContext).promise;
                if (isRendered) {
                    // 表示サイズを確定
                    setPdfDimensions({ 
                        width: viewport.width / 2.0, 
                        height: viewport.height / 2.0 
                    });
                    setIsLoading(false);
                }
            } catch (err) {
                console.error("Render Error:", err);
            }
        };

        render();

        return () => {
            isRendered = false;
        };
    }, [pdfPage, renderZoom]);

    // Touch handling for pinch zoom
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                touchState.current = {
                    distance: dist,
                    initialZoom: displayZoom,
                    isPinching: true
                };
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && touchState.current.isPinching) {
                e.preventDefault();
                const dist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                
                const factor = dist / touchState.current.distance;
                const newZoom = Math.min(Math.max(touchState.current.initialZoom * factor, 0.2), 5.0);
                setDisplayZoom(newZoom);
            }
        };

        const handleTouchEnd = () => {
            touchState.current.isPinching = false;
        };

        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [displayZoom, pdfPage]);

    const handleContainerZoomChange = (newZoom: number) => {
        setDisplayZoom(newZoom);
    };

    const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (readOnly || touchState.current.isPinching) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        onAddMarker({
            x,
            y,
            label: ``,
            type: 'issue',
            page: currentPage
        });
    };

    if (!fileUrl) {
        return (
            <div className={className || "h-[400px] w-full border-2 border-dashed border-stone-200 rounded-2xl flex flex-col items-center justify-center bg-stone-50 text-stone-400 p-8 text-center"}>
                <FileUp className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">図面データが添付されていません</p>
                <p className="text-xs mt-1">「現場一覧 ＞ 編集」からPDF形式の図面を選択してください</p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className={className || "h-[700px] w-full border border-stone-200 rounded-2xl overflow-auto shadow-inner bg-stone-100 relative"}>
            {/* Zoom & Page Controls */}
            {!isLoading && !error && (
                <div className="fixed top-24 right-4 z-[1000] flex flex-col gap-3 items-end pointer-events-none sm:top-28">
                    {/* Page Navigation */}
                    {totalPages > 1 && (
                        <div className="flex bg-white/90 backdrop-blur shadow-2xl rounded-2xl border border-stone-200 overflow-hidden pointer-events-auto">
                            <button 
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="p-3 hover:bg-stone-100 text-stone-600 disabled:opacity-30 transition-colors"
                                title="前のページ"
                            >
                                <ChevronLeft className="w-6 h-6" />
                            </button>
                            <div className="px-4 flex items-center justify-center min-w-[80px] text-xs font-bold text-stone-700 bg-stone-50/50 border-x border-stone-200">
                                {currentPage} / {totalPages}
                            </div>
                            <button 
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="p-3 hover:bg-stone-100 text-stone-600 disabled:opacity-30 transition-colors"
                                title="次のページ"
                            >
                                <ChevronRight className="w-6 h-6" />
                            </button>
                        </div>
                    )}

                    <div className="flex bg-white/90 backdrop-blur shadow-2xl rounded-2xl border border-stone-200 overflow-hidden pointer-events-auto">
                        <button 
                            onClick={() => handleContainerZoomChange(Math.max(displayZoom - 0.2, 0.2))}
                            className="p-3 hover:bg-stone-100 text-stone-600 transition-colors"
                            title="縮小"
                        >
                            <ZoomOut className="w-6 h-6" />
                        </button>
                        <div className="w-[1px] h-6 bg-stone-200 self-center" />
                        <button 
                            onClick={() => handleContainerZoomChange(Math.min(displayZoom + 0.2, 5.0))}
                            className="p-3 hover:bg-stone-100 text-stone-600 transition-colors"
                            title="拡大"
                        >
                            <ZoomIn className="w-6 h-6" />
                        </button>
                        <div className="w-[1px] h-6 bg-stone-200 self-center" />
                        <button 
                            onClick={() => {
                                if (pdfPage && containerRef.current) {
                                    const viewport = pdfPage.getViewport({ scale: 1.0 });
                                    const containerWidth = containerRef.current.clientWidth - 64;
                                    handleContainerZoomChange(containerWidth / viewport.width);
                                }
                            }}
                            className="p-3 hover:bg-stone-100 text-stone-600 transition-colors"
                            title="全体表示"
                        >
                            <Maximize className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            )}
            {isLoading && (
                <div className="sticky top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] bg-white/90 backdrop-blur-sm p-8 rounded-2xl shadow-xl flex flex-col items-center justify-center gap-4 w-64 max-w-full">
                    <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                    <div className="text-center">
                        <p className="text-sm font-bold text-stone-700">図面を描画中...</p>
                        <p className="text-[10px] text-stone-500 mt-1">ファイルサイズにより時間がかかる場合があります</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="sticky top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center justify-center gap-4 text-center w-[90%] max-w-md">
                    <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-2">
                        <AlertCircle className="w-8 h-8 text-rose-500" />
                    </div>
                    <div>
                        <p className="text-base font-bold text-stone-800">図面を表示できません</p>
                        <p className="text-xs text-stone-500 mt-2 leading-relaxed max-w-xs mx-auto">
                            PDFの形式が正しくないか、読み込みに失敗しました。<br />
                            <span className="font-mono bg-stone-100 px-1 rounded block mt-2 text-rose-500">{error}</span>
                        </p>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-full text-xs font-bold shadow-md hover:bg-emerald-700 transition-colors"
                    >
                        ページを再読み込みして再試行
                    </button>
                </div>
            )}

            {/* Canvas Container */}
            <div className="relative min-h-full min-w-full">
                <div 
                    className={`relative bg-white shadow-xl transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'} ${!readOnly && 'cursor-crosshair'}`}
                    style={{ 
                        width: `${pdfDimensions.width}px`,
                        height: `${pdfDimensions.height}px`,
                        transform: `scale(${displayZoom / renderZoom})`,
                        transformOrigin: '0 0',
                        willChange: 'transform',
                        marginLeft: pdfDimensions.width ? `${Math.max(0, (containerSize.width - (pdfDimensions.width * displayZoom / renderZoom)) / 2)}px` : 'auto',
                        marginTop: pdfDimensions.height ? `${Math.max(0, (containerSize.height - (pdfDimensions.height * displayZoom / renderZoom)) / 2)}px` : 'auto'
                    }}
                    onClick={handleContainerClick}
                >
                    <canvas 
                        ref={canvasRef} 
                        className="max-w-none rounded-sm border border-black/5" 
                        style={{
                            width: `${pdfDimensions.width}px`,
                            height: `${pdfDimensions.height}px`,
                        }}
                    />

                    {/* Markers Overlay */}
                    {markers
                        .filter(m => (m.page || 1) === currentPage)
                        .map((marker) => (
                        <div
                            key={marker.id}
                            className="absolute z-[110]"
                            style={{
                                left: `${marker.x}%`,
                                top: `${marker.y}%`,
                                // マーカーのサイズがズームで変わらないように逆スケールをかける
                                transform: `translate(-50%, -50%) scale(${renderZoom / displayZoom})`,
                                transformOrigin: 'center center'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onSelectMarker) onSelectMarker(marker);
                            }}
                        >
                            {(() => {
                                const isResolved = marker.correctiveAction && marker.correctivePhotoId;
                                return (
                                    <div className={`
                                        flex items-center justify-center w-8 h-8 rounded-full shadow-lg border-2 border-white
                                        ${isResolved ? 'bg-emerald-500 text-white' : (marker.type === 'issue' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white')}
                                        cursor-pointer hover:scale-110 transition-transform group relative
                                    `}>
                                        {isResolved ? (
                                            <CheckCircle2 className="w-4 h-4" />
                                        ) : marker.type === 'issue' ? (
                                            <MessageSquare className="w-4 h-4" />
                                        ) : (
                                            <Camera className="w-4 h-4" />
                                        )}
                                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[11px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-[120] pointer-events-none">
                                            {marker.label || '指摘項目'}
                                        </span>
                                        {!readOnly && (
                                            <button
                                                type="button"
                                                className="absolute -right-2 -top-2 bg-white text-rose-500 rounded-full p-1 shadow-md border border-stone-100 opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:scale-110 transition-all"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRemoveMarker(marker.id);
                                                }}
                                                title="ピンを削除"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    ))}
                </div>
                {/* 
                   スクロール領域を確保するためのゴースト要素
                   ズーム倍率に合わせて親のスクロールバーが動くようにサイズを調整する
                */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${Math.max(containerSize.width, (pdfDimensions.width * displayZoom) / renderZoom + 32)}px`,
                    height: `${Math.max(containerSize.height, (pdfDimensions.height * displayZoom) / renderZoom + 32)}px`,
                    pointerEvents: 'none',
                    zIndex: -1
                }} />
            </div>
        </div>
    );
};

