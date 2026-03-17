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
    const q = query(collection(db, "sites"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Site));
  },

  async createSite(name: string, address?: string, managerName?: string, drawingPdfId?: string): Promise<{ id: string }> {
    const docRef = await addDoc(collection(db, "sites"), {
      name,
      address: address || "",
      managerName: managerName || "",
      drawingPdfId: drawingPdfId || ""
    });
    return { id: docRef.id };
  },

  async updateSite(id: string, data: Partial<Site>): Promise<void> {
    const docRef = doc(db, "sites", id);
    await updateDoc(docRef, data);
  },

  async deleteSite(id: string): Promise<void> {
    await deleteDoc(doc(db, "sites", id));
    // Note: In a real app, you might want to delete associated inspections too
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
