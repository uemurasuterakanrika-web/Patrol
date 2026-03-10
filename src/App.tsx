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
  Edit2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "./services/api";
import { Site, Inspection, InspectionItem } from "./types";
import { INSPECTION_ITEMS } from "./constants";
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
  const [editingSiteId, setEditingSiteId] = useState<number | null>(null);
  const [editSiteName, setEditSiteName] = useState("");
  const [editSiteManager, setEditSiteManager] = useState("");
  
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    const [sitesData, inspectionsData] = await Promise.all([
      api.getSites(),
      api.getInspections()
    ]);
    setSites(sitesData);
    setInspections(inspectionsData);
  };

  const handleManualItemUpdate = async (itemId: string, rating?: string, comment?: string, photoId?: string, photoCaption?: string) => {
    if (!currentInspection) return;
    try {
      await api.registerItemResult(currentInspection.id, {
        itemId,
        rating: rating as any,
        comment,
        photoId,
        photoCaption
      });
      const updated = await api.getInspection(currentInspection.id);
      setCurrentInspection(updated);
    } catch (err) {
      console.error("Manual item update error:", err);
    }
  };

  const handlePhotoUpload = (itemId: string, currentRating?: string, currentComment?: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const originalBase64 = event.target?.result as string;
        
        // Resize image
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
          
          // Convert to JPEG with 0.7 quality
          const resizedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          handleManualItemUpdate(itemId, currentRating, currentComment, resizedBase64);
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
      const updated = await api.getInspection(currentInspection.id);
      setCurrentInspection(updated);
    } catch (err) {
      console.error("Manual header update error:", err);
    }
  };

  const handleCreateSite = async () => {
    if (!newSiteName.trim()) return;
    try {
      await api.createSite(newSiteName.trim(), undefined, newSiteManager.trim());
      setNewSiteName("");
      setNewSiteManager("");
      setIsAddingSite(false);
      await loadInitialData();
    } catch (err) {
      console.error("Create site error:", err);
      alert("現場の作成に失敗しました。");
    }
  };

  const handleUpdateSite = async (siteId: number) => {
    if (!editSiteName.trim()) return;
    try {
      await api.updateSite(siteId, { name: editSiteName.trim(), managerName: editSiteManager.trim() });
      setEditingSiteId(null);
      setEditSiteName("");
      setEditSiteManager("");
      await loadInitialData();
    } catch (err) {
      console.error("Update site error:", err);
      alert("現場名の更新に失敗しました。");
    }
  };

  const handleDeleteSite = async (e: React.MouseEvent, siteId: number) => {
    if (!confirm("【警告】この現場自体を完全に削除しますか？\nこの操作により、この現場に関連するすべての点検記録（パトロール点検表）もすべて削除され、元に戻すことはできません。")) return;
    
    // Capture state for rollback if needed
    let previousSites: Site[] = [];
    let previousInspections: Inspection[] = [];
    
    // Immediate UI update using functional form
    setSites(prev => {
      previousSites = [...prev];
      return prev.filter(s => s.id !== siteId);
    });
    setInspections(prev => {
      previousInspections = [...prev];
      return prev.filter(i => i.siteId !== siteId);
    });
    
    setCurrentSite(prev => prev?.id === siteId ? null : prev);
    setCurrentInspection(prev => prev?.siteId === siteId ? null : prev);

    try {
      await api.deleteSite(siteId);
      // Optional: Refresh from server to stay in sync
      const [sitesData, inspectionsData] = await Promise.all([
        api.getSites(),
        api.getInspections()
      ]);
      setSites(sitesData);
      setInspections(inspectionsData);
    } catch (err) {
      console.error("Delete site error:", err);
      // Rollback on error
      if (previousSites.length > 0) setSites(previousSites);
      if (previousInspections.length > 0) setInspections(previousInspections);
      alert("現場の削除に失敗しました。");
    }
  };

  const handleDeleteInspection = async (e: React.MouseEvent, inspectionId: number) => {
    if (!confirm("この点検記録（点検表）を削除しますか？")) return;
    
    let previousInspections: Inspection[] = [];
    
    // Immediate UI update
    setInspections(prev => {
      previousInspections = [...prev];
      return prev.filter(i => i.id !== inspectionId);
    });
    
    setCurrentInspection(prev => prev?.id === inspectionId ? null : prev);

    try {
      await api.deleteInspection(inspectionId);
      const inspectionsData = await api.getInspections();
      setInspections(inspectionsData);
    } catch (err) {
      console.error("Delete inspection error:", err);
      if (previousInspections.length > 0) setInspections(previousInspections);
      alert("点検記録の削除に失敗しました。");
    }
  };

  const autoSelectOrCreateInspection = async (siteId: number) => {
    try {
      const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
      const siteInspections = await api.getInspections(siteId);
      // Only reuse a draft if it's from today
      const todayDraft = siteInspections.find(i => i.status === 'draft' && i.date === today);
      
      if (todayDraft) {
        const detail = await api.getInspection(todayDraft.id);
        setCurrentInspection(detail);
      } else {
        // Create new inspection for today
        const newInsp = await api.createInspection({
          siteId,
          date: today,
          status: 'draft',
          templateVersion: 'R1.9'
        });
        const detail = await api.getInspection(newInsp.id);
        setCurrentInspection(detail);
      }
      await loadInitialData();
    } catch (err) {
      console.error("Auto select/create inspection error:", err);
    }
  };

  const handleFunctionCall = async (call: any) => {
    const { name, args } = call;
    console.log("Function Call:", name, args);

    try {
      switch (name) {
        case "create_site":
          const newSite = await api.createSite(args.siteName, args.address);
          const siteObj = { id: newSite.id, name: args.siteName, address: args.address };
          setCurrentSite(siteObj);
          await autoSelectOrCreateInspection(newSite.id);
          break;
        case "list_sites":
          await loadInitialData();
          break;
        case "select_site":
          const sId = parseInt(args.siteId);
          const selectedSite = sites.find(s => s.id === sId);
          if (selectedSite) {
            setCurrentSite(selectedSite);
            await autoSelectOrCreateInspection(sId);
          }
          break;
        case "attach_drawing_pdf":
          await api.updateSite(parseInt(args.siteId), { drawingPdfId: args.pdfId });
          await loadInitialData();
          break;
        case "create_inspection":
          const inspData = {
            siteId: parseInt(args.siteId),
            date: args.inspectionDate,
            inspectorName: args.inspectorName,
            workerCount: args.workersCount,
            workContent: args.workSummary,
            templateVersion: args.templateVersion
          };
          const newInsp = await api.createInspection(inspData);
          await loadInitialData();
          const insp = await api.getInspection(newInsp.id);
          setCurrentInspection(insp);
          break;
        case "list_inspections":
          const siteInspections = await api.getInspections(parseInt(args.siteId));
          setInspections(siteInspections);
          break;
        case "get_inspection_detail":
          const detail = await api.getInspection(parseInt(args.inspectionId));
          setCurrentInspection(detail);
          break;
        case "set_item_result":
          await api.registerItemResult(parseInt(args.inspectionId), {
            itemId: args.itemId,
            rating: args.evaluation,
            comment: args.comment
          });
          if (currentInspection?.id === parseInt(args.inspectionId)) {
            const updated = await api.getInspection(parseInt(args.inspectionId));
            setCurrentInspection(updated);
          }
          break;
        case "attach_photo":
          await api.registerItemResult(parseInt(args.inspectionId), {
            itemId: args.itemId,
            photoId: args.photoId,
            photoCaption: args.caption
          });
          if (currentInspection?.id === parseInt(args.inspectionId)) {
            const updated = await api.getInspection(parseInt(args.inspectionId));
            setCurrentInspection(updated);
          }
          break;
        case "set_overall_comment":
          await api.updateInspection(parseInt(args.inspectionId), { overallComment: args.overallComment });
          if (currentInspection?.id === parseInt(args.inspectionId)) {
            const updated = await api.getInspection(parseInt(args.inspectionId));
            setCurrentInspection(updated);
          }
          break;
        case "calculate_score":
          // Simulation: Calculate score based on ratings
          if (currentInspection) {
            const items = currentInspection.items || [];
            const xCount = items.filter(i => i.rating === '×' || i.rating === '✕').length;
            const deltaCount = items.filter(i => i.rating === '△').length;
            const score = Math.max(0, 100 - (xCount * 10) - (deltaCount * 5));
            const rank = score >= 90 ? 'A' : score >= 70 ? 'B' : 'C';
            
            await api.updateInspection(parseInt(args.inspectionId), { score, rank });
            const updated = await api.getInspection(parseInt(args.inspectionId));
            setCurrentInspection(updated);
            alert(`計算完了: スコア ${score}点, ランク ${rank}`);
          }
          break;
        case "export_pdf":
          alert(`点検ID: ${args.inspectionId} のPDF出力を開始しました（用紙サイズ: ${args.paperSize || 'A4'}）`);
          break;
      }
    } catch (err) {
      console.error("Function execution error:", err);
    }
  };

  const selectInspection = async (id: number) => {
    const insp = await api.getInspection(id);
    setCurrentInspection(insp);
    const site = sites.find(s => s.id === insp.siteId);
    if (site) setCurrentSite(site);
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-stone-50 text-stone-900 font-sans overflow-hidden">
      {/* Sidebar */}
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
              <div className="p-4 border-bottom border-stone-100 flex justify-between items-center">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                  点検履歴
                </h2>
                <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-1 hover:bg-stone-100 rounded">
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
                          {insp.rank && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-stone-900 text-white">
                              RANK {insp.rank}
                            </span>
                          )}
                          {insp.status === 'completed' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">
                              完了
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="font-medium text-sm line-clamp-1">{insp.siteName || '名称未設定'}</div>
                      <div className="text-xs text-stone-400 flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" />
                        {insp.siteName}
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteInspection(e, insp.id);
                      }}
                      className="absolute right-2 bottom-2 p-2 text-stone-300 hover:text-red-500 sm:opacity-0 group-hover/item:opacity-100 transition-opacity z-20 bg-white/80 rounded-full shadow-sm"
                      title="点検記録を削除"
                    >
                      <Trash2 className="w-4 h-4 pointer-events-none" />
                    </button>
                  </div>
                ))}
                
                {inspections.length === 0 && (
                  <div className="text-center py-10 text-stone-400 text-sm italic">
                    履歴がありません
                  </div>
                )}
              </div>
              
              <div className="p-4 border-t border-stone-100">
                <button 
                  onClick={() => {
                    setCurrentInspection(null);
                    setCurrentSite(null);
                    setIsSidebarOpen(false);
                  }}
                  className="w-full py-2.5 bg-stone-900 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-stone-800 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  新規点検を開始
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative h-full">
        {/* Header */}
        <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {currentInspection ? (
              <button 
                onClick={() => {
                  setCurrentInspection(null);
                  setCurrentSite(null);
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
              >
                <Menu className="w-6 h-6" />
              </button>
            )}
            <div>
              <h1 className="font-bold text-stone-900 leading-tight">現場安全パトロール</h1>
              <p className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">
                {currentSite ? currentSite.name : '現場未選択'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {currentInspection && (
              <button 
                onClick={() => handleFunctionCall({ name: "export_pdf", args: { inspectionId: currentInspection.id } })}
                className="p-2 text-stone-600 hover:bg-stone-100 rounded-lg"
                title="PDF出力"
              >
                <FileText className="w-5 h-5" />
              </button>
            )}
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs">
              Y
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Inspection View */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-stone-50">
            {!currentInspection ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center">
                  <HardHat className="w-10 h-10 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-stone-800">点検を開始しましょう</h3>
                  <p className="text-stone-500 max-w-xs mx-auto mt-2">
                    現場を選択するか、AIエージェントに「点検を始めたい」と伝えてください。
                  </p>
                </div>
                
                <div className="grid grid-cols-1 gap-3 w-full max-w-sm mt-4">
                  {sites.map(site => (
                    <div key={site.id} className="relative group">
                      {editingSiteId === site.id ? (
                        <div className="p-4 rounded-2xl border border-emerald-400 bg-white space-y-3">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <MapPin className="w-5 h-5 text-emerald-500" />
                              <input
                                autoFocus
                                type="text"
                                className="flex-1 outline-none text-stone-800 font-medium"
                                value={editSiteName}
                                onChange={(e) => setEditSiteName(e.target.value)}
                                placeholder="現場名"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateSite(site.id);
                                  if (e.key === 'Escape') setEditingSiteId(null);
                                }}
                              />
                            </div>
                            <div className="flex items-center gap-3">
                              <User className="w-5 h-5 text-emerald-500" />
                              <input
                                type="text"
                                className="flex-1 outline-none text-stone-800 font-medium"
                                value={editSiteManager}
                                onChange={(e) => setEditSiteManager(e.target.value)}
                                placeholder="現場担当者"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateSite(site.id);
                                  if (e.key === 'Escape') setEditingSiteId(null);
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdateSite(site.id)}
                              className="flex-1 bg-emerald-600 text-white py-2 rounded-xl font-bold text-sm"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingSiteId(null)}
                              className="flex-1 bg-stone-100 text-stone-600 py-2 rounded-xl font-bold text-sm"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setCurrentSite(site);
                              autoSelectOrCreateInspection(site.id);
                            }}
                            className={cn(
                              "w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between",
                              currentSite?.id === site.id 
                                ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200" 
                                : "bg-white border-stone-200 hover:border-emerald-400"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <MapPin className={cn("w-5 h-5", currentSite?.id === site.id ? "text-emerald-200" : "text-stone-400")} />
                              <span className="font-medium">{site.name}</span>
                            </div>
                            <ChevronRight className={cn("w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity", currentSite?.id === site.id && "opacity-100")} />
                          </button>
                          
                          <div className="absolute -right-1 -top-1 flex gap-1 z-20">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setEditingSiteId(site.id);
                                setEditSiteName(site.name);
                                setEditSiteManager(site.managerName || "");
                              }}
                              className="p-2 bg-white border border-stone-200 rounded-full text-stone-400 hover:text-emerald-600 hover:border-emerald-200 shadow-sm transition-all"
                              title="現場名を編集"
                            >
                              <Edit2 className="w-3.5 h-3.5 pointer-events-none" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteSite(e, site.id);
                              }}
                              className="p-2.5 bg-white border border-stone-200 rounded-full text-stone-400 hover:text-red-600 hover:border-red-200 shadow-md transition-all active:scale-95"
                              title="現場を完全に削除"
                            >
                              <Trash2 className="w-4 h-4 pointer-events-none" />
                            </button>
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
                          <input
                            autoFocus
                            type="text"
                            placeholder="新しい現場名を入力..."
                            className="flex-1 outline-none text-stone-800 font-medium"
                            value={newSiteName}
                            onChange={(e) => setNewSiteName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateSite();
                              if (e.key === 'Escape') setIsAddingSite(false);
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <User className="w-5 h-5 text-emerald-500" />
                          <input
                            type="text"
                            placeholder="現場担当者名を入力..."
                            className="flex-1 outline-none text-stone-800 font-medium"
                            value={newSiteManager}
                            onChange={(e) => setNewSiteManager(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateSite();
                              if (e.key === 'Escape') setIsAddingSite(false);
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCreateSite}
                          className="flex-1 bg-emerald-600 text-white py-2 rounded-xl font-bold text-sm"
                        >
                          追加
                        </button>
                        <button
                          onClick={() => setIsAddingSite(false)}
                          className="flex-1 bg-stone-100 text-stone-600 py-2 rounded-xl font-bold text-sm"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsAddingSite(true)}
                      className="w-full p-4 rounded-2xl border border-dashed border-stone-300 text-stone-400 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      <span className="font-medium">新しい現場を追加</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 max-w-3xl mx-auto"
              >
                {/* Header Info Card */}
                <section className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-lg text-stone-800 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-stone-400" />
                      点検基本情報
                    </h3>
                    <span className="px-2 py-1 bg-stone-100 rounded text-[10px] font-bold text-stone-600 uppercase">
                      ID: {currentInspection.id}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">現場担当者</label>
                      <div className="w-full bg-stone-50 border-none rounded-lg px-2 py-1 text-sm font-medium text-stone-600">
                        {currentSite?.managerName || '未設定'}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">点検日</label>
                      <input 
                        type="date"
                        value={currentInspection.date || ''}
                        onChange={(e) => handleManualHeaderUpdate({ date: e.target.value })}
                        className="w-full bg-stone-50 border-none rounded-lg px-2 py-1 text-sm font-medium focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">点検者</label>
                      <input 
                        type="text"
                        value={currentInspection.inspectorName || ''}
                        onChange={(e) => handleManualHeaderUpdate({ inspectorName: e.target.value })}
                        className="w-full bg-stone-50 border-none rounded-lg px-2 py-1 text-sm font-medium focus:ring-1 focus:ring-emerald-500 outline-none"
                        placeholder="氏名を入力"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">労働者数</label>
                      <input 
                        type="number"
                        value={currentInspection.workerCount || 0}
                        onChange={(e) => handleManualHeaderUpdate({ workerCount: parseInt(e.target.value) || 0 })}
                        className="w-full bg-stone-50 border-none rounded-lg px-2 py-1 text-sm font-medium focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1 pt-2 border-t border-stone-50">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">作業内容</label>
                    <textarea 
                      value={currentInspection.workContent || ''}
                      onChange={(e) => handleManualHeaderUpdate({ workContent: e.target.value })}
                      className="w-full bg-stone-50 border-none rounded-xl px-3 py-2 text-sm text-stone-600 leading-relaxed focus:ring-1 focus:ring-emerald-500 outline-none min-h-[60px]"
                      placeholder="本日の主な作業内容を入力..."
                    />
                  </div>

                  {currentInspection.rank && (
                    <div className="pt-4 border-t border-stone-100 flex gap-6">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">ランク</label>
                        <div className="text-2xl font-black text-emerald-600">{currentInspection.rank}</div>
                      </div>
                    </div>
                  )}
                </section>

                {/* Overall Comment */}
                <section className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 shadow-sm space-y-2">
                  <h3 className="font-bold text-emerald-800 flex items-center gap-2 text-sm">
                    <ClipboardCheck className="w-4 h-4" />
                    総合所見
                  </h3>
                  <textarea 
                    value={currentInspection.overallComment || ''}
                    onChange={(e) => handleManualHeaderUpdate({ overallComment: e.target.value })}
                    className="w-full bg-white/50 border-none rounded-xl px-3 py-2 text-sm text-emerald-700 leading-relaxed focus:ring-1 focus:ring-emerald-500 outline-none min-h-[80px]"
                    placeholder="点検全体の所見を入力してください..."
                  />
                </section>

                {/* Inspection Items */}
                <section className="space-y-3">
                  <h3 className="font-bold text-stone-800 px-1">点検項目</h3>
                  <div className="space-y-3">
                    {INSPECTION_ITEMS.map(itemMaster => {
                      const result = currentInspection.items?.find(i => i.itemId === itemMaster.id);
                      return (
                        <div 
                          key={itemMaster.id}
                          className={cn(
                            "bg-white rounded-2xl p-4 border transition-all",
                            result ? "border-stone-200" : "border-stone-100 opacity-60"
                          )}
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">
                                {itemMaster.section}
                              </div>
                              <h4 className="font-bold text-stone-800">{itemMaster.label}</h4>
                              {itemMaster.checkpoints && (
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                  {itemMaster.checkpoints.map((cp, idx) => (
                                    <span key={idx} className="text-[9px] px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded border border-stone-200">
                                      {cp}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            <div className="flex gap-1">
                              {['〇', '△', '✕', '○', '×'].map(r => {
                                const isSelected = result?.rating === r || (r === '〇' && result?.rating === '○') || (r === '✕' && result?.rating === '×');
                                if (['○', '×'].includes(r)) return null; // Only show main symbols in UI
                                
                                return (
                                  <button 
                                    key={r}
                                    type="button"
                                    onClick={() => handleManualItemUpdate(itemMaster.id, r, result?.comment)}
                                    className={cn(
                                      "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border transition-colors",
                                      isSelected 
                                        ? r === '〇' ? "bg-emerald-500 border-emerald-500 text-white" :
                                          r === '△' ? "bg-amber-500 border-amber-500 text-white" :
                                          "bg-rose-500 border-rose-500 text-white"
                                        : "bg-stone-50 border-stone-100 text-stone-300 hover:border-stone-300"
                                    )}
                                  >
                                    {r === '〇' && <CheckCircle2 className="w-4 h-4" />}
                                    {r === '△' && <AlertTriangle className="w-4 h-4" />}
                                    {r === '✕' && <XCircle className="w-4 h-4" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          
                          <div className="mt-3 flex gap-2">
                            <div className="flex-1 relative">
                              <input 
                                type="text"
                                value={result?.comment || ''}
                                onChange={(e) => handleManualItemUpdate(itemMaster.id, result?.rating, e.target.value, result?.photoId, result?.photoCaption)}
                                placeholder="指摘内容を入力..."
                                className="w-full bg-stone-50 border-none rounded-xl px-3 py-2 text-xs text-stone-600 focus:ring-1 focus:ring-emerald-500 outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handlePhotoUpload(itemMaster.id, result?.rating, result?.comment)}
                              className={cn(
                                "p-2 rounded-xl border transition-colors",
                                result?.photoId 
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-600" 
                                  : "bg-stone-50 border-stone-100 text-stone-400 hover:border-stone-300"
                              )}
                              title="写真を添付"
                            >
                              <Camera className="w-4 h-4" />
                            </button>
                          </div>
                          
                          {result?.photoId && (
                            <div className="mt-3 space-y-2">
                              <div className="relative group aspect-video rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
                                <img 
                                  src={result.photoId} 
                                  alt="点検写真" 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <button
                                  onClick={() => handleManualItemUpdate(itemMaster.id, result.rating, result.comment, null as any)}
                                  className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                              <input 
                                type="text"
                                value={result.photoCaption || ''}
                                onChange={(e) => handleManualItemUpdate(itemMaster.id, result.rating, result.comment, result.photoId, e.target.value)}
                                placeholder="写真の説明を入力..."
                                className="w-full bg-transparent border-none p-0 text-[10px] text-stone-500 italic focus:ring-0 outline-none"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
