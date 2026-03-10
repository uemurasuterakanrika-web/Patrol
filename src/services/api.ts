import { Site, Inspection, InspectionItem } from "../types";

export const api = {
  async getSites(): Promise<Site[]> {
    const res = await fetch("/api/sites");
    return res.json();
  },
  async createSite(name: string, address?: string, managerName?: string): Promise<{ id: number }> {
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, address, managerName }),
    });
    return res.json();
  },
  async updateSite(id: number, data: Partial<Site>): Promise<void> {
    await fetch(`/api/sites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },
  async deleteSite(id: number): Promise<void> {
    await fetch(`/api/sites/${id}`, {
      method: "DELETE",
    });
  },
  async getInspections(siteId?: number): Promise<Inspection[]> {
    const url = siteId ? `/api/inspections?siteId=${siteId}` : "/api/inspections";
    const res = await fetch(url);
    return res.json();
  },
  async getInspection(id: number): Promise<Inspection> {
    const res = await fetch(`/api/inspections/${id}`);
    return res.json();
  },
  async createInspection(data: Partial<Inspection>): Promise<{ id: number }> {
    const res = await fetch("/api/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async updateInspection(id: number, data: Partial<Inspection>): Promise<void> {
    await fetch(`/api/inspections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },
  async deleteInspection(id: number): Promise<void> {
    await fetch(`/api/inspections/${id}`, {
      method: "DELETE",
    });
  },
  async registerItemResult(inspectionId: number, item: Partial<InspectionItem>): Promise<void> {
    await fetch(`/api/inspections/${inspectionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
  },
};
