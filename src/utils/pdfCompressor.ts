import * as pdfjs from 'pdfjs-dist';
import { jsPDF } from 'jspdf';

// Configure worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

/**
 * PDFファイルを画像（JPEG）に変換してから再構築することで、
 * データサイズを圧縮（最適化）するユーティリティ関数。
 * @param file ユーザーが選択したPDFファイル
 * @param quality 画像の品質（0〜1, デフォルト0.6）
 * @param scale 解像度のスケール（デフォルト1.5 = 文字が読める程度の画質）
 * @returns 圧縮されたPDFのDataURL文字列
 */
export const compressPdf = async (file: File, quality = 0.6, scale = 1.5): Promise<string> => {
  return new Promise(async (resolve) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      // 元のPDFを読み込む
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      
      // 出力用の新しいPDFインスタンスを作成
      const compressedPdf = new jsPDF({
        unit: 'px',
        compress: true // Zlib圧縮を有効化
      });
      
      // jsPDF初期作成時の空ページ（1ページ目）を削除するために保持
      let isFirstPageReplaced = false;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        
        // Canvasを作成してPDFの1ページをレンダリングする
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        // 背景を白で塗りつぶし（透過防止）
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
        
        // CanvasをJPEGに変換して圧縮
        const imgData = canvas.toDataURL('image/jpeg', quality);
        const orientation = viewport.width > viewport.height ? 'landscape' : 'portrait';
        
        // 新しいページを追加（サイズは元ページのviewportに合わせる）
        compressedPdf.addPage([viewport.width, viewport.height], orientation);
        
        // 画像をページ全体に配置
        compressedPdf.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);
        
        // jsPDFが最初に作ってしまったデフォルトページを消す
        if (!isFirstPageReplaced) {
          compressedPdf.deletePage(1);
          isFirstPageReplaced = true;
        }
      }
      
      // 圧縮したPDFをDataURLとして出力
      const finalDataUrl = compressedPdf.output('datauristring');
      resolve(finalDataUrl);
      
    } catch (e) {
      console.error('PDFファイルの圧縮に失敗しました。元のファイルを使用します:', e);
      // エラー時はフォールバックとして圧縮前のファイルをそのまま返す
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  });
};
