export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

export function formatTIN(input: string) {
  let digits = input.replace(/\D/g, '');
  if (digits.length > 9) digits = digits.slice(0, 9);
  let formatted = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === 3 || i === 6) formatted += '-';
    formatted += digits[i];
  }
  return formatted;
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const RDO_CODES = [
  "001 - Laoag City, Ilocos Norte",
  "002 - Vigan / Bantay, Ilocos Sur",
  "003 - San Fernando, La Union",
  "004 - Calasiao, Central Pangasinan",
  "005 - Alaminos City, West Pangasinan",
  "006 - Urdaneta City, East Pangasinan",
  "007 - Bangued, Abra",
  "008 - Baguio City, Baguio City",
  "009 - La Trinidad, Benguet",
  "010 - Bontoc, Mountain Province",
  "011 - Tabuk City, Kalinga & Apayao",
  "012 - Lagawe, Ifugao",
  "013 - Tuguegarao City, Cagayan & Batanes",
  "014 - Bayombong, Nueva Vizcaya",
  "015 - Naguilian / Cauayan, Isabela",
  "016 - Cabarroguis, Quirino",
  "017A - Tarlac City, North Tarlac",
  "017B - Paniqui, South Tarlac",
  "018 - Olongapo City, Zambales",
  "019 - Subic Bay Freeport Zone, Subic",
  "020 - Balanga, Bataan",
  "021A - San Fernando (Sindalan), North Pampanga",
  "021B - San Fernando (Sindalan), South Pampanga",
  "021C - Clark Freeport Zone, Clark, Pampanga/Tarlac",
  "022 - Baler, Aurora",
  "023A - Talavera, North Nueva Ecija",
  "023B - Cabanatuan City, South Nueva Ecija",
  "024 - Valenzuela City, Valenzuela",
  "025A - Guiguinto, West Bulacan",
  "025B - Guiguinto, East Bulacan",
  "026 - Malabon, Malabon & Navotas",
  "027 - Caloocan City, Caloocan",
  "028 - Novaliches, Novaliches, Quezon City",
  "029 - Tondo-San Nicolas, Tondo, Manila",
  "030 - Binondo, Binondo, Manila",
  "031 - Sta. Cruz, Sta. Cruz, Manila",
  "032 - Quiapo-Sampaloc-Sta. Mesa-San Miguel, Manila",
  "033 - Intramuros-Ermita-Malate, Manila",
  "034 - Paco-Pandacan-Sta. Ana-San Andres, Manila",
  "035 - Odiongan, Romblon",
  "036 - Puerto Princesa, Palawan",
  "037 - San Jose, Occidental Mindoro",
  "038 - North Quezon City, North QC",
  "039 - South Quezon City, South QC",
  "040 - Cubao, Cubao, Quezon City",
  "041 - Mandaluyong City, Mandaluyong",
  "042 - San Juan City, San Juan",
  "043 - Pasig City, Pasig",
  "044 - Taguig-Pateros, Taguig & Pateros",
  "045 - Marikina City / Antipolo (partial), Marikina & North Rizal",
  "046 - Cainta-Taytay, South Rizal",
  "047 - East Makati, East Makati",
  "048 - West Makati, West Makati",
  "049 - North Makati, North Makati",
  "050 - South Makati, South Makati",
  "051 - Pasay City, Pasay",
  "052 - Parañaque City, Parañaque",
  "053A - Las Piñas City, Las Piñas",
  "053B - Muntinlupa City, Muntinlupa",
  "054A - Trece Martires City, East Cavite",
  "054B - Kawit, West Cavite",
  "055 - San Pablo City, East Laguna",
  "056 - Calamba City, Central Laguna",
  "057 - Biñan City, West Laguna",
  "058 - Batangas City, West Batangas",
  "059 - Lipa City, East Batangas",
  "060 - Lucena City, North Quezon",
  "061 - Gumaca, South Quezon",
  "062 - Boac, Marinduque",
  "063 - Calapan City, Oriental Mindoro",
  "064 - Talisay, Camarines Norte",
  "065 - Naga City, West Camarines Sur",
  "066 - Iriga City, East Camarines Sur",
  "067 - Legazpi City, Albay",
  "068 - Sorsogon City, Sorsogon",
  "069 - Virac, Catanduanes",
  "070 - Masbate City, Masbate",
  "071 - Kalibo, Aklan",
  "072 - Roxas City, Capiz",
  "073 - San Jose, Antique",
  "074 - Iloilo City, South Iloilo & Guimaras",
  "075 - Zarraga, North Iloilo",
  "076 - Victorias City, North Negros Occidental",
  "077 - Bacolod City, Central Negros Occidental",
  "078 - Binalbagan, South Negros Occidental",
  "079 - Dumaguete City, Negros Oriental & Siquijor",
  "080 - Mandaue City, North Cebu",
  "081 - Cebu City North, Cebu City North",
  "082 - Cebu City South, Cebu City South",
  "083 - Talisay City, South Cebu",
  "084 - Tagbilaran City, Bohol",
  "085 - Catarman, Northern Samar",
  "086 - Borongan City, Eastern Samar",
  "087 - Calbayog City, Samar",
  "088 - Tacloban City, Eastern Leyte & Biliran",
  "089 - Ormoc City, Western Leyte",
  "090 - Maasin City, Southern Leyte",
  "091 - Dipolog City, Zamboanga del Norte",
  "092 - Pagadian City, Zamboanga del Sur",
  "093A - Zamboanga City, Zamboanga City",
  "093B - Ipil, Zamboanga Sibugay",
  "094 - Isabela City, Basilan",
  "095 - Jolo, Sulu",
  "096 - Bongao, Tawi-Tawi",
  "097 - Gingoog City, East Misamis Oriental & Camiguin",
  "098 - Cagayan de Oro City, West Misamis Oriental",
  "099 - Malaybalay, Bukidnon",
  "100 - Ozamiz City, Misamis Occidental",
  "101 - Iligan City, Lanao del Norte",
  "102 - Marawi City, Lanao del Sur",
  "103 - Butuan City, Agusan del Norte",
  "104 - Bayugan City, Agusan del Sur",
  "105 - Surigao City, Surigao del Norte & Dinagat Islands",
  "106 - Tandag City, Surigao del Sur",
  "107 - Cotabato City, Maguindanao provinces",
  "108 - Kidapawan City, Cotabato (North Cotabato)",
  "109 - Tacurong City, Sultan Kudarat",
  "110 - General Santos City, South Cotabato & Sarangani",
  "111 - Koronadal City, South Cotabato (partial)",
  "112 - Tagum City, Davao del Norte & Davao de Oro",
  "113A - West Davao City, West Davao",
  "113B - East Davao City, East Davao",
  "114 - Mati City, Davao Oriental",
  "115 - Digos City, Davao del Sur & Davao Occidental"
];

