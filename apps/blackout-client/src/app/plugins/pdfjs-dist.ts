import { useCallback } from 'react';
import type * as PdfJsDist from 'pdfjs-dist';
import type { GetViewportParameters } from 'pdfjs-dist/types/src/display/api';
// Let vite emit + fingerprint the worker as an asset and resolve its URL
// (base-aware). Replaces the hand-rolled `${BASE_URL}/pdf.worker.min.js` path,
// which broke under vite-plugin-static-copy v4's path-preserving copy.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useAsyncCallback } from '../hooks/useAsyncCallback';

export const usePdfJSLoader = () =>
  useAsyncCallback(
    useCallback(async () => {
      const pdf = await import('pdfjs-dist');
      pdf.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return pdf;
    }, [])
  );

export const usePdfDocumentLoader = (pdfJS: typeof PdfJsDist | undefined, src: string) =>
  useAsyncCallback(
    useCallback(async () => {
      if (!pdfJS) {
        throw new Error('PdfJS is not loaded');
      }
      const doc = await pdfJS.getDocument(src).promise;
      return doc;
    }, [pdfJS, src])
  );

export const createPage = async (
  doc: PdfJsDist.PDFDocumentProxy,
  pNo: number,
  opts: GetViewportParameters
): Promise<HTMLCanvasElement> => {
  const page = await doc.getPage(pNo);
  const pageViewport = page.getViewport(opts);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) throw new Error('failed to render page.');

  canvas.width = pageViewport.width;
  canvas.height = pageViewport.height;

  page.render({
    canvasContext: context,
    viewport: pageViewport,
  });

  return canvas;
};
