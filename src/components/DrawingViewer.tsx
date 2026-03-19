import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { DrawingMarker } from '../types';
import { X, Camera, MessageSquare, Loader2, AlertCircle, CheckCircle2, ZoomIn, ZoomOut, Maximize, FileUp, ChevronLeft, ChevronRight, Pen, Pin, Eraser, Trash2, Undo2, Minus } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';

// -------------------------------------------------------------------------
// COMPONENT: DrawingViewer
// -------------------------------------------------------------------------
// 独自の堅牢なPDFビューア実装（@react-pdf-viewer のバグや依存を排除）
// ＋ ペン書き込み機能（SVGレイヤー）
// -------------------------------------------------------------------------

// PDF.js worker の設定
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

export interface StrokePoint { x: number; y: number; }
export interface Stroke {
  id: string;
  points: StrokePoint[];
  color: string;
  width: number;
  page: number;
}

interface DrawingViewerProps {
    fileUrl: string;
    markers: DrawingMarker[];
    onAddMarker: (marker: Omit<DrawingMarker, 'id'>) => void;
    onRemoveMarker: (id: string) => void;
    onSelectMarker?: (marker: DrawingMarker) => void;
    readOnly?: boolean;
    className?: string;
    // ペン書き込み
    strokes?: Stroke[];
    onStrokesChange?: (strokes: Stroke[]) => void;
}

// ペンモード用カラーパレット
const PEN_COLORS = [
  { value: '#ef4444', label: '赤' },
  { value: '#f97316', label: 'オレンジ' },
  { value: '#eab308', label: '黄' },
  { value: '#22c55e', label: '緑' },
  { value: '#3b82f6', label: '青' },
  { value: '#8b5cf6', label: '紫' },
  { value: '#1e293b', label: '黒' },
];

const PEN_WIDTHS = [2, 5, 10];

