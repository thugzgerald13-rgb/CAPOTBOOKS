import { useState, useRef } from 'react';
import { PageHeader } from '../ui/PageHeader';
import { useAccounting } from '../../context/AccountingContext';
import { formatTIN } from '../../lib/utils';
import { Building2, Search, Trash2, Plus, Users, Factory, Upload } from 'lucide-react';
import { cn } from '../../lib/utils';

export function TinLibraryModal() {
  const { currentClient, currentClientId, saveClient, showToast } = useAccounting();
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  
  // Forms
  const [tin, setTin] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lib = currentClient?.tinLibrary || { customers: [], suppliers: [] };
  const records = activeTab === 'customers' ? lib.customers : lib.suppliers;

  const filtered = records.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.tin.includes(searchTerm)
  );

  const handleFileUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const allLines = text.split(/\r?\n/).filter(line => line.trim() !== '');
      if (allLines.length === 0) return;
      
      const newRecords: any[] = [];
      let isMarkdownTable = allLines.some(line => line.includes('|') && (line.includes('---') || line.trim().startsWith('|')));
      
      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i].trim();
        if (!line) continue;

        // Skip markdown separator lines
        if (isMarkdownTable && line.includes('---') && line.includes('|')) continue;

        let cols: string[] = [];

        if (isMarkdownTable) {
          // Parse markdown table row
          cols = line.split('|').map(c => c.trim()).filter((c, idx, arr) => {
            // Remove first and last empty elements from | col1 | col2 | format
            if ((idx === 0 || idx === arr.length - 1) && !c) return false;
            return true;
          });
        } else {
          const sep = line.includes('\t') ? '\t' : ',';
          // Robust CSV line parser
          let cur = '';
          let inQuotes = false;
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              if (inQuotes && line[j + 1] === '"') {
                cur += '"';
                j++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === sep && !inQuotes) {
              cols.push(cur.trim());
              cur = '';
            } else {
              cur += char;
            }
          }
          cols.push(cur.trim());
        }

        if (cols.length < 2) continue;

        // Check if it's a RELIEF DAT format row (D, P or D, S)
        if (!isMarkdownTable && cols.length >= 10 && cols[0] === 'D' && (cols[1] === 'P' || cols[1] === 'S')) {
            let ptin = cols[2];
            let pname = cols[3];
            if (!pname || pname.trim() === '') {
              pname = [cols[4], cols[5], cols[6]].filter(Boolean).join(' ');
            }
            let addrParts = [];
            if (cols[7] && cols[7].trim()) addrParts.push(cols[7].trim());
            if (cols[8] && cols[8].trim()) addrParts.push(cols[8].trim());
            let paddr = addrParts.join(', ');

            ptin = ptin.replace(/\D/g, '');
            if (ptin.length >= 9) {
              ptin = `${ptin.substring(0,3)}-${ptin.substring(3,6)}-${ptin.substring(6,9)}`;
            }
            
            if (ptin && pname) {
              newRecords.push({ id: Date.now() + i, tin: ptin, name: pname, address: paddr });
            }
            continue;
        }

        // Standard Row Detection Logic
        let tinColIdx = -1;
        let maxDigits = 0;
        
        // Find the column that looks most like a TIN (8-9 digits)
        for (let j = 0; j < cols.length; j++) {
            const digits = (cols[j].replace(/\D/g, '') || '').length;
            if (digits >= 8 && digits <= 12) {
                if (digits > maxDigits) {
                  maxDigits = digits;
                  tinColIdx = j;
                }
            }
        }
        
        // If we didn't find a clear TIN, but we have a header, skip it
        if (tinColIdx === -1) {
          const joined = cols.join(',').toLowerCase();
          if (joined.includes('tin') || joined.includes('reg #') || joined.includes('company')) continue;
          continue;
        }

        // Simple name index - first non-TIN column with characters
        let nameColIdx = -1;
        for (let j = 0; j < cols.length; j++) {
           if (j !== tinColIdx && cols[j].trim().length > 2 && !/^\d+$/.test(cols[j].trim())) {
              nameColIdx = j;
              break;
           }
        }
        
        if (nameColIdx === -1) continue;

        let ptin = cols[tinColIdx].replace(/\D/g, '');
        let pname = cols[nameColIdx];
        
        // Address is anything left over
        let addrCols = cols.filter((_, idx) => idx !== tinColIdx && idx !== nameColIdx && idx !== 0); // skip index 0 often '#'
        let paddr = addrCols.join(', ').trim();

        if (ptin.length >= 9) {
          ptin = `${ptin.substring(0,3)}-${ptin.substring(3,6)}-${ptin.substring(6,9)}`;
        }
        
        if (ptin && pname) {
          newRecords.push({ id: Date.now() + i, tin: ptin, name: pname, address: paddr });
        }
      }
      
      // Deduplicate new records by TIN and Filter Existing
      const uniqueRecords: any[] = [];
      const existingTins = new Set(
        activeTab === 'customers' 
          ? lib.customers.map((c: any) => c.tin) 
          : lib.suppliers.map((s: any) => s.tin)
      );
      const seenTins = new Set();
      
      for (const rec of newRecords) {
        if (!seenTins.has(rec.tin) && !existingTins.has(rec.tin)) {
          seenTins.add(rec.tin);
          uniqueRecords.push(rec);
        }
      }

      if (uniqueRecords.length > 0 && currentClient && currentClientId) {
        const updatedLib = { ...lib };
        if (activeTab === 'customers') {
          updatedLib.customers = [...updatedLib.customers, ...uniqueRecords];
        } else {
          updatedLib.suppliers = [...updatedLib.suppliers, ...uniqueRecords];
        }
        saveClient(currentClientId, { ...currentClient, tinLibrary: updatedLib });
        showToast(`Uploaded ${uniqueRecords.length} new records`);
      } else if (newRecords.length === 0) {
        alert('No valid records found in the file. Ensure TIN and Company Name are visible.');
      } else {
        showToast('All records in the file already exist in the registry.');
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleAdd = () => {
    if (!currentClient || !currentClientId) return;
    if (!tin || !name) {
      alert('TIN and Name are required');
      return;
    }
    if (tin.length !== 11) {
      alert('TIN must be 9 digits format (XXX-XXX-XXX)');
      return;
    }

    const newRecord = { id: Date.now(), tin, name, address };
    const updatedLib = { ...lib };
    
    if (activeTab === 'customers') {
      updatedLib.customers = [...updatedLib.customers, newRecord];
    } else {
      updatedLib.suppliers = [...updatedLib.suppliers, newRecord];
    }

    saveClient(currentClientId, { ...currentClient, tinLibrary: updatedLib });
    showToast(`Added to ${activeTab} library`);
    setTin('');
    setName('');
    setAddress('');
  };

  const handleDelete = (id: number) => {
     if (!currentClient || !currentClientId) return;
     const updatedLib = { ...lib };
     if (activeTab === 'customers') {
       updatedLib.customers = updatedLib.customers.filter(c => c.id !== id);
     } else {
       updatedLib.suppliers = updatedLib.suppliers.filter(s => s.id !== id);
     }
     saveClient(currentClientId, { ...currentClient, tinLibrary: updatedLib });
     showToast('Record deleted');
  };

  return (
    <div className="w-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm mt-8 flex flex-col overflow-hidden">
      <PageHeader title="TIN Library" icon={<Building2 className="w-5 h-5 text-purple-500" />} />
      <div className="p-4 md:p-6 flex-1">
      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
        <button
          onClick={() => setActiveTab('customers')}
          className={cn(
            "flex-1 py-2 px-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all",
            activeTab === 'customers' ? "bg-white dark:bg-slate-700 shadow text-purple-600 dark:text-purple-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          )}
        >
          <Users className="w-4 h-4" /> Customers
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={cn(
            "flex-1 py-2 px-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all",
            activeTab === 'suppliers' ? "bg-white dark:bg-slate-700 shadow text-purple-600 dark:text-purple-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          )}
        >
          <Factory className="w-4 h-4" /> Suppliers
        </button>
      </div>

      <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 mb-6 flex flex-col md:flex-row gap-4 items-end">
        <div>
           <label className="form-label">TIN</label>
           <input type="text" value={tin} onChange={e => setTin(formatTIN(e.target.value))} placeholder="000-000-000" maxLength={11} className="form-input font-mono" />
        </div>
        <div className="flex-1">
           <label className="form-label">{activeTab === 'customers' ? 'Customer' : 'Supplier'} Name</label>
           <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Company or Full Name" className="form-input" />
        </div>
        {activeTab === 'suppliers' && (
          <div className="flex-1">
             <label className="form-label">Address</label>
             <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="Business Address" className="form-input" />
          </div>
        )}
        <button onClick={handleAdd} className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-2.5 rounded-xl transition-colors shadow-sm flex items-center gap-2 h-[42px]">
          <Plus className="w-5 h-5" /> Add
        </button>
      </div>

      <div className="mt-8">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
          <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 capitalize">{activeTab} Registry</h4>
          <div className="flex items-center gap-3 w-full md:w-auto">
            {activeTab === 'suppliers' && (
              <>
                <input 
                  type="file" 
                  accept="*" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" /> Upload
                </button>
              </>
            )}
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input 
                type="text" 
                placeholder={`Search ${activeTab}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="data-table">
            <thead>
              <tr>
                <th>TIN</th>
                <th>Entity Name</th>
                {activeTab === 'suppliers' && <th>Address</th>}
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors">
                  <td className="font-mono text-sm font-semibold">{record.tin}</td>
                  <td className="font-medium">{record.name}</td>
                  {activeTab === 'suppliers' && <td className="text-xs text-slate-500">{record.address || '—'}</td>}
                  <td className="text-center">
                    <button 
                      onClick={() => handleDelete(record.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={activeTab === 'suppliers' ? 4 : 3} className="text-center py-8 text-slate-500 dark:text-slate-400">
                    No registry entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
