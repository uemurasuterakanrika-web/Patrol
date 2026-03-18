import { Site, Inspection, InspectionItem } from "../types";
import { 
  collection, 
  getDocs, 
  getDoc, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  runTransaction
} from "firebase/firestore";
import { db } from "../firebase";

export const api = {
  async getSites(): Promise<Site[]> {
    try {
      // createdAtが存在しない古いデータも漏らさず取得するため、Firestore側のorderByは使用せず全件取得
      const snapshot = await getDocs(collection(db, "sites"));
      const sites = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Site));
      
      // クライアント側で並び替えを実施（新しい順）
      return sites.sort((a, b) => {
        const getTime = (val: any) => {
          if (!val) return 0;
          if (typeof val === 'number') return val;
          if (val.toMillis) return val.toMillis();
          if (val.seconds) return val.seconds * 1000;
          return 0;
        };

        const aTime = getTime(a.createdAt);
        const bTime = getTime(b.createdAt);

        // 両方とも時刻がある場合は新しい順（降順）
        if (aTime > 0 && bTime > 0) return bTime - aTime;
        // 片方だけ時刻がある場合は、時刻がある方（新しい方）を上に
        if (aTime > 0) return -1;
        if (bTime > 0) return 1;
        // 両方ない場合は名前順
        return (a.name || '').localeCompare(b.name || '', 'ja');
      });
    } catch (err) {
      console.error("Fetch sites error:", err);
      return [];
    }
  },

  async createSite(name: string, address?: string, managerName?: string, drawingPdfId?: string): Promise<{ id: string }> {
    const docRef = await addDoc(collection(db, "sites"), {
      name,
      address: address || "",
      managerName: managerName || "",
      drawingPdfId: drawingPdfId || "",
      createdAt: Date.now()
    });
    return { id: docRef.id };
  },

  async updateSite(id: string, data: Partial<Site>): Promise<void> {
    const docRef = doc(db, "sites", id);
    await updateDoc(docRef, data);
  },

  async deleteFile(id: string | undefined): Promise<void> {
    if (!id || id.startsWith('data:')) return;
    try {
      await deleteDoc(doc(db, "files", id));
    } catch (e) {
      console.error(`Failed to delete file ${id}:`, e);
    }
  },

  async deleteSite(id: string): Promise<void> {
    // 1. PDF図面データの特定と削除
    const docSnap = await getDoc(doc(db, "sites", id));
    if (docSnap.exists()) {
      const site = docSnap.data() as Site;
      await this.deleteFile(site.drawingPdfId);
    }

    // 2. 関連する全点検履歴の削除
    const q = query(collection(db, "inspections"), where("siteId", "==", id));
    const snapshot = await getDocs(q);
    for (const inspDoc of snapshot.docs) {
      await this.deleteInspection(inspDoc.id);
    }

    // 3. 現場自体の削除
    await deleteDoc(doc(db, "sites", id));
  },

  async getInspections(siteId?: string): Promise<Inspection[]> {
    let q = collection(db, "inspections");
    let firestoreQuery;
    
    if (siteId) {
      firestoreQuery = query(q, where("siteId", "==", siteId), orderBy("date", "desc"));
    } else {
      firestoreQuery = query(q, orderBy("date", "desc"));
    }
    
    const snapshot = await getDocs(firestoreQuery);
    const inspections = snapshot.docs.map(d => ({ id: d.id, ...d.data() as any } as Inspection));
    
    // Fetch site names for each inspection if needed
    // (In Firestore, it's often better to denormalize siteName into the inspection document)
    return inspections;
  },

  async getInspection(id: string): Promise<Inspection> {
    const docSnap = await getDoc(doc(db, "inspections", id));
    if (!docSnap.exists()) throw new Error("Inspection not found");
    
    const data = docSnap.data();
    // Fetch items (stored as a subcollection or array - here using subcollection for scale)
    const itemsSnap = await getDocs(collection(db, "inspections", id, "items"));
    const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() as any } as InspectionItem));
    
    return { id: docSnap.id, ...data, items } as Inspection;
  },

  async createInspection(data: Partial<Inspection>): Promise<{ id: string }> {
    const docRef = await addDoc(collection(db, "inspections"), {
      ...data,
      status: data.status || 'draft',
      items: [] // Placeholder if not using subcollection
    });
    return { id: docRef.id };
  },

  async updateInspection(id: string, data: Partial<Inspection>): Promise<void> {
    const docRef = doc(db, "inspections", id);
    const { items, ...rest } = data; // Don't update items array directly if using subcollection
    if (Object.keys(rest).length > 0) {
      await updateDoc(docRef, rest);
    }
  },

  async deleteInspection(id: string): Promise<void> {
    // 1. サブコレクション (items) の中のドキュメント群にあるファイルを削除
    const itemsSnap = await getDocs(collection(db, "inspections", id, "items"));
    for (const itemDoc of itemsSnap.docs) {
      const item = itemDoc.data() as InspectionItem;
      
      // 項目に紐づく写真の削除
      await this.deleteFile(item.photoId);
      await this.deleteFile(item.correctivePhotoId);
      
      // マーカー（ピン）に紐づく写真の削除
      if (item.markers) {
        try {
          const markers: any[] = JSON.parse(item.markers);
          for (const marker of markers) {
            await this.deleteFile(marker.issuePhotoId);
            await this.deleteFile(marker.correctivePhotoId);
          }
        } catch (e) {
          console.error("Failed to parse markers for deletion:", e);
        }
      }
      
      // ドキュメント自体を削除
      await deleteDoc(doc(db, "inspections", id, "items", itemDoc.id));
    }
    
    // 2. 点検自体を削除
    await deleteDoc(doc(db, "inspections", id));
  },

  async registerItemResult(inspectionId: string, item: Partial<InspectionItem>): Promise<void> {
    if (!item.itemId) return;
    
    const itemsCol = collection(db, "inspections", inspectionId, "items");
    const q = query(itemsCol, where("itemId", "==", item.itemId));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const docRef = doc(db, "inspections", inspectionId, "items", snapshot.docs[0].id);
      await updateDoc(docRef, item);
    } else {
      await addDoc(itemsCol, item);
    }
  },

  async uploadFile(content: string, mimeType: string = 'application/pdf'): Promise<{ id: string }> {
    // Save to Firestore 'files' collection instead of Storage to stay on free tier
    const docRef = await addDoc(collection(db, "files"), {
      content,
      mimeType,
      createdAt: new Date()
    });
    
    return { id: docRef.id };
  },

  async getFileUrl(id: string): Promise<string> {
    if (!id || id.startsWith('data:')) return id; // Already a data URL
    try {
      const docSnap = await getDoc(doc(db, "files", id));
      if (docSnap.exists()) {
        return docSnap.data().content;
      }
    } catch (e) {
      console.error("Failed to fetch file from Firestore:", e);
    }
    return "";
  }
};
