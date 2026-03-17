import * as pdfjs from 'pdfjs-dist';
import { jsPDF } from 'jspdf';

// Configure worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const CMAP_URL = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`;
const CMAP_PACKED = true;

/**
 * PDFファイルを画像（JPEG）に変換してから再構築することで、
 * データサイズを圧縮（最適化）するユーティリティ関数。
 * @param file ユーザーが選択したPDFファイル
 * @param targetMaxSizeBytes 目標とする最大ファイルサイズ（デフォルト1MB）
 * @returns 圧縮されたPDFのDataURL文字列
 */
export const compressPdf = async (file: File, targetMaxSizeBytes = 1000000): Promise<string> => {
  // すでに十分小さい場合は、そのままDataURLにして返す（画質劣化を防ぐ）
  if (file.size < targetMaxSizeBytes * 0.8) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  }

  return new Promise(async (resolve) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      // 元のPDFを読み込む。cMap設定がないと日本語等の文字が消えることがある。
      const pdf = await pdfjs.getDocument({ 
        data: arrayBuffer,
        cMapUrl: CMAP_URL,
        cMapPacked: CMAP_PACKED
      }).promise;
      
      // 最初は高めの設定で試みる
      let scale = 1.8;
      let quality = 0.7;
      let finalDataUrl = "";

      // 1MB制限に収まるまで再試行（最大3回）
      for (let attempt = 0; attempt < 3; attempt++) {
        const compressedPdf = new jsPDF({ unit: 'px', compress: true });
        let isFirstPageReplaced = false;

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;
          
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          context.fillStyle = 'white';
          context.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: context, viewport }).promise;
          
          const imgData = canvas.toDataURL('image/jpeg', quality);
          const orientation = viewport.width > viewport.height ? 'landscape' : 'portrait';
          
          compressedPdf.addPage([viewport.width, viewport.height], orientation);
          compressedPdf.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);
          
          if (!isFirstPageReplaced) {
            compressedPdf.deletePage(1);
            isFirstPageReplaced = true;
          }
        }
        
        finalDataUrl = compressedPdf.output('datauristring');
        
        // 1MB制限チェック (DataURLは元のデータより約1.3倍大きくなるため厳しめにチェック)
        if (finalDataUrl.length < targetMaxSizeBytes * 1.3) {
          break;
        } else {
          // サイズオーバーなら品質と解像度を下げて再試行
          scale -= 0.4;
          quality -= 0.15;
          console.log(`Retrying compression: attempt ${attempt + 1}, scale=${scale}, quality=${quality}`);
        }
      }
      
      resolve(finalDataUrl);
      
    } catch (e) {
      console.error('PDFファイルの圧縮に失敗しました:', e);
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  });
};
