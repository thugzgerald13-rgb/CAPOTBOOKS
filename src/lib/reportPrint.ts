import { printHtml } from './reliefInquiry';

/**
 * Print the active routed report through the same hidden-iframe mechanism as
 * RELIEF. App.tsx renders an empty dashboard .app-content before the routed
 * page, so selecting the first .app-content prints an empty page. Always use
 * the dedicated transaction-page-content container instead.
 */
export function printReportPage(title: string): void {
  const source = document.querySelector<HTMLElement>('.transaction-page-content');
  if (!source) {
    console.error(`[CAPOTBOOKS] Cannot print "${title}": report container was not found.`);
    return;
  }

  // Clone the active route only. This preserves the exact report data already
  // rendered by React without querying/rebuilding its underlying data sources.
  const content = source.cloneNode(true) as HTMLElement;
  content.querySelectorAll('.no-print, [data-print-hidden="true"]').forEach((node) => node.remove());
  content.querySelectorAll('button, [role="button"]').forEach((node) => node.remove());

  // Replace form controls with their currently displayed values so report
  // headers and editable report labels remain visible in the printed copy.
  content.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input, select, textarea'
  ).forEach((control) => {
    const replacement = document.createElement('span');
    if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) {
      replacement.textContent = control.checked ? 'Yes' : 'No';
    } else {
      replacement.textContent = control.value;
    }
    replacement.className = 'print-control-value';
    control.replaceWith(replacement);
  });

  const styles = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .map((link) => `<link rel="stylesheet" href="${escapeHtml(link.href)}">`).join('');
  const inlineStyles = Array.from(document.querySelectorAll<HTMLStyleElement>('style'))
    .map((style) => `<style>${style.textContent || ''}</style>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><base href="${escapeHtml(document.baseURI)}"><title>${escapeHtml(title)}</title>${styles}${inlineStyles}<style>
    @page{size:A4 landscape;margin:10mm}
    html,body{background:#fff!important;color:#000!important;font-family:Arial,sans-serif}
    body{margin:0;padding:0;font-size:10px}
    *,*:before,*:after{box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .no-print,[data-print-hidden="true"]{display:none!important}
    .transaction-page-content{max-width:none!important;width:100%!important;padding:0!important;margin:0!important;overflow:visible!important}
    .transaction-page-content *{visibility:visible!important}
    .transaction-page-content table{width:100%!important;min-width:0!important;border-collapse:collapse!important}
    .transaction-page-content thead{display:table-header-group}
    .transaction-page-content tr{break-inside:avoid}
    .transaction-page-content th,.transaction-page-content td{color:#000!important;border-color:#999!important}
    .transaction-page-content button{display:none!important}
    .print-control-value{display:inline-block;min-height:1em;white-space:pre-wrap}
    .overflow-auto,.overflow-x-auto,.overflow-y-auto,.overflow-hidden{overflow:visible!important;max-height:none!important}
  </style></head><body>${content.outerHTML}</body></html>`;

  printHtml(html);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}
