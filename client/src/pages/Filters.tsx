import { useState, useEffect } from 'react';
import api from '../lib/api';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  FunnelIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Filter {
  id: string;
  name: string;
  isActive: boolean;
  matchMode: string;
  conditions: any[];
  actions: any[];
}

interface Label {
  id: string;
  name: string;
  color: string;
}

const CONDITION_FIELDS = [
  { value: 'from', label: 'From' },
  { value: 'to', label: 'To' },
  { value: 'subject', label: 'Subject' },
  { value: 'body', label: 'Body' },
  { value: 'hasAttachments', label: 'Has Attachments' },
  { value: 'size', label: 'Size (bytes)' },
];

const CONDITION_OPERATORS = [
  { value: 'contains', label: 'Contains' },
  { value: 'notContains', label: 'Does not contain' },
  { value: 'equals', label: 'Equals' },
  { value: 'startsWith', label: 'Starts with' },
  { value: 'endsWith', label: 'Ends with' },
  { value: 'regex', label: 'Matches regex' },
  { value: 'greaterThan', label: 'Greater than' },
  { value: 'lessThan', label: 'Less than' },
];

const ACTION_TYPES = [
  { value: 'moveToFolder', label: 'Move to folder' },
  { value: 'applyLabel', label: 'Apply label' },
  { value: 'markAsRead', label: 'Mark as read' },
  { value: 'star', label: 'Star' },
  { value: 'delete', label: 'Delete' },
  { value: 'markSpam', label: 'Mark as spam' },
  { value: 'forward', label: 'Forward to' },
  { value: 'autoReply', label: 'Auto-reply with' },
];