// SVGパスを生成（スムーズな曲線）
function buildPath(points: StrokePoint[]): string {
  if (points.length < 2) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y + 0.1}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const cx = (points[i].x + points[i + 1].x) / 2;
    const cy = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${cx} ${cy}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export const DrawingViewer: React.FC<DrawingViewerProps> = ({
    fileUrl,
    markers,
    onAddMarker,
    onRemoveMarker,
    onSelectMarker,
    readOnly = false,
    className,
    strokes: externalStrokes,
    onStrokesChange,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
    const [displayZoom, setDisplayZoom] = useState(1.0);
    const [renderZoom, setRenderZoom] = useState(1.0);
    const [isPinching, setIsPinching] = useState(false);
    const [pdfPage, setPdfPage] = useState<pdfjs.PDFPageProxy | null>(null);
    const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const touchState = useRef({ 
        distance: 0, 
        initialZoom: 1.0, 
        isPinching: false, 
        pinchOriginX: 0, 
        pinchOriginY: 0,
        lastScaleFactor: 1.0,
        startX: 0,
        startY: 0,
        startTime: 0,
        isTouchingMarker: false
    });
    const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastZoomRef = useRef(displayZoom);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const viewerRef = useRef<HTMLDivElement>(null);
    const preZoomScrollRef = useRef<{ x: number, y: number } | null>(null);

    // --- ペン書き込み state ---
    const [mode, setMode] = useState<'pin' | 'pen' | 'eraser'>('pin');
    const [penColor, setPenColor] = useState('#ef4444');
    const [penWidth, setPenWidth] = useState(5);
    const [strokes, setStrokes] = useState<Stroke[]>(externalStrokes || []);
    const [currentStroke, setCurrentStroke] = useState<StrokePoint[] | null>(null);
    const isDrawingRef = useRef(false);
    const currentStrokeRef = useRef<StrokePoint[]>([]);
    const penColorRef = useRef(penColor);
    const penWidthRef = useRef(penWidth);
    const currentPageRef = useRef(currentPage);

    // 外部から渡された strokes と同期
    useEffect(() => {
        if (externalStrokes !== undefined) setStrokes(externalStrokes);
    }, [externalStrokes]);

    // refを最新stateと同期
    useEffect(() => { penColorRef.current = penColor; }, [penColor]);
    useEffect(() => { penWidthRef.current = penWidth; }, [penWidth]);
    useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

    const notifyStrokes = useCallback((newStrokes: Stroke[]) => {
        setStrokes(newStrokes);
        onStrokesChange?.(newStrokes);
    }, [onStrokesChange]);

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

    // ズーム時に中心を維持
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container || !pdfDimensions.width || lastZoomRef.current === displayZoom) {
            lastZoomRef.current = displayZoom;
            return;
        }

        const viewportWidth = container.clientWidth;
        const viewportHeight = container.clientHeight;
        
        if (viewerRef.current) {
            viewerRef.current.style.transform = 'none';
            viewerRef.current.style.willChange = 'auto';
        }

        let oldScrollX = container.scrollLeft;
        let oldScrollY = container.scrollTop;
        if (preZoomScrollRef.current) {
            oldScrollX = preZoomScrollRef.current.x;
            oldScrollY = preZoomScrollRef.current.y;
            preZoomScrollRef.current = null;
        }
        
        const scaleRatio = displayZoom / lastZoomRef.current;

        let cx = viewportWidth / 2;
        let cy = viewportHeight / 2;
        if (touchState.current.pinchOriginX > 0 || touchState.current.pinchOriginY > 0) {
            cx = touchState.current.pinchOriginX;
            cy = touchState.current.pinchOriginY;
            touchState.current.pinchOriginX = 0;
            touchState.current.pinchOriginY = 0;
        }

        const newScrollX = (oldScrollX + cx) * scaleRatio - cx;
        const newScrollY = (oldScrollY + cy) * scaleRatio - cy;

        container.scrollLeft = newScrollX;
        container.scrollTop = newScrollY;

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

                const CMAP_URL = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`;
                const CMAP_PACKED = true;

                const loadingTask = pdfjs.getDocument({
                    ...pdjData,
                    cMapUrl: CMAP_URL,
                    cMapPacked: CMAP_PACKED
                });
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
                    
                    if (containerRef.current) {
                        const container = containerRef.current;
                        const viewport = page.getViewport({ scale: 1.0 });
                        const containerWidth = container.clientWidth - 40;
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

    // ページ切り替え
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

    // デバウンスレンダリング
    useEffect(() => {
        if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
        renderTimeoutRef.current = setTimeout(() => {
            setRenderZoom(displayZoom);
        }, 400);
        return () => {
            if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
        };
    }, [displayZoom]);

    // PDF高精細レンダリング
    useEffect(() => {
        if (!pdfPage || !canvasRef.current) return;

        let isRendered = true;
        let currentRenderTask: any = null;
        
        const render = async () => {
            try {
                const MAX_CANVAS_DIMENSION = 3000;
                const baseViewport = pdfPage.getViewport({ scale: 1.0 });
                
                let targetScale = renderZoom * 2.0;
                if (baseViewport.width * targetScale > MAX_CANVAS_DIMENSION || baseViewport.height * targetScale > MAX_CANVAS_DIMENSION) {
                    const scaleX = MAX_CANVAS_DIMENSION / baseViewport.width;
                    const scaleY = MAX_CANVAS_DIMENSION / baseViewport.height;
                    targetScale = Math.min(scaleX, scaleY);
                }

                const viewport = pdfPage.getViewport({ scale: targetScale }); 
                
                const canvas = canvasRef.current!;
                
                const offscreenCanvas = document.createElement('canvas');
                const offscreenContext = offscreenCanvas.getContext('2d');
                if (!offscreenContext) return;
                offscreenCanvas.width = viewport.width;
                offscreenCanvas.height = viewport.height;

                const renderContext = {
                    canvasContext: offscreenContext,
                    viewport: viewport
                };

                currentRenderTask = pdfPage.render(renderContext);
                await currentRenderTask.promise;
                
                if (isRendered) {
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const context = canvas.getContext('2d');
                    if (context) {
                        context.drawImage(offscreenCanvas, 0, 0);
                    }

                    const baseViewport2 = pdfPage.getViewport({ scale: 1.0 });
                    setPdfDimensions({ 
                        width: baseViewport2.width, 
                        height: baseViewport2.height 
                    });
                    setIsLoading(false);
                }
            } catch (err: any) {
                if (err?.name === 'RenderingCancelledException') {
                    // ignore
                } else {
                    console.error("Render Error:", err);
                }
            }
        };

        render();

        return () => {
            isRendered = false;
            if (currentRenderTask) {
                currentRenderTask.cancel();
            }
        };
    }, [pdfPage, renderZoom]);

    // ペン描画用マウスイベント (PC)
    const getRelativePoint = useCallback((clientX: number, clientY: number): StrokePoint | null => {
        const svg = svgRef.current;
        if (!svg) return null;
        const rect = svg.getBoundingClientRect();
        return {
            x: ((clientX - rect.left) / rect.width) * pdfDimensions.width,
            y: ((clientY - rect.top) / rect.height) * pdfDimensions.height
        };
    }, [pdfDimensions]);

    const handleSvgMouseDown = useCallback((e: React.MouseEvent) => {
        if (mode !== 'pen' && mode !== 'eraser') return;
        if (mode === 'eraser') return; // eraser handled by stroke click
        e.preventDefault();
        const pt = getRelativePoint(e.clientX, e.clientY);
        if (!pt) return;
        isDrawingRef.current = true;
        currentStrokeRef.current = [pt];
        setCurrentStroke([pt]);
    }, [mode, getRelativePoint]);

    const handleSvgMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDrawingRef.current || mode !== 'pen') return;
        const pt = getRelativePoint(e.clientX, e.clientY);
        if (!pt) return;
        currentStrokeRef.current = [...currentStrokeRef.current, pt];
        setCurrentStroke([...currentStrokeRef.current]);
    }, [mode, getRelativePoint]);

    const handleSvgMouseUp = useCallback(() => {
        if (!isDrawingRef.current || mode !== 'pen') return;
        isDrawingRef.current = false;
        if (currentStrokeRef.current.length < 2) {
            setCurrentStroke(null);
            currentStrokeRef.current = [];
            return;
        }
        const newStroke: Stroke = {
            id: `stroke-${Date.now()}`,
            points: currentStrokeRef.current,
            color: penColorRef.current,
            width: penWidthRef.current,
            page: currentPageRef.current
        };
        const next = [...strokes, newStroke];
        notifyStrokes(next);
        setCurrentStroke(null);
        currentStrokeRef.current = [];
    }, [mode, strokes, notifyStrokes]);

    // ペン描画用タッチイベント (スマホ/タブレット)　― ペンモード時のみ
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        const getRelPt = (touch: Touch): StrokePoint | null => {
            const rect = svg.getBoundingClientRect();
            const dims = pdfDimensions;
            if (!dims.width || !dims.height) return null;
            return {
                x: ((touch.clientX - rect.left) / rect.width) * dims.width,
                y: ((touch.clientY - rect.top) / rect.height) * dims.height
            };
        };

        const onTouchStart = (e: TouchEvent) => {
            if (mode !== 'pen') return;
            if (e.touches.length !== 1) return;
            e.preventDefault();
            e.stopPropagation();
            const pt = getRelPt(e.touches[0]);
            if (!pt) return;
            isDrawingRef.current = true;
            currentStrokeRef.current = [pt];
            setCurrentStroke([pt]);
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!isDrawingRef.current || mode !== 'pen') return;
            if (e.touches.length !== 1) return;
            e.preventDefault();
            e.stopPropagation();
            const pt = getRelPt(e.touches[0]);
            if (!pt) return;
            currentStrokeRef.current = [...currentStrokeRef.current, pt];
            setCurrentStroke([...currentStrokeRef.current]);
        };

        const onTouchEnd = (e: TouchEvent) => {
            if (!isDrawingRef.current || mode !== 'pen') return;
            e.preventDefault();
            e.stopPropagation();
            isDrawingRef.current = false;
            if (currentStrokeRef.current.length < 2) {
                setCurrentStroke(null);
                currentStrokeRef.current = [];
                return;
            }
            const newStroke: Stroke = {
                id: `stroke-${Date.now()}`,
                points: currentStrokeRef.current,
                color: penColorRef.current,
                width: penWidthRef.current,
                page: currentPageRef.current
            };
            setStrokes(prev => {
                const next = [...prev, newStroke];
                onStrokesChange?.(next);
                return next;
            });
            setCurrentStroke(null);
            currentStrokeRef.current = [];
        };

        svg.addEventListener('touchstart', onTouchStart, { passive: false });
        svg.addEventListener('touchmove', onTouchMove, { passive: false });
        svg.addEventListener('touchend', onTouchEnd, { passive: false });
        return () => {
            svg.removeEventListener('touchstart', onTouchStart);
            svg.removeEventListener('touchmove', onTouchMove);
            svg.removeEventListener('touchend', onTouchEnd);
        };
    }, [mode, pdfDimensions, onStrokesChange]);

    // Touch handling for pinch zoom (ペンモード時は無効)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleTouchStart = (e: TouchEvent) => {
            if (mode === 'pen') return; // ペンモード中はピンチを無視
            if (e.target instanceof Element && e.target.closest('.pointer-events-auto') && !e.target.closest('.cursor-crosshair')) {
                return;
            }

            if (e.touches.length === 1) {
                touchState.current.startX = e.touches[0].clientX;
                touchState.current.startY = e.touches[0].clientY;
                touchState.current.startTime = Date.now();
                touchState.current.isTouchingMarker = !!(e.target instanceof Element && e.target.closest('.drawing-marker-pin'));
            }
            if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                
                const containerRect = container.getBoundingClientRect();
                const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                
                if (viewerRef.current) {
                    const rect = viewerRef.current.getBoundingClientRect();
                    const originX = centerX - rect.left;
                    const originY = centerY - rect.top;
                    viewerRef.current.style.transformOrigin = `${originX}px ${originY}px`;
                    viewerRef.current.style.willChange = 'transform';
                }

                touchState.current = {
                    ...touchState.current,
                    distance: dist,
                    initialZoom: displayZoom,
                    isPinching: true,
                    pinchOriginX: Math.max(0.1, centerX - containerRect.left),
                    pinchOriginY: Math.max(0.1, centerY - containerRect.top),
                    lastScaleFactor: 1.0
                };
                setIsPinching(true);
            }
        };

        let ticking = false;
        const handleTouchMove = (e: TouchEvent) => {
            if (mode === 'pen') return;
            if (e.touches.length === 2 && touchState.current.isPinching) {
                e.preventDefault();
                const dist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                
                if (!ticking) {
                    requestAnimationFrame(() => {
                        const factor = dist / touchState.current.distance;
                        const newZoom = Math.min(Math.max(touchState.current.initialZoom * factor, 0.2), 5.0);
                        const actualFactor = newZoom / touchState.current.initialZoom;
                        touchState.current.lastScaleFactor = actualFactor;
                        if (viewerRef.current) {
                            viewerRef.current.style.transform = `scale(${actualFactor})`;
                        }
                        ticking = false;
                    });
                    ticking = true;
                }
            }
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (mode === 'pen') return;
            if (e.target instanceof Element && e.target.closest('.pointer-events-auto') && !e.target.closest('.cursor-crosshair')) {
                return;
            }

            if (touchState.current.isPinching) {
                touchState.current.isPinching = false;
                setIsPinching(false);
                
                const actualFactor = touchState.current.lastScaleFactor || 1.0;
                touchState.current.lastScaleFactor = 1.0;

                if (actualFactor !== 1.0) {
                    const finalZoom = Math.min(Math.max(touchState.current.initialZoom * actualFactor, 0.2), 5.0);
                    if (Math.abs(finalZoom - displayZoom) > 0.001) {
                        preZoomScrollRef.current = { x: container.scrollLeft, y: container.scrollTop };
                        setDisplayZoom(finalZoom);
                    } else {
                        touchState.current.pinchOriginX = 0;
                        touchState.current.pinchOriginY = 0;
                        if (viewerRef.current) {
                            viewerRef.current.style.transform = 'none';
                            viewerRef.current.style.willChange = 'auto';
                        }
                    }
                } else {
                    touchState.current.pinchOriginX = 0;
                    touchState.current.pinchOriginY = 0;
                    if (viewerRef.current) {
                        viewerRef.current.style.transform = 'none';
                        viewerRef.current.style.willChange = 'auto';
                    }
                }
            } else if (e.changedTouches.length === 1 && !readOnly && !touchState.current.isTouchingMarker && mode === 'pin') {
                const timeDiff = Date.now() - touchState.current.startTime;
                const endX = e.changedTouches[0].clientX;
                const endY = e.changedTouches[0].clientY;
                const distFromStart = Math.hypot(
                    endX - touchState.current.startX,
                    endY - touchState.current.startY
                );

                if (timeDiff < 300 && distFromStart < 15) {
                    const rect = viewerRef.current?.getBoundingClientRect();
                    if (rect) {
                        const x = ((endX - rect.left) / rect.width) * 100;
                        const y = ((endY - rect.top) / rect.height) * 100;
                        onAddMarker({
                            x,
                            y,
                            label: ``,
                            type: 'issue',
                            page: currentPage
                        });
                    }
                }
            }
        };

        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);
        container.addEventListener('touchcancel', handleTouchEnd);

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
            container.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, [displayZoom, pdfPage, mode]);

    const handleContainerZoomChange = (newZoom: number) => {
        if (containerRef.current) {
            preZoomScrollRef.current = { x: containerRef.current.scrollLeft, y: containerRef.current.scrollTop };
        }
        setDisplayZoom(newZoom);
    };

    const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (readOnly || touchState.current.isPinching) return;
        if (mode !== 'pin') return; // ピンモード以外はクリックでピンを立てない
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

    // undo
    const handleUndo = () => {
        const next = strokes.slice(0, -1);
        notifyStrokes(next);
    };

    // clear all strokes on current page
    const handleClearPage = () => {
        if (!confirm('このページのペン書き込みをすべて消去しますか？')) return;
        const next = strokes.filter(s => s.page !== currentPage);
        notifyStrokes(next);
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

    const currentPageStrokes = strokes.filter(s => s.page === currentPage);
    const strokesOnPage = currentPageStrokes.length;

    return (
        <div ref={containerRef} className={className || "h-[700px] w-full border border-stone-200 rounded-2xl overflow-auto shadow-inner bg-stone-100 relative"}>
            {/* Zoom & Page Controls */}
            {!isLoading && !error && (
                <div className="fixed top-24 right-4 z-[1000] flex flex-col gap-3 items-end pointer-events-none sm:top-28">
                    {/* Page Navigation */}
                    {totalPages > 1 && (
                        <div 
                            className="flex bg-white/90 backdrop-blur shadow-2xl rounded-2xl border border-stone-200 overflow-hidden pointer-events-auto"
                            onTouchStart={(e) => e.stopPropagation()}
                            onTouchEnd={(e) => e.stopPropagation()}
                        >
                            <button 
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="p-3 hover:bg-stone-100 text-stone-600 disabled:opacity-30"
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
                                className="p-3 hover:bg-stone-100 text-stone-600 disabled:opacity-30"
                                title="次のページ"
                            >
                                <ChevronRight className="w-6 h-6" />
                            </button>
                        </div>
                    )}

                    <div 
                        className="flex bg-white/90 backdrop-blur shadow-2xl rounded-2xl border border-stone-200 overflow-hidden pointer-events-auto"
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => e.stopPropagation()}
                    >
                        <button 
                            onClick={() => handleContainerZoomChange(Math.max(displayZoom - 0.2, 0.2))}
                            className="p-3 hover:bg-stone-100 text-stone-600"
                            title="縮小"
                        >
                            <ZoomOut className="w-6 h-6" />
                        </button>
                        <div className="w-[1px] h-6 bg-stone-200 self-center" />
                        <button 
                            onClick={() => handleContainerZoomChange(Math.min(displayZoom + 0.2, 5.0))}
                            className="p-3 hover:bg-stone-100 text-stone-600"
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

            {/* ─── ツールバー（左下固定） ─── */}
            {!isLoading && !error && !readOnly && (
                <div
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1001] pointer-events-auto"
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                >
                    <div className="flex flex-col gap-2 items-center">

                        {/* ペンモード時のオプション */}
                        {mode === 'pen' && (
                            <div className="flex flex-col gap-2 bg-white/95 backdrop-blur border border-stone-200 shadow-2xl rounded-2xl px-3 py-3 w-[calc(100vw-32px)] max-w-sm">
                                {/* 上段：カラーパレット */}
                                <div className="flex items-center justify-center gap-2 flex-wrap">
                                    {PEN_COLORS.map(c => (
                                        <button
                                            key={c.value}
                                            onClick={() => setPenColor(c.value)}
                                            className={`w-8 h-8 rounded-full border-2 transition-transform ${penColor === c.value ? 'scale-125 border-stone-700 shadow-md' : 'border-white'}`}
                                            style={{ backgroundColor: c.value }}
                                            title={c.label}
                                        />
                                    ))}
                                </div>
                                {/* 下段：太さ + Undo + 全消去 */}
                                <div className="flex items-center justify-center gap-2">
                                    {PEN_WIDTHS.map(w => (
                                        <button
                                            key={w}
                                            onClick={() => setPenWidth(w)}
                                            className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${penWidth === w ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                                            title={`太さ ${w}`}
                                        >
                                            <div className="rounded-full bg-current" style={{ width: Math.min(w * 2 + 4, 24), height: Math.min(w * 2 + 4, 24) }} />
                                        </button>
                                    ))}
                                    <div className="w-px h-6 bg-stone-200 mx-1" />
                                    <button
                                        onClick={handleUndo}
                                        disabled={strokesOnPage === 0}
                                        className="flex items-center justify-center w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 disabled:opacity-30"
                                        title="1つ戻す"
                                    >
                                        <Undo2 className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={handleClearPage}
                                        disabled={strokesOnPage === 0}
                                        className="flex items-center justify-center w-9 h-9 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-500 disabled:opacity-30"
                                        title="このページの書き込みを全消去"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* メインツール切り替え */}
                        <div className="flex gap-2 bg-white/95 backdrop-blur border border-stone-200 shadow-2xl rounded-2xl px-3 py-2.5">
                            <button
                                onClick={() => setMode('pin')}
                                className={`flex items-center gap-2 px-3 py-2.5 sm:px-4 rounded-xl font-bold text-sm transition-all ${mode === 'pin' ? 'bg-emerald-600 text-white shadow-md' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                                title="ピンモード（タップで指摘を追加）"
                            >
                                <Pin className="w-5 h-5" />
                                <span className="hidden sm:inline">ピン</span>
                            </button>
                            <button
                                onClick={() => setMode('pen')}
                                className={`flex items-center gap-2 px-3 py-2.5 sm:px-4 rounded-xl font-bold text-sm transition-all ${mode === 'pen' ? 'bg-blue-600 text-white shadow-md' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                                title="ペンモード（図面に書き込み）"
                            >
                                <Pen className="w-5 h-5" />
                                <span className="hidden sm:inline">ペン</span>
                            </button>
                            {(mode === 'pen' || mode === 'eraser') && strokesOnPage > 0 && (
                                <button
                                    onClick={() => setMode(m => m === 'eraser' ? 'pen' : 'eraser')}
                                    className={`flex items-center gap-2 px-3 py-2.5 sm:px-4 rounded-xl font-bold text-sm transition-all ${mode === 'eraser' ? 'bg-orange-500 text-white shadow-md' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                                    title="消しゴムモード（線をタップして削除）"
                                >
                                    <Eraser className="w-5 h-5" />
                                    <span className="hidden sm:inline">消しゴム</span>
                                </button>
                            )}
                        </div>
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
                        className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-full text-xs font-bold shadow-md hover:bg-emerald-700"
                    >
                        ページを再読み込みして再試行
                    </button>
                </div>
            )}

            {/* Canvas Container */}
            <div className="relative min-h-full min-w-full">
                <div 
                    ref={viewerRef}
                    className={`relative bg-white shadow-xl ${isLoading ? 'opacity-0' : 'opacity-100'} ${mode === 'pin' && !readOnly ? 'cursor-crosshair' : mode === 'pen' ? 'cursor-none' : mode === 'eraser' ? 'cursor-cell' : ''}`}
                    style={{ 
                        width: `${pdfDimensions.width * displayZoom}px`,
                        height: `${pdfDimensions.height * displayZoom}px`,
                        marginLeft: pdfDimensions.width ? `${Math.max(0, (containerSize.width - (pdfDimensions.width * displayZoom)) / 2)}px` : 'auto',
                        marginTop: pdfDimensions.height ? `${Math.max(0, (containerSize.height - (pdfDimensions.height * displayZoom)) / 2)}px` : 'auto'
                    }}
                    onClick={handleContainerClick}
                >
                    {/* PDF Canvas */}
                    <canvas 
                        ref={canvasRef} 
                        className="absolute inset-0 w-full h-full rounded-sm border border-black/5 pointer-events-none" 
                    />

                    {/* SVG 書き込みレイヤー */}
                    {pdfDimensions.width > 0 && (
                        <svg
                            ref={svgRef}
                            className="absolute inset-0 w-full h-full"
                            viewBox={`0 0 ${pdfDimensions.width} ${pdfDimensions.height}`}
                            style={{ 
                                pointerEvents: (mode === 'pen' || mode === 'eraser') ? 'all' : 'none',
                                touchAction: mode === 'pen' ? 'none' : 'auto',
                                cursor: mode === 'pen' ? 'crosshair' : mode === 'eraser' ? 'cell' : 'default'
                            }}
                            onMouseDown={handleSvgMouseDown}
                            onMouseMove={handleSvgMouseMove}
                            onMouseUp={handleSvgMouseUp}
                            onMouseLeave={handleSvgMouseUp}
                        >
                            {/* 保存済みストローク */}
                            {currentPageStrokes.map(stroke => (
                                <path
                                    key={stroke.id}
                                    d={buildPath(stroke.points)}
                                    stroke={stroke.color}
                                    strokeWidth={stroke.width}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    fill="none"
                                    opacity={0.85}
                                    className={mode === 'eraser' ? 'cursor-cell hover:opacity-40' : ''}
                                    onClick={mode === 'eraser' ? (e) => {
                                        e.stopPropagation();
                                        const next = strokes.filter(s => s.id !== stroke.id);
                                        notifyStrokes(next);
                                    } : undefined}
                                    style={{ pointerEvents: mode === 'eraser' ? 'stroke' : 'none' }}
                                />
                            ))}
                            {/* 現在描画中のストローク */}
                            {currentStroke && currentStroke.length > 0 && (
                                <path
                                    d={buildPath(currentStroke)}
                                    stroke={penColor}
                                    strokeWidth={penWidth}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    fill="none"
                                    opacity={0.85}
                                    style={{ pointerEvents: 'none' }}
                                />
                            )}
                        </svg>
                    )}

                    {/* Markers Overlay */}
                    {mode !== 'pen' && markers
                        .filter(m => (m.page || 1) === currentPage)
                        .map((marker) => (
                        <div
                            key={marker.id}
                            className="absolute z-[110] drawing-marker-pin"
                            style={{
                                left: `${marker.x}%`,
                                top: `${marker.y}%`,
                                transform: `translate(-50%, -50%)`,
                                transformOrigin: 'center center'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onSelectMarker) onSelectMarker(marker);
                            }}
                        >
                            {(() => {
                                const isResolved = marker.correctiveAction && (!marker.issuePhotoId || marker.correctivePhotoId);
                                return (
                                    <div className={`
                                        flex items-center justify-center w-8 h-8 rounded-full shadow-lg border-2 border-white
                                        ${isResolved ? 'bg-emerald-500 text-white' : (marker.type === 'issue' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white')}
                                        cursor-pointer group relative
                                    `}>
                                        <span className="text-[13px] font-black leading-none tracking-tighter">
                                            {marker.label}
                                        </span>
                                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[11px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 z-[120] pointer-events-none min-w-[80px] text-center shadow-xl">
                                            {marker.description || '指摘項目'}
                                        </span>
                                    </div>
                                );
                            })()}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
