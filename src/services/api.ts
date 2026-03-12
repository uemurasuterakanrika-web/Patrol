import { Site, Inspection, InspectionItem } from "../types";

// Helper to check if we are in a static environment (no backend)
let isStaticMode = false;

const checkResponse = async (res: Response) => {
  if (!res.ok) {
    isStaticMode = true;
    throw new Error("API not available");
  }
  const contentType = res.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    isStaticMode = true;
    throw new Error("Response is not JSON");
  }
  return res.json();
};

// LocalStorage Keys
const STORAGE_KEYS = {
  SITES: 'safety_sites',
  INSPECTIONS: 'safety_inspections',
  FILES: 'safety_files'
};

// LocalStorage Handlers
const getLocal = <T>(key: string, defaultValue: T): T => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : defaultValue;
};

const saveLocal = (key: string, data: any) => {
  localStorage.setItem(key, JSON.stringify(data));
};

export const api = {
  async getSites(): Promise<Site[]> {
    if (isStaticMode) return getLocal(STORAGE_KEYS.SITES, []);
    try {
      const res = await fetch("/api/sites");
      return await checkResponse(res);
    } catch (e) {
      console.warn("Falling back to local storage for getSites");
      return getLocal(STORAGE_KEYS.SITES, []);
    }
  },

  async createSite(name: string, address?: string, managerName?: string, drawingPdfId?: number): Promise<{ id: number }> {
    if (isStaticMode) {
      const sites = getLocal<Site[]>(STORAGE_KEYS.SITES, []);
      const newSite: Site = { id: Date.now(), name, address, managerName, drawingPdfId };
      saveLocal(STORAGE_KEYS.SITES, [...sites, newSite]);
      return { id: newSite.id };
    }
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, managerName, drawingPdfId }),
      });
      return await checkResponse(res);
    } catch (e) {
      isStaticMode = true;
      return this.createSite(name, address, managerName, drawingPdfId);
    }
  },

  async updateSite(id: number, data: Partial<Site>): Promise<void> {
    if (isStaticMode) {
      const sites = getLocal<Site[]>(STORAGE_KEYS.SITES, []);
      const updated = sites.map(s => s.id === id ? { ...s, ...data } : s);
      saveLocal(STORAGE_KEYS.SITES, updated);
      return;
    }
    try {
      await fetch(`/api/sites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch (e) {
      isStaticMode = true;
      await this.updateSite(id, data);
    }
  },

  async deleteSite(id: number): Promise<void> {
    if (isStaticMode) {
      const sites = getLocal<Site[]>(STORAGE_KEYS.SITES, []);
      saveLocal(STORAGE_KEYS.SITES, sites.filter(s => s.id !== id));
      return;
    }
    await fetch(`/api/sites/${id}`, { method: "DELETE" });
  },

  async getInspections(siteId?: number): Promise<Inspection[]> {
    if (isStaticMode) {
      const all = getLocal<Inspection[]>(STORAGE_KEYS.INSPECTIONS, []);
      const filtered = siteId ? all.filter(i => i.siteId === siteId) : all;
      return filtered.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    }
    try {
      const url = siteId ? `/api/inspections?siteId=${siteId}` : "/api/inspections";
      const res = await fetch(url);
      return await checkResponse(res);
    } catch (e) {
      isStaticMode = true;
      return this.getInspections(siteId);
    }
  },

  async getInspection(id: number): Promise<Inspection> {
    if (isStaticMode) {
      const all = getLocal<Inspection[]>(STORAGE_KEYS.INSPECTIONS, []);
      const insp = all.find(i => i.id === id);
      if (!insp) throw new Error("Inspection not found");
      return insp;
    }
    const res = await fetch(`/api/inspections/${id}`);
    return await checkResponse(res);
  },

  async createInspection(data: Partial<Inspection>): Promise<{ id: number }> {
    if (isStaticMode) {
      const all = getLocal<Inspection[]>(STORAGE_KEYS.INSPECTIONS, []);
      const newInsp: Inspection = { ...data, id: Date.now(), items: [] } as any;
      saveLocal(STORAGE_KEYS.INSPECTIONS, [...all, newInsp]);
      return { id: newInsp.id };
    }
    const res = await fetch("/api/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return await checkResponse(res);
  },

  async updateInspection(id: number, data: Partial<Inspection>): Promise<void> {
    if (isStaticMode) {
      const all = getLocal<Inspection[]>(STORAGE_KEYS.INSPECTIONS, []);
      const updated = all.map(i => i.id === id ? { ...i, ...data } : i);
      saveLocal(STORAGE_KEYS.INSPECTIONS, updated);
      return;
    }
    await fetch(`/api/inspections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async deleteInspection(id: number): Promise<void> {
    if (isStaticMode) {
      const all = getLocal<Inspection[]>(STORAGE_KEYS.INSPECTIONS, []);
      saveLocal(STORAGE_KEYS.INSPECTIONS, all.filter(i => i.id !== id));
      return;
    }
    await fetch(`/api/inspections/${id}`, { method: "DELETE" });
  },

  async registerItemResult(inspectionId: number, item: Partial<InspectionItem>): Promise<void> {
    if (isStaticMode) {
      const all = getLocal<Inspection[]>(STORAGE_KEYS.INSPECTIONS, []);
      const updated = all.map(insp => {
        if (insp.id !== inspectionId) return insp;
        const items = [...(insp.items || [])];
        const existingIdx = items.findIndex(i => i.itemId === item.itemId);
        if (existingIdx >= 0) {
          items[existingIdx] = { ...items[existingIdx], ...item };
        } else {
          items.push({ ...item, id: Date.now() } as any);
        }
        return { ...insp, items };
      });
      saveLocal(STORAGE_KEYS.INSPECTIONS, updated);
      return;
    }
    await fetch(`/api/inspections/${inspectionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
  },

  async uploadFile(content: string, mimeType: string = 'application/pdf'): Promise<{ id: number }> {
    if (isStaticMode) {
      const files = getLocal<any[]>(STORAGE_KEYS.FILES, []);
      const newId = Date.now();
      saveLocal(STORAGE_KEYS.FILES, [...files, { id: newId, content, mimeType }]);
      return { id: newId };
    }
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mimeType }),
      });
      return await checkResponse(res);
    } catch (e) {
      isStaticMode = true;
      return this.uploadFile(content, mimeType);
    }
  },

  getFileUrl(id: number): string {
    if (isStaticMode) {
      const files = getLocal<any[]>(STORAGE_KEYS.FILES, []);
      const file = files.find(f => f.id === id);
      return file ? file.content : '';
    }
    return `/api/files/${id}`;
  }
};

