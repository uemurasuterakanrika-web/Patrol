import React, { useState, useEffect } from "react";
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
  Pin
} from "lucide-react";
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from "motion/react";
import { io } from "socket.io-client";
import { api } from "./services/api";
import { Site, Inspection, InspectionItem, DrawingMarker } from "./types";
import { INSPECTION_ITEMS } from "./constants";
import { VoiceInput, VoiceTextarea } from "./components/VoiceInput";
import { DrawingViewer } from "./components/DrawingViewer";
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
  const [editingSiteId, setEditingSiteId] = useState<number | null>(null);
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
  const [isPreviewingPhoto, setIsPreviewingPhoto] = useState<string | null>(null);
  const [isActiveCorrecting, setIsActiveCorrecting] = useState(false);
  const [correctiveText, setCorrectiveText] = useState("");
  const [correctivePhoto, setCorrectivePhoto] = useState<string | null>(null);

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
      const changedItem = updatedItems.find(i => {
        const old = items.find(oi => oi.itemId === i.itemId);
        return old?.markers !== i.markers;
      });
      if (changedItem) {
        api.registerItemResult(currentInspection.id, changedItem);
      }
    }
  };
  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const socket = io();
    socket.on('dataUpdated', async (data) => {
      const [sitesData, inspectionsData] = await Promise.all([
        api.getSites(),
        api.getInspections()
      ]);
      setSites(sitesData);
      setInspections(inspectionsData);

      if (currentInspection && (
        (data.type === 'inspections' && data.id == currentInspection.id) ||
        (data.type === 'inspection_item' && data.id == currentInspection.id)
      )) {
        const updated = await api.getInspection(currentInspection.id);
        setCurrentInspection(updated);
      }

      if (currentSite && data.type === 'sites' && data.id == currentSite.id) {
        const updatedSite = sitesData.find(s => s.id === currentSite.id);
        if (updatedSite) setCurrentSite(updatedSite);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [currentInspection, currentSite]);

  const loadInitialData = async () => {
    const [sitesData, inspectionsData] = await Promise.all([
      api.getSites(),
      api.getInspections()
    ]);
    setSites(sitesData);
    setInspections(inspectionsData);
  };

  const handleManualItemUpdate = async (itemId: string, updates: Partial<InspectionItem>) => {
    if (!currentInspection) return;
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const originalBase64 = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          const resizedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          const updates = { ...existingData };
          if (isCorrectivePhoto) {
            updates.correctivePhotoId = resizedBase64;
          } else {
            updates.photoId = resizedBase64;
          }
          handleManualItemUpdate(itemId, updates);
        };
        img.src = originalBase64;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleManualHeaderUpdate = async (data: Partial<Inspection>) => {
    if (!currentInspection) return;
    try {
      await api.updateInspection(currentInspection.id, data);
    } catch (err) {
      console.error("Manual header update error:", err);
    }
  };

  const handleUpdateSiteSimple = async (id: number, updates: Partial<Site>) => {
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
        console.log("Uploading PDF drawing...");
        const uploadRes = await api.uploadFile(newSiteDrawing);
        drawingPdfId = Number(uploadRes.id);
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

  const handleUpdateSite = async (siteId: number) => {
    if (isUploading || !editSiteName.trim()) return;
    try {
      setIsUploading(true);
      let drawingPdfId = undefined;
      // If a new drawing was selected during edit, upload it
      if (newSiteDrawing) {
        console.log("Updating PDF drawing...");
        const uploadRes = await api.uploadFile(newSiteDrawing);
        drawingPdfId = Number(uploadRes.id);
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

  const handleDeleteSite = async (e: React.MouseEvent, siteId: number) => {
    if (!confirm("【警告】この現場自体を完全に削除しますか？")) return;
    try {
      await api.deleteSite(siteId);
      await loadInitialData();
      if (currentSite?.id === siteId) {
        setCurrentSite(null);
        setCurrentInspection(null);
      }
    } catch (err) {
      console.error("Delete site error:", err);
    }
  };

  const handleDeleteInspection = async (e: React.MouseEvent, inspectionId: number) => {
    if (!confirm("この点検記録を削除しますか？")) return;
    try {
      await api.deleteInspection(inspectionId);
      await loadInitialData();
      if (currentInspection?.id === inspectionId) {
        setCurrentInspection(null);
      }
    } catch (err) {
      console.error("Delete inspection error:", err);
    }
  };

  const selectInspection = async (id: number) => {
    try {
      const insp = await api.getInspection(id);
      setCurrentInspection(insp);
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

  const siteDrawingUrl = currentSite?.drawingPdfId ? api.getFileUrl(currentSite.drawingPdfId) : null;

  return (
    <div className="flex h-screen bg-stone-50 text-stone-900 font-sans overflow-hidden">
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
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
                        "w-full text-left p-3 rounded-xl transition-all border",
                        currentInspection?.id === insp.id
                          ? "bg-emerald-50 border-emerald-200 shadow-sm"
                          : "bg-white border-stone-100 hover:border-stone-300"
                      )}
                    >
                      <div className="text-xs text-stone-500 mb-1 flex justify-between">
                        <span>{insp.date}</span>
                        <div className="flex gap-1">
                          {insp.status === 'completed' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">
                              完了
                            </span>
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
                      className="absolute top-2 right-2 p-1.5 bg-white border border-stone-100 text-stone-300 hover:text-rose-600 hover:border-rose-100 rounded-lg opacity-0 group-hover/item:opacity-100 transition-all shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col relative h-full">
        <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {currentInspection ? (
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
            ) : (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 hover:bg-stone-100 rounded-lg lg:hidden"
                title="メニューを開く"
              >
                <Menu className="w-6 h-6" />
              </button>
            )}
            <div>
              <h1 className="font-bold text-stone-900 leading-tight">現場パトロール点検表</h1>
              <p className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">
                {currentSite ? currentSite.name : '現場未選択'}
              </p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs">Y</div>
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
                                input.onchange = (e: any) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const reader = new FileReader();
                                  reader.onload = (ev) => setNewSiteDrawing(ev.target?.result as string);
                                  reader.readAsDataURL(file);
                                };
                                input.click();
                              }}
                              className={cn(
                                "text-[9px] px-2 py-1 rounded border border-dashed transition-all",
                                newSiteDrawing ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500"
                              )}
                              title="図面PDFをアップロード"
                            >
                              {newSiteDrawing ? "図面更新待機中" : "図面を変更（任意）"}
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
                            <div className="w-10 h-10 rounded-xl bg-stone-50 flex items-center justify-center text-stone-400 group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-colors">
                              <MapPin className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                              <div className="font-bold text-stone-800 leading-tight">{site.name}</div>
                              <div className="text-xs text-stone-500">{site.managerName || '担当者未設定'}</div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                          </button>
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/site:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingSiteId(site.id); setEditSiteName(site.name); setEditSiteManager(site.managerName || ""); }} className="p-1.5 bg-white border border-stone-200 rounded-lg text-stone-400 hover:text-emerald-600" title="編集"><Edit2 className="w-3 h-3" /></button>
                            <button onClick={(e) => handleDeleteSite(e, site.id)} className="p-1.5 bg-white border border-stone-200 rounded-lg text-stone-400 hover:text-rose-600" title="削除"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {isAddingSite ? (
                    <div className="p-4 rounded-2xl border border-emerald-400 bg-white space-y-3 animate-in fade-in slide-in-from-top-2">
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
                              input.onchange = (e: any) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = (ev) => setNewSiteDrawing(ev.target?.result as string);
                                reader.readAsDataURL(file);
                              };
                              input.click();
                            }}
                            className={cn(
                              "text-xs px-3 py-1.5 rounded-lg border border-dashed transition-all",
                              newSiteDrawing ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500 hover:border-emerald-200"
                            )}
                            title="図面PDFを選択"
                          >
                            {newSiteDrawing ? "図面PDF添付済み" : "図面PDFを添付（任意）"}
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleCreateSite} className="flex-1 bg-emerald-600 text-white py-2 rounded-xl font-bold text-sm" title="現場を作成">追加</button>
                        <button onClick={() => setIsAddingSite(false)} className="flex-1 bg-stone-100 text-stone-600 py-2 rounded-xl font-bold text-sm" title="キャンセル">中止</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setIsAddingSite(true)} className="w-full p-4 rounded-2xl border border-dashed border-stone-300 text-stone-400 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all flex items-center justify-center gap-2" title="新規現場登録">
                      <Plus className="w-5 h-5" />
                      <span className="font-medium">新しい現場を追加</span>
                    </button>
                  )}
                </div>

                {viewingSiteHistory && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
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
                                className="w-full text-left p-4 rounded-2xl bg-stone-50 hover:bg-emerald-50 border border-stone-100 hover:border-emerald-200 transition-all group flex items-center justify-between"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-stone-400 group-hover:text-emerald-500 shadow-sm transition-colors">
                                    <Calendar className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <div className="font-bold text-stone-800">{insp.date}</div>
                                    <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                                      {(() => {
                                        const isResolved = (insp.items || []).every(item => {
                                          // Check if it's an issue (X) or has any markers
                                          const isIssue = item.rating === '✕' || item.rating === '×';
                                          let markersResolved = true;
                                          if (item.markers) {
                                            try {
                                              const markers: DrawingMarker[] = JSON.parse(item.markers);
                                              markersResolved = markers.every(m => 
                                                m.correctiveAction && m.correctiveAction.trim() !== ""
                                              );
                                            } catch (e) {}
                                          }
                                          
                                          if (isIssue) {
                                            // Must have corrective action and markers must be resolved
                                            return item.correctiveAction && item.correctiveAction.trim() !== "" && markersResolved;
                                          }
                                          // If not an issue, just need markers to be resolved
                                          return markersResolved;
                                        });

                                        if (isResolved && (insp.items || []).length > 0) {
                                          return (
                                            <>
                                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                              処置完了
                                            </>
                                          );
                                        } else {
                                          return (
                                            <>
                                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                              処置完了待ち
                                            </>
                                          );
                                        }
                                      })()}
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
                                    className="p-2 bg-white hover:bg-rose-50 border border-stone-100 hover:border-rose-100 text-stone-300 hover:text-rose-600 rounded-xl transition-all shadow-sm group/del"
                                    title="この履歴を削除"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-emerald-400 transition-transform group-hover:translate-x-0.5" />
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
                        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg mt-2"
                      >
                        <Plus className="w-5 h-5" />
                        新規点検を開始する
                      </button>
                    </section>
                  </motion.div>
                )}
              </div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-3xl mx-auto">
                {/* Header Info Card */}
                <section className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">点検者</label>
                      <VoiceInput value={currentInspection.inspectorName || ''} onChange={(e) => handleManualHeaderUpdate({ inspectorName: e.target.value })} className="w-full bg-stone-50 border-none rounded-lg px-2 py-1 text-sm font-medium" placeholder="点検者名" />
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
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-700 transition-all active:scale-95" 
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
                              className="flex items-center gap-1.5 text-stone-700 font-bold hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-4 py-2.5 rounded-xl transition-all shadow-sm"
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
                              onRemoveMarker={(id) => {
                                if (!window.confirm("このピンを削除してもよろしいですか？")) return;
                                currentInspection.items?.forEach(item => {
                                  if (item.markers) {
                                    try {
                                      const parsed = JSON.parse(item.markers);
                                      const filtered = parsed.filter((p: any) => p.id !== id);
                                      if (filtered.length !== parsed.length) handleManualItemUpdate(item.itemId, { markers: JSON.stringify(filtered) });
                                    } catch (e) { }
                                  }
                                });
                              }}
                              readOnly={currentInspection.status === 'completed'}
                            />

                            {/* Marker Detail Input Overlay */}
                            <AnimatePresence>
                              {activeMarkerInput && (
                                <div className="absolute inset-0 z-[10001] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                  <motion.div 
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col"
                                  >
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
                                                  const MAX = 1000; // 解像度を少し上げつつ圧縮
                                                  let w = img.width, h = img.height;
                                                  if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                                                  canvas.width = w; canvas.height = h;
                                                  const ctx = canvas.getContext('2d');
                                                  if (ctx) {
                                                    ctx.imageSmoothingEnabled = true;
                                                    ctx.imageSmoothingQuality = 'high';
                                                    ctx.drawImage(img, 0, 0, w, h);
                                                    setMarkerPhoto(canvas.toDataURL('image/jpeg', 0.6)); // 0.6まで圧縮して容量削減
                                                  }
                                                };
                                                img.src = event.target?.result as string;
                                              };
                                              reader.readAsDataURL(file);
                                            };
                                            input.click();
                                          }}
                                          className={cn(
                                            "w-full aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden",
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
                                          if (!activeMarkerInput) return;
                                          const master = INSPECTION_ITEMS.find(m => m.id === activeMarkerInput.targetItemId);
                                          const finalLabel = markerDescription.trim() || (master ? master.label.substring(0, 1) : "？");
                                          
                                          const item = currentInspection.items?.find(i => i.itemId === activeMarkerInput.targetItemId);
                                          const existingMarkers: DrawingMarker[] = item?.markers ? JSON.parse(item.markers) : [];
                                          const newMarker = { 
                                            ...activeMarkerInput.markerData, 
                                            id: Math.random().toString(36).substr(2, 9), 
                                            label: finalLabel,
                                            issuePhotoId: markerPhoto || undefined,
                                            description: markerDescription
                                          };
                                          
                                          handleManualItemUpdate(activeMarkerInput.targetItemId, { 
                                            markers: JSON.stringify([...existingMarkers, newMarker]) 
                                          });
                                          
                                          setActiveMarkerInput(null);
                                          setPinningForItem(null);
                                        }}
                                        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 shadow-lg"
                                      >
                                        完了
                                      </button>
                                    </div>
                                  </motion.div>
                                </div>
                              )}
                            </AnimatePresence>

                            {/* Marker Detail View Overlay */}
                            <AnimatePresence>
                              {selectedMarkerDetail && (
                                <div className="absolute inset-0 z-[10002] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                  <motion.div 
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 20 }}
                                    className="bg-white rounded-3xl w-full max-w-sm shadow-2xl flex flex-col relative max-h-[90vh]"
                                  >
                                    <button 
                                      onClick={() => setSelectedMarkerDetail(null)}
                                      className="absolute top-3 right-3 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md transition-all z-[10010]"
                                      title="閉じる"
                                    >
                                      <X className="w-5 h-5" />
                                    </button>

                                    <div className="flex-1 overflow-y-auto overflow-x-hidden rounded-3xl custom-scrollbar">
                                      <div className="relative aspect-video bg-stone-100 cursor-zoom-in group">
                                        {selectedMarkerDetail.issuePhotoId ? (
                                          <img 
                                            src={selectedMarkerDetail.issuePhotoId} 
                                            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" 
                                            alt="指摘写真" 
                                            onClick={() => setIsPreviewingPhoto(selectedMarkerDetail.issuePhotoId!)}
                                          />
                                        ) : (
                                          <div className="w-full h-full flex flex-col items-center justify-center text-stone-300">
                                            <Camera className="w-12 h-12 mb-2" />
                                            <span className="text-xs">写真なし</span>
                                          </div>
                                        )}
                                        {selectedMarkerDetail.issuePhotoId && (
                                          <div className="absolute bottom-3 left-3 bg-black/50 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-sm pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                            <Camera className="w-3 h-3" />
                                            タップで拡大表示
                                          </div>
                                        )}
                                      </div>
                                      
                                      <div className="p-6 space-y-4">
                                        {isActiveCorrecting ? (
                                          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 relative">
                                            <div className="space-y-1.5">
                                              <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">処置内容の入力</label>
                                                <button onClick={() => setIsActiveCorrecting(false)} className="p-1 hover:bg-stone-100 rounded-full text-stone-400 transition-all" title="入力をキャンセル">
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
                                                  "w-full aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden",
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
                                                confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#10b981', '#34d399', '#6ee7b7'] });
                                              }}
                                              disabled={!correctiveText || !correctivePhoto}
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
                                                {selectedMarkerDetail.correctivePhotoId && (
                                                  <button 
                                                    onClick={() => setIsPreviewingPhoto(selectedMarkerDetail.correctivePhotoId!)}
                                                    className="mt-2 w-full aspect-video rounded-xl overflow-hidden border border-emerald-200"
                                                  >
                                                    <img src={selectedMarkerDetail.correctivePhotoId} className="w-full h-full object-cover" alt="処置写真" />
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
                                  </motion.div>
                                </div>
                              )}
                            </AnimatePresence>

                            {/* Global Photo Preview Overlay */}
                            <AnimatePresence>
                              {isPreviewingPhoto && (
                                <div 
                                  className="fixed inset-0 z-[12000] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
                                  onClick={() => setIsPreviewingPhoto(null)}
                                >
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="relative max-w-5xl w-full h-full flex items-center justify-center"
                                  >
                                    <img 
                                      src={isPreviewingPhoto} 
                                      className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" 
                                      alt="プレビュー" 
                                    />
                                    <button 
                                      onClick={() => setIsPreviewingPhoto(null)}
                                      className="absolute top-0 right-0 sm:-top-10 sm:-right-10 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all"
                                      title="閉じる"
                                    >
                                      <X className="w-8 h-8" />
                                    </button>
                                  </motion.div>
                                </div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      )}
                  </section>
                )}

                {/* Items */}
                <section className="space-y-3">
                  <h3 className="font-bold text-stone-800 px-1">点検項目</h3>
                  <div className="space-y-3">
                    {INSPECTION_ITEMS.map(itemMaster => {
                      const result = currentInspection.items?.find(i => i.itemId === itemMaster.id);
                      const isActionNeeded = result?.rating === '✕' || result?.rating === '×';
                      return (
                        <div key={itemMaster.id} id={`item-${itemMaster.id}`} className={cn("bg-white rounded-2xl p-4 border transition-all", isActionNeeded ? "border-rose-200 bg-rose-50" : "border-stone-200")}>
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
                                  <button type="button" onClick={() => handlePhotoUpload(itemMaster.id, result || {}, false)} className="p-2 rounded-lg bg-white border border-rose-100 text-stone-400" title="写真を撮る"><Camera className="w-4 h-4" /></button>
                                </div>
                                {result?.photoId && <img src={result.photoId} alt="指摘箇所写真" className="mt-2 rounded-lg border border-rose-200 aspect-video object-cover" />}
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
                                  <button type="button" onClick={() => handlePhotoUpload(itemMaster.id, result || {}, true)} className="p-2 rounded-lg bg-white border border-emerald-100 text-stone-400" title="是正後の写真を撮る"><Camera className="w-4 h-4" /></button>
                                </div>
                                {result?.correctivePhotoId && <img src={result.correctivePhotoId} alt="是正後写真" className="mt-2 rounded-lg border border-emerald-200 aspect-video object-cover" />}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <div className="flex flex-col gap-3 pt-6 pb-12">
                  <button
                    onClick={() => window.print()}
                    className="w-full py-4 rounded-xl border-2 border-emerald-600 text-emerald-700 font-bold flex items-center justify-center gap-2 hover:bg-emerald-50 transition-all shadow-sm"
                    title="PDFとして出力（印刷）"
                  >
                    <FileText className="w-5 h-5" />
                    PDF・印刷用に出力する
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
