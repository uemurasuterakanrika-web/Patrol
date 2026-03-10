export interface Site {
  id: number;
  name: string;
  address?: string;
  managerName?: string;
  drawingPdfId?: string;
}

export interface Inspection {
  id: number;
  siteId: number;
  siteName?: string;
  date?: string;
  inspectorName?: string;
  workerCount?: number;
  workContent?: string;
  overallComment?: string;
  score?: number;
  rank?: string;
  templateVersion?: string;
  status: 'draft' | 'completed';
  items?: InspectionItem[];
}

export interface InspectionItem {
  id?: number;
  inspectionId: number;
  itemId: string;
  rating: '〇' | '△' | '✕' | '○' | '×' | '';
  comment?: string;
  photoId?: string;
  photoCaption?: string;
}

export interface InspectionItemMaster {
  id: string;
  section: string;
  label: string;
  checkpoints?: string[];
}
