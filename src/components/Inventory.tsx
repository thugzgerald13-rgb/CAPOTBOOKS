import React, { useState, useMemo, useEffect } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { 
  Boxes, Plus, Search, Trash2, Edit3, CheckCircle, 
  AlertTriangle, History, DollarSign, ArrowUpDown, 
  TrendingUp, ClipboardList, PackageCheck, PackageX,
  RefreshCw, Layers, MapPin, Tag, X
} from 'lucide-react';
import { InventoryItem, InventoryMovement, InventoryColumn, Client } from '../types';
import { supabase } from '../lib/supabase';

export function Inventory() {
  const { currentClient, saveClient, activePage, navigateToPage } = useAccounting();

  // Tab state
  const [activeTab, setActiveTab] = useState<'registry' | 'movements' | 'alerts'>('registry');
  const [loadedMovements, setLoadedMovements] = useState<InventoryMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // New item form state
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemSku, setItemSku] = useState('');
  const [itemCategory, setItemCategory] = useState('Merchandise');
  const [itemUom, setItemUom] = useState('pcs');
  const [itemCost, setItemCost] = useState('0');
  const [itemSelling, setItemSelling] = useState('0');
  const [itemLevel, setItemLevel] = useState('0');
  const [itemReorder, setItemReorder] = useState('5');
  const [itemLocation, setItemLocation] = useState('');
  const [itemDesc, setItemDesc] = useState('');

  // Stock Adjustment form state
  const [isAdjFormOpen, setIsAdjFormOpen] = useState(false);
  const [adjItemId, setAdjItemId] = useState('');
  const [adjType, setAdjType] = useState<'Inbound' | 'Outbound' | 'Adjustment'>('Inbound');
  const [adjQty, setAdjQty] = useState('1');
  const [adjRef, setAdjRef] = useState('');
  const [adjNotes, setAdjNotes] = useState('');

  // Default Categories
  const CATEGORIES = ['Merchandise', 'Raw Materials', 'Work in Progress', 'Finished Goods', 'Services', 'Office Supplies'];

  // Initialize client's inventory items from real saved data (no mock/sample data)
  const inventoryItems: InventoryItem[] = useMemo(() => {
    if (!currentClient) return [];
    return currentClient.inventoryItems || [];
  }, [currentClient]);

  // Inventory movements are intentionally lazy-loaded. The registry and alerts
  // only need inventory item metadata; potentially large movement history is
  // fetched when the user actually opens the Movements tab.
  const inventoryMovements = loadedMovements;

  useEffect(() => {
    let cancelled = false;
    const loadMovements = async () => {
      if (!currentClient?.id || activeTab !== 'movements') return;
      setMovementsLoading(true);
      setMovementsError(null);
      try {
        const { data, error } = await supabase
          .from('inventory_movements')
          .select('id,item_id,item_name,item_code,date,type,qty,unit_cost,total_value,reference,notes')
          .eq('client_id', currentClient.id)
          .order('date', { ascending: false })
          .limit(500);
        if (error) throw error;
        if (!cancelled) {
          setLoadedMovements((data || []).map((m: any) => ({
            id: String(m.id), itemId: m.item_id || '', itemName: m.item_name || '',
            itemCode: m.item_code || '', date: m.date ? String(m.date).slice(0, 10) : '',
            type: m.type, qty: Number(m.qty || 0), unitCost: Number(m.unit_cost || 0),
            totalValue: Number(m.total_value || 0), reference: m.reference || '', notes: m.notes || ''
          })));
        }
      } catch (e: any) {
        if (!cancelled) setMovementsError(e?.message || 'Unable to load inventory movements.');
      } finally {
        if (!cancelled) setMovementsLoading(false);
      }
    };
    loadMovements();
    return () => { cancelled = true; };
  }, [currentClient?.id, activeTab]);

  // Make sure client's data matches
  const syncWithCloud = async (newItems: InventoryItem[], newMovements: InventoryMovement[]) => {
    if (!currentClient) return;
    const updated: Client = {
      ...currentClient,
      inventoryItems: newItems,
      inventoryMovements: newMovements
    };
    await saveClient(currentClient.id, updated);
  };

  // Helper selectors
  const itemSummary = useMemo(() => {
    let totalItems = inventoryItems.length;
    let totalStock = inventoryItems.reduce((acc, i) => acc + i.stockLevel, 0);
    let totalValuation = inventoryItems.reduce((acc, i) => acc + (i.stockLevel * i.costPrice), 0);
    let estimatedProfit = inventoryItems.reduce((acc, i) => acc + (i.stockLevel * (i.sellingPrice - i.costPrice)), 0);
    
    let lowStockItems = inventoryItems.filter(i => i.stockLevel > 0 && i.stockLevel <= i.reorderPoint).length;
    let outOfStockItems = inventoryItems.filter(i => i.stockLevel === 0).length;

    return {
      totalItems,
      totalStock,
      totalValuation,
      estimatedProfit,
      lowStockItems,
      outOfStockItems
    };
  }, [inventoryItems]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return inventoryItems.filter(item => {
      const matchQuery = 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.location && item.location.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchCategory = categoryFilter === 'All' || item.category === categoryFilter;
      return matchQuery && matchCategory;
    });
  }, [inventoryItems, searchQuery, categoryFilter]);

  // Form Handlers
  const handleOpenAddForm = () => {
    setEditingItem(null);
    setItemCode('PRD-' + Math.floor(100+Math.random()*900));
    setItemName('');
    setItemSku('SKU-' + Date.now().toString().slice(-6));
    setItemCategory('Merchandise');
    setItemUom('pcs');
    setItemCost('0');
    setItemSelling('0');
    setItemLevel('0');
    setItemReorder('5');
    setItemLocation('');
    setItemDesc('');
    setIsFormOpen(true);
  };

  const handleEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setItemCode(item.code);
    setItemName(item.name);
    setItemSku(item.sku);
    setItemCategory(item.category);
    setItemUom(item.unitOfMeasure);
    setItemCost(item.costPrice.toString());
    setItemSelling(item.sellingPrice.toString());
    setItemLevel(item.stockLevel.toString());
    setItemReorder(item.reorderPoint.toString());
    setItemLocation(item.location || '');
    setItemDesc(item.description || '');
    setIsFormOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !itemCode.trim()) return;

    const costVal = parseFloat(itemCost) || 0;
    const sellVal = parseFloat(itemSelling) || 0;
    const levelVal = parseInt(itemLevel) || 0;
    const reorderVal = parseInt(itemReorder) || 0;

    let updatedList: InventoryItem[];

    if (editingItem) {
      // Modify
      updatedList = inventoryItems.map(item => {
        if (item.id === editingItem.id) {
          return {
            ...item,
            code: itemCode.trim(),
            name: itemName.trim(),
            sku: itemSku.trim(),
            category: itemCategory,
            unitOfMeasure: itemUom,
            costPrice: costVal,
            sellingPrice: sellVal,
            stockLevel: levelVal,
            reorderPoint: reorderVal,
            location: itemLocation.trim(),
            description: itemDesc.trim()
          };
        }
        return item;
      });
    } else {
      // Create new
      const newItem: InventoryItem = {
        id: 'inv_' + Date.now(),
        code: itemCode.trim(),
        name: itemName.trim(),
        sku: itemSku.trim(),
        category: itemCategory,
        unitOfMeasure: itemUom,
        costPrice: costVal,
        sellingPrice: sellVal,
        stockLevel: levelVal,
        reorderPoint: reorderVal,
        location: itemLocation.trim(),
        description: itemDesc.trim()
      };
      updatedList = [...inventoryItems, newItem];
    }

    await syncWithCloud(updatedList, inventoryMovements);
    setIsFormOpen(false);
    setEditingItem(null);
  };

  const handleDeleteItem = async (itemId: string) => {
    const updated = inventoryItems.filter(item => item.id !== itemId);
    const updatedMovs = inventoryMovements.filter(mov => mov.itemId !== itemId);
    await syncWithCloud(updated, updatedMovs);
  };

  // Custom Column Handlers (user-defined extra fields on the registry table)
  const customColumns: InventoryColumn[] = currentClient?.inventoryColumns || [];

  const handleAddColumn = async () => {
    if (!currentClient) return;
    const label = window.prompt('New column name (e.g. Supplier, Warranty Period):');
    if (!label || !label.trim()) return;
    const id = 'col_' + Date.now();
    const updatedColumns = [...customColumns, { id, label: label.trim() }];
    await saveClient(currentClient.id, { ...currentClient, inventoryColumns: updatedColumns });
  };

  const handleDeleteColumn = async (columnId: string, columnLabel: string) => {
    if (!currentClient) return;
    if (!confirm(`Delete column "${columnLabel}"? This removes its data from every item.`)) return;
    const updatedColumns = customColumns.filter(c => c.id !== columnId);
    const updatedItems = inventoryItems.map(item => {
      if (!item.customFields || !(columnId in item.customFields)) return item;
      const { [columnId]: _removed, ...rest } = item.customFields;
      return { ...item, customFields: rest };
    });
    await saveClient(currentClient.id, { ...currentClient, inventoryColumns: updatedColumns, inventoryItems: updatedItems });
  };

  const handleCustomFieldChange = async (itemId: string, columnId: string, value: string) => {
    if (!currentClient) return;
    const updatedItems = inventoryItems.map(item =>
      item.id === itemId ? { ...item, customFields: { ...(item.customFields || {}), [columnId]: value } } : item
    );
    await saveClient(currentClient.id, { ...currentClient, inventoryItems: updatedItems });
  };

  // Stock Adjustment Handlers
  const handleOpenAdjForm = (itemId?: string) => {
    setAdjItemId(itemId || (inventoryItems[0]?.id || ''));
    setAdjType('Inbound');
    setAdjQty('1');
    setAdjRef('');
    setAdjNotes('');
    setIsAdjFormOpen(true);
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedQty = parseInt(adjQty) || 0;
    if (parsedQty <= 0 || !adjItemId) return;

    const targetItem = inventoryItems.find(i => i.id === adjItemId);
    if (!targetItem) return;

    let currentStock = targetItem.stockLevel;
    let netQty = parsedQty;

    if (adjType === 'Outbound') {
      netQty = -parsedQty;
    } else if (adjType === 'Adjustment') {
      // Adjustment could be negative or positive
      netQty = parsedQty; // standard adjustment quantity directly applied
    }

    // Safety checks
    if (currentStock + netQty < 0) {
      alert("Insufficient stock level for this ledger transaction!");
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const newMov: InventoryMovement = {
      id: 'mov_' + Date.now(),
      itemId: adjItemId,
      itemName: targetItem.name,
      itemCode: targetItem.code,
      date: todayStr,
      type: adjType,
      qty: parsedQty,
      unitCost: targetItem.costPrice,
      totalValue: parsedQty * targetItem.costPrice,
      reference: adjRef.trim() || 'Manual Adjustment',
      notes: adjNotes.trim()
    };

    const updatedItems = inventoryItems.map(item => {
      if (item.id === adjItemId) {
        return {
          ...item,
          stockLevel: item.stockLevel + netQty
        };
      }
      return item;
    });

    const updatedMovs = [newMov, ...inventoryMovements];
    setLoadedMovements(updatedMovs);

    await syncWithCloud(updatedItems, updatedMovs);
    setIsAdjFormOpen(false);
  };

  // Alerts configuration
  const outOfStockList = inventoryItems.filter(i => i.stockLevel === 0);
  const lowStockList = inventoryItems.filter(i => i.stockLevel > 0 && i.stockLevel <= i.reorderPoint);

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Inventory & Stock Valuation" icon={<Boxes className="text-amber-500 w-5 h-5" />} />
      <div className="p-4 md:p-6 flex-1">
      <div className="flex flex-col gap-6 font-sans">
        
        {/* Header KPI Hub */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-3 shadow-sm">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 text-blue-600 rounded-xl">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Registered SKU</span>
              <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{itemSummary.totalItems} Items</div>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-3 shadow-sm">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 rounded-xl">
              <PackageCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-sans">Asset Valuation</span>
              <div className="text-xl font-bold text-emerald-600">₱{itemSummary.totalValuation.toLocaleString()}</div>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-3 shadow-sm">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-500 rounded-xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Low Stock Alert</span>
              <div className="text-xl font-bold text-amber-500">{itemSummary.lowStockItems} Items</div>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-3 shadow-sm">
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-500 rounded-xl">
              <PackageX className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Out of Stock</span>
              <div className="text-xl font-bold text-rose-600">{itemSummary.outOfStockItems} Items</div>
            </div>
          </div>
        </div>

        {/* Action controls & Tabs */}
        <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-100 dark:bg-slate-800/40 p-1.5 rounded-2xl gap-3">
          <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
            <button 
              onClick={() => setActiveTab('registry')}
              className={`flex-1 sm:flex-initial py-2 px-4 rounded-lg font-bold text-xs transition uppercase ${activeTab === 'registry' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              <span className="flex items-center gap-2 justify-center"><ClipboardList className="w-4 h-4" /> Item Catalog</span>
            </button>
            <button 
              onClick={() => setActiveTab('movements')}
              className={`flex-1 sm:flex-initial py-2 px-4 rounded-lg font-bold text-xs transition uppercase ${activeTab === 'movements' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              <span className="flex items-center gap-2 justify-center"><History className="w-4 h-4" /> Movement Logs</span>
            </button>
            <button 
              onClick={() => setActiveTab('alerts')}
              className={`flex-1 sm:flex-initial py-2 px-4 rounded-lg font-bold text-xs transition uppercase relative ${activeTab === 'alerts' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              <span className="flex items-center gap-2 justify-center">
                <AlertTriangle className="w-4 h-4" /> Stock Alerts
                {(outOfStockList.length + lowStockList.length) > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-black animate-pulse">
                    {outOfStockList.length + lowStockList.length}
                  </span>
                )}
              </span>
            </button>
          </div>

          <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end">
            <button 
              onClick={() => handleOpenAdjForm()}
              className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-1.5 uppercase tracking-wide cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Stock Adjustment
            </button>
            <button 
              onClick={handleOpenAddForm}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-md shadow-blue-500/20 uppercase tracking-wide cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Register SKU
            </button>
          </div>
        </div>

        {/* Primary Views */}
        {activeTab === 'registry' && (
          <div className="space-y-4">
            
            {/* Filter Panel */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                  type="text" 
                  placeholder="Search item code, SKU, product name, or storage physical location..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-800 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition shadow-sm outline-none"
                />
              </div>

              <div className="flex gap-2 items-center">
                <span className="text-xs font-bold text-slate-500 uppercase shrink-0">Category:</span>
                <select 
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold p-2.5 rounded-xl outline-none"
                >
                  <option value="All">All Categories</option>
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <button
                onClick={handleAddColumn}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 rounded-xl transition shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Add Column
              </button>
            </div>

            {/* Catalog Table */}
            <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-6 py-4">Product Code & SKU</th>
                      <th className="px-6 py-4">Item Name</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4 text-center">Unit of Measure</th>
                      <th className="px-6 py-4 text-right">Cost Price / Unit</th>
                      <th className="px-6 py-4 text-right">MSRP / Unit</th>
                      <th className="px-6 py-4 text-center">In Stock</th>
                      <th className="px-6 py-4 text-right">Total Asset Worth</th>
                      {customColumns.map(col => (
                        <th key={col.id} className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            {col.label}
                            <button
                              onClick={() => handleDeleteColumn(col.id, col.label)}
                              className="text-slate-300 hover:text-rose-500 transition"
                              title={`Delete column "${col.label}"`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </th>
                      ))}
                      <th className="px-6 py-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm font-medium">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={9 + customColumns.length} className="text-center py-16 text-slate-400">
                          <Boxes className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p className="text-sm font-semibold">No stock catalog items matched your filters.</p>
                          <p className="text-xs opacity-75 mt-1">Try refining search parameters or register a new SKU product.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map(item => {
                        const totalCostValue = item.stockLevel * item.costPrice;
                        const isOut = item.stockLevel === 0;
                        const isLow = !isOut && item.stockLevel <= item.reorderPoint;
                        
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition">
                            <td className="px-6 py-4">
                              <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 block">{item.code}</span>
                              <span className="font-mono text-[10px] text-slate-400 block mt-0.5">{item.sku}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-bold text-slate-800 dark:text-slate-100 block">{item.name}</span>
                              {item.description && <span className="text-[11px] text-slate-400 font-normal line-clamp-1 mt-0.5">{item.description}</span>}
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                <Tag className="w-2.5 h-2.5" />
                                {item.category}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center uppercase tracking-wide text-xs">{item.unitOfMeasure}</td>
                            <td className="px-6 py-4 text-right font-mono text-xs text-slate-600 dark:text-slate-300">₱{item.costPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            <td className="px-6 py-4 text-right font-mono text-xs text-blue-600 font-bold">₱{item.sellingPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            <td className="px-6 py-4 text-center font-mono">
                              <div className="flex flex-col items-center justify-center">
                                <span className={`text-sm font-bold ${isOut ? 'text-rose-600' : isLow ? 'text-amber-500' : 'text-slate-800 dark:text-slate-100'}`}>
                                  {item.stockLevel}
                                </span>
                                {isOut ? (
                                  <span className="text-[9px] uppercase font-black tracking-widest text-rose-500">Out of Stock</span>
                                ) : isLow ? (
                                  <span className="text-[9px] uppercase font-black tracking-widest text-amber-500">Low Stock</span>
                                ) : (
                                  <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">Normal</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right font-mono font-bold text-emerald-600">
                              ₱{totalCostValue.toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </td>
                            {customColumns.map(col => (
                              <td key={col.id} className="px-6 py-4">
                                <input
                                  type="text"
                                  defaultValue={item.customFields?.[col.id] || ''}
                                  onBlur={e => {
                                    if (e.target.value !== (item.customFields?.[col.id] || '')) {
                                      handleCustomFieldChange(item.id, col.id, e.target.value);
                                    }
                                  }}
                                  placeholder="—"
                                  className="w-full min-w-[100px] bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1 text-xs outline-none transition"
                                />
                              </td>
                            ))}
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button 
                                  onClick={() => handleEditItem(item)}
                                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 hover:text-blue-600 dark:text-slate-400 transition cursor-pointer"
                                  title="Edit Item Details"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => {
                                    if(confirm(`Remove item "${item.name}" from catalog? This deletes all history logs associated with it`)) {
                                      handleDeleteItem(item.id);
                                    }
                                  }}
                                  className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg text-rose-500 hover:text-rose-700 transition cursor-pointer"
                                  title="Delete Item"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Movements Log View */}
        {activeTab === 'movements' && (
          <div className="space-y-4">
            {movementsLoading && (
              <div className="px-4 py-3 text-sm text-slate-500">Loading inventory movements…</div>
            )}
            {movementsError && (
              <div className="px-4 py-3 text-sm text-rose-600">{movementsError}</div>
            )}
            <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-6 py-4">Transaction Date</th>
                      <th className="px-6 py-4">Product Association</th>
                      <th className="px-6 py-4">Movement Type</th>
                      <th className="px-6 py-4 text-center">Unit Cost Used</th>
                      <th className="px-6 py-4 text-center">Quantity</th>
                      <th className="px-6 py-4 text-right">Total Transacted Value</th>
                      <th className="px-6 py-4">Ref/Source Document</th>
                      <th className="px-6 py-4">Audit Memo / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm font-medium">
                    {inventoryMovements.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-16 text-slate-400">
                          <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p className="text-sm font-semibold">No stock ledger transactions registered yet.</p>
                        </td>
                      </tr>
                    ) : (
                      inventoryMovements.map(mov => {
                        const isAdd = mov.type === 'Inbound';
                        const isDed = mov.type === 'Outbound';
                        return (
                          <tr key={mov.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition">
                            <td className="px-6 py-4 font-mono text-xs">{mov.date}</td>
                            <td className="px-6 py-4">
                              <span className="font-bold text-slate-800 dark:text-slate-100 block">{mov.itemName}</span>
                              <span className="font-mono text-[10px] text-slate-400">{mov.itemCode}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                isAdd ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' :
                                isDed ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400' :
                                'bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400'
                              }`}>
                                {mov.type === 'Inbound' ? 'Inbound (+)' : mov.type === 'Outbound' ? 'Outbound (-)' : 'Adjustment (±)'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center font-mono text-xs">₱{mov.unitCost.toLocaleString()}</td>
                            <td className={`px-6 py-4 text-center font-mono font-bold text-xs ${isAdd ? 'text-emerald-600' : isDed ? 'text-blue-600' : 'text-purple-600'}`}>
                              {isAdd ? '+' : isDed ? '-' : ''}{mov.qty}
                            </td>
                            <td className="px-6 py-4 text-right font-mono font-bold text-xs text-slate-700 dark:text-slate-200">
                              ₱{mov.totalValue.toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-mono text-xs uppercase bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{mov.reference}</span>
                            </td>
                            <td className="px-6 py-4 text-xs font-normal text-slate-500 dark:text-slate-400 max-w-xs truncate" title={mov.notes}>
                              {mov.notes || <span className="italic opacity-60">None</span>}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Alerts View */}
        {activeTab === 'alerts' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Out of Stock Cards */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-rose-600 uppercase tracking-wider flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-rose-500" /> Critical replenishment Needed (Out of Stock)
              </h4>
              <div className="flex flex-col gap-3">
                {outOfStockList.length === 0 ? (
                  <div className="p-6 bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900 rounded-2xl text-center text-sm font-bold text-emerald-600 dark:text-emerald-400 flex flex-col items-center gap-2">
                    <CheckCircle className="w-10 h-10" />
                    <span>No SKUs out of stock! Excellent warehouse monitoring.</span>
                  </div>
                ) : (
                  outOfStockList.map(item => (
                    <div key={item.id} className="p-4 bg-rose-50 dark:bg-rose-950/15 border border-rose-100 dark:border-rose-900 rounded-2xl flex justify-between items-center shadow-sm">
                      <div>
                        <span className="font-mono text-[10px] bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded font-bold uppercase">{item.code}</span>
                        <h5 className="font-bold text-slate-800 dark:text-slate-100 text-sm mt-1">{item.name}</h5>
                        <p className="text-xs text-slate-500 mt-1">Stored at: {item.location || 'Not Specified'}</p>
                      </div>
                      <button 
                        onClick={() => handleOpenAdjForm(item.id)}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase px-4 py-2 rounded-xl"
                      >
                        Adjust Stock
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Low Stock Warning Cards */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-amber-500 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Low Stock Watchlist (At/Below Reorder Point)
              </h4>
              <div className="flex flex-col gap-3">
                {lowStockList.length === 0 ? (
                  <div className="p-6 bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900 rounded-2xl text-center text-sm font-bold text-emerald-600 dark:text-emerald-400 flex flex-col items-center gap-2">
                    <CheckCircle className="w-10 h-10" />
                    <span>All stock levels safely above safety buffer limits.</span>
                  </div>
                ) : (
                  lowStockList.map(item => (
                    <div key={item.id} className="p-4 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/60 rounded-2xl flex justify-between items-center shadow-sm">
                      <div>
                        <span className="font-mono text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded font-bold uppercase">{item.code}</span>
                        <h5 className="font-bold text-slate-800 dark:text-slate-100 text-sm mt-1">{item.name}</h5>
                        <div className="flex gap-4 items-center mt-2 font-mono text-xs">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Stock</span>
                            <span className="font-black text-amber-600">{item.stockLevel} units</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Reorder point</span>
                            <span className="font-extrabold text-slate-600">{item.reorderPoint} units</span>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleOpenAdjForm(item.id)}
                        className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs uppercase px-4 py-2 rounded-xl"
                      >
                        Adjust Stock
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Side Slide-over form Panel for Adding / Editing SKUs */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg h-full flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h3 className="text-base md:text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Boxes className="w-5 h-5 text-blue-500" />
                {editingItem ? 'Edit SKU Information' : 'Register New Inventory SKU'}
              </h3>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
              >
                ✖
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Item Code *</label>
                  <input 
                    type="text" 
                    value={itemCode} 
                    onChange={e => setItemCode(e.target.value.toUpperCase())}
                    className="w-full text-sm bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono uppercase focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">SKU Barcode</label>
                  <input 
                    type="text" 
                    value={itemSku} 
                    onChange={e => setItemSku(e.target.value.toUpperCase())}
                    className="w-full text-sm bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Item Title Name *</label>
                <input 
                  type="text" 
                  value={itemName} 
                  onChange={e => setItemName(e.target.value)}
                  placeholder="e.g. Ergonomic Office Desk Stand Pro"
                  className="w-full text-sm border border-slate-200 p-2.5 rounded-xl focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Category</label>
                  <select 
                    value={itemCategory}
                    onChange={e => setItemCategory(e.target.value)}
                    className="w-full text-sm border border-slate-200 p-2.5 rounded-xl font-semibold outline-none"
                  >
                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Unit of Measure</label>
                  <input 
                    type="text" 
                    value={itemUom} 
                    placeholder="e.g. pcs, box, kgs"
                    onChange={e => setItemUom(e.target.value)}
                    className="w-full text-sm border border-slate-200 p-2.5 rounded-xl focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Unit Purchase Cost (₱)</label>
                  <input 
                    type="number" 
                    min={0}
                    step="any"
                    value={itemCost} 
                    onChange={e => setItemCost(e.target.value)}
                    className="w-full text-sm border border-slate-200 p-2.5 rounded-xl focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Standard Selling Price (₱)</label>
                  <input 
                    type="number" 
                    min={0}
                    step="any"
                    value={itemSelling} 
                    onChange={e => setItemSelling(e.target.value)}
                    className="w-full text-sm border border-slate-200 p-2.5 rounded-xl focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Initial Stock Level</label>
                  <input 
                    type="number" 
                    min={0}
                    value={itemLevel} 
                    disabled={!!editingItem} // stock level is updated only via Adjustments panel for integrity
                    onChange={e => setItemLevel(e.target.value)}
                    className="w-full text-sm border border-slate-200 p-2.5 rounded-xl focus:ring-1 focus:ring-blue-500 focus:bg-white transition disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Reorder Alert buffer</label>
                  <input 
                    type="number" 
                    min={0}
                    value={itemReorder} 
                    onChange={e => setItemReorder(e.target.value)}
                    className="w-full text-sm border border-slate-200 p-2.5 rounded-xl focus:ring-1 focus:ring-blue-500 focus:bg-white transition animate-bounce-short"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Physical Storage Location / bin</label>
                <input 
                  type="text" 
                  value={itemLocation} 
                  placeholder="e.g. Aisle B, Bin 3"
                  onChange={e => setItemLocation(e.target.value)}
                  className="w-full text-sm border border-slate-200 p-2.5 rounded-xl focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Product Description</label>
                <textarea 
                  rows={3}
                  value={itemDesc} 
                  placeholder="Additional specifications, notes, or logistics comments..."
                  onChange={e => setItemDesc(e.target.value)}
                  className="w-full text-sm border border-slate-200 p-2.5 rounded-xl focus:ring-1 focus:ring-blue-500 focus:bg-white transition resize-none"
                />
              </div>

              <div className="pt-4 flex gap-3 border-t border-slate-100 dark:border-slate-800">
                <button 
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold p-3 rounded-xl shadow-md uppercase tracking-wider text-xs transition"
                >
                  Save Stock Item
                </button>
                <button 
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold p-3 rounded-xl uppercase tracking-wider text-xs transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjustment Form Dialog Overlay */}
      {isAdjFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-amber-500" /> Post Stock Ledger Entry
              </h4>
              <button 
                onClick={() => setIsAdjFormOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
              >
                ✖
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="space-y-4">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Target Stock SKU *</label>
                <select 
                  value={adjItemId}
                  onChange={e => setAdjItemId(e.target.value)}
                  className="w-full text-sm border border-slate-200 p-2.5 rounded-xl font-semibold outline-none"
                  required
                >
                  {inventoryItems.map(item => (
                    <option key={item.id} value={item.id}>{item.name} ({item.code}) - Stock: {item.stockLevel}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Adjustment Action *</label>
                <div className="grid grid-cols-3 gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  {(['Inbound', 'Outbound', 'Adjustment'] as const).map(action => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => setAdjType(action)}
                      className={`text-[10px] font-black uppercase tracking-wider px-2 py-2 rounded-lg transition ${
                        adjType === action 
                          ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' 
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Adjustment Quantity *</label>
                  <input 
                    type="number" 
                    min="1"
                    value={adjQty} 
                    onChange={e => setAdjQty(e.target.value)}
                    className="w-full text-sm border border-slate-200 p-2.5 rounded-xl focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Reference Document</label>
                  <input 
                    type="text" 
                    value={adjRef} 
                    placeholder="e.g. INVOICE-4892"
                    onChange={e => setAdjRef(e.target.value)}
                    className="w-full text-sm border border-slate-200 p-2.5 rounded-xl font-mono uppercase focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">Audit Log Memo / Reason</label>
                <textarea 
                  rows={2}
                  value={adjNotes} 
                  placeholder="e.g. Out of stock replenishment, physical damage correction..."
                  onChange={e => setAdjNotes(e.target.value)}
                  className="w-full text-sm border border-slate-200 p-2.5 rounded-xl focus:ring-1 focus:ring-blue-500 focus:bg-white transition resize-none"
                />
              </div>

              <div className="pt-4 flex gap-3 border-t border-slate-100 dark:border-slate-800">
                <button 
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold p-3 rounded-xl shadow-md uppercase tracking-wider text-xs transition"
                >
                  Commit Journal
                </button>
                <button 
                  type="button"
                  onClick={() => setIsAdjFormOpen(false)}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold p-3 rounded-xl uppercase tracking-wider text-xs transition"
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
          </div>
    </div>
  );
}