export function getMonthName(monthNum: number | string) {
  return MONTHS[parseInt(monthNum as string) - 1];
}

export function generateDATFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface DownloadableAttachment {
  name: string;
  type: string;
  originalType: string;
  size: number;
  originalSize: number;
  compression?: 'none' | 'gzip';
  content: string;
}

export async function downloadAttachment(file?: DownloadableAttachment | null) {
  if (!file?.content) return;
  try {
    if (file.compression === 'gzip') {
      if (!('DecompressionStream' in window)) throw new Error('DecompressionStream unavailable');
      const response = await fetch(file.content);
      const compressed = await response.blob();
      const restoredStream = compressed.stream().pipeThrough(new DecompressionStream('gzip'));
      const restored = await new Response(restoredStream).blob();
      const url = URL.createObjectURL(new Blob([restored], { type: file.originalType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return;
    }

    if (!file.originalType.startsWith('image/') || file.type === file.originalType) {
      const link = document.createElement('a');
      link.href = file.content;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }

    const image = new Image();
    image.src = file.content;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to restore image format'));
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(image, 0, 0);
    const restored = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, file.originalType, 0.92));
    if (!restored) throw new Error('Unable to restore image');
    const url = URL.createObjectURL(restored);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    const link = document.createElement('a');
    link.href = file.content;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

export function generateCSV(filename: string, rows: any[][]) {
  const csvContent = rows.map(r => 
    r.map(item => {
      // Escape quotes and commas
      let str = String(item !== null && item !== undefined ? item : '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  ).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
