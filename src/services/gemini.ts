import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const functionDeclarations: FunctionDeclaration[] = [
  {
    name: "create_site",
    description: "現場（Site）を新規作成する",
    parameters: {
      type: Type.OBJECT,
      properties: {
        siteName: { type: Type.STRING, description: "工事名/現場名" },
        address: { type: Type.STRING, description: "住所（任意）" }
      },
      required: ["siteName"]
    }
  },
  {
    name: "list_sites",
    description: "現場（Site）一覧を取得する",
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: "select_site",
    description: "作業対象の現場（Site）を選択する（セッション保持用）",
    parameters: {
      type: Type.OBJECT,
      properties: {
        siteId: { type: Type.STRING, description: "選択する現場ID" }
      },
      required: ["siteId"]
    }
  },
  {
    name: "attach_drawing_pdf",
    description: "現場に図面PDFを添付登録する（プロトはpdfId文字列）",
    parameters: {
      type: Type.OBJECT,
      properties: {
        siteId: { type: Type.STRING },
        pdfId: { type: Type.STRING, description: "図面PDFの識別子（仮）" },
        fileName: { type: Type.STRING, description: "ファイル名（任意）" }
      },
      required: ["siteId", "pdfId"]
    }
  },
  {
    name: "create_inspection",
    description: "点検（Inspection）を新規作成する（ヘッダ情報含む）",
    parameters: {
      type: Type.OBJECT,
      properties: {
        siteId: { type: Type.STRING },
        inspectionDate: { type: Type.STRING, description: "YYYY-MM-DD" },
        inspectorName: { type: Type.STRING },
        workersCount: { type: Type.INTEGER },
        workSummary: { type: Type.STRING },
        templateVersion: { type: Type.STRING, description: "例: R1.9" }
      },
      required: ["siteId", "inspectionDate", "inspectorName"]
    }
  },
  {
    name: "list_inspections",
    description: "現場の点検一覧を取得する",
    parameters: {
      type: Type.OBJECT,
      properties: {
        siteId: { type: Type.STRING }
      },
      required: ["siteId"]
    }
  },
  {
    name: "get_inspection_detail",
    description: "点検の詳細（入力状況/結果）を取得する",
    parameters: {
      type: Type.OBJECT,
      properties: {
        inspectionId: { type: Type.STRING }
      },
      required: ["inspectionId"]
    }
  },
  {
    name: "set_item_result",
    description: "点検項目の評価（〇△✕）とコメントを登録/更新する",
    parameters: {
      type: Type.OBJECT,
      properties: {
        inspectionId: { type: Type.STRING },
        itemId: { type: Type.STRING, description: "点検項目ID（例: F-4, D-2 など）" },
        evaluation: { type: Type.STRING, enum: ["○", "△", "×"] },
        comment: { type: Type.STRING, description: "指摘内容（△/×の場合は必須）" }
      },
      required: ["inspectionId", "itemId", "evaluation"]
    }
  },
  {
    name: "attach_photo",
    description: "点検項目に写真を紐付ける（プロトはphotoId文字列）",
    parameters: {
      type: Type.OBJECT,
      properties: {
        inspectionId: { type: Type.STRING },
        itemId: { type: Type.STRING },
        photoId: { type: Type.STRING, description: "写真の識別子（仮）" },
        caption: { type: Type.STRING, description: "写真説明（任意）" }
      },
      required: ["inspectionId", "itemId", "photoId"]
    }
  },
  {
    name: "set_overall_comment",
    description: "総合所見を登録/更新する",
    parameters: {
      type: Type.OBJECT,
      properties: {
        inspectionId: { type: Type.STRING },
        overallComment: { type: Type.STRING }
      },
      required: ["inspectionId", "overallComment"]
    }
  },
  {
    name: "calculate_score",
    description: "点検の点数とランクを計算する（プロトは概算でOK）",
    parameters: {
      type: Type.OBJECT,
      properties: {
        inspectionId: { type: Type.STRING }
      },
      required: ["inspectionId"]
    }
  },
  {
    name: "export_pdf",
    description: "点検結果をPDF出力する（プロトは出力要求のみ）",
    parameters: {
      type: Type.OBJECT,
      properties: {
        inspectionId: { type: Type.STRING },
        paperSize: { type: Type.STRING, enum: ["A4"], default: "A4" }
      },
      required: ["inspectionId"]
    }
  }
];

export const systemInstruction = `
あなたは「現場安全パトロール点検表エージェント」です。
ユーザーの入力を元に、現場の作成、点検の開始、項目の評価登録をサポートします。

【点検項目カテゴリ】
A. 書類提出等 (A-1, A-2)
B. 現場運営管理 (B-1, B-2, B-3)
C. 掲示等 (C-1, C-2)
D. 整理整頓 (D-1, D-2, D-3, D-4, D-5)
E. 公衆災害防止 (E-1)
F. 墜落災害防止 (F-1, F-2, F-3, F-4, F-5, F-6)
G. 飛来 (G-1, G-2, G-3)
H. 建設機械災害防止 (H-1, H-2)
I. 電気等 (I-1, I-2)
J. 環境衛生 (J-1, J-2)

【ルール】
1. 評価は「〇 / △ / ✕」のみ。
2. △または✕の場合、コメントは必須です。
3. ✕の場合、写真は必須です（プロトタイプではphotoIdを適当に生成して登録してください）。
4. ユーザーが「次へ」と言ったら、まだ入力されていない次の項目を案内してください。
5. ユーザーの発話から項目を推定してください。例：「足場の通路に物が置いてある」→ D-1（安全通路確保）に△または✕。
6. 現場を選択または新規作成した直後は、自動的に点検表が開くようになっています。

現在の状態を常に意識し、適切な関数を呼び出してください。
`;

export function createChat() {
  return ai.chats.create({
    model: "gemini-3.1-pro-preview",
    config: {
      systemInstruction,
      tools: [{ functionDeclarations }],
    },
  });
}
