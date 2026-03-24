/**
 * pdfService — generates a multi-page job photo report as a PDF, uploads it
 * to Firebase Storage, and appends it to the Job's `files` array in Firestore.
 *
 * Layout per page:
 *   ┌──────────────────────────────────────────┐
 *   │  HEADER  customer info  │  job address   │
 *   ├──────────────────────────────────────────┤
 *   │                                          │
 *   │   [ photo + comment ]  [ photo + comment]│
 *   │   [ photo + comment ]  [ photo + comment]│
 *   │                                          │
 *   ├──────────────────────────────────────────┤
 *   │  FOOTER  Page X of Y   │  company logo  │
 *   └──────────────────────────────────────────┘
 *
 * Each page holds exactly 4 photos in a 2-column CSS grid.
 * expo-print renders the HTML inside a WebView and returns a local file URI.
 * The PDF blob is then uploaded to Firebase Storage and saved as a JobFile.
 */

import * as Print from 'expo-print';
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../config/firebaseConfig';
import { COLLECTIONS } from '../constants/config';
import type { Job, JobFile, JobMedia } from '../types/job';
import type { Customer } from '../types/customer';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Split an array into fixed-size chunks. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** Escape HTML special characters so user-supplied text is safe to inject. */
function esc(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── HTML Builder ─────────────────────────────────────────────────────────────

function buildHtml(
  job: Job,
  customer: Customer,
  pages: JobMedia[][],
  companyLogoUrl?: string,
): string {
  const totalPages = pages.length;
  const customerName = esc(`${customer.firstName} ${customer.lastName}`.trim());
  const claimLine = job.claimNumber ? `Claim: #${esc(job.claimNumber)}` : '';
  const customerPhone = esc(customer.phone ?? '');

  // Use the job address if present; fall back to the customer's address.
  const streetAddress = esc(customer.address ?? '');

  const reportDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // ── Per-page HTML ─────────────────────────────────────────────────────────

  const pageHtml = pages
    .map((photos, pageIndex) => {
      const pageNumber = pageIndex + 1;

      // Fill the grid to exactly 4 cells so layout is always uniform.
      const cells = [...photos];
      while (cells.length < 4) cells.push(null as unknown as JobMedia);

      const gridCells = cells
        .map((photo) => {
          if (!photo) {
            // Empty placeholder — keeps the 2×2 grid balanced on the last page.
            return `<div class="photo-cell photo-cell--empty"></div>`;
          }
          const comment = esc(photo.comment ?? '');
          return `
            <div class="photo-cell">
              <div class="photo-frame">
                <img src="${esc(photo.url)}" class="photo-img" />
              </div>
              ${comment
                ? `<p class="photo-caption">${comment}</p>`
                : `<p class="photo-caption photo-caption--empty">&nbsp;</p>`
              }
            </div>`;
        })
        .join('');

      // ── Footer right: logo or blank ─────────────────────────────────────
      const footerRight = companyLogoUrl
        ? `<img src="${esc(companyLogoUrl)}" class="footer-logo" />`
        : '';

      return `
        <div class="page">

          <!-- HEADER -->
          <div class="header">
            <div class="header-left">
              <span class="header-name">${customerName}</span>
              ${claimLine ? `<span class="header-meta">${claimLine}</span>` : ''}
              ${customerPhone ? `<span class="header-meta">${customerPhone}</span>` : ''}
            </div>
            <div class="header-right">
              <span class="header-address">${streetAddress}</span>
              <span class="header-meta">${reportDate}</span>
            </div>
          </div>

          <!-- PHOTO GRID -->
          <div class="grid">
            ${gridCells}
          </div>

          <!-- FOOTER -->
          <div class="footer">
            <span class="footer-page">Page ${pageNumber} of ${totalPages}</span>
            <div class="footer-right">${footerRight}</div>
          </div>

        </div>`;
    })
    .join('\n');

  // ── Full HTML document ────────────────────────────────────────────────────

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Job Report — ${customerName}</title>
  <style>

    /* ── Reset ─────────────────────────────────────────────────── */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      background: #ffffff;
      color: #1a1a1a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Page container ────────────────────────────────────────── */
    .page {
      width: 100%;
      height: 100vh;
      position: relative;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      padding: 28px 32px 80px 32px; /* bottom padding reserves footer space */
      overflow: hidden;
    }

    /* ── Header ────────────────────────────────────────────────── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 14px;
      margin-bottom: 18px;
      border-bottom: 2.5px solid #2e7d32;
      flex-shrink: 0;
    }

    .header-left,
    .header-right {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .header-right {
      align-items: flex-end;
      text-align: right;
    }

    .header-name {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a1a;
      letter-spacing: -0.3px;
    }

    .header-address {
      font-size: 14px;
      font-weight: 600;
      color: #1a1a1a;
    }

    .header-meta {
      font-size: 12px;
      color: #555555;
    }

    /* ── Photo grid ────────────────────────────────────────────── */
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      flex: 1;
      align-content: start;
    }

    .photo-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #f9f9f9;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
      padding: 8px 8px 10px 8px;
    }

    .photo-cell--empty {
      background: transparent;
      border: 1px dashed #e0e0e0;
    }

    .photo-frame {
      width: 100%;
      height: 350px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #eeeeee;
      border-radius: 4px;
      overflow: hidden;
    }

    .photo-img {
      width: 100%;
      height: 350px;
      object-fit: contain;
      display: block;
    }

    .photo-caption {
      margin-top: 8px;
      font-size: 11.5px;
      color: #333333;
      text-align: center;
      line-height: 1.45;
      max-width: 100%;
      word-break: break-word;
    }

    .photo-caption--empty {
      color: transparent;
      user-select: none;
    }

    /* ── Footer ────────────────────────────────────────────────── */
    .footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 60px;
      padding: 0 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1.5px solid #e0e0e0;
      background: #ffffff;
    }

    .footer-page {
      font-size: 11px;
      color: #888888;
      font-weight: 500;
      letter-spacing: 0.2px;
    }

    .footer-right {
      display: flex;
      align-items: center;
    }

    .footer-logo {
      max-height: 40px;
      max-width: 140px;
      object-fit: contain;
    }

    /* ── Print overrides ───────────────────────────────────────── */
    @media print {
      .page { page-break-after: always; }
      .page:last-child { page-break-after: avoid; }
    }

  </style>
