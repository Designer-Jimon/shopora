'use client';

// SHOPORA category manager — tree view + create / edit / delete via API.

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  _count: { products: number; children: number };
  children: Category[];
};

function TreeNode({ cat, allCats, onEdit, onDelete, depth = 0 }: {
  cat: Category; allCats: Category[]; onEdit: (c: Category) => void; onDelete: (c: Category) => void; depth?: number;
}) {
  return (
    <div>
      <div className={`flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-gray-50`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}>
        <div>
          <span className="font-medium text-[var(--color-text)]">{cat.name}</span>
          {cat.description && <span className="ml-2 text-xs text-[var(--color-text-muted)]">{cat.description}</span>}
          <span className="ml-2 text-xs text-[var(--color-text-muted)]">({cat._count.products})</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onEdit(cat)} className="text-xs text-[var(--color-primary)] hover:underline">Edit</button>
          {cat._count.products === 0 && cat._count.children === 0 && (
            <button onClick={() => onDelete(cat)} className="text-xs text-red-500 hover:underline">Delete</button>
          )}
        </div>
      </div>
      {cat.children.map((child) => (
        <TreeNode key={child.id} cat={child} allCats={allCats} onEdit={onEdit} onDelete={onDelete} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function CategoryManager({ categories: initial }: { categories: Category[] }) {
  const router = useRouter();
  const [categories, setCategories] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setCategories(initial), [initial]);

  const flatCategories = (() => {
    const result: { id: string; name: string; depth: number }[] = [];
    function walk(items: Category[], depth: number) {
      for (const c of items) {
        result.push({ id: c.id, name: c.name, depth });
        walk(c.children, depth + 1);
      }
    }
    walk(categories, 0);
    return result;
  })();

  const startCreate = () => {
    setEditingId(null); setName(''); setDescription(''); setParentId(''); setError(null); setShowForm(true);
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id); setName(cat.name); setDescription(cat.description ?? ''); setParentId(cat.parentId ?? ''); setError(null); setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const payload = { name: name.trim(), description: description.trim() || null, parentId: parentId || null };
      const url = editingId ? `/api/categories/${editingId}` : '/api/categories';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed');
        return;
      }
      setShowForm(false);
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Delete "${cat.name}"? This is permanent.`)) return;
    const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
  };

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Categories</h2>
        <button onClick={startCreate} className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">+ Add category</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 rounded-md border border-[var(--color-border)] p-4">
          {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cat-name" className="block text-xs font-medium text-[var(--color-text)]">Name *</label>
              <input id="cat-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none" />
            </div>
            <div>
              <label htmlFor="cat-parent" className="block text-xs font-medium text-[var(--color-text)]">Parent</label>
              <select id="cat-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none">
                <option value="">None (top-level)</option>
                {flatCategories.filter((c) => c.id !== editingId).map((c) => (
                  <option key={c.id} value={c.id}>{'—'.repeat(c.depth)} {c.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="cat-desc" className="block text-xs font-medium text-[var(--color-text)]">Description</label>
              <input id="cat-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none" />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4">
        {categories.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">No categories yet.</p>
        )}
        {categories.map((cat) => (
          <TreeNode key={cat.id} cat={cat} allCats={categories} onEdit={startEdit} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}
