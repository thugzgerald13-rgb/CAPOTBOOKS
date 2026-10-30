import { printHtml } from './reliefInquiry';

/** Print the currently rendered report through the same hidden-iframe flow used by RELIEF. */
export function printReportPage(title: string): void {
  const source = document.querySelector<HTMLElement>('.app-content');
  if (!source) return;
  const content = source.cloneNode(true) as HTMLElement;
  content.querySelectorAll('.no-print, [data-print-hidden="true"]').forEach((node) => node.remove());
  content.querySelectorAll('button').forEach((node) => node.remove());
  content.querySelectorAll('input, select, textarea').forEach((node) => {
    const value = (node as HTMLInputElement).value;
    const replacement = document.createElement('span');
    replacement.textContent = value;
    node.replaceWith(replacement);
  });
  const styles = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .map((link) => `<link rel="stylesheet" href="${link.href}">`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><base href="${document.baseURI}"><title>${escapeHtml(title)}</title>${styles}<style>
    @page{size:A4 landscape;margin:10mm}
    html,body{background:#fff!important;color:#000!important;font-family:Arial,sans-serif}
    body{margin:0;padding:0;font-size:10px}
    *,*:before,*:after{box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .no-print{display:none!important}
    .app-content{max-width:none!important;width:100%!important;padding:0!important;margin:0!important;overflow:visible!important}
    table{width:100%!important;min-width:0!important;border-collapse:collapse!important}
    thead{display:table-header-group} tr{break-inside:avoid}
    th,td{color:#000!important;border-color:#999!important}
    button{display:none!important}
  </style></head><body>${content.outerHTML}</body></html>`;
  printHtml(html);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char] || char));
}
