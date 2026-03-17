import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  ClipboardCheck,
  MapPin,
  Calendar,
  User,
  Users,
  HardHat,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  ChevronRight,
  Menu,
  X,
  Camera,
  Trash2,
  ArrowLeft,
  Edit2,
  FileUp,
  Pin,
  Filter
} from "lucide-react";
import * as pdfjs from 'pdfjs-dist';
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { api } from "./services/api";
import { Site, Inspection, InspectionItem, DrawingMarker } from "./types";
import { INSPECTION_ITEMS } from "./constants";
import { VoiceInput, VoiceTextarea } from "./components/VoiceInput";
import { DrawingViewer } from "./components/DrawingViewer";
import { compressPdf } from "./utils/pdfCompressor";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [sites, setSites] = useState<Site[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [currentSite, setCurrentSite] = useState<Site | null>(null);
  const [currentInspection, setCurrentInspection] = useState<Inspection | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddingSite, setIsAddingSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteManager, setNewSiteManager] = useState("");
  const [newSiteDrawing, setNewSiteDrawing] = useState<string | null>(null);
  const [isCompressingPdf, setIsCompressingPdf] = useState(false);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editSiteName, setEditSiteName] = useState("");
  const [editSiteManager, setEditSiteManager] = useState("");
  const [isDrawingFullView, setIsDrawingFullView] = useState(false);
  const [pinningForItem, setPinningForItem] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [viewingSiteHistory, setViewingSiteHistory] = useState<Site | null>(null);
  const [activeMarkerInput, setActiveMarkerInput] = useState<{
    markerData: Omit<DrawingMarker, 'id'>;
    targetItemId: string;
  } | null>(null);
  const [markerDescription, setMarkerDescription] = useState("");
  const [markerPhoto, setMarkerPhoto] = useState<string | null>(null);
  const [selectedMarkerDetail, setSelectedMarkerDetail] = useState<DrawingMarker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onFileSelectedRef = useRef<((file: File) => void) | null>(null);

  const processImage = (file: File, callback: (dataUrl: string) => void) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 1024;
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } else { if (h > MAX) { w *= MAX / h; h = MAX; } }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.6));
      }
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      alert("画像の読み込みに失敗しました。");
    };
    img.src = URL.createObjectURL(file);
  };

  const triggerUpload = (handler: (file: File) => void) => {
    onFileSelectedRef.current = handler;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };
  const [isPreviewingPhoto, setIsPreviewingPhoto] = useState<string | null>(null);
  const [isActiveCorrecting, setIsActiveCorrecting] = useState(false);
  const [correctiveText, setCorrectiveText] = useState("");
  const [correctivePhoto, setCorrectivePhoto] = useState<string | null>(null);
  const [inspectionCompleted, setInspectionCompleted] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [drawingPages, setDrawingPages] = useState<Record<number, string>>({});
  const [siteDrawingUrl, setSiteDrawingUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchDrawing = async () => {
      if (currentSite?.drawingPdfId) {
        try {
          const url = await api.getFileUrl(currentSite.drawingPdfId);
          setSiteDrawingUrl(url);
        } catch (e) {
          console.error("Failed to fetch drawing:", e);
          setSiteDrawingUrl(null);
        }
      } else {
        setSiteDrawingUrl(null);
      }
    };
    fetchDrawing();
  }, [currentSite?.drawingPdfId]);

  const handleUpdateMarker = (markerId: string, updates: Partial<DrawingMarker>) => {
    if (!currentInspection) return;
    const items = [...(currentInspection.items || [])];
    let found = false;
    const updatedItems = items.map(item => {
      if (!item.markers) return item;
      try {
        const markers: DrawingMarker[] = JSON.parse(item.markers);
        const markerIdx = markers.findIndex(m => m.id === markerId);
        if (markerIdx >= 0) {
          markers[markerIdx] = { ...markers[markerIdx], ...updates };
          found = true;
          return { ...item, markers: JSON.stringify(markers) };
        }
      } catch (e) {}
      return item;
    });
    if (found) {
      setCurrentInspection({ ...currentInspection, items: updatedItems });
      if (selectedMarkerDetail && selectedMarkerDetail.id === markerId) {
        setSelectedMarkerDetail({ ...selectedMarkerDetail, ...updates });
      }
      const changedItem = updatedItems.find(i => {
        const old = items.find(oi => oi.itemId === i.itemId);
        return old?.markers !== i.markers;
      });
      if (changedItem) {
        api.registerItemResult(currentInspection.id, changedItem);
      }
    }
  };
  
  const handleDeleteMarker = (markerId: string) => {
    if (!currentInspection) return;
    if (!window.confirm("このピンを削除してもよろしいですか？")) return;
    
    const items = [...(currentInspection.items || [])];
    let found = false;
    const updatedItems = items.map(item => {
      if (!item.markers) return item;
      try {
        const markers: DrawingMarker[] = JSON.parse(item.markers);
        const filtered = markers.filter(m => m.id !== markerId);
        if (filtered.length !== markers.length) {
          found = true;
          return { ...item, markers: JSON.stringify(filtered) };
        }
      } catch (e) {}
      return item;
    });
    
    if (found) {
      setCurrentInspection({ ...currentInspection, items: updatedItems });
      const changedItem = updatedItems.find(i => {
        const old = items.find(oi => oi.itemId === i.itemId);
        return old?.markers !== i.markers;
      });
      if (changedItem) {
        api.registerItemResult(currentInspection.id, changedItem);
      }
      setSelectedMarkerDetail(null);
    }
  };
  const handlePrint = async () => {
    if (!currentSite?.drawingPdfId || !currentInspection) {
      window.print();
      return;
    }

    setIsPrinting(true);
    setInspectionCompleted(false);

    // ピンがあるページを特定
    const markerPages = new Set<number>();
    (currentInspection.items || []).forEach(item => {
      try {
        const markers: DrawingMarker[] = item.markers ? JSON.parse(item.markers) : [];
        markers.forEach(m => markerPages.add(m.page || 1));
      } catch (e) {}
    });

    if (markerPages.size > 0) {
      // PDFから各ページを画像として抽出
      const pdfUrl = await api.getFileUrl(currentSite.drawingPdfId);
      const pages: Record<number, string> = {};
      
      try {
        const pdfData = pdfUrl.startsWith('data:') 
          ? { data: new Uint8Array(atob(pdfUrl.split(',')[1]).split('').map(c => c.charCodeAt(0))) }
          : { url: pdfUrl };
        
        const CMAP_URL = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`;
        const CMAP_PACKED = true;

        const loadingTask = pdfjs.getDocument({
          ...pdfData,
          cMapUrl: CMAP_URL,
          cMapPacked: CMAP_PACKED
        });
        const pdf = await loadingTask.promise;
        
        for (const pageNum of Array.from(markerPages)) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 }); // 印刷用に高解像度
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            pages[pageNum] = canvas.toDataURL('image/jpeg', 0.8);
          }
        }
        setDrawingPages(pages);
      } catch (e) {
        console.error("Failed to capture drawing pages for print:", e);
      }
    }

    // レンダリングを待ってから印刷
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
      setDrawingPages({}); // Clear drawing pages after printing
    }, 1000);
  };
  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    // Sites Listener
    const qSites = query(collection(db, "sites"), orderBy("name"));
    const unsubSites = onSnapshot(qSites, (snapshot) => {
      const sitesData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Site));
      setSites(sitesData);
      
      // Update current site if it was updated
      if (currentSite) {
        const updated = sitesData.find(s => s.id === currentSite.id);
        if (updated) setCurrentSite(updated);
      }
    });

    // Inspections Listener
    const qInspections = query(collection(db, "inspections"), orderBy("date", "desc"));
    const unsubInspections = onSnapshot(qInspections, (snapshot) => {
      const inspectionsData = snapshot.docs.map(d => {
        const data = d.data();
        return { 
          id: d.id, 
          status: 'draft', 
          ...data 
        } as Inspection;
      });
      setInspections(inspectionsData);
      
      // Update current inspection if it was updated
      if (currentInspection) {
        // If we are looking at a specific inspection, we might need a separate listener for its subcollection (items)
        // For now, we manually re-fetch if the doc itself changed
        const updated = inspectionsData.find(i => i.id === currentInspection.id);
        if (updated) {
          // If items are in subcollection, we'd need another listener.
          // For simplicity, let's trigger a detail fetch
          api.getInspection(currentInspection.id).then(full => {
             setCurrentInspection(full);
          });
        }
      }
    });

    return () => {
      unsubSites();
      unsubInspections();
    };
  }, [currentSite?.id, currentInspection?.id]); // Only re-setup if active IDs change

  const loadInitialData = async () => {
    const [sitesData, rawInspections] = await Promise.all([
      api.getSites(),
      api.getInspections()
    ]);
    const inspectionsData = rawInspections.map(insp => ({
      status: 'draft',
      ...insp
    }));
    setSites(sitesData);
    setInspections(inspectionsData);
  };

  const handleManualItemUpdate = async (itemId: string, updates: Partial<InspectionItem>) => {
    if (!currentInspection) return;
    
    // 楽観的更新
    const items = [...(currentInspection.items || [])];
    const index = items.findIndex(i => i.itemId === itemId);
    const updatedItems = [...items];
    if (index >= 0) {
      updatedItems[index] = { ...items[index], ...updates };
    } else {
      updatedItems.push({ itemId, ...updates } as InspectionItem);
    }
    setCurrentInspection({ ...currentInspection, items: updatedItems });

    try {
      await api.registerItemResult(currentInspection.id, {
        itemId,
        ...updates
      });
    } catch (err) {
      console.error("Manual item update error:", err);
    }
  };

  const handlePhotoUpload = (itemId: string, existingData: Partial<InspectionItem>, isCorrectivePhoto: boolean = false) => {
    triggerUpload((file) => {
      processImage(file, (dataUrl) => {
        const updates = { ...existingData };
        if (isCorrectivePhoto) {
          updates.correctivePhotoId = dataUrl;
        } else {
          updates.photoId = dataUrl;
        }
        handleManualItemUpdate(itemId, updates);
      });
    });
  };

  const handleMarkerPhotoUpload = (callback: (dataUrl: string) => void) => {
    triggerUpload((file) => {
      processImage(file, callback);
    });
  };

  const handleManualHeaderUpdate = async (data: Partial<Inspection>) => {
    if (!currentInspection) return;
    try {
      await api.updateInspection(currentInspection.id, data);
    } catch (err) {
      console.error("Manual header update error:", err);
    }
  };

  const handleUpdateSiteSimple = async (id: string, updates: Partial<Site>) => {
    try {
      await api.updateSite(id, updates);
    } catch (err) {
      console.error("Simple site update error:", err);
    }
  };

  const handleCreateSite = async () => {
    if (isUploading || !newSiteName.trim()) return;
    try {
      setIsUploading(true);
      let drawingPdfId = undefined;
      if (newSiteDrawing) {
        if (newSiteDrawing.length > 1048576) {
          alert("図面のデータサイズが大きすぎます。解像度を下げるか、ページ数を減らしてください。");
          return;
        }
        console.log("Uploading PDF drawing...");
        const uploadRes = await api.uploadFile(newSiteDrawing);
        drawingPdfId = uploadRes.id;
      }

      const finalName = newSiteName.trim().endsWith("新築工事") ? newSiteName.trim() : `${newSiteName.trim()} 新築工事`;
      await api.createSite(finalName, undefined, newSiteManager.trim(), drawingPdfId);
      setNewSiteName("");
      setNewSiteManager("");
      setNewSiteDrawing(null);
      setIsAddingSite(false);
      await loadInitialData();
      alert("現場を登録しました");
    } catch (err: any) {
      console.error("Create site error:", err);
      alert("現場の作成に失敗しました: " + (err.message || "通信エラー"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateSite = async (siteId: string) => {
    if (isUploading || !editSiteName.trim()) return;
    try {
      setIsUploading(true);
      let drawingPdfId = undefined;
      // If a new drawing was selected during edit, upload it
      if (newSiteDrawing) {
        if (newSiteDrawing.length > 1048576) {
          alert("図面のデータサイズが大きすぎます。解像度を下げるか、ページ数を減らしてください。");
          return;
        }
        console.log("Updating PDF drawing...");
        const uploadRes = await api.uploadFile(newSiteDrawing);
        drawingPdfId = uploadRes.id;
      }

      const finalName = editSiteName.trim().endsWith("新築工事") ? editSiteName.trim() : `${editSiteName.trim()} 新築工事`;
      await api.updateSite(siteId, {
        name: finalName,
        managerName: editSiteManager.trim(),
        drawingPdfId: drawingPdfId
      });
      setEditingSiteId(null);
      setEditSiteName("");
      setEditSiteManager("");
      setNewSiteDrawing(null);
      await loadInitialData();
      alert("現場情報を更新しました");
    } catch (err: any) {
      console.error("Update site error:", err);
      alert("現場名の更新に失敗しました: " + (err.message || "通信エラー"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteSite = async (e: React.MouseEvent, siteId: string) => {
    if (!confirm("【警告】この現場自体を完全に削除しますか？")) return;
    try {
      await api.deleteSite(siteId);
      if (currentSite?.id === siteId) {
        setCurrentSite(null);
        setCurrentInspection(null);
      }
    } catch (err) {
      console.error("Delete site error:", err);
    }
  };

  const handleDeleteInspection = async (e: React.MouseEvent, inspectionId: string) => {
    if (!confirm("この点検記録を削除しますか？")) return;
    try {
      await api.deleteInspection(inspectionId);
      if (currentInspection?.id === inspectionId) {
        setCurrentInspection(null);
      }
    } catch (err) {
      console.error("Delete inspection error:", err);
    }
  };

  const selectInspection = async (id: string) => {
    try {
      const insp = await api.getInspection(id);
      setCurrentInspection({ status: 'draft', ...insp });
      const site = sites.find(s => s.id === insp.siteId);
      if (site) setCurrentSite(site);
      setIsSidebarOpen(false);
      setPinningForItem(null);
      setIsDrawingFullView(false);
    } catch (err: any) {
      console.error("Select inspection error:", err);
      alert("点検履歴の読み込みに失敗しました。");
    }
  };

  // siteDrawingUrl is managed by state and useEffect above
  const unresolvedIssues = currentInspection ? (() => {
    const issues: string[] = [];
    
    // 1. PDF Markers check
    const allMarkers: DrawingMarker[] = (currentInspection.items || []).flatMap(item => {
      try { return item.markers ? JSON.parse(item.markers) : []; } catch (e) { return []; }
    });
    const hasUnresolvedMarker = allMarkers.some(m => {
      // 処置内容テキストは常に必須
      if (!m.correctiveAction) return true;
      // 指摘写真がある場合は処置写真も必須、なければ任意
      if (m.issuePhotoId && !m.correctivePhotoId) return true;
      return false;
    });
    if (hasUnresolvedMarker) issues.push("図面指摘の処置入力");

    // 2. Inspection list items check
    const hasUnresolvedItem = (currentInspection.items || []).some(item => {
      const isIssue = item.rating === '✕' || item.rating === '×';
      return isIssue && !item.correctiveAction;
    });
    if (hasUnresolvedItem) issues.push("点検項目の是正処置内容");

    return issues;
  })() : [];

  const isReadyToReport = unresolvedIssues.length === 0;

  return (
    <div className="flex h-screen bg-stone-50 text-stone-900 font-sans overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white">
      {/* アプリUI全般 (印刷時は非表示) */}
      <div className="flex-1 flex overflow-hidden no-print">
        {/* Hidden Global Input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && onFileSelectedRef.current) onFileSelectedRef.current(file);
            e.target.value = '';
          }}
        />
        {isSidebarOpen && (
          <>
            <div
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
            />
            <aside
              className="fixed inset-y-0 left-0 w-72 bg-white border-r border-stone-200 z-50 lg:relative lg:translate-x-0 flex flex-col shadow-xl lg:shadow-none"
            >
              <div className="p-4 border-b border-stone-100 flex justify-between items-center">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                  点検履歴
                </h2>
                <button onClick={() => setIsSidebarOpen(false)} title="閉じる" className="lg:hidden p-1 hover:bg-stone-100 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {inspections.map(insp => (
                  <div key={insp.id} className="relative group/item">
                    <button
                      onClick={() => selectInspection(insp.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-xl border",
                        currentInspection?.id === insp.id
                          ? "bg-emerald-50 border-emerald-200 shadow-sm"
                          : "bg-white border-stone-100 hover:border-stone-300"
                      )}
                    >
                      <div className="text-xs text-stone-500 mb-1 flex justify-between">
                        <span>{insp.date}</span>
                        <div className="flex gap-1">
                          {insp.status === 'completed' ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">処置完了</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">処置完了報告待ち</span>
                          )}
                        </div>
                      </div>
                      <div className="font-medium text-sm line-clamp-1">{insp.siteName || '名称未設定'}</div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteInspection(e, insp.id);
                      }}
                      title="点検履歴を削除"
                      className="absolute top-2 right-2 p-1.5 bg-white border border-stone-100 text-stone-300 hover:text-rose-600 hover:border-rose-100 rounded-lg opacity-0 group-hover/item:opacity-100 shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </aside>
          </>
        )}

      <main className="flex-1 flex flex-col relative h-full">
        <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {currentInspection && (
              <button
                onClick={() => {
                  setCurrentInspection(null);
                  setCurrentSite(null);
                  setPinningForItem(null);
                  setIsDrawingFullView(false);
                }}
                className="p-2 hover:bg-stone-100 rounded-lg text-stone-600"
                title="ホームに戻る"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
            )}

            <div>
              <h1 className="font-bold text-stone-900 leading-tight">現場パトロール点検表</h1>
              <p className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">
                {currentSite ? currentSite.name : '現場未選択'}
              </p>
            </div>
          </div>

        </header>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-stone-50">
            {!currentInspection ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center">
                  <HardHat className="w-10 h-10 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-stone-800">点検を開始しましょう</h3>
                  <p className="text-stone-500 max-w-xs mx-auto mt-2">現場を選択して点検を開始してください。</p>
                </div>

                <div className="grid grid-cols-1 gap-3 w-full max-w-sm mt-4">
                  {sites.map(site => (
                    <div key={site.id} className="relative group/site">
                      {editingSiteId === site.id ? (
                        <div className="p-3 bg-white border border-emerald-400 rounded-2xl shadow-sm space-y-2">
                          <VoiceInput
                            autoFocus
                            value={editSiteName}
                            onChange={(e) => setEditSiteName(e.target.value)}
                            className="w-full text-sm font-medium border-none p-0 focus:ring-0 outline-none"
                            placeholder="現場名"
                          />
                          <VoiceInput
                            value={editSiteManager}
                            onChange={(e) => setEditSiteManager(e.target.value)}
                            placeholder="現場担当者..."
                            className="w-full text-xs text-stone-500 border-none p-0 focus:ring-0 outline-none"
                          />
                          <div className="flex items-center gap-2 pt-1">
                            <FileUp className="w-3 h-3 text-emerald-500" />
                            <button
                              onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = 'application/pdf';
                                input.onchange = async (e: any) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setIsCompressingPdf(true);
                                  try {
                                    const compressedDataUrl = await compressPdf(file);
                                    setNewSiteDrawing(compressedDataUrl);
                                  } catch (err) {
                                    console.error(err);
                                    alert("PDFの読み込み・最適化に失敗しました。");
                                  } finally {
                                    setIsCompressingPdf(false);
                                  }
                                };
                                input.click();
                              }}
                              className={cn(
                                "text-[9px] px-2 py-1 rounded border border-dashed",
                                isCompressingPdf ? "bg-stone-100 border-stone-300 text-stone-500 cursor-wait" : newSiteDrawing ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500"
                              )}
                              disabled={isCompressingPdf}
                              title="図面PDFをアップロード"
                            >
                              {isCompressingPdf ? "PDF最適化中..." : newSiteDrawing ? "図面更新待機中" : "図面を変更（任意）"}
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleUpdateSite(site.id)} className="flex-1 bg-emerald-600 text-white text-[10px] font-bold py-1.5 rounded-lg" title="保存">保存</button>
                            <button onClick={() => { setEditingSiteId(null); setNewSiteDrawing(null); }} className="flex-1 bg-stone-100 text-stone-600 text-[10px] font-bold py-1.5 rounded-lg" title="中止">中止</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => setViewingSiteHistory(site)}
                            className="w-full p-4 rounded-2xl border border-stone-200 bg-white hover:border-emerald-400 text-left flex items-center gap-4 group"
                            title="履歴・点検開始"
                          >
                            <div className="w-10 h-10 rounded-xl bg-stone-50 flex items-center justify-center text-stone-400 group-hover:bg-emerald-50 group-hover:text-emerald-500">
                              <MapPin className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                              <div className="font-bold text-stone-800 leading-tight">{site.name}</div>
                              <div className="text-xs text-stone-500">{site.managerName || '担当者未設定'}</div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-emerald-400" />
                          </button>
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/site:opacity-100">
                            <button onClick={() => { setEditingSiteId(site.id); setEditSiteName(site.name); setEditSiteManager(site.managerName || ""); }} className="p-1.5 bg-white border border-stone-200 rounded-lg text-stone-400 hover:text-emerald-600" title="編集"><Edit2 className="w-3 h-3" /></button>
                            <button onClick={(e) => handleDeleteSite(e, site.id)} className="p-1.5 bg-white border border-stone-200 rounded-lg text-stone-400 hover:text-rose-600" title="削除"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {isAddingSite ? (
                    <div className="p-4 rounded-2xl border border-emerald-400 bg-white space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <MapPin className="w-5 h-5 text-emerald-500" />
                          <VoiceInput
                            autoFocus
                            placeholder="新しい現場名を入力..."
                            className="flex-1 outline-none text-stone-800 font-medium"
                            value={newSiteName}
                            onChange={(e) => setNewSiteName(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <User className="w-5 h-5 text-emerald-500" />
                          <VoiceInput
                            placeholder="現場担当者名を入力..."
                            className="flex-1 outline-none text-stone-800 font-medium"
                            value={newSiteManager}
                            onChange={(e) => setNewSiteManager(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <FileUp className="w-5 h-5 text-emerald-500" />
                          <button
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = 'application/pdf';
                              input.onchange = async (e: any) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setIsCompressingPdf(true);
                                try {
                                  const compressedDataUrl = await compressPdf(file);
                                  setNewSiteDrawing(compressedDataUrl);
                                } catch (err) {
                                  console.error(err);
                                  alert("PDFの最適化に失敗しました。");
                                } finally {
                                  setIsCompressingPdf(false);
                                }
                              };
                              input.click();
                            }}
                            className={cn(
                              "text-xs px-3 py-1.5 rounded-lg border border-dashed",
                              isCompressingPdf ? "bg-stone-100 border-stone-300 text-stone-500 cursor-wait" : newSiteDrawing ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500 hover:border-emerald-200"
                            )}
                            disabled={isCompressingPdf}
                            title="図面PDFを選択"
                          >
                            {isCompressingPdf ? "PDF最適化中..." : newSiteDrawing ? "図面PDF添付済み" : "図面PDFを添付（任意）"}
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleCreateSite} className="flex-1 bg-emerald-600 text-white py-2 rounded-xl font-bold text-sm" title="現場を作成">追加</button>
                        <button onClick={() => setIsAddingSite(false)} className="flex-1 bg-stone-100 text-stone-600 py-2 rounded-xl font-bold text-sm" title="キャンセル">中止</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setIsAddingSite(true)} className="w-full p-4 rounded-2xl border border-dashed border-stone-300 text-stone-400 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 flex items-center justify-center gap-2" title="新規現場登録">
                      <Plus className="w-5 h-5" />
                      <span className="font-medium">新しい現場を追加</span>
                    </button>
                  )}
                </div>

                {viewingSiteHistory && (
                  <div 
                    className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                  >
                    <section className="bg-white rounded-3xl p-6 border border-stone-200 shadow-2xl max-w-md w-full space-y-6 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500" />
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                            <MapPin className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-stone-800">{viewingSiteHistory.name}</h3>
                            <p className="text-sm text-stone-500">{viewingSiteHistory.managerName || '担当者未設定'}</p>
                          </div>
                        </div>
                        <button onClick={() => setViewingSiteHistory(null)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest px-1">過去の点検記録</h4>
                        <div className="grid gap-2 max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
                          {inspections.filter(i => i.siteId === viewingSiteHistory.id).length > 0 ? (
                            inspections.filter(i => i.siteId === viewingSiteHistory.id).map(insp => (
                              <button
                                key={insp.id}
                                onClick={() => {
                                  selectInspection(insp.id);
                                  setViewingSiteHistory(null);
                                }}
                                className="w-full text-left p-4 rounded-2xl bg-stone-50 hover:bg-emerald-50 border border-stone-100 hover:border-emerald-200 group flex items-center justify-between"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-stone-400 group-hover:text-emerald-500 shadow-sm">
                                    <Calendar className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <div className="font-bold text-stone-800">{insp.date}</div>
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                      {insp.status === 'completed' ? (
                                        <>
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                          処置完了
                                        </>
                                      ) : (
                                        <>
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                          処置完了報告待ち
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleDeleteInspection(e, insp.id);
                                    }}
                                    className="p-2 bg-white hover:bg-rose-50 border border-stone-100 hover:border-rose-100 text-stone-300 hover:text-rose-600 rounded-xl shadow-sm group/del"
                                    title="この履歴を削除"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-emerald-400" />
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="text-center py-8 text-stone-400 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                              履歴がありません
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={async () => {
                          const newInsp = await api.createInspection({ 
                            siteId: viewingSiteHistory.id, 
                            date: new Date().toISOString().split('T')[0], 
                            status: 'draft' 
                          });
                          await loadInitialData();
                          selectInspection(newInsp.id);
                          setViewingSiteHistory(null);
                        }}
                        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 shadow-lg mt-2"
                      >
                        <Plus className="w-5 h-5" />
                        新規点検を開始する
                      </button>
                    </section>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6 max-w-3xl mx-auto">
                <h1 className="hidden print:block text-2xl font-bold text-center mb-6">現場パトロール点検報告書</h1>
                {/* Header Info Card */}
                <section className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm space-y-4">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">現場名</label>
                        <VoiceInput value={currentSite?.name || ''} onChange={(e) => currentSite && handleUpdateSiteSimple(currentSite.id, { name: e.target.value })} className="w-full bg-stone-50 border-none rounded-lg px-2 py-1 text-sm font-medium" placeholder="現場名" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">担当者</label>
                        <VoiceInput value={currentSite?.managerName || ''} onChange={(e) => currentSite && handleUpdateSiteSimple(currentSite.id, { managerName: e.target.value })} className="w-full bg-stone-50 border-none rounded-lg px-2 py-1 text-sm font-medium" placeholder="担当者" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">点検日</label>
                        <input 
                          type="date" 
                          value={currentInspection.date || ''} 
                          onChange={(e) => handleManualHeaderUpdate({ date: e.target.value })} 
                          className="w-full bg-stone-50 border-none rounded-lg px-2 py-1 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none" 
                          title="点検日"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">点検者</label>
                        <VoiceInput value={currentInspection.inspectorName || ''} onChange={(e) => handleManualHeaderUpdate({ inspectorName: e.target.value })} className="w-full bg-stone-50 border-none rounded-lg px-2 py-1 text-sm font-medium" placeholder="点検者名" />
                      </div>
                    </div>
                    <div className="flex items-end justify-end md:w-auto">
                      <button
                        onClick={handlePrint}
                        className="px-3 py-1.5 rounded-lg border-2 border-emerald-600 text-emerald-700 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-50 shadow-sm whitespace-nowrap"
                        title="PDFとして出力（印刷）"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        PDF出力・印刷
                      </button>
                    </div>
                  </div>
                </section>

                {/* Drawing & Pinning */}
                {currentSite?.drawingPdfId && (
                  <section className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 shadow-sm space-y-4">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1"><Pin className="w-3 h-3" />図面・配置指摘</label>
                      <button 
                        onClick={() => { setIsDrawingFullView(!isDrawingFullView); setPinningForItem(null); }} 
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-700" 
                        title="図面表示切り替え"
                      >
                        <Pin className="w-3.5 h-3.5" />
                        {isDrawingFullView ? "図面を閉じる" : "図面を表示する"}
                      </button>
                    </div>
                      {isDrawingFullView && (
                        <div className="fixed inset-0 z-[9999] bg-stone-100 flex flex-col">
                          {/* 戻るボタン＆ヘッダー */}
                          <div className="bg-white px-4 py-3 shadow-md border-b flex items-center justify-between z-[10000]">
                            <button 
                              onClick={() => { setIsDrawingFullView(false); setPinningForItem(null); }} 
                              className="flex items-center gap-1.5 text-stone-700 font-bold hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-4 py-2.5 rounded-xl shadow-sm"
                            >
                              <ArrowLeft className="w-5 h-5" />
                              戻る
                            </button>
                            <div className="hidden sm:flex text-sm font-bold text-stone-800 items-center justify-center gap-2 absolute left-1/2 -translate-x-1/2 pointer-events-none">
                                <Pin className="w-4 h-4 text-emerald-600" />
                                {currentSite?.name} - 現場図面
                            </div>
                            <div className="w-auto sm:w-[140px]" />
                          </div>

                          {/* ガイドメッセージ */}
                          {pinningForItem ? (
                            <div className="bg-emerald-600 text-white text-xs sm:text-sm py-2 px-4 shadow flex justify-between items-center z-[10000]">
                              <span className="font-bold">【対象】{INSPECTION_ITEMS.find(i => i.id === pinningForItem)?.label} の位置をタップ</span>
                              <button onClick={() => setPinningForItem(null)} className="bg-white/20 hover:bg-white/30 rounded px-3 py-1 text-xs font-bold" title="キャンセル">キャンセル</button>
                            </div>
                          ) : (
                            currentInspection.status !== 'completed' && (
                              <div className="bg-emerald-50 text-emerald-800 text-[11px] sm:text-xs py-2 px-4 shadow-sm flex justify-center items-center z-[10000] border-b border-emerald-100">
                                <span className="font-bold">図面内をタップするとピンを立てて指摘を作成できます</span>
                              </div>
                            )
                          )}

                          {/* ビューワ本体（全画面） */}
                          <div className="flex-1 w-full relative overflow-hidden p-0 sm:p-4">
                            <DrawingViewer
                              className="w-full h-full overflow-auto bg-white relative sm:border sm:border-stone-200 sm:rounded-2xl sm:shadow-xl"
                              fileUrl={siteDrawingUrl || ""}
                              markers={(() => {
                                const allMarkers: DrawingMarker[] = [];
                                currentInspection.items?.forEach(item => {
                                  if (item.markers) {
                                    try {
                                      const parsed = JSON.parse(item.markers);
                                      const master = INSPECTION_ITEMS.find(m => m.id === item.itemId);
                                      allMarkers.push(...parsed.map((p: any) => ({ ...p, itemId: item.itemId, label: p.label || master?.label?.substring(0, 1) || '?' })));
                                    } catch (e) { }
                                  }
                                });
                                
                                // 入力中のピンを即座に表示
                                if (activeMarkerInput) {
                                  const master = INSPECTION_ITEMS.find(m => m.id === activeMarkerInput.targetItemId);
                                  allMarkers.push({
                                    ...activeMarkerInput.markerData,
                                    id: 'temp-pin',
                                    label: '?',
                                    description: markerDescription || '詳細を入力中...'
                                  } as DrawingMarker);
                                }
                                
                                return allMarkers;
                              })()}
                              onSelectMarker={(marker) => {
                                if (marker.issuePhotoId || marker.description) {
                                  setSelectedMarkerDetail(marker);
                                  setIsActiveCorrecting(false);
                                } else {
                                  const itemId = (marker as any).itemId;
                                  if (itemId) {
                                    setIsDrawingFullView(false);
                                    setTimeout(() => {
                                      document.getElementById(`item-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }, 300);
                                  }
                                }
                              }}
                              onAddMarker={(markerData) => {
                                const targetItemId = pinningForItem || 'custom-pins';
                                setActiveMarkerInput({ markerData, targetItemId });
                                setMarkerDescription("");
                                setMarkerPhoto(null);
                              }}
                              onRemoveMarker={handleDeleteMarker}
                              readOnly={currentInspection.status === 'completed'}
                            />

                            {activeMarkerInput && (
                              <div className="absolute inset-0 z-[10001] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
                                  <div className="bg-emerald-600 p-4 text-white flex justify-between items-center">
                                    <h3 className="font-bold flex items-center gap-2">
                                      <Pin className="w-5 h-5" />
                                      指摘の追加
                                    </h3>
                                    <button onClick={() => setActiveMarkerInput(null)} className="p-1 hover:bg-white/20 rounded-full">
                                      <X className="w-5 h-5" />
                                    </button>
                                  </div>

                                  <div className="p-6 space-y-5">
                                    <div className="space-y-1.5">
                                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">指摘内容・ラベル（ピンに表示）</label>
                                      <VoiceTextarea 
                                        autoFocus
                                        value={markerDescription}
                                        onChange={(e) => setMarkerDescription(e.target.value)}
                                        placeholder="指摘内容を入力..."
                                        className="w-full bg-stone-50 border-stone-100 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-emerald-500 min-h-[100px]"
                                        rows={3}
                                      />
                                    </div>

                                    <div className="space-y-1.5">
                                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">現場写真</label>
                                      <div 
                                        onClick={() => handleMarkerPhotoUpload(setMarkerPhoto)}
                                        className={cn(
                                          "w-full aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer overflow-hidden",
                                          markerPhoto ? "border-emerald-300 bg-emerald-50" : "border-stone-200 bg-stone-50 hover:border-emerald-200"
                                        )}
                                      >
                                        {markerPhoto ? (
                                          <img src={markerPhoto} className="w-full h-full object-cover" alt="Selected" />
                                        ) : (
                                          <>
                                            <Camera className="w-8 h-8 text-stone-300 mb-2" />
                                            <span className="text-xs text-stone-400 font-medium">写真を撮影・選択</span>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    <button
                                      onClick={() => {
                                        if (!activeMarkerInput || !markerDescription.trim() || !currentInspection) return;
                                        const allMarkers: DrawingMarker[] = (currentInspection.items || []).flatMap(item => {
                                          try { return item.markers ? JSON.parse(item.markers) : []; } catch (e) { return []; }
                                        });
                                        const existingNumbers = allMarkers.map(m => parseInt(m.label)).filter(n => !isNaN(n));
                                        const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
                                        const finalLabel = nextNumber.toString();
                                        const item = currentInspection.items?.find(i => i.itemId === activeMarkerInput.targetItemId);
                                        const existingMarkers: DrawingMarker[] = item?.markers ? JSON.parse(item.markers) : [];
                                        const newMarker = { 
                                          ...activeMarkerInput.markerData, 
                                          id: Math.random().toString(36).substr(2, 9), 
                                          label: finalLabel,
                                          issuePhotoId: markerPhoto || undefined,
                                          description: markerDescription
                                        };
                                        
                                        // 楽観的更新
                                        const updatedItems = currentInspection.items?.map(i => 
                                          i.itemId === activeMarkerInput.targetItemId 
                                            ? { ...i, markers: JSON.stringify([...existingMarkers, newMarker]) }
                                            : i
                                        ) || [];
                                        setCurrentInspection({ ...currentInspection, items: updatedItems });

                                        handleManualItemUpdate(activeMarkerInput.targetItemId, { markers: JSON.stringify([...existingMarkers, newMarker]) });
                                        setActiveMarkerInput(null);
                                        setMarkerDescription("");
                                        setMarkerPhoto(null);
                                        setPinningForItem(null);
                                      }}
                                      disabled={!markerDescription.trim()}
                                      className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                                    >
                                      完了
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {selectedMarkerDetail && (
                              <div className="absolute inset-0 z-[10002] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl flex flex-col relative max-h-[90vh]">
                                  <button 
                                    onClick={() => setSelectedMarkerDetail(null)}
                                    className="absolute top-3 right-3 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md z-[10010]"
                                    title="閉じる"
                                  >
                                    <X className="w-5 h-5" />
                                  </button>

                                  <div className="flex-1 overflow-y-auto overflow-x-hidden rounded-3xl custom-scrollbar">
                                    <div className="relative aspect-video bg-stone-100 cursor-zoom-in group">
                                      {selectedMarkerDetail.issuePhotoId ? (
                                        <img 
                                          src={selectedMarkerDetail.issuePhotoId} 
                                          className="w-full h-full object-cover group-hover:opacity-90" 
                                          alt="指摘写真" 
                                          onClick={() => setIsPreviewingPhoto(selectedMarkerDetail.issuePhotoId!)}
                                        />
                                      ) : (
                                        <div 
                                          className="w-full h-full flex flex-col items-center justify-center text-stone-300 hover:bg-stone-200 cursor-pointer"
                                          onClick={() => handleMarkerPhotoUpload((dataUrl) => handleUpdateMarker(selectedMarkerDetail.id, { issuePhotoId: dataUrl }))}
                                        >
                                          <Camera className="w-12 h-12 mb-2" />
                                          <span className="text-xs">タップで写真を追加</span>
                                        </div>
                                      )}
                                      {selectedMarkerDetail.issuePhotoId && (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleMarkerPhotoUpload((dataUrl) => handleUpdateMarker(selectedMarkerDetail.id, { issuePhotoId: dataUrl }));
                                          }}
                                          className="absolute top-3 left-3 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity"
                                          title="写真を変更"
                                        >
                                          <Camera className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      {selectedMarkerDetail.issuePhotoId && (
                                        <div className="absolute bottom-3 left-3 bg-black/50 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-sm pointer-events-none opacity-0 group-hover:opacity-100 flex items-center gap-1">
                                          <Camera className="w-3 h-3" />
                                          タップで拡大表示
                                        </div>
                                      )}
                                    </div>
                                    
                                    <div className="p-6 space-y-4">
                                      {isActiveCorrecting ? (
                                        <div className="space-y-4 relative">
                                          <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                              <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">処置内容の入力</label>
                                              <button onClick={() => setIsActiveCorrecting(false)} className="p-1 hover:bg-stone-100 rounded-full text-stone-400" title="入力をキャンセル">
                                                <X className="w-4 h-4" />
                                              </button>
                                            </div>
                                            <VoiceTextarea 
                                              autoFocus
                                              value={correctiveText}
                                              onChange={(e) => setCorrectiveText(e.target.value)}
                                              placeholder="どのような処置を行いましたか？"
                                              className="w-full bg-stone-50 border-stone-100 rounded-xl px-4 py-3 text-base min-h-[100px]"
                                              rows={3}
                                            />
                                          </div>
                                          <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">処置後の写真</label>
                                            <div 
                                              onClick={() => {
                                                const input = document.createElement('input');
                                                input.type = 'file';
                                                input.accept = 'image/*';
                                                input.onchange = (e: any) => {
                                                  const file = e.target.files?.[0];
                                                  if (!file) return;
                                                  const reader = new FileReader();
                                                  reader.onload = (event) => {
                                                    const img = new Image();
                                                    img.onload = () => {
                                                      const canvas = document.createElement('canvas');
                                                      const MAX = 1000;
                                                      let w = img.width, h = img.height;
                                                      if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                                                      canvas.width = w; canvas.height = h;
                                                      const ctx = canvas.getContext('2d');
                                                      if (ctx) { ctx.drawImage(img, 0, 0, w, h); setCorrectivePhoto(canvas.toDataURL('image/jpeg', 0.6)); }
                                                    };
                                                    img.src = event.target?.result as string;
                                                  };
                                                  reader.readAsDataURL(file);
                                                };
                                                input.click();
                                              }}
                                              className={cn(
                                                "w-full aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer overflow-hidden",
                                                correctivePhoto ? "border-emerald-300 bg-emerald-50" : "border-stone-200 bg-stone-50"
                                              )}
                                            >
                                              {correctivePhoto ? (
                                                <img src={correctivePhoto} className="w-full h-full object-cover" alt="Corrective" />
                                              ) : (
                                                <Camera className="w-8 h-8 text-stone-300" />
                                              )}
                                            </div>
                                          </div>
                                          <button
                                            onClick={() => {
                                              handleUpdateMarker(selectedMarkerDetail.id, {
                                                correctiveAction: correctiveText,
                                                correctivePhotoId: correctivePhoto || undefined
                                              });
                                              setIsActiveCorrecting(false);
                                              setSelectedMarkerDetail(null);
                                            }}
                                            disabled={!correctiveText || (selectedMarkerDetail.issuePhotoId && !correctivePhoto)}
                                            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                                          >
                                            処置を完了する
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <div>
                                            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">指摘事項</div>
                                            <h3 className="text-lg font-bold text-stone-800 leading-tight">
                                              {selectedMarkerDetail.description || selectedMarkerDetail.label}
                                            </h3>
                                          </div>

                                          {selectedMarkerDetail.correctiveAction && (
                                            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                                              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> 実施済み処置
                                              </div>
                                              <p className="text-sm text-stone-700 font-medium">{selectedMarkerDetail.correctiveAction}</p>
                                              {selectedMarkerDetail.correctivePhotoId ? (
                                                <div className="relative group/corrective mt-2">
                                                  <button 
                                                    onClick={() => setIsPreviewingPhoto(selectedMarkerDetail.correctivePhotoId!)}
                                                    className="w-full aspect-video rounded-xl overflow-hidden border border-emerald-200"
                                                  >
                                                    <img src={selectedMarkerDetail.correctivePhotoId} className="w-full h-full object-cover" alt="処置写真" />
                                                  </button>
                                                  <button 
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleMarkerPhotoUpload((dataUrl) => handleUpdateMarker(selectedMarkerDetail.id, { correctivePhotoId: dataUrl }));
                                                    }}
                                                    className="absolute top-2 right-2 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md opacity-0 group-hover/corrective:opacity-100 transition-opacity"
                                                    title="処置写真を変更"
                                                  >
                                                    <Camera className="w-3.5 h-3.5" />
                                                  </button>
                                                </div>
                                              ) : (
                                                <button 
                                                  onClick={() => handleMarkerPhotoUpload((dataUrl) => handleUpdateMarker(selectedMarkerDetail.id, { correctivePhotoId: dataUrl }))}
                                                  className="mt-2 w-full py-3 bg-white border border-dashed border-emerald-200 rounded-xl text-emerald-600 text-[10px] font-bold flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors"
                                                >
                                                  <Camera className="w-3.5 h-3.5" />
                                                  処置写真を追加
                                                </button>
                                              )}
                                            </div>
                                          )}

                                          <div className="flex gap-2 pt-2">
                                            <button
                                              onClick={() => {
                                                setCorrectiveText(selectedMarkerDetail.correctiveAction || "");
                                                setCorrectivePhoto(selectedMarkerDetail.correctivePhotoId || null);
                                                setIsActiveCorrecting(true);
                                              }}
                                              className="flex-1 py-3 bg-stone-100 text-stone-700 rounded-xl font-bold text-sm hover:bg-stone-200 flex items-center justify-center gap-2"
                                            >
                                              <Edit2 className="w-4 h-4" />
                                              処置内容
                                            </button>
                                            <button
                                              onClick={() => handleDeleteMarker(selectedMarkerDetail.id)}
                                              className="w-12 h-12 flex items-center justify-center bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100"
                                              title="削除"
                                            >
                                              <Trash2 className="w-5 h-5" />
                                            </button>
                                            <button
                                              onClick={() => setSelectedMarkerDetail(null)}
                                              className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 shadow-md"
                                            >
                                              閉じる
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Global Photo Preview Overlay */}
                              {isPreviewingPhoto && (
                                <div 
                                  className="fixed inset-0 z-[12000] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
                                  onClick={() => setIsPreviewingPhoto(null)}
                                >
                                  <div
                                    className="relative max-w-5xl w-full h-full flex items-center justify-center"
                                  >
                                    <img 
                                      src={isPreviewingPhoto} 
                                      className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" 
                                      alt="プレビュー" 
                                    />
                                    <button 
                                      onClick={() => setIsPreviewingPhoto(null)}
                                      className="absolute top-0 right-0 sm:-top-10 sm:-right-10 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full"
                                      title="閉じる"
                                    >
                                      <X className="w-8 h-8" />
                                    </button>
                                  </div>
                                </div>
                              )}
                          </div>
                        </div>
                      )}
                  </section>
                )}

                {/* Items */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="font-bold text-stone-800">点検項目</h3>
                    <button
                      onClick={async () => {
                        const newStatus = currentInspection.status === 'completed' ? 'draft' : 'completed';
                        if (newStatus === 'completed') {
                          if (!isReadyToReport) {
                            alert("全ての指摘事項に処置を入力してください。\n\n【未完了項目】\n・" + unresolvedIssues.join("\n・"));
                            return;
                          }
                          if (!confirm("点検を「完了報告」としてマークしますか？履歴で処置完了として表示されます。")) return;
                        }
                        try {
                          await api.updateInspection(currentInspection.id, { status: newStatus });
                          setCurrentInspection({ ...currentInspection, status: newStatus });
                        } catch (err) {
                          console.error("Update inspection status error:", err);
                        }
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border transition-all shadow-sm",
                        currentInspection.status === 'completed'
                          ? "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"
                          : isReadyToReport
                            ? "bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            : "bg-stone-50 border-stone-200 text-stone-400 cursor-not-allowed"
                      )}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {currentInspection.status === 'completed' ? "報告済み" : "完了報告"}
                    </button>
                    <button
                      onClick={() => setInspectionCompleted(v => !v)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border",
                        inspectionCompleted
                          ? "bg-stone-500 border-stone-500 text-white shadow-sm"
                          : "bg-white border-stone-200 text-stone-600 hover:border-emerald-400 hover:text-emerald-600"
                      )}
                      title={inspectionCompleted ? "全項目を表示する" : "指摘箇所のみ表示"}
                    >
                      <Filter className="w-3.5 h-3.5" />
                      {inspectionCompleted ? "全項目表示" : "指摘のみ表示"}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {INSPECTION_ITEMS.filter(itemMaster => {
                      if (isPrinting) return true; // 印刷時は無条件で全て表示
                      if (!inspectionCompleted) return true;
                      const result = currentInspection.items?.find(i => i.itemId === itemMaster.id);
                      return result?.rating === '✕' || result?.rating === '×';
                    }).map(itemMaster => {
                      const result = currentInspection.items?.find(i => i.itemId === itemMaster.id);
                      const isActionNeeded = result?.rating === '✕' || result?.rating === '×';
                      return (
                        <div key={itemMaster.id} id={`item-${itemMaster.id}`} className={cn("bg-white rounded-2xl p-4 border", isActionNeeded ? "border-rose-200 bg-rose-50" : "border-stone-200")}>
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <div className="text-[10px] font-bold text-emerald-600 uppercase mb-1">{itemMaster.section}</div>
                              <h4 className="font-bold text-stone-800">{itemMaster.label}</h4>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleManualItemUpdate(itemMaster.id, { rating: isActionNeeded ? '' : '✕' })}
                                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5", isActionNeeded ? "bg-rose-500 border-rose-500 text-white" : "bg-stone-50 border-stone-200 text-stone-500")}
                                title="処置が必要としてマーク"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />処置が必要
                              </button>
                            </div>
                          </div>

                          {isActionNeeded && (
                            <div className="mt-4 space-y-4 pt-3 border-t border-rose-100">
                              <div className="space-y-1.5 bg-rose-50 p-3 rounded-xl border border-rose-100/50">
                                <label className="text-[10px] font-bold text-rose-500 uppercase">指摘内容（状況）</label>
                                <div className="flex gap-2">
                                  <VoiceTextarea 
                                    value={result?.comment || ''} 
                                    onChange={(e) => handleManualItemUpdate(itemMaster.id, { comment: e.target.value })} 
                                    placeholder="指摘内容を入力..." 
                                    className="flex-1 bg-white border border-rose-100 rounded-lg px-3 py-2 text-base min-h-[80px]" 
                                    rows={2}
                                  />
                                  <button 
                                    onClick={() => handlePhotoUpload(itemMaster.id, result || {}, false)}
                                    className={cn(
                                      "w-20 h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center shrink-0 overflow-hidden",
                                      result?.photoId ? "border-rose-300 bg-rose-50" : "border-stone-200 bg-white hover:border-rose-200 text-stone-300"
                                    )}
                                    title="指摘写真を撮影・選択"
                                  >
                                    {result?.photoId ? (
                                      <img src={result.photoId} className="w-full h-full object-cover" alt="状況写真" />
                                    ) : (
                                      <>
                                        <Camera className="w-6 h-6" />
                                        <span className="text-[10px]">写真</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-1.5 bg-emerald-50 p-3 rounded-xl border border-emerald-100/50">
                                <label className="text-[10px] font-bold text-emerald-600 uppercase">是正処置</label>
                                <div className="flex gap-2">
                                  <VoiceTextarea 
                                    value={result?.correctiveAction || ''} 
                                    onChange={(e) => handleManualItemUpdate(itemMaster.id, { correctiveAction: e.target.value })} 
                                    placeholder="是正処置を入力..." 
                                    className="flex-1 bg-white border border-emerald-100 rounded-lg px-3 py-2 text-base min-h-[80px]" 
                                    rows={2}
                                  />
                                  <button 
                                    onClick={() => handlePhotoUpload(itemMaster.id, result || {}, true)}
                                    className={cn(
                                      "w-20 h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center shrink-0 overflow-hidden",
                                      result?.correctivePhotoId ? "border-emerald-300 bg-emerald-50" : "border-stone-200 bg-white hover:border-emerald-200 text-stone-300"
                                    )}
                                    title="是正写真を撮影・選択"
                                  >
                                    {result?.correctivePhotoId ? (
                                      <img src={result.correctivePhotoId} className="w-full h-full object-cover" alt="是正写真" />
                                    ) : (
                                      <>
                                        <Camera className="w-6 h-6" />
                                        <span className="text-[10px]">写真</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>

      {/* 印刷専用テンプレート (画面上には表示されず、印刷時にのみ表示) */}
      <div className="print-only report-page">
        <h1 className="report-page-title">現場パトロール点検報告書</h1>
        
        <div className="report-header-grid">
          <div className="report-header-item">
            <span className="report-header-label">現場名</span>
            <div className="report-header-value">{currentSite?.name}</div>
          </div>
          <div className="report-header-item">
            <span className="report-header-label">担当者</span>
            <div className="report-header-value">{currentSite?.managerName}</div>
          </div>
          <div className="report-header-item">
            <span className="report-header-label">点検日</span>
            <div className="report-header-value">{currentInspection?.date}</div>
          </div>
          <div className="report-header-item">
            <span className="report-header-label">点検者</span>
            <div className="report-header-value">{currentInspection?.inspectorName}</div>
          </div>
        </div>

        <div className="report-section-header">点検項目</div>

        {(() => {
          // セクションごとにグループ化
          const sections = INSPECTION_ITEMS.reduce((acc, item) => {
            if (!acc[item.section]) acc[item.section] = [];
            acc[item.section].push(item);
            return acc;
          }, {} as Record<string, typeof INSPECTION_ITEMS>);

          return Object.entries(sections).map(([sectionName, items]) => {
            // 指摘内容がある項目のみを抽出
            const filteredItems = items.filter(itemMaster => {
              const result = currentInspection?.items?.find(i => i.itemId === itemMaster.id);
              return result?.comment && result.comment.trim() !== "";
            });

            // 指摘がある項目が1つもないセクションは表示しない
            if (filteredItems.length === 0) return null;

            return (
              <div key={sectionName} className="report-group">
                <div className="report-group-header">{sectionName}</div>
                {filteredItems.map(itemMaster => {
                  const result = currentInspection?.items?.find(i => i.itemId === itemMaster.id);
                  return (
                    <div key={itemMaster.id} className="report-item-box">
                      <div className="report-item-title">{itemMaster.label}</div>
                      <div className="report-item-row">
                        <span className="report-item-label">指摘内容（状況）</span>
                        <div className="report-item-value-line">{result?.comment || ""}</div>
                      </div>
                      <div className="report-item-row">
                        <span className="report-item-label">是正処置</span>
                        <div className="report-item-value-line">{result?.correctiveAction || ""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          });
        })()}

        {/* ピンがある図面を表示 */}
        {Object.keys(drawingPages).length > 0 && (
          <div className="page-break">
            <div className="report-section-header">指摘箇所（図面）</div>
            <div className="report-drawings-grid">
              {Object.entries(drawingPages).map(([pageNum, dataUrl]) => {
                const pageInt = parseInt(pageNum);
                const pageMarkers = (currentInspection?.items || []).flatMap(item => {
                  try {
                    const markers: DrawingMarker[] = item.markers ? JSON.parse(item.markers) : [];
                    return markers.filter(m => (m.page || 1) === pageInt);
                  } catch (e) { return []; }
                });

                return (
                  <div key={pageNum} className="report-drawing-item">
                    <div className="report-photo-caption" style={{ textAlign: 'left', marginBottom: '1.5mm', fontSize: '9pt', fontWeight: 'bold' }}>
                      {pageNum}ページ目
                    </div>
                    <div className="report-drawing-container">
                      <img src={dataUrl} className="report-drawing-image" alt={`Drawing Page ${pageNum}`} />
                      {pageMarkers.map(marker => {
                        const isResolved = marker.correctiveAction && (!marker.issuePhotoId || marker.correctivePhotoId);
                        return (
                          <div 
                            key={marker.id} 
                            className={cn("report-drawing-pin", isResolved ? "resolved" : "issue")}
                            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                          >
                            {marker.label}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 図面ピンの指摘記録を追加 */}
        {(() => {
          const allMarkers = (currentInspection?.items || []).flatMap(item => {
            try {
              return item.markers ? JSON.parse(item.markers) as DrawingMarker[] : [];
            } catch (e) {
              return [];
            }
          }).sort((a, b) => {
            const numA = parseInt(a.label) || 0;
            const numB = parseInt(b.label) || 0;
            return numA - numB;
          });

          if (allMarkers.length === 0) return null;

          return (
            <div className="page-break">
              <div className="report-section-header" style={{ marginTop: '10mm' }}>図面指摘・処置記録</div>
              {allMarkers.map(marker => (
                <div key={marker.id} className="report-item-box" style={{ marginBottom: '8mm', borderBottom: '0.5pt solid #eee', paddingBottom: '4mm' }}>
                  <div className="report-item-title" style={{ color: '#e11d48' }}>ピンNo.{marker.label}：指摘詳細</div>
                  <div className="report-item-row">
                    <span className="report-item-label">指摘内容（状況）</span>
                    <div className="report-item-value-line">{marker.description}</div>
                  </div>
                  <div className="report-item-row">
                    <span className="report-item-label">是正処置内容</span>
                    <div className="report-item-value-line">{marker.correctiveAction}</div>
                  </div>
                  
                  {/* ピンに紐づく写真を表示 */}
                  {(marker.issuePhotoId || marker.correctivePhotoId) && (
                    <div className="report-photo-grid cols-2" style={{ marginTop: '4mm' }}>
                      {marker.issuePhotoId && (
                        <div className="report-photo-container">
                          <img src={marker.issuePhotoId} alt="指摘状況" style={{ height: '5.5cm' }} />
                          <div className="report-photo-caption">【No.{marker.label}】指摘状況</div>
                        </div>
                      )}
                      {marker.correctivePhotoId && (
                        <div className="report-photo-container">
                          <img src={marker.correctivePhotoId} alt="是正完了" style={{ height: '5.5cm' }} />
                          <div className="report-photo-caption">【No.{marker.label}】是正完了</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}

        {/* 以前の形式の写真（もしあれば）も念のため残す */}
        {currentInspection?.items?.some(i => i.photoId || i.correctivePhotoId) && (
          <div className="page-break">
            <div className="report-section-header" style={{ marginTop: '10mm' }}>その他点検写真</div>
            <div className="report-photo-grid">
              {currentInspection.items.map(res => {
                const master = INSPECTION_ITEMS.find(m => m.id === res.itemId);
                return (
                  <React.Fragment key={res.itemId}>
                    {res.photoId && (
                      <div className="report-photo-container">
                        <img src={res.photoId} alt="状況写真" />
                        <div className="report-photo-caption">【{master?.label}】指摘状況</div>
                      </div>
                    )}
                    {res.correctivePhotoId && (
                      <div className="report-photo-container">
                        <img src={res.correctivePhotoId} alt="是正写真" />
                        <div className="report-photo-caption">【{master?.label}】是正完了</div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
