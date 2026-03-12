export interface Site {
  id: number;
  name: string;
  address?: string;
  managerName?: string;
  drawingPdfId?: number;
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

export interface DrawingMarker {
  id: string;
  x: number;
  y: number;
  label: string;
  type: 'issue' | 'photo';
  page?: number;
  issuePhotoId?: string;
  description?: string;
  correctiveAction?: string;
  correctivePhotoId?: string;
}

export interface InspectionItem {
  id?: number;
  inspectionId: number;
  itemId: string;
  rating: '〇' | '△' | '✕' | '○' | '×' | '';
  comment?: string;
  correctiveAction?: string;
  photoId?: string;
  photoCaption?: string;
  correctivePhotoId?: string;
  correctivePhotoCaption?: string;
  markers?: string; // JSON string of DrawingMarker[]
}

export interface InspectionItemMaster {
  id: string;
  section: string;
  label: string;
  checkpoints?: string[];
}