</head>
<body>
  ${pageHtml}
</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a paginated PDF photo report for a job, uploads it to Firebase
 * Storage, and appends it to the Job's `files` array as a document record.
 *
 * Intended to be called fire-and-forget from the UI. Errors are thrown so the
 * caller can attach a `.catch()` handler for logging.
 *
 * @param job            - The Firestore job document.
 * @param customer       - The associated customer document.
 * @param selectedMedia  - The JobMedia items to include (caller decides which
 *                         photos to include — inspection, install, or both).
 * @param companyLogoUrl - Optional HTTPS URL to the company logo. Rendered in
 *                         the footer of every page when provided.
 */
export async function generateJobReport(
  job: Job,
  customer: Customer,
  selectedMedia: JobMedia[],
  companyLogoUrl?: string,
): Promise<void> {
  if (selectedMedia.length === 0) {
    throw new Error('No photos selected. Please select at least one photo to generate a report.');
  }

  // 1. Chunk photos into groups of 4 — one group per page.
  const pages = chunk(selectedMedia, 4);
  const html = buildHtml(job, customer, pages, companyLogoUrl);

  // 2. expo-print renders the HTML in a headless WebView and returns a local
  //    file:// URI pointing to the generated PDF.
  const { uri: localUri } = await Print.printToFileAsync({ html, base64: false });

  // 3. Read the local PDF file into a Blob using the XHR method — bulletproof
  //    with file:// URIs on Hermes / React Native.
  const blob = await new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = () => reject(new TypeError('Network request failed'));
    xhr.responseType = 'blob';
    xhr.open('GET', localUri, true);
    xhr.send(null);
  });

  // 4. Upload to Firebase Storage.
  const fileName = `Inspection_Report_${Date.now()}.pdf`;
  const storageRef = ref(storage, `jobs/${job.id}/documents/${fileName}`);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, {
      contentType: 'application/pdf',
    });
    task.on('state_changed', undefined, reject, resolve);
  });

  const downloadUrl = await getDownloadURL(storageRef);

  // 5. Append a new JobFile record to the Firestore job document.
  const newFile: JobFile = {
    id: Date.now().toString(),
    type: 'document',
    name: 'Inspection Report',
    url: downloadUrl,
    createdAt: new Date().toISOString(),
    isSharedWithCustomer: false,
  };

  await updateDoc(doc(db, COLLECTIONS.jobs, job.id), {
    files: arrayUnion(newFile),
  });
}