export default function Filters() {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [editFilter, setEditFilter] = useState<Filter | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState({ name: '', color: '#3B82F6' });
  const [showLabelForm, setShowLabelForm] = useState(false);

  const emptyFilter: Filter = {
    id: '',
    name: '',
    isActive: true,
    matchMode: 'all',
    conditions: [{ field: 'from', operator: 'contains', value: '' }],
    actions: [{ type: 'moveToFolder', value: '' }],
  };

  const fetchFilters = async () => {
    try {
      const { data } = await api.get('/filters');
      const parsed = data.map((f: any) => {
        const conditions = typeof f.conditions === 'string' ? JSON.parse(f.conditions) : f.conditions;
        const actions = typeof f.actions === 'string' ? JSON.parse(f.actions) : f.actions;
        // conditions may be { logic, rules } or a plain array
        const rules = Array.isArray(conditions) ? conditions : conditions.rules || [];
        const matchMode = Array.isArray(conditions) ? 'all' : (conditions.logic === 'OR' ? 'any' : 'all');
        return {
          id: f.id,
          name: f.name,
          isActive: f.isActive,
          matchMode,
          conditions: rules,
          actions: Array.isArray(actions) ? actions : [],
        } as Filter;
      });
      setFilters(parsed);
    } catch { /* ignore */ }
  };

  const fetchLabels = async () => {
    try {
      const { data } = await api.get('/filters/labels');
      setLabels(data);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchFilters(); fetchLabels(); }, []);

  const handleSave = async () => {
    if (!editFilter?.name) return toast.error('Name is required');
    try {
      const payload = {
        name: editFilter.name,
        isActive: editFilter.isActive,
        conditions: { logic: editFilter.matchMode === 'any' ? 'OR' : 'AND', rules: editFilter.conditions },
        actions: editFilter.actions,
      };
      if (editFilter.id) {
        await api.put(`/filters/${editFilter.id}`, payload);
      } else {
        await api.post('/filters', payload);
      }
      toast.success('Filter saved');
      fetchFilters();
      setShowForm(false);
      setEditFilter(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this filter?')) return;
    try {
      await api.delete(`/filters/${id}`);
      toast.success('Filter deleted');
      fetchFilters();
    } catch { toast.error('Failed to delete filter'); }
  };

  const handleToggle = async (f: Filter) => {
    try {
      await api.put(`/filters/${f.id}`, { isActive: !f.isActive });
      fetchFilters();
    } catch { toast.error('Failed to update filter'); }
  };

  const addCondition = () => {
    if (!editFilter) return;
    setEditFilter({ ...editFilter, conditions: [...editFilter.conditions, { field: 'from', operator: 'contains', value: '' }] });
  };

  const removeCondition = (i: number) => {
    if (!editFilter) return;
    setEditFilter({ ...editFilter, conditions: editFilter.conditions.filter((_, idx) => idx !== i) });
  };

  const updateCondition = (i: number, key: string, val: string) => {
    if (!editFilter) return;
    const conds = [...editFilter.conditions];
    conds[i] = { ...conds[i], [key]: val };
    setEditFilter({ ...editFilter, conditions: conds });
  };

  const addAction = () => {
    if (!editFilter) return;
    setEditFilter({ ...editFilter, actions: [...editFilter.actions, { type: 'moveToFolder', value: '' }] });
  };

  const removeAction = (i: number) => {
    if (!editFilter) return;
    setEditFilter({ ...editFilter, actions: editFilter.actions.filter((_, idx) => idx !== i) });
  };

  const updateAction = (i: number, key: string, val: string) => {
    if (!editFilter) return;
    const acts = [...editFilter.actions];
    acts[i] = { ...acts[i], [key]: val };
    setEditFilter({ ...editFilter, actions: acts });
  };

  const handleAddLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.name) return;
    try {
      await api.post('/filters/labels', newLabel);
      toast.success('Label created');
      fetchLabels();
      setNewLabel({ name: '', color: '#3B82F6' });
      setShowLabelForm(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create label');
    }
  };

  const handleDeleteLabel = async (id: string) => {
    if (!window.confirm('Delete this label?')) return;
    try {
      await api.delete(`/filters/labels/${id}`);
      toast.success('Label deleted');
      fetchLabels();
    } catch { toast.error('Failed to delete label'); }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Filters Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FunnelIcon className="w-6 h-6" /> Email Filters
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  try {
                    const { data } = await api.post('/emails/apply-filters');
                    toast.success(`Filters applied to ${data.applied} of ${data.total} emails`);
                  } catch {
                    toast.error('Failed to apply filters');
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition"
              >
                <FunnelIcon className="w-4 h-4" /> Apply to Existing
              </button>
              <button
                onClick={() => { setEditFilter({ ...emptyFilter }); setShowForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition"
              >
                <PlusIcon className="w-4 h-4" /> New Filter
              </button>
            </div>
          </div>

          {/* Filter Form */}
          {showForm && editFilter && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-5">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {editFilter.id ? 'Edit Filter' : 'Create Filter'}
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                  <input
                    type="text"
                    value={editFilter.name}
                    onChange={(e) => setEditFilter({ ...editFilter, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Filter name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Match Mode</label>
                  <select
                    value={editFilter.matchMode}
                    onChange={(e) => setEditFilter({ ...editFilter, matchMode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="all">Match ALL conditions</option>
                    <option value="any">Match ANY condition</option>
                  </select>
                </div>
              </div>

              {/* Conditions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Conditions</label>
                  <button onClick={addCondition} className="text-xs text-blue-600 hover:text-blue-700">+ Add Condition</button>
                </div>
                <div className="space-y-2">
                  {editFilter.conditions.map((c, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select value={c.field} onChange={(e) => updateCondition(i, 'field', e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm flex-shrink-0">
                        {CONDITION_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      <select value={c.operator} onChange={(e) => updateCondition(i, 'operator', e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm flex-shrink-0">
                        {CONDITION_OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {c.field !== 'hasAttachments' && (
                        <input
                          type="text" value={c.value || ''} placeholder="Value"
                          onChange={(e) => updateCondition(i, 'value', e.target.value)}
                          className="flex-1 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      )}
                      {editFilter.conditions.length > 1 && (
                        <button onClick={() => removeCondition(i)} className="text-red-500 hover:text-red-700 text-lg px-1">&times;</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Actions</label>
                  <button onClick={addAction} className="text-xs text-blue-600 hover:text-blue-700">+ Add Action</button>
                </div>
                <div className="space-y-2">
                  {editFilter.actions.map((a, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select value={a.type} onChange={(e) => updateAction(i, 'type', e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm flex-shrink-0">
                        {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      {!['markAsRead', 'star', 'delete', 'markSpam'].includes(a.type) && (
                        <input
                          type="text" value={a.value || ''}
                          placeholder={a.type === 'forward' ? 'email@example.com' : a.type === 'autoReply' ? 'Reply message...' : 'Folder name'}
                          onChange={(e) => updateAction(i, 'value', e.target.value)}
                          className="flex-1 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      )}
                      {editFilter.actions.length > 1 && (
                        <button onClick={() => removeAction(i)} className="text-red-500 hover:text-red-700 text-lg px-1">&times;</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button onClick={() => { setShowForm(false); setEditFilter(null); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition">
                  Cancel
                </button>
                <button onClick={handleSave} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition">
                  Save Filter
                </button>
              </div>
            </div>
          )}

          {/* Filter List */}
          <div className="space-y-3">
            {filters.length === 0 && !showForm ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <FunnelIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No filters yet. Create one to auto-organize your emails.</p>
              </div>
            ) : (
              filters.map((f) => (
                <div key={f.id} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 flex items-center gap-4">
                  <button
                    onClick={() => handleToggle(f)}
                    className={`w-10 h-6 rounded-full relative transition-colors ${f.isActive ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${f.isActive ? 'left-4.5' : 'left-0.5'}`} />
                  </button>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">{f.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {f.conditions.length} condition{f.conditions.length !== 1 ? 's' : ''} · {f.actions.length} action{f.actions.length !== 1 ? 's' : ''} · Match {f.matchMode}
                    </div>
                  </div>
                  <button
                    onClick={() => { setEditFilter(f); setShowForm(true); }}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(f.id)}
                    className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 transition"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Labels Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <TagIcon className="w-5 h-5" /> Labels
            </h2>
            <button
              onClick={() => setShowLabelForm(!showLabelForm)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl text-sm font-medium transition"
            >
              <PlusIcon className="w-4 h-4" /> New Label
            </button>
          </div>

          {showLabelForm && (
            <form onSubmit={handleAddLabel} className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-4 shadow-sm border border-gray-200 dark:border-gray-700 flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label Name</label>
                <input
                  type="text" value={newLabel.name} onChange={(e) => setNewLabel({ ...newLabel, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Label name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color</label>
                <input type="color" value={newLabel.color} onChange={(e) => setNewLabel({ ...newLabel, color: e.target.value })} className="w-12 h-10 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer" />
              </div>
              <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition h-10">
                Create
              </button>
            </form>
          )}

          <div className="flex flex-wrap gap-2">
            {labels.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No labels created yet.</p>
            ) : (
              labels.map((l) => (
                <div key={l.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-sm text-gray-900 dark:text-white">{l.name}</span>
                  <button onClick={() => handleDeleteLabel(l.id)} className="text-gray-400 hover:text-red-500 text-xs ml-1">&times;</button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
